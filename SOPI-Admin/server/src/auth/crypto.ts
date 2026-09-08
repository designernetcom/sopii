/*
 * The one-way half of the auth module (§17).
 * ===========================================================================
 * Passwords and OTPs are bcrypt hashes. Bearer-style secrets that the server
 * has to *find* again — refresh tokens, reset tokens — cannot be bcrypt (there
 * is nothing to look them up by), so they are long random values stored as a
 * keyed SHA-256 digest: an attacker holding the database still cannot present
 * one, because the digest is not the token.
 *
 * Nothing here is reversible, and nothing here logs its input.
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { authConfig, hmac } from './config.js';

/* -------------------------------- passwords -------------------------------- */

export interface PasswordCheck {
  ok: boolean;
  /** Human-readable, safe to show beneath the field. */
  problems: string[];
}

/**
 * §4's rules, read from config so an operator can relax or tighten them.
 * Returns every problem at once — telling someone about one missing character
 * class at a time is a miserable way to choose a password.
 */
export function checkPasswordStrength(password: string): PasswordCheck {
  const rules = authConfig.password;
  const problems: string[] = [];

  if (password.length < rules.minLength) {
    problems.push(`Use at least ${rules.minLength} characters`);
  }
  if (password.length > rules.maxLength) {
    problems.push(`Use no more than ${rules.maxLength} characters`);
  }
  if (rules.requireUppercase && !/[A-Z]/.test(password)) {
    problems.push('Add an uppercase letter');
  }
  if (rules.requireLowercase && !/[a-z]/.test(password)) {
    problems.push('Add a lowercase letter');
  }
  if (rules.requireNumber && !/\d/.test(password)) {
    problems.push('Add a number');
  }
  if (rules.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    problems.push('Add a special character');
  }

  return { ok: problems.length === 0, problems };
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, authConfig.password.rounds);
}

/**
 * Always awaits a bcrypt comparison, even when there is no hash to compare
 * against. Returning early on a missing hash would make "no such account"
 * measurably faster than "wrong password", which is an enumeration oracle.
 */
export async function verifyPassword(password: string, hash: string | undefined) {
  if (!hash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

/*
 * A real bcrypt hash of a value nobody knows, used purely to burn the same
 * amount of time as a genuine comparison. Generated once at module load.
 */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

/* ----------------------------------- otp ----------------------------------- */

/**
 * A numeric code of the configured length, drawn from the CSPRNG.
 *
 * Rejection sampling rather than `% 10`: the remainder of a byte modulo 10 is
 * biased toward the low digits, and a biased OTP is a smaller search space.
 */
export function generateOtp(length = authConfig.otp.length): string {
  let code = '';
  while (code.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (const byte of bytes) {
      if (byte >= 250) continue; // 250..255 would skew the distribution
      code += String(byte % 10);
      if (code.length === length) break;
    }
  }
  return code;
}

/*
 * Cost 10 rather than the password cost: an OTP lives for five minutes and is
 * guarded by an attempt counter, so the tuning target is "expensive enough
 * that a stolen database is not a list of live codes" rather than "expensive
 * enough to survive an offline campaign".
 */
const OTP_ROUNDS = 10;

export function hashOtp(otp: string) {
  return bcrypt.hash(otp, OTP_ROUNDS);
}

export function verifyOtp(otp: string, hash: string) {
  return bcrypt.compare(otp, hash);
}

/* --------------------------------- secrets --------------------------------- */

/** 256 bits, URL-safe. What the client is given for refresh and reset tokens. */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** What the database stores in place of the token above. */
export const tokenDigest = (token: string) => hmac(token);

/* ---------------------------------- ids ------------------------------------ */

let counter = 0;

/**
 * Human-readable ids in the same `prefix_xxx` shape the rest of the dataset
 * uses, so a row is identifiable at a glance in the shell.
 */
export function id(prefix: string) {
  counter = (counter + 1) % 0xffff;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${crypto
    .randomBytes(3)
    .toString('hex')}`;
}

/* --------------------------------- compare --------------------------------- */

/** Length-safe constant-time comparison for CSRF tokens and the like. */
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    // Still spend the comparison, so length is not leaked by timing either.
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}
