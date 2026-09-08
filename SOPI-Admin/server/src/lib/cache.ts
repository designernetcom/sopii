/*
 * The cache layer (§5).
 * ===========================================================================
 * One interface, two backends, chosen at boot:
 *
 *   REDIS_URL set    → Redis, shared by every API instance. This is the
 *                      production shape: a catalogue page cached by API 1 is
 *                      served from cache by API 2, and an invalidation from
 *                      the admin panel reaches all of them.
 *   REDIS_URL unset  → an in-process LRU with the same interface. Correct on a
 *                      single instance and correct-but-per-instance on several,
 *                      which is why /api/health reports which one is live
 *                      rather than leaving an operator to guess.
 *
 * `ioredis` is imported through a non-literal specifier so the server still
 * builds and boots on a machine that has never installed it. A cache that
 * cannot connect degrades to the local one instead of taking the store down —
 * a cache is an optimisation, never a dependency.
 *
 * WHAT MUST NEVER GO IN HERE
 * ---------------------------------------------------------------------------
 * Anything keyed by a person: a cart, an order, a customer record, an OTP.
 * Every key below names a *store-wide* fact — the published catalogue, the
 * taxonomy, the store's own settings — so a cache hit can never hand one
 * shopper another's data. The single exception is the auth entry, which is
 * keyed by session id, holds a few seconds of TTL, and is argued for at its
 * use site in `auth/middleware.ts`.
 */

import { logger } from './logger.js';

export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  /** Drops every key under a prefix — the invalidation half of the strategy. */
  delPrefix(prefix: string): Promise<void>;
  /**
   * Adds one to a counter and answers the new total, atomically.
   *
   * The rate limiter is the caller, and it needs this rather than get-then-set
   * for the reason every other counter in this codebase does: thirty requests
   * arriving together all read the same value before any of them writes, so a
   * burst of thirty counts as one. A limiter that only holds against
   * sequential clients is not a limiter — parallel is how a scraper and a
   * credential-stuffer actually send.
   *
   * `ttlMs` sets the expiry when the key is created and is ignored afterwards,
   * so a window cannot be extended by continuing to hit it.
   */
  incr(key: string, ttlMs: number): Promise<number>;
  readonly kind: 'redis' | 'memory';
}

/* ------------------------------ memory backend ------------------------------ */

interface Entry {
  value: string;
  expiresAt: number;
}

/**
 * A bounded LRU. Bounded matters: an unbounded map keyed by query string is a
 * memory leak with a friendly interface, and the process is what dies.
 */
class MemoryCache implements CacheBackend {
  readonly kind = 'memory' as const;

  private readonly store = new Map<string, Entry>();

  constructor(private readonly maxEntries = Number(process.env.CACHE_MAX_ENTRIES ?? 5000)) {}

  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    // Re-insert so the key moves to the young end of the iteration order.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: string, ttlMs: number) {
    if (this.store.size >= this.maxEntries) {
      // Map iterates in insertion order, so the first key is the coldest.
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async del(keys: string[]) {
    keys.forEach((key) => this.store.delete(key));
  }

  async delPrefix(prefix: string) {
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /*
   * Atomic by construction: no `await` between the read and the write, so the
   * whole increment runs in one turn of the event loop and no other caller can
   * interleave with it.
   */
  async incr(key: string, ttlMs: number) {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      const next = Number(entry.value) + 1;
      entry.value = String(next);
      return next;
    }
    this.store.set(key, { value: '1', expiresAt: Date.now() + ttlMs });
    return 1;
  }
}

/* ------------------------------ redis backend ------------------------------- */

class RedisCache implements CacheBackend {
  readonly kind = 'redis' as const;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly client: any) {}

  async get(key: string) {
    return (await this.client.get(key)) as string | null;
  }

  async set(key: string, value: string, ttlMs: number) {
    await this.client.set(key, value, 'PX', Math.max(1, Math.round(ttlMs)));
  }

  async del(keys: string[]) {
    if (keys.length) await this.client.del(...keys);
  }

  /**
   * SCAN rather than KEYS. `KEYS pattern` is O(n) *and* blocks the single Redis
   * thread for the whole sweep — on a cache with a million keys that is a
   * store-wide stall every time somebody saves a product.
   */
  /*
   * `INCR` is atomic on the server, so concurrent instances share one counter.
   * `PEXPIRE` only when the key was just created (`next === 1`) — setting it on
   * every hit would slide the window forward for as long as the abuse
   * continues, which is the one thing a fixed window must not do.
   */
  async incr(key: string, ttlMs: number) {
    const next = Number(await this.client.incr(key));
    if (next === 1) await this.client.pexpire(key, Math.max(1, Math.round(ttlMs)));
    return next;
  }

  async delPrefix(prefix: string) {
    let cursor = '0';
    do {
      const [next, batch]: [string, string[]] = await this.client.scan(
        cursor,
        'MATCH',
        prefix + '*',
        'COUNT',
        500,
      );
      cursor = next;
      if (batch.length) await this.client.del(...batch);
    } while (cursor !== '0');
  }
}

/* -------------------------------- selection --------------------------------- */

let backend: CacheBackend = new MemoryCache();
let ready: Promise<CacheBackend> | null = null;

export const cacheKind = () => backend.kind;

export async function initCache(): Promise<CacheBackend> {
  if (ready) return ready;

  ready = (async () => {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      logger.warn('cache.memory', {
        detail: 'REDIS_URL is unset — caching is per-instance. Set it before scaling out.',
      });
      return backend;
    }

    try {
      // Non-literal specifier: TypeScript does not try to resolve the module,
      // so the build does not require the package to be installed.
      const specifier = process.env.CACHE_CLIENT_MODULE ?? 'ioredis';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import(specifier);
      const Redis = mod.default ?? mod.Redis ?? mod;

      const client = new Redis(url, {
        // Fail fast and fall through to the local cache rather than queueing
        // every request behind a dead connection.
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        lazyConnect: true,
        connectTimeout: 3000,
      });

      client.on('error', (error: Error) => {
        logger.warn('cache.redis_error', { detail: error.message });
      });

      await client.connect();
      await client.ping();

      backend = new RedisCache(client);
      logger.info('cache.redis', { detail: 'connected' });
    } catch (error) {
      logger.warn('cache.redis_unavailable', {
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    return backend;
  })();

  return ready;
}

/* ------------------------------- the interface ------------------------------ */

/**
 * Namespaced and versioned, so a deploy that changes a cached shape does not
 * serve the old one: bump CACHE_VERSION and every key moves.
 */
const NS = 'sopii:v' + (process.env.CACHE_VERSION ?? '1') + ':';

export const cacheKey = (...parts: (string | number | undefined)[]) =>
  NS + parts.filter((part) => part !== undefined && part !== '').join(':');

export const metrics = { hits: 0, misses: 0 };

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await backend.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    // A cache that misbehaves must never fail a request.
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlMs: number) {
  try {
    await backend.set(key, JSON.stringify(value), ttlMs);
  } catch {
    /* ignore — see above */
  }
}

/**
 * Atomic increment, for counters that must not lose a concurrent write.
 *
 * Returns `null` when the backend is unavailable, rather than a count the
 * caller would have to guess about — the rate limiter reads that as "allow",
 * which is the right failure direction for a shop.
 */
export async function cacheIncr(key: string, ttlMs: number): Promise<number | null> {
  try {
    return await backend.incr(key, ttlMs);
  } catch {
    return null;
  }
}

export async function cacheDel(...keys: string[]) {
  try {
    await backend.del(keys);
  } catch {
    /* ignore */
  }
}

/** Invalidation by namespace — `invalidate('catalog')` drops every catalogue key. */
export async function invalidate(...prefixes: string[]) {
  await Promise.all(
    prefixes.map(async (prefix) => {
      try {
        await backend.delPrefix(cacheKey(prefix));
      } catch {
        /* ignore */
      }
    }),
  );
}

/* ---------------------------- read-through helper --------------------------- */

/**
 * In-flight de-duplication, per process.
 *
 * The stampede this prevents is the one that actually hurts: a popular key
 * expires and the fifty requests arriving in the next 40 ms all miss and all
 * run the same aggregation. With this they run it once and share the answer.
 * Redis narrows the cross-instance case to one stampede per instance, which is
 * the part a single process cannot fix on its own.
 */
const inFlight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) {
    metrics.hits += 1;
    return hit;
  }
  metrics.misses += 1;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = load()
    .then(async (value) => {
      await cacheSet(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

export const cacheStats = () => {
  const total = metrics.hits + metrics.misses;
  return {
    backend: backend.kind,
    hits: metrics.hits,
    misses: metrics.misses,
    hitRate: total ? Number((metrics.hits / total).toFixed(4)) : 0,
  };
};

/* --------------------------------- namespaces -------------------------------- */

/**
 * Every cache namespace in one place, so an invalidation cannot miss a key
 * somebody added in another file. `routes/*` import these rather than spelling
 * the strings out.
 */
export const NAMESPACE = {
  catalog: 'catalog',
  taxonomy: 'taxonomy',
  cms: 'cms',
  settings: 'settings',
  seo: 'seo',
  analytics: 'analytics',
  reviews: 'reviews',
  auth: 'auth',
} as const;

/**
 * What a write to each domain invalidates.
 *
 * Publishing a product changes the catalogue feed, the change token, the
 * sitemap and every dashboard number, so all four namespaces go. Being
 * generous here is deliberate: a stale page is a bug an operator reports, and
 * a redundant cache miss is a few milliseconds nobody notices.
 */
/**
 * The key a session's resolved identity is cached under.
 *
 * Defined here rather than in `auth/middleware.ts` because two files need it
 * and they cannot import each other: the middleware writes the entry, and
 * `auth/sessions.ts` deletes it the instant a session is revoked. A key spelled
 * out twice is a key that eventually differs by a character, and the symptom of
 * that would be a revoked session that keeps working for ten seconds — which is
 * exactly the bug the invalidation exists to prevent.
 */
export const authSessionKey = (sessionId: string) => cacheKey(NAMESPACE.auth, 'session', sessionId);

export const onWrite = {
  product: () => invalidate(NAMESPACE.catalog, NAMESPACE.seo, NAMESPACE.analytics),
  taxonomy: () => invalidate(NAMESPACE.taxonomy, NAMESPACE.catalog, NAMESPACE.seo),
  cms: () => invalidate(NAMESPACE.cms, NAMESPACE.catalog),
  settings: () => invalidate(NAMESPACE.settings, NAMESPACE.catalog),
  seo: () => invalidate(NAMESPACE.seo),
  order: () => invalidate(NAMESPACE.analytics, NAMESPACE.catalog),
  review: () => invalidate(NAMESPACE.reviews, NAMESPACE.catalog),
};

/* ---------------------------------- TTLs ------------------------------------ */

/**
 * One table, so a TTL is a decision somebody made rather than a number that
 * appeared in a handler. Every value is deliberately short: the shop polls for
 * changes and an admin publishing a product expects to see it, so these trade
 * a little staleness for a very large drop in database load.
 */
export const TTL = {
  /** Store settings: read by every quote, changed a few times a year. */
  settings: Number(process.env.CACHE_TTL_SETTINGS_MS ?? 60_000),
  /** The published catalogue feed. */
  catalog: Number(process.env.CACHE_TTL_CATALOG_MS ?? 60_000),
  /** Taxonomy — categories and collections change rarely. */
  taxonomy: Number(process.env.CACHE_TTL_TAXONOMY_MS ?? 300_000),
  /** The change token the shop polls. Short, because it gates everything else. */
  version: Number(process.env.CACHE_TTL_VERSION_MS ?? 15_000),
  /** One product's detail page. */
  product: Number(process.env.CACHE_TTL_PRODUCT_MS ?? 60_000),
  /** Reviews and their star breakdown. */
  reviews: Number(process.env.CACHE_TTL_REVIEWS_MS ?? 120_000),
  /** SEO metadata and the sitemap chunks. */
  seo: Number(process.env.CACHE_TTL_SEO_MS ?? 600_000),
  /** Admin dashboard and reports — expensive, and nobody watches them tick. */
  analytics: Number(process.env.CACHE_TTL_ANALYTICS_MS ?? 120_000),
  /** Session + identity + role, keyed by session id. Seconds, not minutes. */
  auth: Number(process.env.CACHE_TTL_AUTH_MS ?? 10_000),
} as const;
