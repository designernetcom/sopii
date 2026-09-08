/*
 * Tests for the security rules that fail silently (§17, §18).
 * ===========================================================================
 * Every rule here is one that breaks without any symptom. A logger that stops
 * redacting still logs; a credential stored in plaintext still decrypts; a
 * masked token still renders. Nothing goes red until the day somebody reads
 * the log or the database and finds a password in it.
 *
 * So these are the assertions that would have caught it: the redaction rule
 * applied to the shapes real log calls actually pass, and the secret box
 * asserted to be both reversible for the server and unreadable in a dump.
 *
 * Run with:  npm test        (in server/)
 *
 * No database and no network — these are pure functions, deliberately.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scrub } from '../lib/logger.js';
import { decryptSecret, encryptSecret, isEncrypted, maskSecret } from '../auth/secretBox.js';

/* ------------------------------ log redaction ------------------------------- */

describe('logger: the redaction rule (§18)', () => {
  it('redacts every forbidden key §18 names, whatever the casing', () => {
    const out = scrub({
      password: 'hunter2',
      passwordHash: '$2a$10$abcdefghijklmnop',
      otp: '481920',
      otpCode: '481920',
      apiKey: 'rzp_live_abc123',
      api_key: 'rzp_live_abc123',
      razorpayKeySecret: 'shhh',
      Authorization: 'Bearer eyJhbGciOi',
      Cookie: 'sopii_session=abc',
      'X-CSRF-Token': 'csrf-abc',
      signature: 'deadbeef',
      cvv: '123',
      cardNumber: '4111111111111111',
      pin: '4321',
      credential: 'whatever',
    }) as Record<string, unknown>;

    for (const [key, value] of Object.entries(out)) {
      assert.equal(value, '[redacted]', `${key} reached the log`);
    }
  });

  it('leaves the fields an operator actually needs', () => {
    const out = scrub({
      requestId: 'req-1',
      route: 'POST /orders',
      status: 201,
      durationMs: 42,
      ip: '203.0.113.9',
      userId: 'usr_0001',
    }) as Record<string, unknown>;

    assert.deepEqual(out, {
      requestId: 'req-1',
      route: 'POST /orders',
      status: 201,
      durationMs: 42,
      ip: '203.0.113.9',
      userId: 'usr_0001',
    });
  });

  it('redacts a secret nested inside a payload, not just at the top level', () => {
    const out = scrub({
      event: 'payment.verify',
      payload: { order: { id: 'ord_1', razorpaySignature: 'abc' }, headers: { cookie: 'x=1' } },
    }) as { payload: { order: Record<string, unknown>; headers: Record<string, unknown> } };

    assert.equal(out.payload.order.id, 'ord_1');
    assert.equal(out.payload.order.razorpaySignature, '[redacted]');
    assert.equal(out.payload.headers.cookie, '[redacted]');
  });

  it('redacts a secret inside an array of objects', () => {
    const out = scrub({
      sessions: [{ id: 's1', token: 'tok-1' }, { id: 's2', token: 'tok-2' }],
    }) as { sessions: Record<string, unknown>[] };

    assert.deepEqual(out.sessions.map((s) => s.id), ['s1', 's2']);
    assert.deepEqual(out.sessions.map((s) => s.token), ['[redacted]', '[redacted]']);
  });

  it('truncates a long string so a pasted JWT cannot ride along inside a message', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.' + 'a'.repeat(2000);
    const out = scrub({ detail: jwt }) as { detail: string };

    assert.ok(out.detail.length < jwt.length, 'the long value was not truncated');
    assert.ok(out.detail.endsWith('[truncated]'));
    assert.ok(out.detail.length <= 512 + '…[truncated]'.length);
  });

  it('stops descending rather than looping on a deeply nested payload', () => {
    // Depth guard: a cyclic or pathologically nested object must not hang the
    // process inside a log call.
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 20; i += 1) deep = { nested: deep };

    assert.doesNotThrow(() => scrub(deep));
    assert.equal(JSON.stringify(scrub(deep)).includes('[deep]'), true);
  });

  it('keeps an Error readable without dumping the whole stack', () => {
    const out = scrub(new Error('gateway refused')) as { name: string; message: string; stack: string };

    assert.equal(out.name, 'Error');
    assert.equal(out.message, 'gateway refused');
    assert.ok(out.stack.split('\n').length <= 4, 'the full stack was kept');
  });

  it('caps a long array rather than serialising all of it', () => {
    const out = scrub({ items: Array.from({ length: 500 }, (_, i) => i) }) as { items: number[] };
    assert.equal(out.items.length, 50);
  });
});

/* ------------------------- credentials at rest ------------------------------ */

describe('secretBox: operator credentials at rest (§17)', () => {
  const TOKEN = 'EAAG9ZBxyz0123456789wa-business-token';

  it('round-trips a token through encrypt and decrypt', () => {
    const stored = encryptSecret(TOKEN);
    assert.notEqual(stored, TOKEN);
    assert.equal(decryptSecret(stored), TOKEN);
  });

  it('never leaves the plaintext recoverable from the stored string', () => {
    const stored = encryptSecret(TOKEN);
    assert.ok(!stored.includes(TOKEN), 'the plaintext is present in the ciphertext');
    assert.ok(!Buffer.from(stored, 'utf8').toString('base64').includes(TOKEN));
    assert.ok(isEncrypted(stored));
  });

  it('produces a different ciphertext every time, so equal tokens are not linkable', () => {
    // A deterministic ciphertext leaks "these two stores use the same token"
    // to anyone reading the collection. A random IV per call is what prevents it.
    const a = encryptSecret(TOKEN);
    const b = encryptSecret(TOKEN);
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a), decryptSecret(b));
  });

  it('refuses a tampered ciphertext rather than returning wrong bytes', () => {
    // This is what the GCM auth tag buys: an edited body fails to authenticate
    // instead of decrypting to something plausible.
    const stored = encryptSecret(TOKEN);
    const [prefix, iv, tag, body] = stored.split('.');
    const flipped = body.startsWith('A') ? 'B' + body.slice(1) : 'A' + body.slice(1);

    assert.equal(decryptSecret([prefix, iv, tag, flipped].join('.')), '');
  });

  it('refuses a ciphertext whose auth tag has been swapped', () => {
    const stored = encryptSecret(TOKEN);
    const other = encryptSecret('a completely different token');
    const [prefix, iv, , body] = stored.split('.');
    const [, , otherTag] = other.split('.');

    assert.equal(decryptSecret([prefix, iv, otherTag, body].join('.')), '');
  });

  it('treats absence as absence rather than as a ciphertext of nothing', () => {
    assert.equal(encryptSecret(''), '');
    assert.equal(decryptSecret(''), '');
    assert.equal(decryptSecret(undefined), '');
    assert.equal(isEncrypted(''), false);
  });

  it('reads a value written before this module existed', () => {
    // A token seeded straight into Mongo by hand still has to work; it is
    // re-encrypted the next time the settings form is saved.
    assert.equal(decryptSecret('plain-legacy-token'), 'plain-legacy-token');
  });

  it('returns empty for a malformed stored value instead of throwing', () => {
    // A rotated AUTH_SECRET makes every stored token undecryptable. That is
    // expected — the admin re-enters it — and must not crash a settings read.
    assert.equal(decryptSecret('encv1.only-two-parts'), '');
    assert.equal(decryptSecret('encv1...'), '');
    assert.equal(decryptSecret('encv1.!!!.!!!.!!!'), '');
  });

  it('masks a credential to something recognisable but useless', () => {
    const masked = maskSecret(TOKEN);

    assert.ok(masked.startsWith(TOKEN.slice(0, 4)));
    assert.ok(masked.endsWith(TOKEN.slice(-4)));
    assert.ok(!masked.includes(TOKEN.slice(4, -4)), 'the middle of the token survived masking');
  });

  it('masks a short credential entirely, revealing no ends at all', () => {
    assert.equal(maskSecret('short'), '••••••••');
    assert.equal(maskSecret(''), '');
    assert.equal(maskSecret(undefined), '');
  });
});
