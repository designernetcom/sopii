/*
 * The email delivery log.
 * ===========================================================================
 * One document per *attempt*, append-only. It answers the question the order
 * document cannot: not "what is the current state of this order's
 * confirmation" — `order.emailNotifications` holds that, and is what the panel
 * renders — but "what has this store actually sent, to whom, when, and what
 * did the relay say".
 *
 *     order.emailNotifications[]     the latest state, per order, per kind
 *     email_log                      every attempt ever made, in order
 *
 * Both exist because they are different questions. The first is a field on a
 * record an operator is already looking at; the second is an audit trail that
 * survives the order being edited and covers mail that has no order at all —
 * a password reset belongs to a user, not to an order.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT JUST `logger.info`
 * ---------------------------------------------------------------------------
 * It is that too — `lib/mailtrap.ts` logs every send. But a log line lives
 * wherever the log shipper put it and is gone at whatever retention that has.
 * "Did we email this customer, and when" is a question a support conversation
 * asks weeks later, against a store that may have no log shipper at all. So it
 * is a collection, with a TTL long enough to answer that (90 days) and short
 * enough that it cannot grow without bound.
 *
 * ---------------------------------------------------------------------------
 * IT NEVER THROWS
 * ---------------------------------------------------------------------------
 * A logging failure must not turn a delivered email into a failed job, and
 * must certainly not fail an order. Every write here is best-effort and
 * swallows its own errors, which is the same contract `queue.enqueue` keeps
 * and for the same reason.
 */

import mongoose, { Schema, model, type Model } from 'mongoose';

import { nextId } from './ids.js';
import { logger } from './logger.js';
import type { EmailStatus } from './mailtrap.js';

/* ---------------------------------- model ----------------------------------- */

export interface EmailLogDoc {
  _id: string;
  /** `order_confirmation`, `password_reset`, … */
  kind: string;
  status: EmailStatus;
  recipient: string;
  subject: string;
  /** The order this was about, when there is one. Absent for account mail. */
  orderId?: string;
  orderCode?: string;
  /** The relay's Message-ID, present only on a successful send. */
  messageId?: string;
  error?: string;
  /** Which attempt this was, counted per idempotency key. */
  attempt: number;
  /** The value that makes a repeat send a no-op. See `email.ts`. */
  idempotencyKey?: string;
  /** How long the send itself took, so a slow relay is visible. */
  durationMs?: number;
  /** Who asked for it — `queue`, `admin:usr_x`, `script`. */
  source: string;
  createdAt: Date;
}

const emailLogSchema = new Schema<EmailLogDoc>(
  {
    _id: String,
    kind: { type: String, index: true },
    status: { type: String, index: true },
    recipient: { type: String, index: true },
    subject: String,
    orderId: { type: String, index: true },
    orderCode: { type: String, index: true },
    messageId: String,
    error: String,
    attempt: { type: Number, default: 1 },
    idempotencyKey: { type: String, index: true },
    durationMs: Number,
    source: { type: String, default: 'queue' },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

/* "Everything sent about this order, newest first" is the query a support
   conversation makes, so it is the one that gets an index. */
emailLogSchema.index({ orderCode: 1, createdAt: -1 });
/* Ninety days: long enough to settle a "we never received it" dispute, short
   enough that the collection cannot grow forever. */
emailLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const EmailLogModel: Model<EmailLogDoc> = model<EmailLogDoc>(
  'EmailLog',
  emailLogSchema,
  'email_log',
);

/* --------------------------------- writing ---------------------------------- */

export type EmailLogEntry = Omit<EmailLogDoc, '_id' | 'createdAt'>;

/**
 * Writes that have been started and not yet finished.
 *
 * `recordDelivery` is deliberately not awaited by the send path, which leaves
 * a window: the caller returns, something tears the process down, and the
 * insert rejects against a client that has already disconnected. That is not a
 * hypothetical — it drops the last entries of every shutdown, and it is what
 * `MongoNotConnectedError: Client must be connected` in the log actually
 * means.
 *
 * So the promises are tracked, and `flushDeliveryLog()` lets a shutdown path
 * drain them. Fire-and-forget on the hot path, awaited once at the end.
 */
const inFlight = new Set<Promise<void>>();

/**
 * Waits for the in-flight log writes, with a ceiling.
 *
 * Called from the server's shutdown handler and from the CLI scripts, both
 * immediately before disconnecting. The timeout matters: a shutdown must not
 * be held open by a database that has already gone away, and a lost log line
 * is a smaller problem than a container that will not stop.
 */
export async function flushDeliveryLog(timeoutMs = 5_000): Promise<void> {
  if (!inFlight.size) return;

  await Promise.race([
    Promise.allSettled([...inFlight]),
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      timer.unref?.();
    }),
  ]);
}

/**
 * Records one attempt. Best-effort: a failure here is logged and dropped.
 *
 * Not awaited by the send path on purpose — the caller has already done the
 * work that matters, and holding a worker on a bookkeeping insert would be the
 * same mistake as holding a checkout on an SMTP round trip. See
 * `flushDeliveryLog` for how the resulting window is closed at shutdown.
 */
export async function recordDelivery(entry: EmailLogEntry): Promise<void> {
  /*
   * Dropped rather than buffered when the database is away.
   *
   * Mongoose queues an operation on a disconnected connection and resolves it
   * when the connection returns — or rejects it ten seconds later. Either is
   * wrong here: the caller has already sent the email, and holding a worker
   * for ten seconds on a bookkeeping insert is precisely the cost this whole
   * design exists to keep off the path. A log line that is written nowhere is
   * better than a worker that is doing nothing.
   */
  if (mongoose.connection.readyState !== 1) {
    logger.debug('email.log_skipped', { template: entry.kind, detail: 'database not connected' });
    return;
  }

  const write = (async () => {
    try {
      await EmailLogModel.create({
        _id: nextId('eml'),
        ...entry,
        // The address is a personal identifier; it is stored, but never logged.
        recipient: entry.recipient,
        createdAt: new Date(),
      });
    } catch (error) {
      /*
       * A disconnect that beat this write is a shutdown, not a fault — the
       * connection was open when the guard above ran. Logged quietly, because
       * a stack trace here sends somebody looking for a broken mailer when
       * what actually happened is that the process stopped.
       */
      if ((error as Error)?.name === 'MongoNotConnectedError') {
        logger.debug('email.log_skipped', { template: entry.kind, detail: 'shut down mid-write' });
        return;
      }
      logger.warn('email.log_write_failed', { template: entry.kind, error });
    }
  })();

  inFlight.add(write);
  try {
    await write;
  } finally {
    inFlight.delete(write);
  }
}

/** Every attempt made about one order, newest first. For support and the API. */
export async function deliveryHistory(orderCode: string, limit = 20) {
  return EmailLogModel.find({ orderCode }).sort({ createdAt: -1 }).limit(limit).lean();
}
