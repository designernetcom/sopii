/*
 * Tests for the order-email rules that must not break.
 * ===========================================================================
 * Three categories, and the split matters:
 *
 *   1. **Rendering** — pure, no database, no network. That the template escapes
 *      what it substitutes, that the discount row appears only when there is a
 *      discount, that a COD order says so. These are the ones that catch a
 *      broken email before a customer receives it.
 *
 *   2. **Failure classification** — that an SMTP 4xx throws (so the queue
 *      retries) and a 5xx does not (so it does not burn five attempts on an
 *      address that will never work). This is the property the whole retry
 *      design rests on, and it is invisible until Mailtrap has a bad minute.
 *      Note that this is INVERTED from HTTP, which is the trap: in SMTP, 4xx
 *      is the temporary one.
 *
 *   3. **Duplicate prevention** — that a job which runs twice does not mail
 *      the customer twice, and that an operator pressing Resend still can.
 *
 * A fourth property — that a store with no mailer still checks out — lives in
 * `email-unconfigured.test.ts`, which has to clear MAILTRAP_* before anything
 * imports `env.ts` and therefore needs a process of its own.
 *
 * What is NOT tested here: that mail actually arrives. That needs real
 * credentials and a real inbox, and asserting on it in CI would mean a test
 * suite that fails when a third party is down. `npm run email:test` is the
 * manual version of that check; the seam is `mailtrap.send()`, and everything
 * above it is covered here.
 *
 * Run with:  npm test        (in server/)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildTemplateVars,
  EmailService,
  renderOrderText,
  renderTemplate,
  idempotencyKeyFor,
  type OrderLike,
} from '../lib/email.js';
import { classify, TransientEmailError } from '../lib/mailtrap.js';

/* ------------------------------- fixtures ---------------------------------- */

const order = (overrides: Partial<OrderLike> = {}): OrderLike => ({
  _id: 'ord_test_1',
  code: 'SOP10001',
  customerName: 'Meera Iyer',
  customerEmail: 'meera@example.com',
  createdAt: '2026-08-29T10:00:00.000Z',
  items: [
    {
      name: 'Ivory Handwoven Saree',
      image: 'https://res.cloudinary.com/demo/image/upload/saree.jpg',
      size: 'Free',
      color: 'Ivory',
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
  paymentMethod: 'razorpay',
  paymentStatus: 'paid',
  shippingEta: '2–4 business days',
  shippingAddress: {
    name: 'Meera Iyer',
    line1: '14 Turner Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400050',
    phone: '+919820011223',
  },
  ...overrides,
});

const TEMPLATE = '{{headline}}|{{orderNumber}}|{{total}}|{{paymentMethod}}{{paymentNote}}';

/* ------------------------------- rendering ---------------------------------- */

describe('order email rendering', () => {
  it('substitutes the order into the template', () => {
    const html = renderTemplate(TEMPLATE, buildTemplateVars('order_confirmation', order()));
    assert.match(html, /Order Confirmed/);
    assert.match(html, /SOP10001/);
    assert.match(html, /₹9,658/);
  });

  /*
   * The one that matters most. A product name is attacker-influenced — a seller
   * types it, an importer sets it — and it lands inside markup in somebody's
   * inbox. Escaping is at substitution time so no caller has to remember it.
   */
  it('escapes HTML in values rather than emitting it as markup', () => {
    const hostile = order({
      customerName: '<script>alert(1)</script>',
      items: [{ name: 'Saree <img src=x onerror=alert(1)>', price: 100, quantity: 1, total: 100 }],
    });

    const html = renderTemplate(
      '{{customerName}}{{#each products}}{{name}}{{/each}}',
      buildTemplateVars('order_confirmation', hostile),
    );

    assert.ok(!html.includes('<script>'), 'script tag survived escaping');
    assert.ok(!html.includes('<img'), 'img tag survived escaping');
    assert.match(html, /&lt;script&gt;/);
  });

  it('repeats the line-item block once per product', () => {
    const two = order({
      items: [
        { name: 'Saree A', price: 100, quantity: 1, total: 100 },
        { name: 'Saree B', price: 200, quantity: 2, total: 400 },
      ],
    });
    const html = renderTemplate(
      '{{#each products}}[{{name}}:{{quantity}}]{{/each}}',
      buildTemplateVars('order_confirmation', two),
    );
    assert.equal(html, '[Saree A:1][Saree B:2]');
  });

  it('shows the discount row only when there is a discount', () => {
    const without = renderTemplate(
      '{{#if hasDiscount}}DISCOUNT{{/if}}',
      buildTemplateVars('order_confirmation', order({ discount: 0 })),
    );
    assert.equal(without, '');

    const withDiscount = renderTemplate(
      '{{#if hasDiscount}}DISCOUNT {{discount}}{{discountLabel}}{{/if}}',
      buildTemplateVars('order_confirmation', order({ discount: 500, couponCode: 'FESTIVE10' })),
    );
    assert.match(withDiscount, /DISCOUNT ₹500 \(FESTIVE10\)/);
  });

  it('labels a COD order as cash on delivery, with the amount caveat', () => {
    const html = renderTemplate(
      TEMPLATE,
      buildTemplateVars(
        'order_confirmation',
        order({ paymentMethod: 'cod', paymentStatus: 'pending' }),
      ),
    );
    assert.match(html, /Cash on Delivery — please keep the amount ready/);
  });

  /* A UPI payment settled inside the Razorpay popup is recorded as `upi`, and
     "Upi" in a receipt reads as a typo rather than as an acronym. */
  it('labels a settled UPI payment as UPI, with no pending caveat', () => {
    const html = renderTemplate(
      TEMPLATE,
      buildTemplateVars('order_confirmation', order({ paymentMethod: 'upi', paymentStatus: 'paid' })),
    );
    assert.match(html, /\|UPI$/);
  });

  it('does not leave unresolved placeholders in the real order template', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');

    const file = path.resolve(
      path.dirname(url.fileURLToPath(import.meta.url)),
      '../templates/order-confirmation.html',
    );
    const html = renderTemplate(
      fs.readFileSync(file, 'utf8'),
      buildTemplateVars('order_confirmation', order()),
    );

    /* An unrendered {{token}} in a customer's inbox is the most visible way
       this can fail, and the easiest to miss in review. */
    const leftover = html.match(/\{\{[^}]+\}\}/g);
    assert.equal(leftover, null, `unresolved placeholders: ${leftover?.join(', ')}`);
    assert.match(html, /Ivory Handwoven Saree/);
    assert.match(html, /400050/);
  });

  /**
   * Every field the brief requires, asserted against the rendered HTML rather
   * than against `vars`. A value that is computed correctly and then not
   * placed in the template is still a missing field in the customer's inbox.
   */
  it('renders every field the order confirmation is required to carry', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');

    const file = path.resolve(
      path.dirname(url.fileURLToPath(import.meta.url)),
      '../templates/order-confirmation.html',
    );
    const html = renderTemplate(
      fs.readFileSync(file, 'utf8'),
      buildTemplateVars(
        'order_confirmation',
        order({ discount: 500, couponCode: 'FESTIVE10', shipping: 99, codCharge: 0 }),
      ),
    );

    const required: [string, RegExp][] = [
      ['SOPII logo', /final_logo-240\.png/],
      ['customer name', /Meera/],
      ['order number', /SOP10001/],
      ['order date', /29 August 2026/],
      ['product name', /Ivory Handwoven Saree/],
      ['product image', /res\.cloudinary\.com\/demo\/image\/upload\/saree\.jpg/],
      ['quantity', /Qty 2/],
      ['unit price', /₹4,599/],
      ['subtotal', /Subtotal[\s\S]{0,400}₹9,198/],
      ['discount', /Discount \(FESTIVE10\)[\s\S]{0,300}₹500/],
      ['shipping', /Shipping[\s\S]{0,300}₹99/],
      ['GST', /GST[\s\S]{0,300}₹460/],
      ['total', /Total[\s\S]{0,400}₹9,658/],
      ['payment method', /Paid by Razorpay/],
      ['shipping address', /14 Turner Road/],
      ['tracking link', /href="[^"]*SOP10001"/],
      ['support information', /Need help with this order\?/],
    ];

    for (const [label, pattern] of required) {
      assert.match(html, pattern, `order confirmation is missing the ${label}`);
    }
  });

  it('gives each lifecycle stage its own headline', () => {
    const headline = (kind: Parameters<typeof buildTemplateVars>[0]) =>
      renderTemplate('{{headline}}', buildTemplateVars(kind, order()));

    assert.equal(headline('order_confirmation'), 'Order Confirmed');
    assert.equal(headline('order_shipped'), 'Your Order Has Shipped');
    assert.equal(headline('order_delivered'), 'Delivered');
    assert.equal(headline('order_cancelled'), 'Order Cancelled');
  });

  it('falls back to a computed delivery date when the order promised none', () => {
    const vars = buildTemplateVars('order_confirmation', order({ shippingEta: '' }));
    assert.notEqual(vars.expectedDelivery, '');
    assert.notEqual(vars.expectedDelivery, '—');
  });

  it('points Track Order at the order code', () => {
    const vars = buildTemplateVars('order_confirmation', order());
    assert.match(String(vars.trackingUrl), /SOP10001$/);
  });

  /* Every message goes out multipart/alternative. An HTML-only transactional
     email is filtered more aggressively and is unreadable to a screen reader. */
  it('builds a plain-text alternative carrying the same figures', () => {
    const text = renderOrderText(buildTemplateVars('order_confirmation', order()));
    assert.match(text, /Order number\s+SOP10001/);
    assert.match(text, /Ivory Handwoven Saree \(Free · Ivory\) × 2 — ₹9,198/);
    assert.match(text, /Total\s+₹9,658/);
    assert.match(text, /Track your order: http/);
    assert.ok(!text.includes('<'), 'plain-text alternative contains markup');
  });

  it('does not leave unresolved placeholders in the password-reset template', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');

    const file = path.resolve(
      path.dirname(url.fileURLToPath(import.meta.url)),
      '../templates/password-reset.html',
    );
    const html = renderTemplate(fs.readFileSync(file, 'utf8'), {
      logoUrl: 'https://shop.example/final_logo-240.png',
      customerName: 'Meera',
      resetUrl: 'https://shop.example/reset-password?token=abc',
      expiresIn: '1 hour',
      supportLine: 'Email us at care@sopii.in',
    });

    const leftover = html.match(/\{\{[^}]+\}\}/g);
    assert.equal(leftover, null, `unresolved placeholders: ${leftover?.join(', ')}`);
    assert.match(html, /reset-password\?token=abc/);
    assert.match(html, /1 hour/);
  });
});

/* --------------------------- failure classification ------------------------- */

describe('Mailtrap failure classification', () => {
  /*
   * SMTP 4xx is TEMPORARY — "mailbox busy", "try again later", greylisting.
   * Greylisting exists to be retried and is how many relays treat a first-time
   * sender, so reading these the HTTP way round means giving up on exactly the
   * failures that were designed to succeed on the second attempt.
   */
  it('treats an SMTP 4xx as transient, so the queue retries it', () => {
    const { transient, message } = classify({
      responseCode: 421,
      response: '421 4.7.0 Too many connections',
    });
    assert.equal(transient, true);
    assert.match(message, /Too many connections/);
  });

  /* SMTP 5xx is PERMANENT. Retrying "no such user" five times only delays the
     moment somebody reads the error. */
  it('treats an SMTP 5xx as permanent, so the job is not retried', () => {
    const { transient } = classify({
      responseCode: 550,
      response: '550 5.1.1 The email account does not exist',
    });
    assert.equal(transient, false);
  });

  /*
   * Observed against a real Mailtrap sandbox inbox, which answers a burst with
   * a 550 — the code for "never going to work" — carrying a message that
   * describes the most temporary condition there is. Taken at face value it
   * marks the job done and the customer never receives their confirmation.
   */
  it('retries a rate limit even when it arrives as a 5xx', () => {
    const { transient, message } = classify({
      responseCode: 550,
      response:
        '550 5.7.0 Too many emails per second. Please upgrade your plan https://mailtrap.io/billing/plans/testing',
    });
    assert.equal(transient, true, 'a per-second rate limit must be retried');
    assert.match(message, /Too many emails per second/);
  });

  it('retries the other ways a relay says "not now"', () => {
    for (const response of [
      '550 5.7.0 Rate limit exceeded',
      '554 5.7.1 Please slow down',
      '550 Message temporarily deferred',
      '452 4.5.3 Too many recipients',
    ]) {
      assert.equal(classify({ responseCode: Number(response.slice(0, 3)), response }).transient, true, response);
    }
  });

  /* The exception must stay narrow: a genuine rejection still has to be
     permanent, or a bad address burns five attempts on every send. */
  it('still treats a real rejection as permanent', () => {
    for (const response of [
      '550 5.1.1 The email account that you tried to reach does not exist',
      '550 5.7.1 Sending from domain gmail.com is not allowed',
      '553 5.1.8 Sender address rejected: Domain not found',
    ]) {
      assert.equal(classify({ responseCode: Number(response.slice(0, 3)), response }).transient, false, response);
    }
  });

  it('treats bad credentials as permanent — they will not improve on retry', () => {
    assert.equal(classify({ code: 'EAUTH', message: 'Invalid login' }).transient, false);
    assert.equal(classify({ code: 'ENOTFOUND', message: 'getaddrinfo' }).transient, false);
  });

  /* No SMTP code at all: a socket that died, a connection refused, a timeout.
     Those are the faults a retry exists for. */
  it('treats a transport fault with no SMTP code as transient', () => {
    assert.equal(classify({ code: 'ECONNRESET', message: 'socket hang up' }).transient, true);
    assert.equal(classify(new Error('read ETIMEDOUT')).transient, true);
  });

  it('never returns an empty message, whatever it was handed', () => {
    assert.ok(classify(undefined).message.length > 0);
    assert.ok(classify({}).message.length > 0);
  });

  it('is a distinct error type, so the queue can tell a retry from a bug', () => {
    const error = new TransientEmailError('Mailtrap timed out after 10000ms');
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'TransientEmailError');
  });
});

/* --------------------------- duplicate prevention --------------------------- */

describe('duplicate prevention', () => {
  const sent = (recipient = 'meera@example.com') =>
    order({
      emailNotifications: [
        { kind: 'order_confirmation', status: 'sent', recipient, attempts: 1, sentAt: 'x' },
      ],
    });

  /*
   * The queue's unique dedupeKey stops the *job* existing twice. This is the
   * second layer: a job that runs twice anyway — a worker that sent and then
   * died before marking it done has its lease reclaimed — must not produce a
   * second confirmation.
   */
  it('recognises a confirmation already sent to the same address', () => {
    assert.equal(EmailService.alreadySent(sent(), 'order_confirmation', 'meera@example.com'), true);
  });

  it('ignores case when comparing the recipient', () => {
    assert.equal(EmailService.alreadySent(sent(), 'order_confirmation', 'MEERA@Example.com'), true);
  });

  /* Correcting a customer's address and resending is not a duplicate — it is
     the whole reason the Resend button exists. */
  it('does not suppress a send to a different address', () => {
    assert.equal(
      EmailService.alreadySent(sent(), 'order_confirmation', 'meera.iyer@example.com'),
      false,
    );
  });

  it('does not suppress a different kind of email about the same order', () => {
    assert.equal(EmailService.alreadySent(sent(), 'order_shipped', 'meera@example.com'), false);
  });

  /* A previous *failure* must not block the retry that fixes it. */
  it('does not suppress after a failed attempt', () => {
    const failed = order({
      emailNotifications: [
        {
          kind: 'order_confirmation',
          status: 'failed',
          recipient: 'meera@example.com',
          attempts: 3,
        },
      ],
    });
    assert.equal(
      EmailService.alreadySent(failed, 'order_confirmation', 'meera@example.com'),
      false,
    );
  });

  /* A store with no mailer records `skipped`, which is not a delivery — the
     moment Mailtrap is configured, that order should still get its email. */
  it('does not suppress after a skipped attempt', () => {
    const skipped = order({
      emailNotifications: [
        {
          kind: 'order_confirmation',
          status: 'skipped',
          recipient: 'meera@example.com',
          attempts: 1,
        },
      ],
    });
    assert.equal(
      EmailService.alreadySent(skipped, 'order_confirmation', 'meera@example.com'),
      false,
    );
  });

  it('keys idempotency on kind, subject and recipient, case-insensitively', () => {
    assert.equal(
      idempotencyKeyFor('order_confirmation', 'SOP10001', 'Meera@Example.com'),
      'order_confirmation:SOP10001:meera@example.com',
    );
    assert.notEqual(
      idempotencyKeyFor('order_confirmation', 'SOP10001', 'a@b.com'),
      idempotencyKeyFor('order_shipped', 'SOP10001', 'a@b.com'),
    );
  });
});
