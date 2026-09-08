/*
 * Mailtrap — the transport, and the only module that talks to it.
 * ===========================================================================
 * Everything above this file (`lib/email.ts`, the queue handler, the panel's
 * Resend button) deals in "send this HTML to this address and tell me what
 * happened". Everything below it is SMTP. Keeping the seam here is what made
 * replacing the previous provider a change to two files rather than nine, and
 * it is why swapping Mailtrap for something else later would be the same.
 *
 *     EmailService ──▶ send() ──▶ nodemailer pool ──▶ Mailtrap SMTP
 *                        │
 *                        └── EmailDelivery { status, messageId, error }
 *
 * ---------------------------------------------------------------------------
 * WHY SMTP RATHER THAN MAILTRAP'S HTTP API
 * ---------------------------------------------------------------------------
 * Because the credentials this store is configured with — HOST, PORT, USER,
 * PASSWORD — are SMTP credentials, and because SMTP is the one interface that
 * is identical between a Mailtrap sandbox inbox (where this is developed and
 * tested) and a Mailtrap sending domain (where it runs in production). The
 * same four variables move a store from capturing mail to delivering it, with
 * no code change and no second code path that is only ever exercised in one
 * environment.
 *
 * ---------------------------------------------------------------------------
 * WHAT COUNTS AS A FAILURE — and why the answer is inverted from HTTP
 * ---------------------------------------------------------------------------
 * The queue retries with exponential backoff, and a retry is only worth
 * spending on a fault that might clear. So every send is classified:
 *
 *   SMTP 4xx = TEMPORARY  ("mailbox busy", "try again later", greylisting)
 *              THROWS, so the job is rescheduled.
 *   SMTP 5xx = PERMANENT  ("no such user", "message rejected", bad sender)
 *              RETURNS, so the job is marked done and the reason recorded.
 *
 * Reading these the HTTP way round — 5xx retryable, 4xx not — means retrying
 * the rejections and giving up on the greylisting, which is precisely
 * backwards: greylisting exists to be retried, and it is how a lot of relays
 * treat a first-time sender.
 *
 * ---------------------------------------------------------------------------
 * CREDENTIALS
 * ---------------------------------------------------------------------------
 * `MAILTRAP_USER` / `MAILTRAP_PASSWORD` can send mail as this store — as can
 * `MAILTRAP_API_TOKEN`, which is the same credential under the name the Email
 * Sending dashboard gives it and which `env.ts` expands into that pair. They stay
 * on this server, are never returned by an endpoint, and must never reach a
 * VITE_-prefixed variable. With any of host/user/password/from unset,
 * `isConfigured` is false and sends are recorded as `skipped` — the store
 * still checks out, and the panel says plainly that no mailer is configured
 * rather than showing a failure nobody can act on.
 */

import nodemailer from 'nodemailer';

import { env } from '../env.js';
import { logger } from './logger.js';

/* --------------------------------- readiness -------------------------------- */

/**
 * True when there is enough to open an authenticated connection *and* a
 * `from` address to put on the message. All four are required: Mailtrap
 * refuses an unauthenticated session, and a message with no envelope sender is
 * refused by the relay rather than by us.
 */
export const isConfigured = Boolean(
  env.mailtrap.host && env.mailtrap.user && env.mailtrap.password && env.mailtrap.fromEmail,
);

/** Why it is not configured, in words an operator can act on. */
export function missingConfig(): string {
  const missing = [
    !env.mailtrap.host && 'MAILTRAP_HOST',
    !env.mailtrap.user && 'MAILTRAP_USER',
    !env.mailtrap.password && 'MAILTRAP_PASSWORD (or MAILTRAP_API_TOKEN)',
    !env.mailtrap.fromEmail && 'MAILTRAP_FROM_EMAIL',
  ].filter(Boolean);
  return missing.length ? `unset: ${missing.join(', ')}` : '';
}

/**
 * For the test script and any health check — host:port, and no secrets.
 *
 * It names the credential shape as well, because the two fail differently and
 * the error does not distinguish them: an API token that has been revoked and a
 * sandbox inbox pair aimed at the live relay both answer `535 Invalid
 * credentials`, and knowing which one is loaded is half the diagnosis.
 */
export const describeTransport = () =>
  `${env.mailtrap.host || '(no host)'}:${env.mailtrap.port}${
    env.mailtrap.secure ? ' (implicit TLS)' : ''
  }${env.mailtrap.apiToken ? ' — API token' : env.mailtrap.user ? ' — user/password' : ''}`;

/* -------------------------------- the pool ---------------------------------- */

/**
 * One pooled connection set, built lazily and reused for the life of the
 * process.
 *
 * Pooled deliberately. The worker sends one message at a time but sends them
 * continuously, and a fresh TCP + TLS + AUTH handshake per email is three
 * round trips of pure latency against a relay that is happy to keep the
 * connection open. `maxConnections: 3` is well inside Mailtrap's concurrency
 * allowance and more than a single worker will ever saturate.
 *
 * Built lazily rather than at import time so that importing this module — as
 * the tests and the type checker do — never opens a socket.
 */
let pool: nodemailer.Transporter | null = null;

function transporter(): nodemailer.Transporter {
  if (pool) return pool;

  pool = nodemailer.createTransport({
    host: env.mailtrap.host,
    port: env.mailtrap.port,
    secure: env.mailtrap.secure,
    auth: { user: env.mailtrap.user, pass: env.mailtrap.password },
    pool: true,
    maxConnections: 3,
    /*
     * All three, not just one. `connectionTimeout` covers a host that never
     * accepts; `greetingTimeout` a host that accepts and then says nothing;
     * `socketTimeout` a connection that dies mid-DATA. A worker held by any
     * one of those is a worker sending nothing else.
     */
    connectionTimeout: env.mailtrap.timeoutMs,
    greetingTimeout: env.mailtrap.timeoutMs,
    socketTimeout: env.mailtrap.timeoutMs,
  });

  return pool;
}

/** Closes the pool, so a container shutting down exits promptly. */
export function closeTransport() {
  pool?.close();
  pool = null;
}

/**
 * Proves Mailtrap accepts the configured credentials, without sending mail.
 *
 * One round trip that separates "your configuration is wrong" from "that
 * message was rejected" — different problems, with different fixes, that look
 * identical in a failed send.
 */
export async function verifyConnection(): Promise<void> {
  if (!isConfigured) throw new Error(`Mailtrap is not configured — ${missingConfig()}`);
  await transporter().verify();
}

/* ------------------------------- the contract ------------------------------- */

export type EmailStatus = 'sent' | 'failed' | 'skipped';

export interface EmailDelivery {
  status: EmailStatus;
  recipient: string;
  /** The RFC 5322 Message-ID the relay assigned — the handle for a mail log. */
  messageId?: string;
  error?: string;
}

/**
 * A send that failed in a way worth retrying. The queue turns a throw into a
 * rescheduled job, so only transient faults are thrown — see the header.
 */
export class TransientEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientEmailError';
  }
}

/**
 * Throttling, whatever status code it arrives under.
 *
 * The code is supposed to say this — 421 and 450 exist precisely for "not
 * now, try again". Mailtrap does not always use them: it answers a burst with
 *
 *     550 5.7.0 Too many emails per second. Please upgrade your plan
 *
 * and 550 is the code for "this will never work". Taken at face value that
 * marks the job done and the customer never gets their confirmation — over a
 * condition that clears in one second. Observed against a real sandbox inbox,
 * not hypothesised.
 *
 * So the text is consulted when the code disagrees with it. The bias is
 * deliberate and safe in this direction: a wrongly-transient failure costs
 * four more attempts and then lands in `failed` exactly as before, because
 * `maxAttempts` bounds it. A wrongly-permanent one costs the email.
 */
const THROTTLED = /too many|rate.?limit|throttl|try again|slow down|temporarily (deferred|unavailable)/i;

/** Turns whatever nodemailer threw into "retry this" or "do not". */
export function classify(error: unknown): { transient: boolean; message: string } {
  const err = error as {
    responseCode?: number;
    code?: string;
    response?: string;
    message?: string;
  };

  const message = String(err?.response || err?.message || 'unknown Mailtrap error').slice(0, 500);
  const code = Number(err?.responseCode);

  if (Number.isFinite(code)) {
    // 4xx is temporary in SMTP; so is anything that says it is, whatever its code.
    return { transient: (code >= 400 && code < 500) || THROTTLED.test(message), message };
  }

  /*
   * No SMTP code, so this is a transport-level fault. Bad credentials will not
   * improve on retry and neither will a hostname that does not resolve; a
   * refused connection, a timeout or a dead socket might.
   */
  if (err?.code === 'EAUTH' || err?.code === 'ENOTFOUND') return { transient: false, message };
  return { transient: true, message };
}

/* --------------------------------- sending ---------------------------------- */

export interface SendInput {
  to: string;
  subject: string;
  html: string;
  /** The plain-text alternative. Every message carries one; see below. */
  text: string;
  /** Groups sends in a log search — `order_confirmation`, `password_reset`. */
  category: string;
}

/**
 * Sends one message and answers what happened.
 *
 * Throws only on a transient fault. A permanent one comes back as
 * `{ status: 'failed' }` so the caller can record it against the order without
 * the queue burning four more attempts on an address that will never work.
 */
export async function send({
  to,
  subject,
  html,
  text,
  category,
}: SendInput): Promise<EmailDelivery> {
  const recipient = to.trim();
  if (!recipient) return { status: 'failed', recipient: '', error: 'no recipient address' };

  if (!isConfigured) {
    const detail = missingConfig();
    logger.info('email.not_configured', { detail: `${detail} — "${subject}" not sent` });
    return { status: 'skipped', recipient, error: `Mailtrap is not configured (${detail})` };
  }

  let timer: NodeJS.Timeout | undefined;

  try {
    const info = await Promise.race([
      transporter().sendMail({
        to: recipient,
        from: { address: env.mailtrap.fromEmail, name: env.mailtrap.fromName },
        subject,
        html,
        /*
         * A text/plain alternative on every message. Not decoration: a
         * multipart/alternative message scores materially better with spam
         * filters than an HTML-only one, and it is what a screen reader and a
         * plain-text client actually render.
         */
        text,
        /* Groups sends in a Mailtrap search, so "how many confirmations
           bounced last week" is answerable without reading a log. */
        headers: { 'X-Entity-Ref-ID': category },
      }),
      /*
       * A ceiling over the whole operation, not just the socket. Nodemailer's
       * three timeouts cover a connection; this also covers time spent waiting
       * for a free connection in the pool, which no socket timeout can see.
       */
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new TransientEmailError(`Mailtrap timed out after ${env.mailtrap.timeoutMs}ms`)),
          env.mailtrap.timeoutMs,
        );
        timer.unref?.();
      }),
    ]);

    /* The address is a personal identifier; the domain is enough to debug
       with, and is what §18's redaction rule leaves room for. */
    logger.info('email.sent', {
      template: category,
      detail: `${recipient.split('@')[1] ?? 'unknown'} via mailtrap`,
    });
    return { status: 'sent', recipient, messageId: info.messageId };
  } catch (error) {
    if (error instanceof TransientEmailError) {
      logger.warn('email.transient_failure', { template: category, detail: error.message });
      throw error;
    }

    const { transient, message } = classify(error);
    if (transient) {
      logger.warn('email.transient_failure', { template: category, detail: message });
      throw new TransientEmailError(message);
    }

    logger.error('email.permanent_failure', { template: category, detail: message });
    return { status: 'failed', recipient, error: message };
  } finally {
    // Otherwise a fast send leaves a 10-second timer holding a reference.
    if (timer) clearTimeout(timer);
  }
}
