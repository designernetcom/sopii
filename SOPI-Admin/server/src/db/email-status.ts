/*
 * What has this store actually emailed, and what became of it?
 * ===========================================================================
 * Read-only. Answers the question "did the customer get their confirmation"
 * from the three places that know, in the order an operator would check them:
 *
 *   1. the order's own `emailNotifications` — what the panel shows
 *   2. the `email_log` collection — every attempt, including the failed ones
 *   3. the job queue — anything still waiting, retrying, or given up on
 *
 * A confirmation that never arrived is one of those three: recorded as failed,
 * never attempted, or stuck in the queue. Checking all three at once is what
 * distinguishes "the mailer is broken" from "the job never ran".
 *
 *   npm run email:status            the last 10 orders
 *   npm run email:status -- 25      the last 25
 *
 * Addresses are masked. This prints to a terminal that may be shared, and the
 * domain is enough to tell whether the right person was emailed.
 */

import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

import { connectDb, disconnectDb } from './connect.js';
import { OrderModel } from './models.js';
import { EmailLogModel } from '../lib/emailLog.js';
import { JobModel } from '../lib/queue.js';
import { isConfigured, describeTransport, missingConfig } from '../lib/mailtrap.js';
import { env } from '../env.js';

/** `meera@example.com` → `m***a@example.com`. Enough to identify, not to leak. */
const mask = (address: unknown) => {
  const value = String(address ?? '');
  const [local, domain] = value.split('@');
  if (!domain) return value || '—';
  const head = local.slice(0, 1);
  const tail = local.length > 1 ? local.slice(-1) : '';
  return `${head}***${tail}@${domain}`;
};

const ago = (value: unknown) => {
  const at = value ? new Date(String(value)).getTime() : NaN;
  if (Number.isNaN(at)) return '—';
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
};

const TICK = { sent: '✓', failed: '✕', skipped: '·' } as const;

async function main() {
  const limit = Number(process.argv[2] ?? 10) || 10;

  console.log('\n── mailer ────────────────────────────────────────────────────');
  console.log(`  configured   ${isConfigured ? 'yes' : `NO — ${missingConfig()}`}`);
  console.log(`  relay        ${describeTransport()}`);
  console.log(`  from         ${env.mailtrap.fromName} <${env.mailtrap.fromEmail || '(unset)'}>`);

  await connectDb();

  /* ---- 1. the orders, and what the panel would show for each ---- */

  const orders = await OrderModel.find({})
    .sort({ placedAt: -1 })
    .limit(limit)
    .select('code customerEmail placedAt paymentMethod paymentStatus status emailNotifications')
    .lean<Record<string, any>[]>();

  console.log(`\n── last ${orders.length} orders ─────────────────────────────────────────`);

  if (!orders.length) console.log('  (no orders yet)');

  let confirmed = 0;
  let missing = 0;

  for (const order of orders) {
    const record = order.emailNotifications?.find(
      (entry: Record<string, unknown>) => entry.kind === 'order_confirmation',
    );

    const state = record
      ? `${TICK[record.status as keyof typeof TICK] ?? '?'} ${record.status}`
      : '⚠ never attempted';

    if (record?.status === 'sent') confirmed += 1;
    else missing += 1;

    console.log(
      `  ${order.code.padEnd(10)} ${String(order.paymentMethod ?? '?').padEnd(9)} ` +
        `${String(order.paymentStatus ?? '?').padEnd(8)} ${ago(order.placedAt).padEnd(9)} ` +
        `${state.padEnd(18)} ${mask(order.customerEmail)}`,
    );

    if (record?.attempts > 1 || record?.error) {
      console.log(
        `             ↳ attempts ${record.attempts ?? 0}` +
          (record.error ? ` — ${String(record.error).slice(0, 90)}` : ''),
      );
    }
  }

  /* ---- 2. every attempt, including ones the order no longer shows ---- */

  const log = await EmailLogModel.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<Record<string, any>[]>();

  console.log(`\n── delivery log (last ${log.length}) ──────────────────────────────────`);
  if (!log.length) {
    console.log('  (empty — nothing has been attempted since the log was added)');
  }
  for (const entry of log) {
    console.log(
      `  ${TICK[entry.status as keyof typeof TICK] ?? '?'} ${String(entry.kind).padEnd(20)} ` +
        `${String(entry.orderCode ?? '—').padEnd(10)} ${ago(entry.createdAt).padEnd(9)} ` +
        `${String(entry.durationMs ?? '?').padStart(5)}ms  ${String(entry.source).padEnd(12)} ${mask(entry.recipient)}`,
    );
    if (entry.error) console.log(`    ↳ ${String(entry.error).slice(0, 100)}`);
  }

  /* ---- 3. anything the queue is still holding ---- */

  const jobs = await JobModel.find({ type: { $in: ['email.send', 'order.placed'] } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<Record<string, any>[]>();

  console.log(`\n── queue: order.placed / email.send (last ${jobs.length}) ─────────────`);
  if (!jobs.length) console.log('  (none)');
  for (const job of jobs) {
    console.log(
      `  ${String(job.status).padEnd(9)} ${String(job.type).padEnd(14)} ` +
        `attempts ${String(job.attempts).padEnd(3)} ${ago(job.createdAt).padEnd(9)} ${job.dedupeKey ?? ''}`,
    );
    if (job.lastError) console.log(`    ↳ ${String(job.lastError).slice(0, 100)}`);
  }

  console.log(
    `\n  ${confirmed} of the last ${orders.length} orders have a confirmation recorded as sent.` +
      (missing ? `  ${missing} do not.` : ''),
  );
  console.log('');

  await disconnectDb();
  await mongoose.disconnect().catch(() => {});
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[status] failed:', error?.message ?? error);
    process.exit(1);
  });
}
