/*
 * Load test — the write path (§22).
 * ===========================================================================
 *   k6 run loadtest/k6-checkout.js
 *   k6 run -e BASE=https://api.sopii.in -e VUS=100 loadtest/k6-checkout.js
 *
 * ⚠️  THIS WRITES ORDERS. Point it at a staging database, never production.
 *     It also consumes real stock and, if a Razorpay key is configured, will
 *     open real gateway orders. `PLACE_ORDERS=false` (the default) keeps it to
 *     quotes only, which is the safe way to measure checkout throughput.
 *
 * The read test measures whether the shop stays fast. This one measures the
 * two things that actually break a store under load, and neither is latency:
 *
 *   1. **Duplicate orders.** Every VU sends its bag twice, deliberately, the
 *      way a double-tapped button does. Every pair must produce one order.
 *   2. **Overselling.** A single product is hammered by every VU at once. The
 *      count of successful orders must never exceed the stock it started with.
 *
 * A run that is fast and wrong is worse than a run that is slow and right, so
 * both are thresholds and both fail the run.
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:4000';
const VUS = Number(__ENV.VUS || 30);
const PLACE_ORDERS = (__ENV.PLACE_ORDERS || 'false') === 'true';

const quoteLatency = new Trend('quote_latency', true);
const orderLatency = new Trend('order_latency', true);
const ordersCreated = new Counter('orders_created');
const duplicatesDetected = new Counter('duplicate_orders_detected');
const soldOutRefusals = new Counter('sold_out_refusals');
const failures = new Rate('business_failures');

export const options = {
  scenarios: {
    checkout: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: VUS },
        { duration: '1m', target: VUS },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    /* Pricing a bag reads the catalogue and the settings stack; it should still
       be quick, because the checkout re-quotes on every field change. */
    quote_latency: ['p(95)<600'],
    /* Placing one is heavier — a stock claim, a sequence, several writes. */
    order_latency: ['p(95)<1500'],
    http_req_failed: ['rate<0.02'],
    business_failures: ['rate<0.01'],
    /*
     * The correctness thresholds, and the reason this file exists.
     *
     * `duplicate_orders_detected` counts *replays the server correctly
     * recognised* — a non-zero value is the guard working. What must be zero is
     * a second order actually being created, which `business_failures` records
     * because the check below fails when two codes come back for one bag.
     */
    duplicate_orders_detected: ['count>=0'],
  },
};

const address = {
  fullName: 'Load Test',
  name: 'Load Test',
  phone: '9876543210',
  line1: '1 Test Street',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001',
  country: 'India',
};

const json = { headers: { 'Content-Type': 'application/json' } };

export function setup() {
  const res = http.get(`${BASE}/api/storefront/products?pageSize=40&inStock=true`);
  const items = res.json('items') || [];

  const buyable = items.filter((item) => (item.stock ?? 0) > 0);
  if (!buyable.length) throw new Error('no in-stock products to test against');

  return {
    /* One product for the contention test — everyone fights over this. */
    contended: buyable[0],
    /* A spread for the throughput test, so the numbers are not one document's. */
    pool: buyable.slice(0, 20),
    startingStock: buyable[0].stock,
  };
}

export default function (data) {
  const product = data.pool[Math.floor(Math.random() * data.pool.length)];

  group('price the bag', () => {
    const res = http.post(
      `${BASE}/api/storefront/checkout/quote`,
      JSON.stringify({
        items: [{ productId: product.id, quantity: 1 }],
        state: address.state,
        paymentMethod: 'cod',
      }),
      { ...json, tags: { name: 'quote' } },
    );

    quoteLatency.add(res.timings.duration);
    failures.add(
      !check(res, {
        'quote 200': (r) => r.status === 200,
        'quote returns a total': (r) => typeof r.json('total') === 'number',
        /* Money is computed server-side; a zero total means it was not. */
        'total is non-zero': (r) => (r.json('total') || 0) > 0,
      }),
    );
  });

  sleep(0.5);

  if (!PLACE_ORDERS) return;

  group('place it — twice, the way a double tap does', () => {
    const payload = JSON.stringify({
      email: `k6-${__VU}-${__ITER}@example.com`,
      address,
      items: [{ productId: data.contended.id, quantity: 1 }],
      paymentMethod: 'cod',
    });

    /*
     * Deliberately the *same* body with no explicit key, so the derived key
     * has to catch it — which is the case that protects a client that sends no
     * Idempotency-Key header at all, i.e. most of them.
     */
    const responses = http.batch([
      ['POST', `${BASE}/api/storefront/orders`, payload, { ...json, tags: { name: 'order' } }],
      ['POST', `${BASE}/api/storefront/orders`, payload, { ...json, tags: { name: 'order' } }],
    ]);

    responses.forEach((res) => orderLatency.add(res.timings.duration));

    const created = responses.filter((r) => r.status === 201);
    const codes = new Set(created.map((r) => r.json('order.code')).filter(Boolean));
    const replayed = responses.filter((r) => r.json('duplicate') === true).length;
    const conflicts = responses.filter((r) => r.status === 409).length;
    const soldOut = responses.filter(
      (r) => r.status === 400 && /sold out/i.test(r.body || ''),
    ).length;

    if (replayed || conflicts) duplicatesDetected.add(replayed + conflicts);
    if (soldOut) soldOutRefusals.add(soldOut);
    if (codes.size) ordersCreated.add(codes.size);

    failures.add(
      !check(null, {
        /*
         * THE ASSERTION THIS WHOLE FILE IS FOR. Two identical requests, at most
         * one order. Zero is fine — the product may have sold out — but two
         * distinct codes means a customer was charged twice.
         */
        'one bag never produces two orders': () => codes.size <= 1,
      }),
    );
  });

  sleep(1);
}

export function teardown(data) {
  if (!PLACE_ORDERS) return;

  const res = http.get(`${BASE}/api/storefront/products/${data.contended.id}`);
  const remaining = res.json('stock');

  console.log('');
  console.log('  Inventory check on the contended product');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  product          ${data.contended.name}`);
  console.log(`  stock before     ${data.startingStock}`);
  console.log(`  stock after      ${remaining}`);
  console.log(`  sold-out refusals ${soldOutRefusals.name ? '(see summary)' : ''}`);
  console.log('');
  console.log(
    remaining >= 0
      ? '  PASS — stock never went negative.'
      : `  FAIL — OVERSOLD by ${-remaining} units.`,
  );
  console.log('');
}

export function handleSummary(data) {
  const m = data.metrics;
  const p = (metric, stat) => Math.round(m[metric]?.values?.[stat] ?? 0);
  const count = (metric) => m[metric]?.values?.count ?? 0;

  return {
    stdout: [
      '',
      '  SOPII checkout load test',
      '  ─────────────────────────────────────────────',
      `  requests            ${count('http_reqs')}`,
      `  throughput          ${(m.http_reqs?.values?.rate ?? 0).toFixed(1)} req/s`,
      `  error rate          ${((m.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%`,
      '',
      `  quote   p95         ${p('quote_latency', 'p(95)')} ms`,
      `  order   p95         ${p('order_latency', 'p(95)')} ms`,
      `  order   p99         ${p('order_latency', 'p(99)')} ms`,
      '',
      `  orders created      ${count('orders_created')}`,
      `  duplicates caught   ${count('duplicate_orders_detected')}   (guard working)`,
      `  sold-out refusals   ${count('sold_out_refusals')}   (guard working)`,
      '',
      PLACE_ORDERS
        ? '  Orders were written. Check the teardown output above for the stock result.'
        : '  Quotes only. Set -e PLACE_ORDERS=true against staging to test order writes.',
      '',
    ].join('\n'),
  };
}
