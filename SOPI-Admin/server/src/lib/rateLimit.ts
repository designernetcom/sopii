/*
 * HTTP rate limiting (§16).
 * ===========================================================================
 * `auth/rateLimit.ts` protects *credentials* — it is keyed by the email or the
 * mobile number under attack, it is progressive, and its ledger is durable
 * because a lockout that a restart forgets is not a lockout. This file is the
 * other half: a cheap ceiling on *request volume*, keyed by IP or session, in
 * front of everything else. Search, checkout, payment, the admin API.
 *
 * It counts in the cache rather than in MongoDB, for one reason: a limiter
 * that writes a document per request turns a traffic spike into a write storm
 * on the database it is supposed to be protecting. With Redis the window is
 * shared across instances; with the in-memory fallback each instance keeps its
 * own, so the effective ceiling is `max × instances` — which is why the
 * fallback logs a warning and why REDIS_URL is not optional in production.
 *
 * The window is a fixed one (`floor(now / windowMs)`), not a sliding one. A
 * caller can therefore burst across a boundary and briefly get 2× the quota;
 * that is a deliberate trade for one increment per request instead of a sorted
 * set. Credential endpoints, where the burst actually matters, use the durable
 * progressive limiter instead.
 */

import type { Request, RequestHandler, Response } from 'express';
import { cacheKey, cacheIncr } from './cache.js';
import { HttpError } from './http.js';
import { logger } from './logger.js';

export interface RateRule {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
  /** Prefix for the counter key, so two rules never share a bucket. */
  scope: string;
  /**
   * What is being limited. Defaults to the client address; pass a function to
   * limit per account instead, which is what the admin API wants — one
   * misbehaving integration should not throttle the whole office.
   */
  keyOf?: (req: Request) => string | undefined;
  /** Requests that should not count against the quota (health checks, CORS). */
  skip?: (req: Request) => boolean;
  message?: string;
}

/**
 * The client address.
 *
 * `req.ip` is only meaningful because `app.set('trust proxy', …)` is on in
 * production — without it every request behind the load balancer shares one
 * address and one quota, which is a self-inflicted outage rather than a limit.
 */
export function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** Session-aware key: a signed-in caller is limited as themselves, not as their office NAT. */
export function userOrIpKey(req: Request): string {
  const user = req.authUser?.user._id ?? req.auth?.user._id ?? req.customer?._id;
  return user ? `u:${user}` : `ip:${clientKey(req)}`;
}

/**
 * Counts one hit and reports where that leaves the caller.
 *
 * Exported so a handler can charge a request *after* deciding it was
 * expensive — a search that hit the database costs more than one served from
 * cache, and the limiter should say so.
 *
 * The count is an **atomic increment**, not a read followed by a write. That
 * distinction is the whole limiter: with get-then-set, thirty requests sent in
 * parallel all read zero before any of them writes, so a burst of thirty is
 * counted once and passes a ceiling of ten untouched. Sequential clients were
 * limited correctly the whole time, which is exactly why it looked fine by
 * hand — and parallel is how a scraper and a credential-stuffer actually send.
 */
export async function consume(
  scope: string,
  identifier: string,
  { max, windowMs }: { max: number; windowMs: number },
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const window = Math.floor(Date.now() / windowMs);
  const key = cacheKey('rl', scope, identifier, window);
  const resetAt = (window + 1) * windowMs;

  // TTL is the remainder of the window plus a second of slack, so the key
  // disappears on its own and the cache never accumulates dead counters.
  const count = await cacheIncr(key, Math.max(1000, resetAt - Date.now() + 1000));

  // A limiter whose backend is unavailable allows the request — refusing every
  // checkout because Redis blipped is the worse outage.
  if (count === null) return { allowed: true, remaining: max, resetAt };

  return { allowed: count <= max, remaining: Math.max(0, max - count), resetAt };
}

function setHeaders(res: Response, max: number, remaining: number, resetAt: number) {
  res.set('RateLimit-Limit', String(max));
  res.set('RateLimit-Remaining', String(remaining));
  res.set('RateLimit-Reset', String(Math.max(0, Math.ceil((resetAt - Date.now()) / 1000))));
}

/**
 * Express middleware for one rule.
 *
 * A limiter whose backend is unavailable **allows** the request. That is the
 * right failure direction for a shop: refusing every checkout because Redis
 * blipped is a worse outage than briefly letting a scraper through.
 */
export function rateLimit(rule: RateRule): RequestHandler {
  const { max, windowMs, scope, keyOf = clientKey, skip, message } = rule;

  return (req, res, next) => {
    if (max <= 0 || skip?.(req)) return next();

    const identifier = keyOf(req);
    if (!identifier) return next();

    consume(scope, identifier, { max, windowMs })
      .then(({ allowed, remaining, resetAt }) => {
        setHeaders(res, max, remaining, resetAt);

        if (allowed) return next();

        const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
        logger.warn('ratelimit.blocked', {
          scope,
          route: req.originalUrl,
          method: req.method,
          ip: clientKey(req),
          retryAfter,
        });

        const error = new HttpError(
          429,
          message ??
            `Too many requests. Please try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
        );
        error.retryAfter = retryAfter;
        next(error);
      })
      .catch(() => next());
  };
}

/* --------------------------------- presets ---------------------------------- */

const n = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * The tuned rules, in one table so the ceilings are reviewable rather than
 * scattered. Every one is overridable from the environment: load testing is
 * how these get their real values, and that must not need a deploy.
 */
export const limits = {
  /**
   * The blanket ceiling on the public API. Generous — a shopper browsing
   * quickly makes a lot of requests — but low enough that a single scraper
   * pulling the catalogue is stopped before it costs anything.
   */
  publicApi: {
    scope: 'public',
    max: n(process.env.RATE_PUBLIC_MAX, 600),
    windowMs: n(process.env.RATE_PUBLIC_WINDOW_MS, 60_000),
  },
  /** Search is the expensive read: it cannot be served from a warm key. */
  search: {
    scope: 'search',
    max: n(process.env.RATE_SEARCH_MAX, 60),
    windowMs: n(process.env.RATE_SEARCH_WINDOW_MS, 60_000),
    message: 'You are searching very quickly. Please wait a moment and try again.',
  },
  /** Pricing a bag runs a catalogue read and the whole settings stack. */
  checkout: {
    scope: 'checkout',
    max: n(process.env.RATE_CHECKOUT_MAX, 40),
    windowMs: n(process.env.RATE_CHECKOUT_WINDOW_MS, 60_000),
  },
  /**
   * Opening gateway orders. Deliberately tight: each one is an outbound call
   * to Razorpay, and a loop here is a bill as well as a load problem.
   */
  payment: {
    scope: 'payment',
    max: n(process.env.RATE_PAYMENT_MAX, 12),
    windowMs: n(process.env.RATE_PAYMENT_WINDOW_MS, 60_000),
    message: 'Too many payment attempts. Please wait a minute before trying again.',
  },
  /** Placing an order. The idempotency key is the real guard; this is the ceiling. */
  order: {
    scope: 'order',
    max: n(process.env.RATE_ORDER_MAX, 10),
    windowMs: n(process.env.RATE_ORDER_WINDOW_MS, 60_000),
  },
  /** Signed-in admins, keyed per account rather than per office IP. */
  adminApi: {
    scope: 'admin',
    max: n(process.env.RATE_ADMIN_MAX, 1200),
    windowMs: n(process.env.RATE_ADMIN_WINDOW_MS, 60_000),
    keyOf: userOrIpKey,
  },
  /** Uploads carry megabytes and hit Cloudinary. */
  upload: {
    scope: 'upload',
    max: n(process.env.RATE_UPLOAD_MAX, 60),
    windowMs: n(process.env.RATE_UPLOAD_WINDOW_MS, 60_000),
    keyOf: userOrIpKey,
  },
  /** Newsletter and other unauthenticated writes — spam targets. */
  publicWrite: {
    scope: 'pubwrite',
    max: n(process.env.RATE_PUBLIC_WRITE_MAX, 10),
    windowMs: n(process.env.RATE_PUBLIC_WRITE_WINDOW_MS, 60_000),
  },
} satisfies Record<string, RateRule>;
