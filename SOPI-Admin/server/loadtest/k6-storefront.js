/*
 * Load test — the read path (§22).
 * ===========================================================================
 *   k6 run loadtest/k6-storefront.js
 *   k6 run -e BASE=https://api.sopii.in -e VUS=500 loadtest/k6-storefront.js
 *
 * This is the traffic shape a storefront actually gets: overwhelmingly reads,
 * concentrated on a handful of URLs, with a long tail of product pages. It
 * exercises the four endpoints that carry that load — the bootstrap feed, the
 * change-token poll, the paginated catalogue and product detail — plus search,
 * which is the expensive one because it cannot be served from a warm key.
 *
 * WHAT THE THRESHOLDS MEAN
 * ---------------------------------------------------------------------------
 * They are pass/fail conditions, not decoration: k6 exits non-zero when one is
 * breached, so this can gate a deploy. The numbers below are a *starting
 * position* for a single API instance with Redis. Run it, look at what you
 * actually get, and set them to something the system has demonstrated — a
 * threshold nobody has ever met is a threshold everybody learns to ignore.
 *
 * §22 asks for max throughput, average latency, p95, p99, error rate and where
 * the bottleneck is. The summary at the end prints the first five. For the
 * sixth, read /api/metrics during the run: it breaks latency down per route,
 * so the slowest route is named rather than inferred.
 *
 * REQUIRED BEFORE THE NUMBERS MEAN ANYTHING
 * ---------------------------------------------------------------------------
 *   1. Seed a realistic catalogue. Testing against 400 products tells you
 *      nothing about 400,000 — the whole question is what happens when the
 *      working set stops fitting in RAM.
 *   2. Run with REDIS_URL set. Without it every instance caches separately and
 *      the hit rate you measure is not the one production will have.
 *   3. Run k6 from a different machine than the API. Sharing a CPU means
 *      measuring the load generator.
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:4000';
const VUS = Number(__ENV.VUS || 50);

/* Split out so a slow search cannot hide behind fast cached reads. */
const searchLatency = new Trend('search_latency', true);
const catalogLatency = new Trend('catalog_latency', true);
const failures = new Rate('business_failures');

export const options = {
  scenarios: {
    /*
     * A ramp rather than a step. A step start measures how the system handles
     * a cold cache and an empty connection pool, which is a different (and
     * also worth running) test — `spike` below is that one.
     */
    browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: VUS },
        { duration: '2m', target: VUS },
        { duration: '30s', target: VUS * 2 },
        { duration: '1m', target: VUS * 2 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },

  thresholds: {
    /*
     * p95 under 500 ms and p99 under 1.5 s for the whole run. The gap between
     * them is deliberate: p99 is where connection-pool waits and cache misses
     * live, and holding it to the same bar as p95 would fail every run for
     * reasons that are not regressions.
     */
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    /* A cached catalogue read should be very fast — this is the one that
       catches a cache that has quietly stopped working. */
    catalog_latency: ['p(95)<250'],
    /* Search is uncached by design; it gets its own, looser bar. */
    search_latency: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
    business_failures: ['rate<0.01'],
  },
};

/* Slugs are collected on the first iteration so product pages are hit with
   real ids rather than a fixed one that would sit permanently in cache. */
let slugs = [];

export function setup() {
  const res = http.get(`${BASE}/api/storefront/bootstrap`);
  const products = res.json('products') || [];
  return { slugs: products.slice(0, 100).map((p) => p.slug || p.id).filter(Boolean) };
}

export default function (data) {
  slugs = data.slugs.length ? data.slugs : slugs;

  group('cold load — the shop opening', () => {
    const res = http.get(`${BASE}/api/storefront/bootstrap`, {
      tags: { name: 'bootstrap' },
    });
    catalogLatency.add(res.timings.duration);
    const ok = check(res, {
      'bootstrap 200': (r) => r.status === 200,
      'bootstrap carries products': (r) => (r.json('products') || []).length > 0,
      /* The payload budget. A regression that puts the full projection back in
         the feed shows up here rather than in a bug report from a phone. */
      'bootstrap under 1 MB': (r) => r.body.length < 1_048_576,
    });
    failures.add(!ok);
  });

  sleep(1);

  group('the poll every open tab makes', () => {
    const res = http.get(`${BASE}/api/storefront/version`, { tags: { name: 'version' } });
    failures.add(!check(res, { 'version 200': (r) => r.status === 200 }));
  });

  group('browsing a listing', () => {
    const page = 1 + Math.floor(Math.random() * 5);
    const res = http.get(
      `${BASE}/api/storefront/products?page=${page}&pageSize=24&sort=price_asc`,
      { tags: { name: 'products' } },
    );
    catalogLatency.add(res.timings.duration);
    failures.add(!check(res, { 'listing 200': (r) => r.status === 200 }));
  });

  sleep(1);

  group('a product page', () => {
    if (!slugs.length) return;
    const slug = slugs[Math.floor(Math.random() * slugs.length)];
    const res = http.get(`${BASE}/api/storefront/products/${slug}`, {
      tags: { name: 'product_detail' },
    });
    failures.add(!check(res, { 'product 200': (r) => r.status === 200 }));
  });

  group('search — the expensive read', () => {
    /* Varied terms on purpose: one repeated term would be answered from cache
       and would measure the cache rather than the search. */
    const terms = ['saree', 'silk', 'cotton', 'blouse', 'festive', 'handloom', 'indigo'];
    const term = terms[Math.floor(Math.random() * terms.length)];
    const res = http.get(`${BASE}/api/storefront/products?search=${term}&pageSize=24`, {
      tags: { name: 'search' },
    });
    searchLatency.add(res.timings.duration);
    failures.add(!check(res, { 'search 200': (r) => r.status === 200 }));
  });

  sleep(Math.random() * 2);
}

export function handleSummary(data) {
  const m = data.metrics;
  const p = (metric, stat) => Math.round(m[metric]?.values?.[stat] ?? 0);

  const lines = [
    '',
    '  SOPII storefront load test',
    '  ─────────────────────────────────────────────',
    `  requests          ${m.http_reqs?.values?.count ?? 0}`,
    `  throughput        ${(m.http_reqs?.values?.rate ?? 0).toFixed(1)} req/s`,
    `  error rate        ${((m.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%`,
    '',
    `  latency  avg      ${p('http_req_duration', 'avg')} ms`,
    `           p95      ${p('http_req_duration', 'p(95)')} ms`,
    `           p99      ${p('http_req_duration', 'p(99)')} ms`,
    `           max      ${p('http_req_duration', 'max')} ms`,
    '',
    `  catalogue p95     ${p('catalog_latency', 'p(95)')} ms`,
    `  search    p95     ${p('search_latency', 'p(95)')} ms`,
    '',
    '  Next: read /api/metrics for the per-route breakdown, and',
    '  /api/health for the cache backend that produced these numbers.',
    '',
  ];

  return { stdout: lines.join('\n') };
}
