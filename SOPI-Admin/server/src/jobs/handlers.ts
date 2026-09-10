/*
 * What the worker actually does (§13, §14).
 * ===========================================================================
 * Every handler here is work that used to sit inside a request — mostly inside
 * checkout — and is now enqueued instead. Two properties are non-negotiable
 * for anything in this file:
 *
 * 1. **Idempotent.** A job can run twice: a worker can die after doing the work
 *    and before marking it done, and the lease will then be reclaimed. So each
 *    handler is written so that running it a second time is a no-op — the
 *    notification is upserted on a stable key rather than inserted, and so on.
 * 2. **Throws on a *transient* failure, returns on a permanent one.** Throwing
 *    schedules a retry with backoff; returning marks the job done. A malformed
 *    payload will never succeed however many times it runs, so it is logged and
 *    swallowed rather than retried five times on the way to the failed pile.
 *
 * Email goes out through Mailtrap (`lib/email.ts` → `lib/mailtrap.ts`); the
 * SMS and WhatsApp handlers are still seams. That the email one survived a
 * whole change of provider without this file's control flow moving — because
 * checkout enqueues the job and does not wait for it, and the handler only
 * maps two outcomes onto the queue's contract — is what the seam was for.
 */

import { NotificationModel } from '../db/models.js';
import { invalidate, NAMESPACE } from '../lib/cache.js';
import { EmailService, sendAndRecordOrderEmail, type OrderEmailKind } from '../lib/email.js';
import { logger } from '../lib/logger.js';
import { JOB, registerHandler } from '../lib/queue.js';
import { whatsappEnabled } from '../auth/whatsappConfig.js';

/* ------------------------------ order follow-up ----------------------------- */

interface OrderPlacedPayload {
  orderId?: string;
  code?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  total?: number;
}

/**
 * The bell in the admin panel's header.
 *
 * Upserted on the order code rather than inserted, so a replayed job leaves one
 * notification. That is the idempotency requirement above, in its simplest
 * form: the natural key of "the notification about order SOP10711" is the order
 * code, so that is the `_id`.
 */
registerHandler(JOB.orderNotification, async (raw) => {
  const payload = raw as OrderPlacedPayload;
  if (!payload.code) {
    logger.warn('job.order_notification.skipped', { detail: 'no order code in payload' });
    return;
  }

  const total = Number(payload.total) || 0;

  await NotificationModel.updateOne(
    { _id: `ntf_order_${payload.code}` },
    {
      $set: {
        type: 'new_order',
        title: `New order ${payload.code}`,
        message: `${payload.customerName ?? 'A customer'} placed an order worth ₹${total.toLocaleString('en-IN')}.`,
        link: `/admin/orders/${payload.orderId ?? payload.code}`,
      },
      $setOnInsert: { read: false, createdAt: new Date().toISOString() },
    },
    { upsert: true },
  );
});

/**
 * Everything else an order sets off, fanned out into its own jobs.
 *
 * Fanning out rather than doing the work inline is what stops one slow channel
 * blocking the others: a WhatsApp provider timing out must not delay the
 * confirmation email, and neither must hold up the analytics invalidation.
 */
registerHandler(JOB.orderPlaced, async (raw) => {
  const payload = raw as OrderPlacedPayload;
  const { enqueue } = await import('../lib/queue.js');

  await enqueue(JOB.orderNotification, { ...payload }, { dedupeKey: `ntf:${payload.code}` });

  if (payload.customerEmail) {
    await enqueue(
      JOB.emailSend,
      {
        to: payload.customerEmail,
        template: 'order_confirmation',
        /* Identity only. The handler reads the order itself, so nothing here
           can go stale between this insert and the send. */
        data: { orderId: payload.orderId, code: payload.code },
      },
      { dedupeKey: `mail:order:${payload.code}` },
    );
  }

  if (payload.customerPhone) {
    await enqueue(
      JOB.whatsappSend,
      {
        to: payload.customerPhone,
        template: 'order_confirmation',
        data: { code: payload.code, total: payload.total },
      },
      { dedupeKey: `wa:order:${payload.code}` },
    );
  }

  // The dashboard's numbers moved; drop the cached ones.
  await invalidate(NAMESPACE.analytics);
});

/* -------------------------------- notification ------------------------------ */

/**
 * Email, through Mailtrap.
 *
 * The order is loaded by `sendAndRecordOrderEmail` rather than carried in the
 * payload — see the note on that function. This handler's whole job is to map
 * the two outcomes onto the queue's contract:
 *
 *   throws  → transient (5xx, 429, timeout). Rescheduled with backoff.
 *   returns → done. Either sent, or failed for a reason a retry cannot fix.
 *
 * Duplicate prevention has two layers, and this handler relies on both.
 * `writeOrder` passes `dedupeKey: mail:order:{code}`, whose unique index makes
 * a replayed checkout produce one job rather than two. But a job can still run
 * twice — a worker that sends and then dies before marking the job done has
 * its lease reclaimed — so `sendAndRecordOrderEmail` checks the order's own
 * recorded status before sending. The queue stops the second *job*; the
 * service stops the second *send*.
 */
registerHandler(JOB.emailSend, async (payload) => {
  const template = String(payload.template ?? 'generic');

  const kind = ORDER_EMAIL_KINDS.find((k) => k === template);
  if (!kind) {
    // Nothing else sends mail yet. A payload naming an unknown template is a
    // bug in the caller, not a fault to retry.
    logger.warn('job.email.unknown_template', { template });
    return;
  }

  const data = (payload.data ?? {}) as { orderId?: string; code?: string };
  const result = await sendAndRecordOrderEmail({ id: data.orderId, code: data.code }, kind);

  if (result.status === 'failed') {
    logger.warn('job.email.failed', { template, detail: result.error ?? 'unknown' });
  }
});

/* ------------------------------ password reset ------------------------------ */

/**
 * The reset link, retried.
 *
 * `/forgot-password` sends inline and only enqueues this when that attempt
 * failed in a way a retry might clear — a timeout, a throttle, a 4xx. So this
 * handler exists for the case the shopper has already been told "instructions
 * have been sent": the sentence is a promise, and one flaky SMTP round trip
 * should not be what breaks it.
 *
 * Bounded by the link itself rather than by the queue. Five attempts at 2s,
 * 4s, 8s, 16s, 32s all land inside the hour the token is good for, but a job
 * whose lease was reclaimed by a worker restart could come back much later,
 * and mailing a dead link is worse than mailing nothing — so `expiresAt` is
 * checked first and an expired job is dropped rather than retried.
 *
 * Idempotent in the only sense that matters here: running twice sends the same
 * one-time link to the same mailbox twice. It does not mint a second token and
 * does not invalidate the first.
 *
 * NOTHING IDENTIFYING IS LOGGED, and the URL never is — it carries the token,
 * which is the credential.
 */
registerHandler(JOB.passwordResetSend, async (payload) => {
  const to = String(payload.to ?? '');
  const resetUrl = String(payload.resetUrl ?? '');

  if (!to || !resetUrl) {
    // A payload this shape will never succeed, so it is dropped rather than
    // retried five times on the way to the failed pile.
    logger.warn('job.password_reset.malformed', { detail: 'missing recipient or link' });
    return;
  }

  const expiresAt = Number(payload.expiresAt ?? 0);
  if (expiresAt && expiresAt <= Date.now()) {
    logger.warn('job.password_reset.expired', { detail: 'link expired before it could be sent' });
    return;
  }

  /*
   * `rethrowTransient` is what makes the retry happen: the service reports a
   * transient fault as a value for the route's sake, and as a throw for ours.
   */
  const result = await EmailService.sendPasswordReset({
    to,
    resetUrl,
    name: payload.name ? String(payload.name) : undefined,
    expiresIn: payload.expiresIn ? String(payload.expiresIn) : undefined,
    attempt: Number(payload.attempt ?? 2),
    source: 'queue',
    rethrowTransient: true,
  });

  if (result.status !== 'sent') {
    // Permanent, or the mailer is unconfigured. Neither improves on a retry.
    logger.warn('job.password_reset.failed', { detail: result.error ?? 'unknown' });
  }
});

/** The templates the email handler knows how to render. */
const ORDER_EMAIL_KINDS = [
  'order_confirmation',
  'order_shipped',
  'order_delivered',
  'order_cancelled',
] as const satisfies readonly OrderEmailKind[];

/**
 * WhatsApp.
 *
 * Deliberately does not send yet, and the reason is a constraint rather than an
 * omission: `auth/whatsapp.ts` sends *authentication* templates, and Meta will
 * not deliver a business-initiated message that is not an approved template of
 * the right category. An order-confirmation template has to be submitted and
 * approved before there is anything to call, so what this handler does today is
 * confirm a provider exists and record the intent.
 *
 * When that template is approved, this is where it goes — and because checkout
 * already enqueues the job and does not wait for it, adding the send is a
 * change to this function and nothing else.
 */
registerHandler(JOB.whatsappSend, async (payload) => {
  const to = String(payload.to ?? '');
  if (!to) return;

  if (!(await whatsappEnabled())) {
    logger.info('job.whatsapp.not_configured', { detail: 'no WhatsApp provider configured' });
    return;
  }

  logger.info('job.whatsapp.pending_template', {
    detail: `order template not yet approved — ${String(payload.template ?? 'generic')} not sent`,
  });
});

registerHandler(JOB.smsSend, async (payload) => {
  logger.info('job.sms.queued', { detail: String(payload.template ?? 'generic') });
});

/* ---------------------------------- exports --------------------------------- */

/**
 * §12's "export jobs processed asynchronously".
 *
 * A CSV of a million orders is minutes of streaming and hundreds of megabytes;
 * building it inside a request holds an HTTP connection open for the duration
 * and holds the whole result in memory. The seam is here so the admin panel's
 * export button becomes "we will email you a link" rather than a spinner that
 * eventually times out.
 */
registerHandler(JOB.exportGenerate, async (payload) => {
  logger.info('job.export.requested', {
    detail: `${String(payload.resource ?? 'unknown')} requested by ${String(payload.requestedBy ?? 'unknown')}`,
  });
});

registerHandler(JOB.analyticsRollup, async () => {
  await invalidate(NAMESPACE.analytics);
});

/** Imported for its side effects; the export makes that explicit to a reader. */
export const handlersRegistered = true;
