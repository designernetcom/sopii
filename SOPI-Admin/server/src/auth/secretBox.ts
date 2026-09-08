/*
 * Encryption at rest for operator-supplied credentials.
 * ===========================================================================
 * The WhatsApp access token is the one secret in this system that an *admin*
 * types into a form rather than an operator putting in the environment. It has
 * to be stored, and it has to be readable again — a one-way hash is no use
 * when the value must be presented to Meta on every send.
 *
 * So: AES-256-GCM, keyed by a value derived from AUTH_SECRET. That does not
 * protect against someone who holds both the database and the server's
 * environment, and nothing storing a reversible credential could. What it does
 * buy is that a leaked database dump — a backup on a laptop, a misconfigured
 * replica — is not a leaked WhatsApp Business account.
 *
 * The ciphertext is a single self-describing string, so the settings document
 * stays a plain document and nothing else has to know the layout.
 */

import crypto from 'node:crypto';
import { authConfig } from './config.js';

/*
 * Marks a value as produced by this module, and pins the format. Dot-free on
 * purpose: the parts below are joined with dots, and a prefix containing one
 * would shift every field by one on the way back.
 */
const PREFIX = 'encv1';

/*
 * The AES key is derived rather than used raw: AUTH_SECRET is a passphrase of
 * unknown length, and scrypt gives a 32-byte key from it whatever it is. The
 * salt is fixed because the key must be reproducible across restarts — the
 * per-message randomness lives in the IV, which is where GCM needs it.
 */
let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (!cachedKey) {
    cachedKey = crypto.scryptSync(authConfig.secret, 'sopii-auth-secretbox', 32);
  }
  return cachedKey;
}

/** True for a string this module produced. Cheap enough to call on every read. */
export const isEncrypted = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(`${PREFIX}.`);

/**
 * Encrypts a credential.
 *
 * An empty input encrypts to an empty output rather than to a ciphertext of
 * nothing: "no token configured" has to survive a round trip as *absence*, or
 * every caller has to decrypt before it can ask whether a token exists.
 */
export function encryptSecret(plain: string): string {
  if (!plain) return '';

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join(
    '.',
  );
}

/**
 * Decrypts one, or returns `''` when it cannot.
 *
 * A rotated AUTH_SECRET makes every stored token undecryptable, which is the
 * expected outcome and not an exception: the admin re-enters the token. The
 * failure is logged without its input, and the caller sees "not configured".
 */
export function decryptSecret(stored: string | undefined): string {
  if (!stored) return '';

  /*
   * Tolerates a plain value. A token written before this module existed, or
   * seeded straight into Mongo by hand, still works — and is re-encrypted the
   * next time the settings form is saved.
   */
  if (!isEncrypted(stored)) return stored;

  const [prefix, iv, tag, body] = stored.split('.');
  if (prefix !== PREFIX || !iv || !tag || !body) return '';

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    // No value in the message: the input is a credential and the only useful
    // fact is that it could not be read.
    console.error('[auth] a stored credential could not be decrypted — has AUTH_SECRET changed?');
    return '';
  }
}

/**
 * What a credential looks like on its way to a browser: enough to recognise,
 * useless to replay. `EAAG...b7Zq` for a token, never the token.
 */
export function maskSecret(plain: string | undefined): string {
  if (!plain) return '';
  if (plain.length <= 8) return '••••••••';
  return `${plain.slice(0, 4)}${'•'.repeat(8)}${plain.slice(-4)}`;
}
