/*
 * End-to-end email delivery, against a real SMTP server.
 * ===========================================================================
 * `email.test.ts` covers rendering and classification as pure functions. This
 * file covers the thing those cannot: that a message actually leaves the
 * process, over a socket, through nodemailer, with the right envelope — and
 * that every failure mode behaves the way the retry design assumes.
 *
 * THE FAKE RELAY
 * ---------------------------------------------------------------------------
 * A ~90-line SMTP server on a random port, speaking enough of RFC 5321 for
 * nodemailer to complete a session: EHLO, AUTH LOGIN, MAIL FROM, RCPT TO,
 * DATA, QUIT. It captures what it receives and can be told to answer 421 or
 * 550 on demand, which is how the transient/permanent split is tested against
 * the real client rather than against a hand-made error object.
 *
 * Standing one up rather than mocking `nodemailer` is deliberate. A mock
 * asserts that we called a function; this asserts that a message with the
 * right From, To, Subject and body reached a relay and was acknowledged —
 * which is the part that was actually broken when the provider changed.
 *
 * WHY THE DYNAMIC IMPORTS
 * ---------------------------------------------------------------------------
 * `env.ts` reads `process.env` at import time and `lib/mailtrap.ts` builds its
 * pool from that. Static imports are hoisted above any assignment, so the
 * MAILTRAP_* values are set first and the modules are pulled in afterwards.
 *
 * Run with:  npm test        (in server/)
 */

import assert from 'node:assert/strict';
import net from 'node:net';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';

/* ------------------------------- the fake relay ----------------------------- */

interface Captured {
  from: string;
  to: string[];
  data: string;
}

interface FakeRelay {
  port: number;
  captured: Captured[];
  /** Answer every DATA with this code instead of 250. Reset by `reset()`. */
  failWith: { code: number; text: string } | null;
  reset(): void;
  close(): Promise<void>;
}

async function startRelay(): Promise<FakeRelay> {
  const captured: Captured[] = [];
  const state: FakeRelay = {
    port: 0,
    captured,
    failWith: null,
    reset() {
      captured.length = 0;
      state.failWith = null;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };

  const server = net.createServer((socket) => {
    let inData = false;
    let buffer = '';
    let body = '';
    let from = '';
    let to: string[] = [];

    const say = (line: string) => socket.write(`${line}\r\n`);
    say('220 fake.mailtrap.test ESMTP ready');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      for (;;) {
        const index = buffer.indexOf('\r\n');
        if (index === -1) break;
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            if (state.failWith) {
              say(`${state.failWith.code} ${state.failWith.text}`);
            } else {
              captured.push({ from, to: [...to], data: body });
              say('250 2.0.0 Ok: queued as FAKE1');
            }
            body = '';
            to = [];
            continue;
          }
          // Dot-stuffing: a body line starting with '.' arrives doubled.
          body += `${line.startsWith('..') ? line.slice(1) : line}\n`;
          continue;
        }

        const command = line.slice(0, 4).toUpperCase();

        if (command === 'EHLO' || command === 'HELO') {
          say('250-fake.mailtrap.test');
          say('250-AUTH LOGIN PLAIN');
          say('250 SMTPUTF8');
        } else if (command === 'AUTH') {
          // LOGIN is a three-step exchange; accept whatever is offered.
          say('334 VXNlcm5hbWU6');
        } else if (command === 'MAIL') {
          from = /<([^>]*)>/.exec(line)?.[1] ?? '';
          say('250 2.1.0 Ok');
        } else if (command === 'RCPT') {
          const address = /<([^>]*)>/.exec(line)?.[1] ?? '';
          if (address) to.push(address);
          say('250 2.1.5 Ok');
        } else if (command === 'DATA') {
          inData = true;
          say('354 End data with <CR><LF>.<CR><LF>');
        } else if (command === 'QUIT') {
          say('221 2.0.0 Bye');
          socket.end();
        } else if (command === 'RSET') {
          say('250 2.0.0 Ok');
        } else {
          /* The base64 lines of an AUTH LOGIN exchange land here: the username
             prompt was answered, so ask for the password, then accept. */
          say(to.length || from ? '250 2.0.0 Ok' : '235 2.7.0 Authentication successful');
        }
      }
    });

    socket.on('error', () => {
      /* A client that hangs up mid-session is a case under test, not a fault. */
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.port = (server.address() as net.AddressInfo).port;
  return state;
}

/** The decoded body of a captured message — quoted-printable and base64 both. */
function bodyOf(message: Captured): string {
  const raw = message.data;
  const base64Parts = raw.match(/(?:^[A-Za-z0-9+/=]{60,}$\n?)+/gm) ?? [];
  const decoded = base64Parts
    .map((part) => Buffer.from(part.replace(/\n/g, ''), 'base64').toString('utf8'))
    .join('\n');

  const quotedPrintable = raw
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));

  return `${quotedPrintable}\n${decoded}`;
}

/** The Subject header, undoing RFC 2047 encoding if the mailer applied it. */
function subjectOf(message: Captured): string {
  const line = /^Subject: (.*)$/m.exec(message.data)?.[1] ?? '';
  const encoded = /=\?UTF-8\?B\?(.+?)\?=/i.exec(line);
  return encoded ? Buffer.from(encoded[1], 'base64').toString('utf8') : line;
}

/* --------------------------------- harness ---------------------------------- */

let relay: FakeRelay;
let embedded: { stop: () => Promise<boolean> } | null = null;

/* Bound after the environment is set, because `env.ts` reads it on import. */
let email: typeof import('../lib/email.js');
let mailtrap: typeof import('../lib/mailtrap.js');
let models: typeof import('../db/models.js');
let emailLog: typeof import('../lib/emailLog.js');

const ORDER_ID = 'ord_mailtrap_test';
const ORDER_CODE = 'SOP99001';

before(async () => {
  relay = await startRelay();

  process.env.MAILTRAP_HOST = '127.0.0.1';
  process.env.MAILTRAP_PORT = String(relay.port);
  process.env.MAILTRAP_USER = 'test-inbox-user';
  process.env.MAILTRAP_PASSWORD = 'test-inbox-password';
  process.env.MAILTRAP_FROM_EMAIL = 'orders@sopii.test';
  process.env.MAILTRAP_FROM_NAME = 'SOPII';
  process.env.MAILTRAP_TIMEOUT_MS = '4000';
  process.env.SHOP_URL = 'https://shop.sopii.test';
  process.env.SUPPORT_EMAIL = 'care@sopii.test';

  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/sopii_test';
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
  } catch {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    embedded = server;
    await mongoose.connect(server.getUri('sopii_test'));
  }

  email = await import('../lib/email.js');
  mailtrap = await import('../lib/mailtrap.js');
  models = await import('../db/models.js');
  emailLog = await import('../lib/emailLog.js');

  assert.equal(mailtrap.isConfigured, true, 'the fake relay should read as configured');
});

after(async () => {
  mailtrap?.closeTransport();
  await models?.OrderModel.deleteMany({ _id: ORDER_ID });
  await emailLog?.EmailLogModel.deleteMany({ orderCode: ORDER_CODE });
  await mongoose.disconnect();
  if (embedded) await embedded.stop();
  await relay.close();
});

/** A confirmed order in the database, as `writeOrder` would have left it. */
async function seedOrder(overrides: Record<string, unknown> = {}) {
  await models.OrderModel.deleteOne({ _id: ORDER_ID });
  await emailLog.EmailLogModel.deleteMany({ orderCode: ORDER_CODE });
  relay.reset();

  await models.OrderModel.create({
    _id: ORDER_ID,
    code: ORDER_CODE,
    customerId: 'cus_test',
    customerName: 'Meera Iyer',
    customerEmail: 'meera@example.com',
    items: [
      {
        productId: 'prd_1',
        name: 'Ivory Handwoven Saree',
        image: 'https://res.cloudinary.com/demo/image/upload/saree.jpg',
        sku: 'SKU-1',
        price: 4599,
        quantity: 2,
        total: 9198,
      },
    ],
    subtotal: 9198,
    discount: 0,
    tax: 460,
    shipping: 0,
    codCharge: 0,
    total: 9658,
    status: 'confirmed',
    paymentStatus: 'paid',
    paymentMethod: 'razorpay',
    fulfillment: 'unfulfilled',
    shippingAddress: {
      name: 'Meera Iyer',
      line1: '14 Turner Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      phone: '+919820011223',
    },
    emailNotifications: [],
    placedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });
}

const reload = () => models.OrderModel.findById(ORDER_ID).lean<Record<string, any>>();

/* ------------------------- the paths that must send ------------------------- */

describe('order confirmation reaches the relay', () => {
  /* Razorpay success → backend verification → writeOrder → queue → this. */
  it('delivers a paid Razorpay order, with the right envelope and content', async () => {
    await seedOrder({ paymentMethod: 'razorpay', paymentStatus: 'paid' });

    const result = await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');

    assert.equal(result.status, 'sent');
    assert.equal(result.recipient, 'meera@example.com');
    assert.ok(result.messageId, 'the relay assigned no Message-ID');

    assert.equal(relay.captured.length, 1, 'expected exactly one message');
    const [message] = relay.captured;

    assert.equal(message.from, 'orders@sopii.test', 'wrong envelope sender');
    assert.deepEqual(message.to, ['meera@example.com']);
    assert.equal(subjectOf(message), `Order ${ORDER_CODE} confirmed`);

    const body = bodyOf(message);
    assert.match(body, /Ivory Handwoven Saree/);
    assert.match(body, /SOP99001/);
    assert.match(body, /Meera/);
    /* multipart/alternative: an HTML-only transactional email is filtered
       harder and is unreadable to a screen reader. */
    assert.match(message.data, /multipart\/alternative/);
    assert.match(message.data, /text\/plain/);
    assert.match(message.data, /text\/html/);
  });

  /* UPI settled inside the Razorpay popup — a different `paymentMethod` on the
     same code path, and the receipt must name it correctly. */
  it('delivers a paid UPI order and names UPI as the method', async () => {
    await seedOrder({ paymentMethod: 'upi', paymentStatus: 'paid' });

    const result = await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');

    assert.equal(result.status, 'sent');
    assert.equal(relay.captured.length, 1);
    assert.match(bodyOf(relay.captured[0]), /Paid by UPI/);
  });

  /* COD: order created, payment pending, order confirmed → email. */
  it('delivers a COD order and says the amount is due on delivery', async () => {
    await seedOrder({ paymentMethod: 'cod', paymentStatus: 'pending', status: 'confirmed' });

    const result = await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');

    assert.equal(result.status, 'sent');
    assert.equal(relay.captured.length, 1);
    assert.match(bodyOf(relay.captured[0]), /Cash on Delivery/);
  });

  it('records the outcome on the order, where the panel reads it', async () => {
    await seedOrder();
    await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');

    const order = await reload();
    const record = order?.emailNotifications?.find(
      (entry: Record<string, unknown>) => entry.kind === 'order_confirmation',
    );

    assert.ok(record, 'nothing was recorded against the order');
    assert.equal(record.status, 'sent');
    assert.equal(record.recipient, 'meera@example.com');
    assert.equal(record.attempts, 1);
    assert.ok(record.sentAt, 'no sentAt for a successful send');
    assert.ok(record.messageId, 'no messageId for a successful send');
  });

  it('writes an entry to the delivery log', async () => {
    await seedOrder();
    await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');

    /* The log write is deliberately not awaited by the send path. Draining it
       is exactly what the shutdown handlers do, and it is what stops the last
       entries of a deploy being lost to a disconnect that beat them. */
    await emailLog.flushDeliveryLog();

    const entries = await emailLog.deliveryHistory(ORDER_CODE);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, 'order_confirmation');
    assert.equal(entries[0].status, 'sent');
    assert.equal(entries[0].source, 'queue');
    assert.ok(typeof entries[0].durationMs === 'number');
  });

  it('sends the password reset link, and nothing but the link', async () => {
    relay.reset();

    const result = await email.EmailService.sendPasswordReset({
      to: 'meera@example.com',
      resetUrl: 'https://shop.sopii.test/reset-password?token=secret-token-value',
      name: 'Meera',
      expiresIn: '1 hour',
    });

    assert.equal(result.status, 'sent');
    assert.equal(relay.captured.length, 1);
    assert.equal(subjectOf(relay.captured[0]), 'Reset your SOPII password');

    const body = bodyOf(relay.captured[0]);
    assert.match(body, /secret-token-value/);
    assert.match(body, /1 hour/);
  });
});

/* --------------------------- duplicate prevention --------------------------- */

describe('a job that runs twice', () => {
  /*
   * The queue's unique dedupeKey stops the job existing twice. This is the
   * second layer: a worker that sends and then dies before marking the job
   * done has its lease reclaimed and the job runs again. Without the guard the
   * shopper receives two confirmations for one order.
   */
  it('does not mail the customer twice', async () => {
    await seedOrder();

    const first = await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');
    const second = await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');

    assert.equal(first.status, 'sent');
    assert.equal(second.status, 'sent', 'a suppressed duplicate reports the earlier success');
    assert.equal(relay.captured.length, 1, 'the customer was emailed twice');
  });

  it('does not inflate the attempt count when it suppresses one', async () => {
    await seedOrder();

    await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');
    await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');

    const order = await reload();
    const record = order?.emailNotifications?.find(
      (entry: Record<string, unknown>) => entry.kind === 'order_confirmation',
    );
    assert.equal(record.attempts, 1);
  });

  /* The panel's Resend button. An operator pressing it has *asked* for the
     duplicate, which is the one case that opts out of the guard. */
  it('still sends when an admin forces a resend', async () => {
    await seedOrder();

    await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');
    const resent = await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation', {
      force: true,
      source: 'admin:usr_test',
    });

    assert.equal(resent.status, 'sent');
    assert.equal(relay.captured.length, 2, 'the resend did not reach the relay');

    const order = await reload();
    const record = order?.emailNotifications?.find(
      (entry: Record<string, unknown>) => entry.kind === 'order_confirmation',
    );
    assert.equal(record.attempts, 2);
  });

  it('sends a different lifecycle email about the same order', async () => {
    await seedOrder();

    await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');
    const shipped = await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_shipped');

    assert.equal(shipped.status, 'sent');
    assert.equal(relay.captured.length, 2);
    assert.equal(subjectOf(relay.captured[1]), `Order ${ORDER_CODE} is on its way`);
  });
});

/* ------------------------------ failure handling ---------------------------- */

describe('when the relay rejects the message', () => {
  /*
   * SMTP 4xx is TEMPORARY. Throwing is what reschedules the queue job, and
   * greylisting — the commonest 4xx for a first-time sender — exists to be
   * retried.
   */
  it('throws on a 4xx, so the queue retries it', async () => {
    await seedOrder();
    relay.failWith = { code: 451, text: '4.7.1 Greylisted, try again later' };

    await assert.rejects(
      () => email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation'),
      (error: Error) => error.name === 'TransientEmailError',
    );
  });

  it('records the failed attempt so the panel can show it', async () => {
    await seedOrder();
    relay.failWith = { code: 451, text: '4.7.1 Greylisted, try again later' };

    await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation').catch(() => {});

    const order = await reload();
    const record = order?.emailNotifications?.find(
      (entry: Record<string, unknown>) => entry.kind === 'order_confirmation',
    );
    assert.equal(record.status, 'failed');
    assert.match(String(record.error), /Greylist/i);
    assert.equal(record.sentAt, '', 'a failure must not claim a send time');
  });

  /*
   * SMTP 5xx is PERMANENT. Returning marks the job done: retrying "no such
   * user" five times only delays the moment somebody reads the error.
   */
  it('returns failed on a 5xx rather than throwing, so it is not retried', async () => {
    await seedOrder();
    relay.failWith = { code: 550, text: '5.1.1 The email account does not exist' };

    const result = await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');

    assert.equal(result.status, 'failed');
    assert.match(String(result.error), /does not exist/);
  });

  /* The property the whole design exists for: the order is untouched by a mail
     failure. Nothing about its status, payment or items may move. */
  it('leaves the order itself completely intact', async () => {
    await seedOrder();
    relay.failWith = { code: 550, text: '5.1.1 The email account does not exist' };

    await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');

    const order = await reload();
    assert.equal(order?.status, 'confirmed');
    assert.equal(order?.paymentStatus, 'paid');
    assert.equal(order?.total, 9658);
    assert.equal(order?.items.length, 1);
  });

  /* A previous failure must not be mistaken for a delivery — the retry that
     fixes it has to be allowed through the duplicate guard. */
  it('lets a retry through after a failure', async () => {
    await seedOrder();

    relay.failWith = { code: 550, text: '5.1.1 The email account does not exist' };
    const failed = await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');
    assert.equal(failed.status, 'failed');

    relay.failWith = null;
    const retried = await email.sendAndRecordOrderEmail({ id: ORDER_ID }, 'order_confirmation');
    assert.equal(retried.status, 'sent');
    assert.equal(relay.captured.length, 1);
  });
});

describe('when there is no order to email about', () => {
  it('returns failed rather than throwing, so the job is not retried forever', async () => {
    const result = await email.sendAndRecordOrderEmail({ id: 'ord_does_not_exist' }, 'order_confirmation');
    assert.equal(result.status, 'failed');
    assert.match(String(result.error), /order not found/);
  });
});
