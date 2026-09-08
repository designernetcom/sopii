/*
 * Drives one confirmation through the REAL queue path, end to end.
 * ===========================================================================
 * `email:test` proves the transport: it renders an order and hands it to
 * Mailtrap directly. That is not the same thing as proving that *placing an
 * order sends an email*, because the path an order actually takes is longer:
 *
 *     writeOrder ─enqueue─▶ order.placed ─enqueue─▶ email.send
 *                                                       │
 *                              the worker claims it ────┘
 *                                                       ▼
 *                                          sendAndRecordOrderEmail
 *                                                       ▼
 *                                                    Mailtrap
 *
 * This script exercises that whole chain against a real order in the real
 * database, using the real worker — the only difference from a live checkout
 * is that the job is enqueued here rather than by `writeOrder`.
 *
 *   npm run email:verify -- SOP11358
 *   npm run email:verify                # the most recent order
 *
 * IT SENDS A REAL EMAIL to whatever address that order was placed with. Pass
 * an order of your own.
 */

import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

import { connectDb, disconnectDb } from './connect.js';
import { OrderModel } from './models.js';
import { flushDeliveryLog } from '../lib/emailLog.js';
import { closeTransport, describeTransport, isConfigured, missingConfig } from '../lib/mailtrap.js';
import { enqueue, JOB, JobModel, startWorker, stopWorker } from '../lib/queue.js';
import { env } from '../env.js';

import '../jobs/handlers.js';

const mask = (address: unknown) => {
  const value = String(address ?? '');
  const [local, domain] = value.split('@');
  if (!domain) return value || '—';
  return `${local.slice(0, 1)}***${local.length > 1 ? local.slice(-1) : ''}@${domain}`;
};

async function main() {
  const code = process.argv[2];

  console.log(`\n[verify] relay   ${describeTransport()}`);
  console.log(`[verify] from    ${env.mailtrap.fromName} <${env.mailtrap.fromEmail || '(unset)'}>`);

  if (!isConfigured) {
    console.error(`\n[verify] ✕ Mailtrap is not configured — ${missingConfig()}\n`);
    process.exitCode = 1;
    return;
  }

  await connectDb();

  const order = code
    ? await OrderModel.findOne({ code }).lean<Record<string, any>>()
    : await OrderModel.findOne({}).sort({ placedAt: -1 }).lean<Record<string, any>>();

  if (!order) {
    console.error('[verify] no such order.');
    await disconnectDb();
    process.exitCode = 1;
    return;
  }

  console.log(`[verify] order   ${order.code} → ${mask(order.customerEmail)}`);

  const before = order.emailNotifications?.find(
    (entry: Record<string, unknown>) => entry.kind === 'order_confirmation',
  );
  console.log(`[verify] before  ${before ? `${before.status} (${before.attempts} attempt(s))` : 'nothing recorded'}`);

  /*
   * A one-off dedupe key. The real one — `mail:order:{code}` — is already
   * taken by the job this order enqueued when it was placed, and reusing it
   * would be silently swallowed as a duplicate, which is exactly the
   * behaviour under test everywhere else.
   */
  const dedupeKey = `verify:${order.code}:${Date.now()}`;

  const jobId = await enqueue(
    JOB.emailSend,
    {
      to: order.customerEmail,
      template: 'order_confirmation',
      data: { orderId: order._id, code: order.code },
    },
    { dedupeKey },
  );

  if (!jobId) {
    console.error('[verify] ✕ the job could not be enqueued.');
    await disconnectDb();
    process.exitCode = 1;
    return;
  }

  console.log(`[verify] queued  ${jobId} — starting a worker`);

  /* The same worker the server runs, in this process. */
  startWorker();

  const deadline = Date.now() + 45_000;
  let job = await JobModel.findById(jobId).lean<Record<string, any>>();

  while (job && job.status !== 'done' && job.status !== 'failed' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    job = await JobModel.findById(jobId).lean<Record<string, any>>();
  }

  stopWorker();

  console.log(`[verify] job     ${job?.status ?? 'unknown'} after ${job?.attempts ?? 0} attempt(s)`);
  if (job?.lastError) console.log(`[verify]         ↳ ${job.lastError}`);

  const after = (
    await OrderModel.findById(order._id).select('emailNotifications').lean<Record<string, any>>()
  )?.emailNotifications?.find((entry: Record<string, unknown>) => entry.kind === 'order_confirmation');

  console.log(`[verify] after   ${after ? `${after.status} (${after.attempts} attempt(s))` : 'nothing recorded'}`);

  if (after?.status === 'sent') {
    console.log(`\n[verify] ✓ CONFIRMED — the queue path delivers.`);
    console.log(`[verify]   message id ${after.messageId || '(none)'}`);
    console.log(`[verify]   recipient  ${mask(after.recipient)}`);
    console.log(`[verify]   sent at    ${after.sentAt}\n`);
  } else {
    console.error(`\n[verify] ✕ NOT DELIVERED — recorded as ${after?.status ?? 'nothing'}.`);
    if (after?.error) console.error(`[verify]   ${after.error}`);
    console.error('');
    process.exitCode = 1;
  }

  /* The one-off job has served its purpose; leaving it would clutter the
     queue view with a row that never came from a real order. */
  await JobModel.deleteOne({ _id: jobId });

  closeTransport();
  await flushDeliveryLog();
  await disconnectDb();
  await mongoose.disconnect().catch(() => {});
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[verify] failed:', error?.message ?? error);
    process.exit(1);
  });
}
