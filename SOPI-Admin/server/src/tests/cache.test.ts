/*
 * Tests for the cache and the rate limiter (§5, §16).
 * ===========================================================================
 * Two properties matter more than the hit rate, and neither is visible in
 * normal operation:
 *
 *   1. A cache that misbehaves must never fail a request. The wrong failure
 *      direction here turns a Redis blip into a store-wide outage.
 *   2. An invalidation must actually drop the keys it claims to. The symptom
 *      of a missed one is an admin publishing a product and not seeing it on
 *      the shop, which reads as "the cache is broken" and is very hard to
 *      trace back to one missing line.
 *
 * These run against the in-process LRU, which is the backend when REDIS_URL is
 * unset — so no service is needed and the semantics under test are the shared
 * ones, not Redis-specific behaviour.
 *
 * Run with:  npm test        (in server/)
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  NAMESPACE,
  cacheDel,
  cacheGet,
  cacheKey,
  cacheKind,
  cacheSet,
  cacheStats,
  cached,
  invalidate,
  metrics,
} from '../lib/cache.js';
import { consume } from '../lib/rateLimit.js';

/** A key nobody else in the suite can collide with. */
let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${(seq += 1)}`;

beforeEach(() => {
  metrics.hits = 0;
  metrics.misses = 0;
});

/* --------------------------------- keys ------------------------------------ */

describe('cache: key construction', () => {
  it('namespaces every key so a version bump invalidates the whole cache', () => {
    assert.ok(cacheKey('catalog', 'product', 'prd_1').startsWith('sopii:v'));
  });

  it('drops undefined and empty parts rather than leaving holes in the key', () => {
    assert.equal(cacheKey('catalog', undefined, 'x'), cacheKey('catalog', 'x'));
    assert.equal(cacheKey('catalog', '', 'x'), cacheKey('catalog', 'x'));
  });

  it('keeps different arguments on different keys', () => {
    assert.notEqual(cacheKey('catalog', 'a'), cacheKey('catalog', 'b'));
    assert.notEqual(cacheKey('catalog', 'a', 'b'), cacheKey('catalog', 'ab'));
  });
});

/* ------------------------------ get / set ---------------------------------- */

describe('cache: reads and writes', () => {
  it('defaults to the in-process backend when REDIS_URL is unset', () => {
    assert.equal(cacheKind(), process.env.REDIS_URL ? 'redis' : 'memory');
  });

  it('round-trips a structured value', async () => {
    const key = cacheKey('catalog', uniq('rt'));
    await cacheSet(key, { products: [{ id: 'prd_1', price: 3990 }], total: 1 }, 5_000);

    assert.deepEqual(await cacheGet(key), { products: [{ id: 'prd_1', price: 3990 }], total: 1 });
  });

  it('answers null for a key that was never written', async () => {
    assert.equal(await cacheGet(cacheKey('catalog', uniq('missing'))), null);
  });

  it('expires an entry once its TTL has passed', async () => {
    const key = cacheKey('catalog', uniq('ttl'));
    await cacheSet(key, 'fresh', 40);

    assert.equal(await cacheGet(key), 'fresh');
    await sleep(70);
    assert.equal(await cacheGet(key), null, 'a stale entry was served past its TTL');
  });

  it('deletes the keys it is given and leaves the rest alone', async () => {
    const gone = cacheKey('catalog', uniq('gone'));
    const kept = cacheKey('catalog', uniq('kept'));
    await cacheSet(gone, 1, 5_000);
    await cacheSet(kept, 1, 5_000);

    await cacheDel(gone);

    assert.equal(await cacheGet(gone), null);
    assert.equal(await cacheGet(kept), 1);
  });
});

/* ----------------------------- invalidation -------------------------------- */

describe('cache: invalidation by namespace (§5)', () => {
  it('drops every key under the namespace it is given', async () => {
    const a = cacheKey(NAMESPACE.catalog, uniq('bootstrap'));
    const b = cacheKey(NAMESPACE.catalog, uniq('products'));
    await cacheSet(a, 1, 10_000);
    await cacheSet(b, 2, 10_000);

    await invalidate(NAMESPACE.catalog);

    assert.equal(await cacheGet(a), null);
    assert.equal(await cacheGet(b), null);
  });

  it('leaves other namespaces untouched', async () => {
    // Publishing a product must not evict the taxonomy or the settings — an
    // over-broad invalidation is a self-inflicted stampede.
    const product = cacheKey(NAMESPACE.catalog, uniq('p'));
    const category = cacheKey(NAMESPACE.taxonomy, uniq('c'));
    const settings = cacheKey(NAMESPACE.settings, uniq('s'));
    await cacheSet(product, 1, 10_000);
    await cacheSet(category, 1, 10_000);
    await cacheSet(settings, 1, 10_000);

    await invalidate(NAMESPACE.catalog);

    assert.equal(await cacheGet(product), null);
    assert.equal(await cacheGet(category), 1, 'taxonomy was evicted by a catalogue write');
    assert.equal(await cacheGet(settings), 1, 'settings were evicted by a catalogue write');
  });

  it('drops several namespaces in one call', async () => {
    const a = cacheKey(NAMESPACE.catalog, uniq('a'));
    const b = cacheKey(NAMESPACE.taxonomy, uniq('b'));
    await cacheSet(a, 1, 10_000);
    await cacheSet(b, 1, 10_000);

    await invalidate(NAMESPACE.catalog, NAMESPACE.taxonomy);

    assert.equal(await cacheGet(a), null);
    assert.equal(await cacheGet(b), null);
  });

  it('is a no-op rather than an error for a namespace holding nothing', async () => {
    await assert.doesNotReject(() => invalidate(NAMESPACE.reviews));
  });
});

/* --------------------------- read-through helper --------------------------- */

describe('cache: the read-through helper', () => {
  it('runs the loader once and serves the second call from the entry', async () => {
    const key = cacheKey('catalog', uniq('rt'));
    let loads = 0;
    const load = async () => {
      loads += 1;
      return { value: 'loaded' };
    };

    assert.deepEqual(await cached(key, 5_000, load), { value: 'loaded' });
    assert.deepEqual(await cached(key, 5_000, load), { value: 'loaded' });
    assert.equal(loads, 1, 'the loader ran again for a warm key');
  });

  it('collapses a stampede into one load', async () => {
    // The case that hurts: a popular key expires and the fifty requests
    // arriving in the next 40 ms all miss and all run the same aggregation.
    const key = cacheKey('catalog', uniq('stampede'));
    let loads = 0;
    const load = async () => {
      loads += 1;
      await sleep(20);
      return loads;
    };

    const answers = await Promise.all(Array.from({ length: 50 }, () => cached(key, 5_000, load)));

    assert.equal(loads, 1, `the loader ran ${loads} times for one cold key`);
    assert.ok(answers.every((a) => a === 1), 'callers disagreed about the answer');
  });

  it('counts hits and misses so the hit rate is real', async () => {
    const key = cacheKey('catalog', uniq('stats'));
    await cached(key, 5_000, async () => 'v');
    await cached(key, 5_000, async () => 'v');
    await cached(key, 5_000, async () => 'v');

    const stats = cacheStats();
    assert.equal(stats.misses, 1);
    assert.equal(stats.hits, 2);
    assert.equal(stats.hitRate, Number((2 / 3).toFixed(4)));
  });

  it('does not cache a rejection, so a transient failure is retried', async () => {
    const key = cacheKey('catalog', uniq('fail'));
    let calls = 0;

    await assert.rejects(() =>
      cached(key, 5_000, async () => {
        calls += 1;
        throw new Error('mongo timed out');
      }),
    );

    assert.deepEqual(await cached(key, 5_000, async () => {
      calls += 1;
      return 'recovered';
    }), 'recovered');
    assert.equal(calls, 2, 'the failure was cached and the retry never ran');
  });

  it('releases the in-flight slot after a rejection', async () => {
    // If the failed promise stayed in the in-flight map, every later caller
    // for that key would be handed the same rejection forever.
    const key = cacheKey('catalog', uniq('inflight'));

    await assert.rejects(() => cached(key, 5_000, async () => { throw new Error('boom'); }));
    assert.equal(await cached(key, 5_000, async () => 'ok'), 'ok');
  });
});

/* ------------------------------ rate limiting ------------------------------ */

describe('rate limiting: the volume ceiling (§16)', () => {
  it('allows exactly the quota and refuses the request after it', async () => {
    const id = uniq('ip');
    const rule = { max: 3, windowMs: 60_000 };

    const verdicts = [];
    for (let i = 0; i < 5; i += 1) verdicts.push((await consume('search', id, rule)).allowed);

    assert.deepEqual(verdicts, [true, true, true, false, false]);
  });

  it('reports the remaining quota, floored at zero', async () => {
    const id = uniq('ip');
    const rule = { max: 2, windowMs: 60_000 };

    assert.equal((await consume('search', id, rule)).remaining, 1);
    assert.equal((await consume('search', id, rule)).remaining, 0);
    assert.equal((await consume('search', id, rule)).remaining, 0, 'remaining went negative');
  });

  it('keeps two scopes on separate buckets', async () => {
    // Searching must not consume the checkout quota — one scope exhausting
    // another is how a browsing shopper gets locked out of paying.
    const id = uniq('ip');
    const rule = { max: 1, windowMs: 60_000 };

    assert.equal((await consume('search', id, rule)).allowed, true);
    assert.equal((await consume('search', id, rule)).allowed, false);
    assert.equal((await consume('checkout', id, rule)).allowed, true, 'scopes shared a bucket');
  });

  it('keeps two callers on separate buckets', async () => {
    const rule = { max: 1, windowMs: 60_000 };

    assert.equal((await consume('order', uniq('a'), rule)).allowed, true);
    assert.equal((await consume('order', uniq('b'), rule)).allowed, true);
  });

  it('lets the caller through again once the window rolls over', async () => {
    const id = uniq('ip');
    const rule = { max: 1, windowMs: 60 };

    assert.equal((await consume('payment', id, rule)).allowed, true);
    assert.equal((await consume('payment', id, rule)).allowed, false);

    await sleep(130);
    assert.equal((await consume('payment', id, rule)).allowed, true, 'the window never reset');
  });

  it('reports a reset time in the future, so Retry-After is a real number', async () => {
    const { resetAt } = await consume('order', uniq('ip'), { max: 5, windowMs: 60_000 });
    assert.ok(resetAt > Date.now(), 'resetAt is in the past');
    assert.ok(resetAt <= Date.now() + 60_000);
  });

  it('holds the ceiling against a burst sent in parallel', async () => {
    /*
     * The regression this guards.
     *
     * `consume` used to read the counter, add one and write it back. Thirty
     * requests sent together all read zero before any of them wrote, so each
     * stored `count: 1` and all thirty passed a ceiling of ten — the counter
     * afterwards still read 1, so the next request passed too. Sequential
     * callers were limited correctly the entire time, which is why it looked
     * fine by hand.
     *
     * Parallel is how a scraper and a credential-stuffer actually send, so
     * this is the shape that matters.
     */
    const id = uniq('burst');
    const rule = { max: 10, windowMs: 60_000 };

    const results = await Promise.all(
      Array.from({ length: 30 }, () => consume('order', id, rule)),
    );
    const allowed = results.filter((r) => r.allowed).length;

    assert.equal(allowed, rule.max, `a parallel burst got ${allowed} through a ceiling of ${rule.max}`);
    assert.equal((await consume('order', id, rule)).allowed, false, 'the burst never hit the ceiling');
  });

  it('counts a parallel burst exactly once per request', async () => {
    // No lost updates and no double-counting: N requests must move the counter
    // by exactly N.
    const id = uniq('exact');
    const rule = { max: 1_000, windowMs: 60_000 };

    await Promise.all(Array.from({ length: 40 }, () => consume('search', id, rule)));
    const { remaining } = await consume('search', id, rule);

    assert.equal(remaining, rule.max - 41);
  });
});
