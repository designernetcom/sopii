/*
 * Sends one order-confirmation email, to prove the Mailtrap setup works.
 * ===========================================================================
 * Renders a REAL order from the database rather than a fixture, so what lands
 * in the inbox is what a customer would actually receive — real products, real
 * totals, real address, the same template the queue uses. Only the recipient
 * is overridden; the order document is not touched and no delivery status is
 * recorded against it, because this is a test of the transport, not an event
 * in that order's history.
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *   npm run email:test -- you@example.com
 *   npm run email:test -- you@example.com SOP11354     # a specific order
 *
 * Against a Mailtrap **sandbox** inbox the recipient barely matters: every
 * message is captured in the inbox whatever address it is addressed to, which
 * is the whole point of the sandbox. Against a **live** sending domain it is a
 * real delivery to a real person, so pass an address you own.
 *
 * ---------------------------------------------------------------------------
 * THE TWO ERRORS YOU WILL PROBABLY SEE FIRST
 * ---------------------------------------------------------------------------
 *   "Invalid login: 535 5.7.0 Invalid credentials"
 *       MAILTRAP_USER / MAILTRAP_PASSWORD are wrong, or they are from a
 *       different inbox than MAILTRAP_HOST points at. Mailtrap shows the exact
 *       pair on the inbox's SMTP Settings tab — pick "Nodemailer" from the
 *       integrations dropdown and copy the four values from there.
 *
 *   "550 5.7.1 Sending from domain <x> is not allowed"  (live sending only)
 *       MAILTRAP_FROM_EMAIL is not on a domain verified in Mailtrap. A freemail
 *       address (gmail.com, outlook.com) can never work here — nobody can prove
 *       ownership of it — so this needs either a domain verified under Sending
 *       Domains, or Mailtrap's demo domain (hello@demomailtrap.co), which only
 *       delivers to the address on your own Mailtrap account. The sandbox does
 *       not enforce any of this, which is why the error appears the day you go
 *       live and not before.
 */

import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

import { env } from '../env.js';
import { connectDb, disconnectDb } from './connect.js';
import { OrderModel } from './models.js';
import { EmailService, TransientEmailError, type OrderLike } from '../lib/email.js';
import { flushDeliveryLog } from '../lib/emailLog.js';
import {
  closeTransport,
  describeTransport,
  isConfigured,
  missingConfig,
  verifyConnection,
} from '../lib/mailtrap.js';

async function main() {
  const [to, code] = process.argv.slice(2);

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    console.error('Usage: npm run email:test -- <recipient@example.com> [ORDER_CODE]');
    process.exitCode = 1;
    return;
  }

  console.log(`[mail] relay  mailtrap — ${describeTransport()}`);
  console.log(`[mail] from   ${env.mailtrap.fromName} <${env.mailtrap.fromEmail || '(unset)'}>`);
  console.log(`[mail] to     ${to}`);

  if (!isConfigured) {
    console.error(
      `\n[mail] Mailtrap is not configured — ${missingConfig()}.\n` +
        '       Set them in SOPI-Admin/server/.env; the values are on the inbox\n' +
        '       SMTP Settings tab (sandbox) or under Sending Domains (live).\n',
    );
    process.exitCode = 1;
    return;
  }

  /* One round trip that proves the relay accepts the credentials, before a
     failed send makes it look like the message was the problem. */
  try {
    await verifyConnection();
    console.log('[mail] smtp   handshake and auth OK');
  } catch (error) {
    console.error(`\n[mail] ✕ Mailtrap connection failed — ${(error as Error).message}\n`);
    closeTransport();
    process.exitCode = 1;
    return;
  }

  await connectDb();

  /* A specific order if one was named, otherwise the most recent — whatever it
     is, it is a real order, which is the point. */
  const order = code
    ? await OrderModel.findOne({ code }).lean<OrderLike>()
    : await OrderModel.findOne({}).sort({ placedAt: -1 }).lean<OrderLike>();

  if (!order) {
    console.error('[mail] no order found to render. Place one first, or pass an order code.');
    await disconnectDb();
    closeTransport();
    process.exitCode = 1;
    return;
  }

  console.log(
    `[mail] order  ${order.code} — ${(order.items ?? []).length} item(s), total ₹${order.total ?? 0}`,
  );

  try {
    /*
     * The spread is what redirects it: the stored order keeps its own address.
     * `sendOrderConfirmation` renders and delivers without writing anything
     * back to the order, which is what makes this safe to run against
     * production data.
     */
    const result = await EmailService.sendOrderConfirmation(
      { ...order, customerEmail: to },
      { source: 'script' },
    );

    if (result.status === 'sent') {
      console.log(`\n[mail] ✓ sent — message id ${result.messageId ?? '(none returned)'}`);
      console.log('[mail]   Open your Mailtrap inbox; a live domain delivers to the address.\n');
    } else {
      console.error(`\n[mail] ✕ ${result.status} — ${result.error ?? 'no reason given'}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    /* Transient here means the queue would have retried it. Reported plainly
       rather than as a crash, because "Mailtrap timed out" is a different
       problem from "your configuration is wrong". */
    const message = error instanceof TransientEmailError ? error.message : String(error);
    console.error(`\n[mail] ✕ transient failure — ${message}`);
    console.error('[mail]   A queued send would have been retried with backoff.\n');
    process.exitCode = 1;
  }

  closeTransport();
  /* The delivery-log write is fire-and-forget; drain it before pulling the
     connection out from under it, or the attempt this script just made is the
     one that never gets recorded. */
  await flushDeliveryLog();
  await disconnectDb();
  await mongoose.disconnect().catch(() => {});
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[mail] failed:', error?.message ?? error);
    process.exit(1);
  });
}
