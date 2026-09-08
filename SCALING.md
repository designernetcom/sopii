# SOPII — Scaling to 1M Users

What this document is: the architecture the code now assumes, the numbers behind
each decision, and the things that are **not** done yet. It is meant to be read
before a deploy, not after an incident.

One thing up front, because it governs everything else:

> **Nothing here demonstrates that SOPII serves a million users.** The code no
> longer contains the specific defects that made that impossible — unbounded
> queries, an unguarded stock decrement, a duplicate-order race, a full-catalogue
> payload — and it is now shaped so that capacity is a question about
> infrastructure rather than about code. Whether the infrastructure is there is a
> question only load testing against a realistically-sized dataset can answer.
> `server/loadtest/` is how you ask it.

---

## 1. The topology

```
                              ┌──────────────┐
                              │   Browsers   │
                              └──────┬───────┘
                                     │
                       ┌─────────────▼──────────────┐
                       │        CDN  (edge)          │
                       │  • SOPII static bundle      │
                       │  • Admin static bundle      │
                       │  • Cloudinary image origin  │
                       │  • /api/storefront/* GETs   │
                       │    honour s-maxage +        │
                       │    stale-while-revalidate   │
                       └─────────────┬──────────────┘
                                     │  (cache misses only)
                       ┌─────────────▼──────────────┐
                       │       Load balancer         │
                       │  idle timeout < origin's    │
                       │  keep-alive (see §5)        │
                       └──┬───────────┬───────────┬──┘
                          │           │           │
                    ┌─────▼───┐ ┌─────▼───┐ ┌─────▼───┐
                    │  API 1  │ │  API 2  │ │  API N  │   stateless
                    └─────┬───┘ └─────┬───┘ └─────┬───┘   → scale horizontally
                          │           │           │
              ┌───────────┴───────────┴───────────┴───────────┐
              │                                               │
      ┌───────▼────────┐                            ┌─────────▼────────┐
      │     Redis      │                            │     MongoDB       │
      │ • cache        │                            │  ┌─────────────┐  │
      │ • rate limits  │                            │  │  Primary    │  │ writes
      │ • auth entries │                            │  └──────┬──────┘  │
      └────────────────┘                            │         │         │
                                                    │  ┌──────▼──────┐  │
      ┌────────────────┐                            │  │ Secondaries │  │ reads
      │ Worker (1..N)  │◄── jobs collection ────────┤  └─────────────┘  │
      │ WORKER_ENABLED │                            └──────────────────┘
      │ =true here     │
      │ =false on API  │        ┌──────────────────────────────────┐
      └───────┬────────┘        │  Cloudinary — all image bytes     │
              │                 │  never served from the API        │
              ▼                 └──────────────────────────────────┘
   email · WhatsApp · exports
```

### What scales how

| Component | Scaling | Why |
|---|---|---|
| **SOPII / Admin bundles** | CDN, infinitely | Static files with hashed names. |
| **API** | Horizontally, freely | Stateless. No in-process session, no in-process counter, no in-process id. |
| **Worker** | Horizontally | Jobs are claimed with an atomic `findOneAndUpdate`; two workers cannot take the same job. |
| **Redis** | Vertically, then cluster | Cache and rate limits. Loss degrades performance, not correctness. |
| **MongoDB** | Vertically + read replicas | The real ceiling. See §4. |
| **Cloudinary** | Theirs | Image bytes never touch the API. |

**Do not run more than one API instance without `REDIS_URL`.** Without it each
instance caches separately (lower hit rate, more database load) and each
enforces rate limits separately (the effective ceiling becomes `max × instances`).
`/api/health` reports `"cache": "memory"` when this is the case, so it is
checkable rather than assumed.

---

## 2. The request path, and what it costs now

### A shopper opening the shop

| Step | Before | Now |
|---|---|---|
| `GET /bootstrap` | Entire published catalogue, full projection, rebuilt per visitor | First 200 products, listing projection, **cached**; CDN-cacheable |
| Per-product payload | ~4.6 KB | ~1.6 KB (**−65 %**) |
| `GET /version` (every open tab) | 6 queries, 5 of them full-collection counts, per poll, every 30 s | Cached 15 s + CDN; polled every 120 s |
| Rest of the catalogue | — | Fetched page by page **after first paint**, capped at `VITE_CATALOG_MAX_PRODUCTS` |
| Anonymous visitor | `POST /auth/refresh` on every page load | Skipped — no session cookie, nothing to restore |

The `/version` change is the largest single reduction in database load in the
system. At 100 000 concurrent tabs, a 30-second poll running six uncached
queries is on the order of 20 000 collection scans per second, all returning the
same answer. It is now six queries per fifteen seconds for the whole store,
before the CDN absorbs most of the requests entirely.

### An authenticated request

`resolveUser` performs three reads — session, identity, role — and previously a
`lastActiveAt` write, on **every** authenticated request.

- The three reads are cached for 10 s, keyed on the session id from a
  signature-verified token. Revocation still takes effect immediately, because
  `revokeSession` evicts the entry; the TTL is the backstop for a revocation
  another instance performed.
- `lastActiveAt` is now written at most once a minute per session.

### The bundles

| | Before | After |
|---|---|---|
| SOPII critical JS + CSS | 421.7 KB | 398.9 KB |
| SOPII main chunk | 164.5 KB (53.0 KB gz) | 140.8 KB (44.2 KB gz) |
| **Admin critical path** | **930.2 KB** | **515.3 KB (−45 %)** |
| Admin critical JS (gz) | 255.4 KB | 142.8 KB (**−44 %**) |

Two findings behind the admin numbers:

1. **The mock API layer shipped to production.** `baseQuery.ts` imported the
   mock router statically, so ~140 KB of handlers and seeded products, orders
   and customers were compiled into every build — including builds pointed at a
   real API, where none of it can execute. It is behind `import()` now, and
   `VITE_USE_MOCK_API=false` lets Rollup drop it entirely.
2. **Recharts was preloaded on the login screen.** `manualChunks: { charts: ['recharts'] }` made the 422 KB
   charting library a static dependency of the entry, with a
   `<link rel="modulepreload">` in `index.html`. Every visitor downloaded it
   before the password field appeared. The function form of `manualChunks`
   keeps it lazy.

---

## 3. Correctness under concurrency

Three races existed. Each is now closed at the database, not in application
logic, and each has a test that fails without the fix.

### Overselling — `lib/inventory.ts`

`quoteCart` read the stock, decided there was enough, and `writeOrder` then
decremented it. `$inc` is atomic, which is what made this easy to miss: the
arithmetic never lost an update, so the counter was always *consistent*. What
was not atomic was the *decision*.

```
stock = 1
A reads 1 ─┐  both see "one left"
B reads 1 ─┘
A $inc -1     stock = 0
B $inc -1     stock = -1     ← two customers, one saree
```

The decision now lives inside the write:
`updateOne({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })`. MongoDB
re-evaluates the filter under the document lock, so exactly one of two
concurrent claims for the last unit matches.

Verified: **21 concurrent buyers, 13 units → 13 orders, 8 refusals, stock 0.**

A multi-line bag is claimed line by line and compensated if a later line fails;
`USE_TRANSACTIONS=true` upgrades that to a real transaction where a replica set
is available.

### Duplicate orders — `lib/idempotency.ts`

- **COD had no protection at all.** A double-tapped Place Order on a slow
  connection produced two orders and a customer charged twice on delivery.
- **The online path had a read-then-write check.** `/verify` read
  `intent.orderId`, saw `null`, and wrote an order. Razorpay's popup handler and
  its webhook, arriving milliseconds apart, both saw `null`.

`withIdempotency` runs a handler at most once per key and replays the first
response to everything after it — the key being an `Idempotency-Key` header, or
one derived from the caller and the exact bag when no header is sent (which is
most clients). `claimOnce` closes the payment race with a single atomic
compare-and-set on the intent.

Verified: **10 simultaneous identical orders → 1 order, 1 unit of stock.**

A replay returns the original receipt rather than a 409, because the second
request is usually the honest client that never saw the first answer.

### Order codes — `lib/ids.ts`

`nextOrderCode` read the highest existing code, added one, and looped while that
code was taken — a read-then-write race whose `while` loop is the same race one
iteration later. It is an atomic `$inc` on a counter document now, with a unique
index on `code` as the hard stop.

Related: `nextId()` appended a **per-process counter**. Unique on one instance;
not unique across three, where two processes sharing a millisecond and a counter
value produce the same `_id`. Now 72 bits of randomness after a sortable time
prefix.

### Coupon limits

`$inc: { usedCount: 1 }` was unguarded, so a code with 100 uses could be
redeemed 140 times by 140 simultaneous checkouts. The increment now carries its
own limit check.

Verified: **30 concurrent redemptions of a 5-use coupon → exactly 5.**

---

## 4. The database

MongoDB is the ceiling, and the work below moves that ceiling rather than
removing it.

### Indexes — `db/indexes.ts`

31 compound indexes, each following **Equality → Sort → Range**. The schemas
carried single-field indexes, which are enough at ten thousand rows and not at
ten million: almost no real query filters on one field, and MongoDB will use one
index then sort the remainder in memory — until the sort exceeds 32 MB, at which
point it errors rather than degrades.

Two that matter especially:

- **`ix_customer_email_ci`** — a collation index. Every customer-by-email lookup
  used `{ email: /^value$/i }`, and an anchored case-insensitive regex **cannot
  use an index**: MongoDB evaluates it against every document. At a million
  customers, login, guest checkout and the newsletter were each a full
  collection scan.
- **`ix_product_text`** — a weighted text index, so search stops being an
  unanchored `/term/i` scan.

Unique indexes that cannot be built because the data already violates them are
rebuilt **without the constraint**, loudly, naming what to deduplicate. Refusing
to boot the store over pre-existing duplicate rows is the wrong trade. (This
fires today: the seeded customer data contains duplicate emails.)

### Queries removed

| Where | Was | Now |
|---|---|---|
| Admin dashboard | `OrderModel.find()` + `ProductModel.find()` + `CustomerModel.find()` — **all rows, no projection** | Windowed by range, projected to the fields the builders read, capped, cached |
| Product reports | Load the catalogue, `.filter().sort().slice(0,50)` in JS | Filter and sort in MongoDB, limit applied before anything leaves it |
| Global search | Unanchored regex over orders and customers | Text index; anchored prefix elsewhere |
| Collection page | Every product in the collection, full projection | Paged, listing projection |
| Account orders | `.limit(100)`, whole documents, no paging | Paged, list projection |
| Sitemap | Every published product in one file | Sitemap index + 20 000-URL chunks |

The dashboard is the one worth naming. At a million orders it did not degrade —
the process ran out of heap and died, taking every in-flight request with it,
**on the screen an operator opens because something is wrong.**

### Read replicas

Not yet wired. The API opens one connection with no `readPreference`, so
everything goes to the primary. The natural split — analytics and the storefront
feed to secondaries, everything transactional to the primary — needs a second
Mongoose connection and is listed in §7.

---

## 5. Cache strategy

| Namespace | Key | TTL | Invalidated by |
|---|---|---|---|
| `catalog` | `bootstrap:{limit}`, `products:{filters}`, `product:{id}`, `version` | 15–60 s | any write under `/api/products`, `/inventory`, `/coupons`, `/homepage` |
| `taxonomy` | `categories`, `collections`, `children:{id}` | 5 min | writes under `/api/categories`, `/collections` |
| `settings` | `store`, `public` | 60 s | `PUT /api/settings/:section` (awaited) |
| `seo` | `feed`, `robots`, `sitemap-*` | 10 min | writes under `/api/seo` |
| `analytics` | `dashboard:{range}`, `sales:{…}`, `products:{…}` | 2 min | any order write |
| `reviews` | `{productId}:{page}` | 2 min | writes under `/api/reviews` |
| `auth` | `session:{sid}` | 10 s | `revokeSession` (immediate) |

**Fallback:** a cache that is unavailable, misbehaving or absent is a miss.
Every read is wrapped so a cache failure can never fail a request, and
`initCache` degrades to the in-process LRU rather than refusing to boot.

**Invalidation is attached at the router**, not in each handler
(`lib/invalidation.ts`). There are ~25 write handlers; the twenty-sixth will not
remember the call. A new handler inherits invalidation by existing.

**Never cached:** carts, orders, customer records, sessions-as-data, OTPs.
Every namespace above names a store-wide fact. The one exception is `auth`,
keyed by a session id that comes out of a signature-verified token — a caller
who cannot produce that signature can never reach the entry — and the password
hash is stripped before anything is stored.

**HTTP caching** is set alongside, with `s-maxage` far longer than `max-age`
(a CDN can be purged; a browser cannot) and `stale-while-revalidate` so an
expiry during a sale serves the stale copy immediately and refreshes behind it.

---

## 6. Deployment checklist

Before the first production deploy:

- [ ] `AUTH_SECRET` and `JWT_SECRET` set to long random values (the server logs
      an error at boot if the development default survives).
- [ ] `REDIS_URL` set, `ioredis` installed. Confirm `/api/health` reports
      `"cache": "redis"`.
- [ ] `MONGODB_URI` points at a replica set. `MEMORY_MONGO` unset or `false`.
- [ ] `TRUST_PROXY_HOPS` matches the number of proxies in front. Wrong here
      means every request shares one IP and one rate limit.
- [ ] `AUTH_COOKIE_SAMESITE=none` + `AUTH_COOKIE_SECURE=true` if the shop and
      the API are on different sites.
- [ ] `CORS_ORIGIN`, `SHOP_URL`, `ADMIN_URL` set to real origins.
- [ ] `METRICS_TOKEN` set — `/api/metrics` is closed in production without it.
- [ ] `WORKER_ENABLED=false` on API instances, `true` on the worker.
- [ ] Load balancer idle timeout **below** `KEEPALIVE_TIMEOUT_MS` (65 s). The
      other way round produces intermittent 502s that appear in no log.
- [ ] A CSP on whatever serves the two SPAs' HTML. The API does not set one and
      should not — it serves JSON, and a permissive policy there would look like
      the problem was handled.
- [ ] Indexes built. They are created at boot, but on a large existing
      collection prefer a rolling build on the replica set first.

---

## 7. What is not done

Listed because a scaling document that only says what was fixed is misleading.

1. **Read replicas are not wired.** All reads go to the primary. Needs a second
   Mongoose connection with `readPreference: secondaryPreferred` for analytics
   and the storefront feed.
2. **Search is a MongoDB text index, not a search engine.** Good to roughly a
   million documents; it does not do typo tolerance, faceting or relevance
   tuning. The seam is one function in `routes/storefront.ts`.
3. **Admin exports are the current page, not a job.** The queue seam exists
   (`JOB.exportGenerate`); a real async export needs object storage for the
   result file, which is not configured.
4. **Email is not wired.** `JOB.emailSend` records the intent and returns.
   Checkout already enqueues it and does not wait, so adding a provider is one
   function body.
5. **WhatsApp order notifications need an approved template.** Meta will not
   deliver a business-initiated message that is not one. Auth OTP works today.
6. **No CSP.** See the checklist.
7. **No load test has been run at scale.** The kit is in `server/loadtest/`.
   Until it has been run against a realistically-sized catalogue on production-
   shaped infrastructure, the capacity of this system is unknown.
8. **`ix_customer_email_ci` is not unique** on the seeded dataset, which
   contains duplicate emails. Deduplicate, then rebuild with `unique: true`.

---

## 8. Load testing

```bash
cd SOPI-Admin/server

# Reads: bootstrap, version poll, listings, product pages, search.
k6 run loadtest/k6-storefront.js
k6 run -e BASE=https://api-staging.sopii.in -e VUS=500 loadtest/k6-storefront.js

# Writes: quotes only by default. PLACE_ORDERS=true writes real orders,
# consumes real stock, and asserts that neither duplicates nor overselling occur.
k6 run loadtest/k6-checkout.js
k6 run -e BASE=https://api-staging.sopii.in -e PLACE_ORDERS=true loadtest/k6-checkout.js
```

Both print throughput, average, p95, p99 and error rate. For *where* the time
goes, read `/api/metrics` during the run — it breaks latency down per route, so
the slowest route is named rather than inferred.

Three conditions, without which the numbers are not about production:

1. **Seed a realistic catalogue.** 400 products tells you nothing about 400 000.
   The whole question is what happens when the working set stops fitting in RAM.
2. **Run with `REDIS_URL` set.** Otherwise the hit rate you measure is not the
   one production will have.
3. **Run k6 from a different machine.** Sharing a CPU measures the load
   generator.

Correctness tests, which need no k6:

```bash
npm test        # in SOPI-Admin/server — 13 concurrency tests
```
