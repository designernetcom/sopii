/*
 * Background jobs (§13, §14).
 * ===========================================================================
 * The rule this file exists to enforce:
 *
 *   **Nothing a customer waits on may do work a customer does not wait for.**
 *
 * Checkout is the case that matters. Writing the order is the shopper's
 * business; sending the confirmation email, pushing the WhatsApp message,
 * ringing the bell in the admin panel and updating the analytics rollup are
 * not. Doing them inside the request adds their latency and their failure
 * modes to the checkout: an SMTP timeout should never be able to fail an order
 * that has already been paid for.
 *
 * THE STORAGE CHOICE
 * ---------------------------------------------------------------------------
 * The queue is a MongoDB collection, claimed with `findOneAndUpdate`. That is
 * deliberately not the fastest possible queue — it is the one that needs no
 * infrastructure the store does not already run, survives a restart, and is
 * safe with several API instances polling it at once because the claim is a
 * single atomic document update.
 *
 * At the volumes §22 tests for it is entirely adequate: a few hundred jobs a
 * second on an indexed collection. Past that, `enqueue()` is the only function
 * anything calls, so moving to BullMQ or SQS is a change to this file and
 * nothing else. That is the actual design goal.
 *
 * IN-PROCESS WORKER, OR A SEPARATE ONE
 * ---------------------------------------------------------------------------
 * `WORKER_ENABLED=false` on the API instances and `true` on a dedicated one is
 * the production shape: notification volume then cannot steal CPU from request
 * handling. Left on by default so a single-box deployment still works, which
 * is what a store starting out actually has.
 */

import { Schema, model, type Model } from 'mongoose';
import { nextId } from './ids.js';
import { logger } from './logger.js';

/* ---------------------------------- model ----------------------------------- */

export const JOB_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobDoc {
  _id: string;
  /** Which handler runs it. Registered below via `registerHandler`. */
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  /** Not picked up before this. Powers both scheduling and retry backoff. */
  runAt: Date;
  attempts: number;
  maxAttempts: number;
  /** Set while a worker holds it; a stale lease is reclaimed. */
  lockedAt?: Date;
  lockedBy?: string;
  lastError?: string;
  /**
   * Optional de-duplication handle. Two enqueues with the same key produce one
   * job — the notification for an order that somehow gets written twice is one
   * message, not two.
   */
  dedupeKey?: string;
  createdAt: Date;
  completedAt?: Date;
}

const jobSchema = new Schema<JobDoc>(
  {
    _id: String,
    type: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: JOB_STATUSES, default: 'pending' },
    runAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    lockedAt: Date,
    lockedBy: String,
    lastError: String,
    dedupeKey: { type: String, sparse: true, unique: true },
    createdAt: { type: Date, default: () => new Date() },
    completedAt: Date,
  },
  { versionKey: false },
);

/*
 * The claim query is `{ status, runAt: { $lte: now } }` sorted by `runAt`, so
 * this index is what keeps the poll a single index scan rather than a
 * collection scan that gets slower every day the queue runs.
 */
jobSchema.index({ status: 1, runAt: 1 });
/* Finished jobs sweep themselves after a week — long enough to investigate a
   failure, short enough that the collection does not grow without bound. */
jobSchema.index({ completedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const JobModel: Model<JobDoc> = model<JobDoc>('Job', jobSchema, 'jobs');

/* -------------------------------- registration ------------------------------ */

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

/* --------------------------------- enqueueing ------------------------------- */

export interface EnqueueOptions {
  /** Delay before the job becomes eligible. */
  delayMs?: number;
  maxAttempts?: number;
  /** Makes the enqueue idempotent — see `dedupeKey` on the document. */
  dedupeKey?: string;
}

/**
 * Adds a job. **Never throws into the request path.**
 *
 * That is the important half. This is called from inside checkout, and a queue
 * that is briefly unavailable must not be able to fail an order that has
 * already taken money — the job is logged as lost and the order stands. A lost
 * confirmation email is a support ticket; a failed paid order is a refund.
 */
export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {},
): Promise<string | null> {
  try {
    const id = nextId('job');
    await JobModel.create({
      _id: id,
      type,
      payload,
      status: 'pending',
      runAt: new Date(Date.now() + (options.delayMs ?? 0)),
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 5,
      dedupeKey: options.dedupeKey,
      createdAt: new Date(),
    });
    return id;
  } catch (error) {
    // A duplicate key here is the dedupe working, not a failure.
    if ((error as { code?: number })?.code === 11000) return null;
    logger.error('queue.enqueue_failed', { type, error });
    return null;
  }
}

/* ---------------------------------- worker ---------------------------------- */

const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/** How long a claimed job may be held before another worker may take it. */
const LEASE_MS = Number(process.env.WORKER_LEASE_MS ?? 60_000);
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const BATCH = Number(process.env.WORKER_BATCH ?? 5);

/**
 * Claims one job, atomically.
 *
 * The filter matches pending work *or* work whose lease has expired, which is
 * how a job survives the worker that was running it being killed mid-flight.
 * `findOneAndUpdate` is atomic per document, so two workers racing for the same
 * job produce one winner and one `null` — no locks, no coordination.
 */
async function claim(): Promise<JobDoc | null> {
  const now = new Date();
  return JobModel.findOneAndUpdate(
    {
      $or: [
        { status: 'pending', runAt: { $lte: now } },
        { status: 'running', lockedAt: { $lte: new Date(Date.now() - LEASE_MS) } },
      ],
    },
    { $set: { status: 'running', lockedAt: now, lockedBy: WORKER_ID }, $inc: { attempts: 1 } },
    { new: true, sort: { runAt: 1 } },
  ).lean<JobDoc>();
}

/** Exponential backoff with a ceiling: 2s, 4s, 8s, 16s, … capped at 5 minutes. */
const backoffMs = (attempts: number) => Math.min(2000 * 2 ** (attempts - 1), 300_000);

async function run(job: JobDoc) {
  const handler = handlers.get(job.type);

  if (!handler) {
    // An unregistered type is a deploy problem, not a transient one — retrying
    // it forever would hide the fact that a handler went missing.
    logger.error('queue.no_handler', { type: job.type, detail: job._id });
    await JobModel.updateOne(
      { _id: job._id },
      { $set: { status: 'failed', lastError: 'no handler registered', completedAt: new Date() } },
    );
    return;
  }

  const startedAt = Date.now();

  try {
    await handler(job.payload);
    await JobModel.updateOne(
      { _id: job._id },
      { $set: { status: 'done', completedAt: new Date() }, $unset: { lockedAt: '', lockedBy: '' } },
    );
    logger.info('queue.completed', { type: job.type, durationMs: Date.now() - startedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exhausted = job.attempts >= job.maxAttempts;

    await JobModel.updateOne(
      { _id: job._id },
      {
        $set: exhausted
          ? { status: 'failed', lastError: message.slice(0, 500), completedAt: new Date() }
          : {
              status: 'pending',
              lastError: message.slice(0, 500),
              runAt: new Date(Date.now() + backoffMs(job.attempts)),
            },
        $unset: { lockedAt: '', lockedBy: '' },
      },
    );

    // Exhausted is an alert; a retry is background noise.
    logger[exhausted ? 'error' : 'warn'](exhausted ? 'queue.exhausted' : 'queue.retry', {
      type: job.type,
      attempts: job.attempts,
      detail: message,
    });
  }
}

let timer: NodeJS.Timeout | null = null;
let draining = false;

async function tick() {
  if (draining) return;
  draining = true;
  try {
    for (let i = 0; i < BATCH; i += 1) {
      const job = await claim();
      if (!job) break;
      await run(job);
    }
  } catch (error) {
    logger.error('queue.tick_failed', { error });
  } finally {
    draining = false;
  }
}

export function startWorker() {
  if (timer) return;
  if (process.env.WORKER_ENABLED === 'false') {
    logger.info('queue.worker_disabled', {
      detail: 'WORKER_ENABLED=false — jobs are queued but processed elsewhere.',
    });
    return;
  }

  timer = setInterval(() => void tick(), POLL_MS);
  // Do not hold the process open for the poll timer alone.
  timer.unref?.();
  logger.info('queue.worker_started', { detail: `${WORKER_ID} every ${POLL_MS}ms` });
}

export function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Queue depth, for §18's "queue failures" line on the dashboard. */
export async function queueStats() {
  const [pending, running, failed] = await Promise.all([
    JobModel.countDocuments({ status: 'pending' }),
    JobModel.countDocuments({ status: 'running' }),
    JobModel.countDocuments({ status: 'failed' }),
  ]);
  return { pending, running, failed, workerId: WORKER_ID };
}

/* -------------------------------- job types --------------------------------- */

/**
 * The catalogue of job names, so an enqueue and its handler cannot drift on a
 * typo — which in a queue is a job that silently never runs.
 */
export const JOB = {
  orderPlaced: 'order.placed',
  orderNotification: 'order.notification',
  emailSend: 'email.send',
  whatsappSend: 'whatsapp.send',
  smsSend: 'sms.send',
  exportGenerate: 'export.generate',
  analyticsRollup: 'analytics.rollup',
} as const;
