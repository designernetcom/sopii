/*
 * A store with no mailer still works.
 * ===========================================================================
 * The property this file exists to hold: **an unconfigured Mailtrap must never
 * be able to fail a checkout.** A send with no credentials is recorded as
 * `skipped`, not `failed`, and nothing throws — so the order stands, and the
 * panel says "Not configured" rather than showing an error nobody can act on.
 *
 * WHY THIS IS A SEPARATE FILE
 * ---------------------------------------------------------------------------
 * It has to run with MAILTRAP_* empty, and `env.ts` reads `process.env` once,
 * at import. ESM hoists every static import above every statement, so a test
 * that clears the variables in its own body has already lost — the module read
 * them first. And on a developer's machine `.env` supplies real credentials,
 * so a guard like `if (isConfigured) return t.skip()` means these assertions
 * quietly stop running on exactly the machines where the code is being
 * changed. That is the worst kind of green.
 *
 * Node's test runner gives each file its own process, so clearing the
 * variables here and importing dynamically afterwards is deterministic
 * regardless of what `.env` holds. `dotenv` never overwrites a variable that
 * is already present — an empty string counts as present — which is what makes
 * the clearing stick.
 *
 * Run with:  npm test        (in server/)
 */

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import type { OrderLike } from '../lib/email.js';

/* Cleared before anything reads them. See the note above. */
for (const key of [
  'MAILTRAP_HOST',
  'MAILTRAP_PORT',
  'MAILTRAP_USER',
  'MAILTRAP_PASSWORD',
  /* A token on its own configures the other three, so clearing them is not
     enough on a machine whose .env holds one. */
  'MAILTRAP_API_TOKEN',
  'MAILTRAP_FROM_EMAIL',
]) {
  process.env[key] = '';
}

let email: typeof import('../lib/email.js');
let mailtrap: typeof import('../lib/mailtrap.js');

before(async () => {
  email = await import('../lib/email.js');
  mailtrap = await import('../lib/mailtrap.js');
});

const order = (overrides: Partial<OrderLike> = {}): OrderLike => ({
  _id: 'ord_test_1',
  code: 'SOP10001',
  customerName: 'Meera Iyer',
  customerEmail: 'meera@example.com',
  items: [{ name: 'Ivory Handwoven Saree', price: 4599, quantity: 2, total: 9198 }],
  subtotal: 9198,
  total: 9658,
  paymentMethod: 'razorpay',
  paymentStatus: 'paid',
  ...overrides,
});

describe('an unconfigured store', () => {
  it('reports itself unconfigured, and says which variables are missing', () => {
    assert.equal(mailtrap.isConfigured, false);
    assert.equal(email.EmailService.isConfigured, false);

    /* The message is what an operator reads in the panel, so it has to name
       the variables rather than say "email is broken". */
    const missing = mailtrap.missingConfig();
    assert.match(missing, /MAILTRAP_HOST/);
    assert.match(missing, /MAILTRAP_USER/);
    assert.match(missing, /MAILTRAP_PASSWORD/);
    assert.match(missing, /MAILTRAP_FROM_EMAIL/);
  });

  /*
   * `skipped`, not `failed`. The distinction is the whole point: a failure is
   * something that went wrong with this order, and a skip is something an
   * operator has not set up yet. Showing the first when it is the second sends
   * somebody hunting through an order that is perfectly fine.
   */
  it('skips rather than fails, and does not throw', async () => {
    const result = await email.EmailService.sendOrderConfirmation(order());

    assert.equal(result.status, 'skipped');
    assert.equal(result.recipient, 'meera@example.com');
    assert.match(String(result.error), /not configured/i);
  });

  it('skips every lifecycle email the same way', async () => {
    for (const send of [
      email.EmailService.sendOrderShipped,
      email.EmailService.sendOrderDelivered,
      email.EmailService.sendOrderCancelled,
    ]) {
      assert.equal((await send(order())).status, 'skipped');
    }
  });

  it('never throws out of a password reset', async () => {
    const result = await email.EmailService.sendPasswordReset({
      to: 'meera@example.com',
      resetUrl: 'https://shop.example/reset-password?token=abc',
      name: 'Meera',
    });
    assert.equal(result.status, 'skipped');
  });

  /* A missing address is a permanent fault in the order, not a missing
     configuration — so it is `failed`, and the reason says which. */
  it('still refuses an order with no customer email, permanently', async () => {
    const result = await email.EmailService.sendOrderConfirmation(order({ customerEmail: '' }));
    assert.equal(result.status, 'failed');
    assert.match(String(result.error), /no customer email/);
  });

  /* Nothing above should have opened a socket, so verifying must fail fast
     with a configuration message rather than hanging on a connect. */
  it('refuses to verify a connection it cannot make', async () => {
    await assert.rejects(
      () => mailtrap.verifyConnection(),
      (error: Error) => /not configured/i.test(error.message),
    );
  });
});
