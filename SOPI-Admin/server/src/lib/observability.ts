/*
 * Monitoring, and the headers that make a browser defend itself (§17, §18).
 * ===========================================================================
 * Three things live here:
 *
 *   requestContext  a correlation id on every request, echoed as a header, so
 *                   a customer's "order 12 minutes ago failed" becomes one
 *                   grep rather than a shrug.
 *   accessLog       one structured line per request, with the timings §18 asks
 *                   for. Health checks are excluded so the log is signal.
 *   securityHeaders  the response headers that cost nothing and close whole
 *                   classes of attack.
 *
 * Plus an in-process latency register, exposed at /api/metrics. It is not a
 * replacement for Prometheus or Datadog — it is what makes the numbers §22
 * asks for (p95, p99, error rate) readable during a load test without any
 * infrastructure at all, and the shape a real exporter would scrape.
 */

import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from './logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlates every log line emitted while serving this request. */
      requestId?: string;
      startedAt?: number;
    }
  }
}

/* ------------------------------ request context ----------------------------- */

/**
 * An inbound `X-Request-Id` is honoured so a trace started at the load
 * balancer or the CDN carries through, and one is minted when there is none.
 * It is length-capped and sanitised because it ends up in a response header
 * and in the logs, and neither should accept arbitrary bytes from a caller.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const inbound = req.get('x-request-id');
  const id =
    inbound && /^[A-Za-z0-9._-]{1,64}$/.test(inbound) ? inbound : crypto.randomUUID();

  req.requestId = id;
  req.startedAt = Date.now();
  res.set('X-Request-Id', id);
  next();
};

/* -------------------------------- the register ------------------------------ */

interface RouteStats {
  count: number;
  errors: number;
  /** Kept as a plain array and sorted on read — see the note on the cap. */
  samples: number[];
  totalMs: number;
  maxMs: number;
}

/**
 * Latency samples per route, capped by reservoir.
 *
 * The cap is the point: percentiles over an unbounded array are a memory leak
 * on a server that runs for a week. Past the cap a sample replaces a random
 * earlier one, which keeps the distribution honest at constant cost.
 */
const SAMPLE_CAP = Number(process.env.METRICS_SAMPLE_CAP ?? 1000);

const routes = new Map<string, RouteStats>();
const started = Date.now();

let totalRequests = 0;
let totalErrors = 0;

function record(route: string, durationMs: number, status: number) {
  totalRequests += 1;
  if (status >= 500) totalErrors += 1;

  let stats = routes.get(route);
  if (!stats) {
    stats = { count: 0, errors: 0, samples: [], totalMs: 0, maxMs: 0 };
    routes.set(route, stats);
  }

  stats.count += 1;
  stats.totalMs += durationMs;
  if (durationMs > stats.maxMs) stats.maxMs = durationMs;
  if (status >= 500) stats.errors += 1;

  if (stats.samples.length < SAMPLE_CAP) stats.samples.push(durationMs);
  else stats.samples[Math.floor(Math.random() * SAMPLE_CAP)] = durationMs;
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[index]);
}

/**
 * The route *pattern*, not the URL.
 *
 * `/api/products/prd_0001` and `/api/products/prd_0002` are one route with two
 * arguments; bucketing them separately gives a million meaningless buckets and
 * no usable p95. Express fills `req.route` after the handler matches, so this
 * runs on 'finish'.
 */
function routeLabel(req: Parameters<RequestHandler>[0]): string {
  const base = (req.baseUrl ?? '').replace(/\/$/, '');
  const path = req.route?.path;
  if (typeof path === 'string') return `${req.method} ${base}${path === '/' ? '' : path}` || req.method;
  // Unmatched (a 404, or a router-level middleware rejection): bucket by prefix
  // so a scanner hammering random paths cannot blow the map up.
  return `${req.method} ${base || (req.path.split('/').slice(0, 3).join('/') || '/')}`;
}

export interface MetricsSnapshot {
  uptimeSeconds: number;
  requests: number;
  errors: number;
  errorRate: number;
  memory: { rssMb: number; heapUsedMb: number };
  routes: {
    route: string;
    count: number;
    errors: number;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
  }[];
}

export function metricsSnapshot(): MetricsSnapshot {
  const memory = process.memoryUsage();

  return {
    uptimeSeconds: Math.round((Date.now() - started) / 1000),
    requests: totalRequests,
    errors: totalErrors,
    errorRate: totalRequests ? Number((totalErrors / totalRequests).toFixed(4)) : 0,
    memory: {
      rssMb: Math.round(memory.rss / 1048576),
      heapUsedMb: Math.round(memory.heapUsed / 1048576),
    },
    routes: [...routes.entries()]
      .map(([route, stats]) => {
        const sorted = [...stats.samples].sort((a, b) => a - b);
        return {
          route,
          count: stats.count,
          errors: stats.errors,
          avgMs: Math.round(stats.totalMs / stats.count),
          p50Ms: percentile(sorted, 50),
          p95Ms: percentile(sorted, 95),
          p99Ms: percentile(sorted, 99),
          maxMs: Math.round(stats.maxMs),
        };
      })
      // Slowest first: the list an operator actually wants to read.
      .sort((a, b) => b.p95Ms - a.p95Ms)
      .slice(0, 60),
  };
}

/* --------------------------------- access log ------------------------------- */

/** Paths that would otherwise drown the log in noise. */
const QUIET = new Set(['/api/health', '/api/metrics', '/favicon.ico']);

/**
 * How slow is worth shouting about. A request over this is logged at `warn`
 * whatever its status, which is how a p99 regression surfaces before a customer
 * reports it.
 */
const SLOW_MS = Number(process.env.LOG_SLOW_REQUEST_MS ?? 1000);

export const accessLog: RequestHandler = (req, res, next) => {
  if (QUIET.has(req.path)) return next();

  res.on('finish', () => {
    const durationMs = Date.now() - (req.startedAt ?? Date.now());
    const route = routeLabel(req);
    record(route, durationMs, res.statusCode);

    const fields = {
      requestId: req.requestId,
      method: req.method,
      route,
      // The path, never the query string: a reset token and an email address
      // both travel in one, and §18 says neither belongs in a log.
      path: req.path,
      status: res.statusCode,
      durationMs,
      ip: req.ip,
      userId: req.authUser?.user._id ?? req.auth?.user._id ?? req.customer?._id,
    };

    if (res.statusCode >= 500) logger.error('http.request', fields);
    else if (res.statusCode >= 400 || durationMs >= SLOW_MS) logger.warn('http.request', fields);
    else logger.info('http.request', fields);
  });

  next();
};

/* ------------------------------ security headers ---------------------------- */

/**
 * Written out rather than pulled in from `helmet`, because there are six of
 * them and each one wants a sentence of justification more than it wants a
 * dependency.
 *
 * There is deliberately **no Content-Security-Policy here**. This process
 * serves a JSON API and a media directory, not the HTML documents the two SPAs
 * are delivered as — a CSP belongs on whatever serves those (the CDN or the
 * static host), where it can be written against the real script origins
 * including Razorpay's checkout. Emitting a permissive one here would be worse
 * than none: it would look like the policy was handled.
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  // No MIME sniffing: an uploaded file that a browser decides is HTML is a
  // stored XSS, and this is the one header that stops it.
  res.set('X-Content-Type-Options', 'nosniff');
  // This API is never framed, and nothing it serves should be.
  res.set('X-Frame-Options', 'DENY');
  // Referrers leak paths — including order codes — to third parties.
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Nothing here needs a camera, a microphone or a location.
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  // Cross-origin reads of API responses are the point of CORS, which decides
  // them; this only stops a *resource* being embedded from another origin.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');

  if (process.env.NODE_ENV === 'production') {
    // Two years, subdomains included. Only meaningful over TLS, which is why
    // it is production-only — issuing it in dev pins localhost to HTTPS in the
    // developer's browser, which is a bad afternoon.
    res.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }

  next();
};

/* ------------------------------- cache headers ------------------------------ */

/**
 * `Cache-Control` for a public, cacheable response.
 *
 * `s-maxage` is what a CDN reads and `max-age` is what a browser reads, and
 * they are set separately on purpose: the CDN should hold a catalogue page far
 * longer than a browser should, because the CDN can be purged and a browser
 * cannot.
 *
 * `stale-while-revalidate` is the one that carries a traffic spike. When a key
 * expires the CDN serves the stale copy *immediately* and refreshes behind it,
 * so an expiry during a sale does not turn into a thundering herd at the
 * origin.
 */
export function publicCache(res: {
  set: (field: string, value: string) => unknown;
}, {
  browserSeconds,
  cdnSeconds,
  staleSeconds = 300,
}: { browserSeconds: number; cdnSeconds: number; staleSeconds?: number }) {
  res.set(
    'Cache-Control',
    `public, max-age=${browserSeconds}, s-maxage=${cdnSeconds}, stale-while-revalidate=${staleSeconds}`,
  );
  // Compression is negotiated, so a shared cache must key on it or it will
  // hand a gzip body to a client that did not ask for one.
  res.set('Vary', 'Accept-Encoding');
}

/** For anything shaped by a session. Belt and braces alongside the auth gate. */
export function privateNoStore(res: { set: (field: string, value: string) => unknown }) {
  res.set('Cache-Control', 'private, no-store, max-age=0');
}
