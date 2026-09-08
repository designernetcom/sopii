/*
 * Rate limiting and brute-force protection (§17, §18).
 * ===========================================================================
 * Counters live in MongoDB rather than in process memory, for one reason that
 * matters: an in-memory limiter forgets everything on restart and counts each
 * instance separately, so "5 attempts per hour" quietly becomes "5 per hour
 * per process, until the next deploy". The ledger is `login_attempts`, swept
 * by a TTL index.
 *
 * Two shapes of protection, applied together:
 *
 *   fixed      — a hard ceiling inside a rolling window (OTP requests, resets,
 *                OAuth callbacks). Over the line, the answer is 429.
 *   progressive— password login. The first few failures cost nothing; past the
 *                threshold each further failure doubles the wait, capped.
 *
 * Every limit is keyed by *what is being attacked* — an email, a mobile
 * number, an account — and additionally by IP, so one abusive client cannot
 * lock out a whole store's worth of customers by spraying their addresses.
 */

import { LoginAttemptModel } from './models.js';
import { authConfig } from './config.js';
import { id } from './crypto.js';

export interface LimitVerdict {
  allowed: boolean;
  /** Attempts left before the limit bites. */
  remaining: number;
  /** Milliseconds until the caller may try again; 0 when allowed. */
  retryAfterMs: number;
}

const ALLOWED: LimitVerdict = { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterMs: 0 };

function key(scope: string, identifier: string) {
  return `${scope}:${identifier.toLowerCase()}`;
}

/** Writes one attempt into the ledger. Never throws into the request path. */
export async function recordAttempt(
  scope: string,
  identifier: string,
  { ip, successful = false, windowMs }: { ip?: string; successful?: boolean; windowMs: number },
) {
  try {
    await LoginAttemptModel.create({
      _id: id('att'),
      key: key(scope, identifier),
      scope,
      identifier: identifier.toLowerCase(),
      ip,
      successful,
      createdAt: new Date(),
      // Kept a little past the window so a boundary query still sees it.
      expiresAt: new Date(Date.now() + windowMs * 2),
    });
  } catch (error) {
    console.warn('[auth] could not record an attempt:', error);
  }
}

/** Forgets an identifier's failures — called after a genuine success. */
export async function clearAttempts(scope: string, identifier: string) {
  try {
    await LoginAttemptModel.deleteMany({ key: key(scope, identifier), successful: false });
  } catch (error) {
    console.warn('[auth] could not clear attempts:', error);
  }
}

/** Failures for one key inside the window, newest first. */
async function recentFailures(scope: string, identifier: string, windowMs: number) {
  return LoginAttemptModel.find({
    key: key(scope, identifier),
    successful: false,
    createdAt: { $gte: new Date(Date.now() - windowMs) },
  })
    .sort({ createdAt: -1 })
    .lean<{ createdAt: Date }[]>();
}

/**
 * A hard ceiling inside a rolling window.
 *
 * Counts *every* attempt, not only the failures: an OTP request that succeeds
 * still costs an SMS, so "5 per hour" has to mean five messages.
 */
export async function checkFixedLimit(
  scope: string,
  identifier: string,
  { max, windowMs }: { max: number; windowMs: number },
): Promise<LimitVerdict> {
  if (max <= 0) return ALLOWED;

  const since = new Date(Date.now() - windowMs);
  const attempts = await LoginAttemptModel.find({
    key: key(scope, identifier),
    createdAt: { $gte: since },
  })
    .sort({ createdAt: 1 })
    .lean<{ createdAt: Date }[]>();

  if (attempts.length < max) {
    return { allowed: true, remaining: max - attempts.length, retryAfterMs: 0 };
  }

  /*
   * The window is rolling, so the wait is until the *oldest* counted attempt
   * falls out of it — not a flat reset, which would let a caller bunch their
   * whole quota at the top of every hour.
   */
  const oldest = attempts[0].createdAt.getTime();
  return {
    allowed: false,
    remaining: 0,
    retryAfterMs: Math.max(1000, oldest + windowMs - Date.now()),
  };
}

/**
 * Progressive throttling for password login (§18).
 *
 * Under the threshold, nothing happens — people mistype passwords. Past it,
 * the wait doubles with each further failure (1x, 2x, 4x, 8x of the base) up
 * to the configured cap, measured from the most recent failure so that
 * continuing to hammer the endpoint extends the wait rather than expiring it.
 */
export async function checkProgressiveLimit(
  scope: string,
  identifier: string,
): Promise<LimitVerdict> {
  const { maxAttempts, windowMs, baseLockoutMs, maxLockoutMs } = authConfig.login;
  if (maxAttempts <= 0) return ALLOWED;

  const failures = await recentFailures(scope, identifier, windowMs);
  if (failures.length < maxAttempts) {
    return { allowed: true, remaining: maxAttempts - failures.length, retryAfterMs: 0 };
  }

  const over = failures.length - maxAttempts;
  const penalty = Math.min(baseLockoutMs * 2 ** over, maxLockoutMs);
  const elapsed = Date.now() - failures[0].createdAt.getTime();

  if (elapsed >= penalty) {
    // The penalty has been served; one attempt is granted back.
    return { allowed: true, remaining: 1, retryAfterMs: 0 };
  }

  return { allowed: false, remaining: 0, retryAfterMs: penalty - elapsed };
}

/**
 * The per-IP ceiling that sits alongside every per-identifier one.
 *
 * Without it, a single client can spray one attempt each across a thousand
 * addresses and never trip a limit; with it, the client stops long before the
 * store's customers notice anything.
 */
export async function checkIpLimit(
  scope: string,
  ip: string | undefined,
  { max, windowMs }: { max: number; windowMs: number },
): Promise<LimitVerdict> {
  if (!ip) return ALLOWED;
  return checkFixedLimit(`${scope}@ip`, ip, { max, windowMs });
}

/** Rounded up, because "try again in 0 seconds" helps nobody. */
export const retryAfterSeconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/**
 * The one message every throttled endpoint answers with (§27). It says a limit
 * was hit and when to come back, and nothing at all about whether the account
 * being attempted exists.
 */
export function throttleMessage(retryAfterMs: number) {
  const seconds = retryAfterSeconds(retryAfterMs);
  if (seconds < 90) {
    return `Your request was temporarily limited. Please try again in ${seconds} seconds.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `Your request was temporarily limited. Please try again in ${minutes} minutes.`;
}
