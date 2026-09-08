# SOPII Admin — API

Express + MongoDB (Mongoose) backend for two clients:

- the **admin panel** in the parent folder, on `/api/*` behind a bearer token;
- the **SOPII shop front** in `../../SOPII`, on `/api/storefront/*` — public and
  read-only, so whatever the panel publishes is what the shop renders.

## Running it

```bash
cd server
npm install
npm run dev          # http://localhost:4000/api
```

Then, in the project root:

```bash
npm run dev          # http://localhost:5173
```

Vite proxies `/api` to `http://localhost:4000`, so the browser only ever talks to
one origin. The root `.env` decides which backend the panel uses:

```ini
VITE_USE_MOCK_API=false   # real API  (true = the original in-browser mock)
VITE_API_BASE_URL=/api
```

Sign in with any seeded admin — `rajesh@sopii.in` (Super Admin) through to
`karthik@sopii.in` (Support) — password `sopii123`.

The shop front runs the same way, from `../../SOPII`:

```bash
npm run dev          # http://localhost:5174
```

It proxies `/api` here too, so one server feeds both.

## The database

`MONGODB_URI` points at a local mongod or an Atlas cluster. If it is unreachable
the server **starts an embedded MongoDB** and keeps its files in
`server/.data/mongo`, so the panel runs on a machine with nothing installed.
That is a development convenience: set `MEMORY_MONGO=false` in production and an
unreachable database becomes a hard startup failure instead.

The first boot against an empty database seeds it automatically.

```bash
npm run seed         # add the starter dataset
npm run seed:fresh   # wipe every collection, then reseed
```

The seed imports the panel's own generators in `src/data/*`, so the database
starts out with exactly the ids and relations the frontend was built against —
456 products, 1,248 orders, 8,540 customers, and the roles/permissions matrix.

## How it fits the existing frontend

Nothing in the panel's API layer changed. The RTK Query endpoints were always
written against real REST URLs; they previously resolved against an in-browser
mock router. This server implements the same contract — same paths, same query
parameters, same response shapes (`{ items, total, page, pageSize, totalPages }`
for lists, `{ message }` for errors) — so flipping `VITE_USE_MOCK_API` is the
only change needed.

Two pieces of the frontend are deliberately reused rather than reimplemented:

- **`src/data/*`** seeds the database, so there is one dataset, not two.
- **`src/data/analytics.ts`** powers `/dashboard` and `/reports`, so the server's
  numbers cannot drift from what the panel used to compute. Those endpoints load
  the working set per request — fine at this size, and the first thing to convert
  to aggregation pipelines if the order table grows large.

## Design notes

- **String `_id`.** Documents keep their seeded ids (`prd_0001`, `SOP10711`)
  instead of ObjectIds, because every cross-reference in the dataset is one of
  those strings. A shared `toJSON` transform renames `_id` to `id`.
- **Auth.** `POST /api/auth/login` verifies a bcrypt hash and returns a JWT; every
  other route requires `Authorization: Bearer <token>`. Shoppers have their own,
  separate sessions — see the storefront feed below.
- **Permissions are enforced server-side.** `requirePermission(resource, action)`
  mirrors the panel's route guards against the signed-in user's role matrix, so a
  Support account gets `403` from `/admin-users` even if it crafts the request by
  hand. The UI hiding a button was never the security boundary.
- **Derived values are computed, not stored.** Coupon status (scheduled / active /
  expired) comes from its date window, role `userCount` from a live count of
  admins, and category `productCount` from a grouped product count — so none of
  them can go stale.

## Endpoints

| Group | Routes |
| --- | --- |
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `PUT /auth/profile`, `PUT /auth/password`, `PUT /auth/two-factor`, `DELETE /auth/sessions/:id` |
| Catalog | `/products` (+ `/:id/duplicate`, `/bulk`), `/categories` (+ `/reorder`), `/collections` (+ `/reorder`) |
| Sales | `/orders` (+ `/counts`, `/:id/status`, `/:id/note`, `/:id/resend-email`, `/:id/email-log`), `/customers`, `/inventory` (+ `/summary`, `/history`, `/:id/adjust`) |
| Marketing | `/coupons`, `/reviews` (+ `/counts`, `/bulk`, `/:id/status`, `/:id/reply`) |
| Storefront | `/homepage/banners`, `/homepage/sections` (both + `/reorder`), `/media` (+ `/stats`, `/bulk-delete`) |
| Images | `/uploads/image` (POST, DELETE), `/uploads/status` |
| Insights | `/dashboard`, `/reports/{sales,products,customers,orders}`, `/search`, `/notifications` |
| Administration | `/admin-users`, `/roles`, `/settings/:section` |

`GET /api/health` reports process uptime and database connection state.

Three commands answer "did the customer get their email", in `server/`:

| Command | What it proves |
| --- | --- |
| `npm run email:test -- you@example.com` | The **transport**: renders a real order and hands it straight to Mailtrap. Verifies the credentials before sending, so a login problem never looks like a template problem |
| `npm run email:status [n]` | The **record**: the last *n* orders and what was emailed about each, the delivery log, and anything the queue is still holding. Addresses are masked |
| `npm run email:verify -- SOP11358` | The **whole path**: enqueues a job and runs the real worker, so it exercises queue → handler → EmailService → Mailtrap exactly as placing an order does. Sends a real email |

Note that a worker holds its Mailtrap configuration from the moment it started.
A server that was running before `MAILTRAP_*` was filled in will keep recording
sends as `skipped` — and because the queue is shared through MongoDB, a stale
worker left running anywhere will claim jobs and do that to them. Restart it
after changing the mail configuration.

## Images

Uploads go to **Cloudinary**, and MongoDB keeps two short strings rather than the picture:

```
admin panel  ──▶  POST /api/uploads/image  ──▶  Cloudinary
                                                    │
                          { url, publicId }  ◀───────┘
                                  │
                                  ▼
                    saved on the product / banner record
```

`src/lib/cloudinary.ts` is the only place image bytes leave this server. It reads
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` (see
`.env.example` for the two alternative spellings that are also accepted). **The API secret
stays on the server** — it signs uploads *and* deletions, so the panel uploads through
this API precisely so the browser bundle never needs it. With nothing configured the
upload endpoints answer 503 rather than falling back to storing base64.

Assets are filed by the record that owns them — `sopii/products/{productId}`,
`sopii/banners/{bannerId}`, `sopii/library/{folder}` — so an admin can see everything
belonging to one product in one place, and a stray asset is traceable to the document that
made it.

`publicId` is the handle, and it is why the field is stored rather than parsed back out of
the URL: when an image is replaced or removed, the record's own writer reconciles the
saved document against its previous state and destroys what nothing points at any more.
That reconciliation is deliberately server-side — an admin who removes an image and then
abandons the form has changed nothing, and an image shared with a duplicated product keeps
its asset.

Delivery goes through Cloudinary transformations rather than the original file. Every
storefront URL carries `f_auto,q_auto` (AVIF/WebP per browser, quality chosen by a
visual-difference check) plus a width matched to what is actually rendered — a card is not
served the 4000 px original it shows at 300 px.

### The legacy `/media` mount

`/media` still serves files off disk — `MEDIA_DIR`, defaulting to the admin panel's own
`public/media` — for records that predate the migration and hold a site-relative path like
`/media/products/saree-01.jpg`. It answers any origin and sends a week's cache lifetime.
Nothing new is written there; it exists so those records keep rendering.

### Migrating existing base64 records

```sh
npm run migrate:cloudinary                  # dry run — reports, changes nothing
npm run migrate:cloudinary -- --confirm     # upload and rewrite
```

Order of operations per image: upload → verify the delivery URL actually serves an image →
*then* replace the data URI. A failure at either of the first two steps leaves the base64
exactly where it was and records the image under `failed`, so the script is safe to re-run.
Public ids are derived from a hash of the bytes, so an interrupted run resumes rather than
duplicating. `--only=products|banners|media`, `--limit=N`, `--concurrency=N` and
`--verbose` narrow a run.

## The storefront feed

`src/routes/storefront.ts` (read) and `src/routes/shop.ts` (write) are both mounted at
`/api/storefront`, **before** the admin auth gate. Together they are the shop front's only
source of data, and the read half is deliberately narrow:

| Route | Returns |
| --- | --- |
| `GET /storefront/bootstrap` | Catalogue, categories, collections, live banners, coupons, testimonials, the home page section layout and public settings — in one response |
| `GET /storefront/version` | A short change token, so the shop can poll cheaply and re-fetch only when something moved |
| `GET /storefront/products` | The same catalogue, paginated and filterable |
| `GET /storefront/products/:idOrSlug` | One product |
| `GET /storefront/products/:id/reviews` | Approved reviews plus the star breakdown |
| `GET /storefront/categories`, `/collections`, `/collections/:slug`, `/banners`, `/coupons`, `/settings` | The individual pieces of the bootstrap payload |

`/settings` carries only what a shop needs to render and price an order: store identity,
shipping rates by zone, the free-shipping threshold, the COD fee, whether prices include
tax, and which payment gateways are switched on — names and descriptions only. Gateway
keys and secrets, the Mailtrap credentials and the tax registration stay on the server.

Two rules make it safe to expose without a token:

- **Projections, not documents.** Every handler names its fields, so cost price, margin,
  revenue, barcodes, stock reservations and customer identities never leave the server.
- **Published only.** Draft and archived products, inactive categories and collections,
  banners outside their date window and unapproved reviews are filtered out here rather
  than in the client — an unpublished draft is not one devtools request away from public.

## The shop's write half

`src/routes/shop.ts` is everything a shopper *does*. It shares the storefront prefix and
its open CORS policy, so three rules run through all of it:

1. **Money is computed here, never accepted from the client.** `quoteCart` prices a bag
   from the database and the store's settings; `POST /orders` writes exactly what it
   returns, and the browser's total is only ever a preview of the same call.
2. **Identity is proven, not claimed.** A customer id comes from a signed token, never
   from the request body. Shopper tokens carry a `sopii-shop` audience claim, so an admin
   token cannot read a customer's orders and a shopper's cannot reach the panel API.
3. **Only published, in-stock goods sell.** A draft product, or one that has run out and
   does not allow backorders, is refused at checkout rather than dropped quietly.

| Route | What it does |
| --- | --- |
| `POST /storefront/auth/register`, `/auth/login` | Create or open a shop session — `{ token, customer }`. Registering with an email the panel already knows claims that customer record, so a shopper keeps the order history the panel has for them |
| `GET /storefront/auth/me` | The customer behind the token |
| `POST /storefront/auth/forgot-password` | Compatibility shim. Password reset lives at `POST /api/auth/forgot-password`, which owns the tokens, the throttles and the audit trail, and which mails the link through Mailtrap. Answers identically either way, so it cannot be used to enumerate accounts |
| `PATCH /storefront/account/profile`, `POST /account/password` | Name, phone, marketing consent; password change |
| `GET/POST/PUT/DELETE /storefront/account/addresses` | The address book. Every handler answers with the whole list, so the client never has to work out which one is now the default |
| `GET/PUT /storefront/account/wishlist` | Whole-list sync, so a signed-out wishlist merges in on sign-in |
| `GET /storefront/account/orders` | The shopper's own orders, matched by id *or* email so guest orders join the history on sign-in |
| `POST /storefront/checkout/quote` | Prices a bag: line prices, coupon, shipping zone, COD fee, tax |
| `POST /storefront/orders` | Places an **offline** order (COD): writes it, decrements stock with a recorded movement, rolls the customer's totals and tier forward, counts the coupon redemption and raises the panel's "New order" notification. Refuses an online payment method outright |
| `GET /storefront/payments/methods` | What the checkout may offer: which gateways are configured, and whether COD covers a given `?total=` |
| `POST /storefront/payments/razorpay/order` | Prices the bag and opens a Razorpay order for it. **No SOPII order exists yet** |
| `POST /storefront/payments/razorpay/verify` | Checks the signature, asks Razorpay what the payment did, then writes the order. The only route that can produce a paid order |
| `POST /storefront/payments/razorpay/failed` | Records a failure or a dismissal. Never writes an order |
| `GET /storefront/payments/intents/:id` | What happened to an attempt — the resume path after a refresh mid-payment |
| `GET /storefront/orders/:idOrCode` | One order. Signed in, your own; otherwise `?email=` must match the address it was placed with |
| `POST /storefront/coupons/validate` | The window, the minimum order value, the overall usage limit and the per-customer limit. `422` with a message for a code that is real but not usable yet |
| `POST /storefront/newsletter` | Records the address as a customer accepting marketing |

### Payments

Two paths, and only one of them can produce a paid order.

```
COD           /orders ──────────────────────────────► order
                                                      confirmed · paymentStatus pending

Razorpay      /payments/razorpay/order ─► intent ─► popup ─► /payments/razorpay/verify ─► order
& UPI         (prices the bag)           (not an   (Razorpay  (signature + gateway        confirmed
                                          order)    hosts it)  + re-price)                paymentStatus paid
```

**An online method is refused by `POST /orders`.** Without that refusal the whole flow
would be one `fetch` away from being skipped — a client could call it with
`paymentMethod: 'razorpay'` and get an order nobody paid for.

A *payment intent* is the record between "Pay Now" and "there is an order". It holds the
server's own pricing of the bag and the gateway order it was opened against, and
deliberately holds **no stock, no coupon redemption and no notification** — an abandoned
popup must not sell out a product to somebody who never paid.

Verification checks three things, in order:

1. **the HMAC signature** — `HMAC_SHA256(order_id|payment_id, key_secret)`, compared in
   constant time. Proves the callback came from Razorpay;
2. **Razorpay's own record of the payment**, fetched server-side. A valid signature only
   proves the callback was not forged; the browser still chose which callback to send. The
   payment must be captured (or authorized), for this order, for this many paise;
3. **the bag, re-priced** from the catalogue, so a price that changed mid-payment is
   caught rather than honoured from a stale snapshot.

Only then does `writeOrder` run — the *same* function COD calls, so stock, coupon usage,
customer tiers and the panel's notification cannot drift between the two paths.

Idempotency is on the server, not on a disabled button. Two Pay Now clicks for the same
bag produce the same fingerprint, find the same open intent and reopen the *same* gateway
order; a verify replayed against an intent that already became an order returns that order
rather than writing a second one.

The Razorpay **key secret** never leaves the server: it is AES-GCM encrypted at rest,
decrypted only to sign a request, and returned to the admin panel as a mask. The **key id**
is public by design — Razorpay's checkout script needs it in the browser — and reaches the
storefront only as part of a payment the server has already priced.

Cash on delivery is written `confirmed` with `paymentStatus: 'pending'`: there is nothing
to collect until the parcel arrives. Its eligibility window (min/max order value) is set
per store under Settings → Payments and enforced here, not in the browser.

The storefront shows one price per product, so orders are priced from `product.price` even
when a variant carries its own; the variant still decides the SKU and which stock the line
draws on. Surface per-variant pricing in the shop before changing that, or shoppers will
be charged something other than what they were shown.

CORS is chosen per request in `src/index.ts`: the admin API stays pinned to `CORS_ORIGIN`
because it carries a session token, while `/api/storefront` answers any origin, since it
is public, credential-free data. That is what lets the shop call it from its own dev port,
or its own domain in production, without editing `CORS_ORIGIN` first.

`bootstrap` sends the whole published catalogue — a few hundred KB at this size, and the
shop filters and searches it in the browser. Pass `?limit=` to cap it, and move the shop
to `/storefront/products` once the catalogue outgrows a single response.

## Before production

- Set a real `JWT_SECRET` and `MEMORY_MONGO=false`.
- Set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, or store them under Settings ->
  Payments. Until both halves are present the storefront offers COD only, which is
  correct but probably not what you meant.
- Check the key prefix: an `rzp_live_` key takes real money whatever the panel's
  "test mode" switch says.
- Replace the shared seed password; `SEED_PASSWORD` exists only so the demo
  logins work.
- Set the three `CLOUDINARY_*` variables. Without them the panel cannot upload at all —
  which is the safe failure, but it is a failure. Imagery used to be stored as base64 data
  URIs inside the documents themselves (hence the 25 MB JSON body limit, which is still
  what bounds an upload on its way through); that made `/api/storefront/bootstrap` a
  ~19.6 MB response the shop front timed out on, so the storefront silently fell back to
  its bundled demo catalogue. Run `npm run migrate:cloudinary` against any database that
  still holds base64.
- `/media` serves whatever is in that directory, so keep it to published imagery. It is
  legacy now — new uploads go to Cloudinary — but it is still public.
- Shop sessions are bearer tokens in the browser's `localStorage`, which is the pragmatic
  choice for a separate-origin SPA but is readable by any script on the page. Move them to
  a `Secure; HttpOnly; SameSite` cookie once the shop and API share a domain.
- `POST /storefront/auth/*`, `/orders` and `/newsletter` have no rate limiting. Put one in
  front of them (and a CAPTCHA on registration) before opening the doors.
- `POST /storefront/orders` writes the order, the stock movement and the customer rollup
  as separate operations. On a replica set, wrap them in a transaction so a failure
  half-way cannot leave stock decremented for an order that was never written.
- Password reset delivers through Mailtrap (`MAILTRAP_*`), against a single-use expiring
  token. With Mailtrap unconfigured, development prints the link to the server log and
  production logs an error rather than sending.
