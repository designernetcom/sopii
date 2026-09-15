# SOPII — Contemporary Indian Fashion

A premium fashion e-commerce experience built with React, Vite and Tailwind CSS.

Everything the shop renders is **served live by the admin panel** in `../SOPI-Admin`:
the catalogue, categories, collections, home page layout and banners, reviews, coupons,
shipping rates, payment methods and store details. Publish a product there and it appears
here.

The shop writes back to the same API too. Accounts, saved addresses, the wishlist and
orders are real: an order placed at this checkout is priced by the store, comes off its
inventory and lands in the panel's order queue. No payment is captured — see
[§8](#8-what-is-mocked) for exactly where the line is.

If the API is unreachable the shop falls back to the bundled demo catalogue in
`src/data/`, so it always renders.

---

## 1. Installation

Start the API first — it is the admin panel's Express + MongoDB server:

```bash
cd ../SOPI-Admin/server
npm install
npm run dev          # http://localhost:4000/api
```

Then the shop:

```bash
npm install
npm run dev          # http://localhost:5174
```

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Vite dev server with hot module replacement   |
| `npm run build`   | Production build to `dist/`                   |
| `npm run preview` | Serve the production build locally            |

Requires Node 18 or newer. Vite proxies `/api` to `http://localhost:4000`, so the browser
sees one origin and no configuration is needed in development. Port **5174**, because the
admin panel takes 5173 and the two normally run side by side.

Everything in `.env.example` is optional; copy it to `.env` to point the shop at a deployed
API (`VITE_API_URL`) or to change how often it checks for new data
(`VITE_CATALOG_POLL_MS`).

The shop runs without the API too — on the bundled catalogue in `src/data/`.

---

## 2. Tech stack

| Concern       | Choice                                                     |
| ------------- | ---------------------------------------------------------- |
| Framework     | React 18                                                    |
| Build         | Vite 5                                                      |
| Styling       | Tailwind CSS 3 with a custom design-token theme             |
| Routing       | React Router 6, with per-route code splitting               |
| State         | Context API — seven focused providers, no Redux             |
| Icons         | lucide-react                                                |
| Persistence   | `localStorage`, wrapped so it can never throw               |
| Data          | The admin panel's REST API, with `src/data/` as the fallback |
| Sessions      | A bearer token from the API, held in `localStorage`         |

Four runtime dependencies in total. Nothing else was added.

---

## 3. Project structure

```
SOPII/
├── index.html
├── tailwind.config.js          Design tokens: palette, type, motion
├── vite.config.js              Aliases, manual chunks
├── postcss.config.js
│
├── public/
│   └── favicon.svg
│
└── src/
    ├── main.jsx                Entry — mounts <BrowserRouter><App/>
    ├── App.jsx                 Provider tree + route table
    ├── index.css               Tailwind layers + design-system classes
    │
    ├── components/
    │   ├── AnnouncementBar/    Scrolling strip above the header (copy from the panel)
    │   ├── Auth/               AuthShell + AuthField (login/register/reset)
    │   ├── CartDrawer/         Right-side bag with free-shipping meter
    │   ├── CategoryCard/       Category tile + the home CategoryGrid
    │   ├── CollectionBanner/   Asymmetric editorial banner
    │   ├── FeaturedCollection/ "SOPII Signature" split section (copy from the panel)
    │   ├── Filters/            FilterPanel — shared by sidebar and drawer
    │   ├── Footer/             Multi-column footer (content from the panel)
    │   ├── Header/             Sticky header, nav, utility icons
    │   ├── Hero/               Full-bleed carousel with autoplay
    │   ├── InstagramSection/   Social grid with hover overlay
    │   ├── Layout/             Shell: header, outlet, footer, overlays
    │   ├── MegaMenu/           Desktop mega panel
    │   ├── MobileNav/          MobileMenu drawer + BottomNav tab bar
    │   ├── Modal/              Accessible portal dialog
    │   ├── Newsletter/         Subscribe form, posted to the API
    │   ├── OccasionGrid/       "Shop by occasion" circles
    │   ├── ProductCard/        The catalogue tile (+ skeleton)
    │   ├── ProductCarousel/    Scroll-snap product rail
    │   ├── ProductGallery/     PDP gallery: zoom, thumbnails, lightbox
    │   ├── ProductOptions/     SizeSelector + ColorSelector
    │   ├── QuickView/          Quick-view modal
    │   ├── ReviewSection/      Testimonial rail
    │   ├── SearchOverlay/      Full-screen search
    │   ├── TrustSection/       Shipping / returns / payment / quality
    │   ├── WishlistButton/     Heart toggle (floating + inline)
    │   └── ui/                 Primitives — see §5
    │
    ├── pages/
    │   ├── Home.jsx            Sections, in the order the panel arranged them
    │   ├── Shop.jsx            Every catalogue route (see "presets")
    │   ├── ProductDetails.jsx  PDP + reviews + recommendations
    │   ├── Collections.jsx     Collection index
    │   ├── CollectionDetail.jsx
    │   ├── SearchResults.jsx
    │   ├── Wishlist.jsx
    │   ├── Cart.jsx
    │   ├── Checkout.jsx
    │   ├── OrderSuccess.jsx
    │   ├── Login.jsx / Register.jsx / ForgotPassword.jsx
    │   ├── Account.jsx         Profile, orders, addresses, wishlist
    │   ├── Orders.jsx          Live history + guest order lookup
    │   ├── StaticPage.jsx      All content pages, data-driven
    │   └── NotFound.jsx
    │
    ├── context/
    │   ├── ToastContext.jsx        Notifications + live region
    │   ├── CatalogContext.jsx      Live catalogue + settings; polls for changes
    │   ├── UIContext.jsx           Which overlay is open
    │   ├── CartContext.jsx         Lines, quantities, coupons, totals
    │   ├── WishlistContext.jsx     Saves + move-to-cart
    │   ├── AuthContext.jsx         Session, profile, orders, addresses — from the API
    │   └── RecentlyViewedContext.jsx
    │
    ├── services/
    │   ├── api.js              fetch wrapper + session token; every endpoint
    │   └── adapters.js         Admin payload ⇄ storefront shape
    │
    ├── data/                    Bundled fallback + copy the panel has no field for
    │   ├── products.js         70 demo products
    │   ├── categories.js       Colour swatches, size order, demo taxonomy
    │   ├── collections.js      Demo collections, hero slides, banners
    │   ├── reviews.js          Testimonials + per-product review generator
    │   ├── navigation.js       Fallback nav + mobile tabs
    │   ├── site.js             Trust, occasions, offline footer fallback
    │   └── pages.js            Content-page copy
    │
    ├── hooks/
    │   ├── useLocalStorage.js  Persisted state, synced across tabs
    │   ├── useProductReviews.js  Approved reviews for one product
    │   ├── useLockBodyScroll.js
    │   ├── useFocusTrap.js
    │   └── useReveal.js        One-shot IntersectionObserver
    │
    └── utils/
        ├── images.js           Central image resolver (see §7)
        ├── catalog.js          Selectors over a product list
        ├── filters.js          URL ⇄ filter state, sorting, facets
        ├── format.js           Currency, dates, slugs
        ├── pricing.js          Shipping zones and totals, mirrored from the API
        ├── storage.js          localStorage that never throws
        └── cn.js               Class-name joiner
```

---

## 4. Routes

| Path                     | Page               | Notes                                    |
| ------------------------ | ------------------ | ---------------------------------------- |
| `/`                      | Home               | Eagerly bundled; everything else is lazy |
| `/shop`                  | Shop               | Full catalogue                           |
| `/new-arrivals`          | Shop               | preset, sorted newest                    |
| `/bestsellers`           | Shop               | preset, sorted by popularity             |
| `/sale`                  | Shop               | preset, sorted by discount               |
| `/sarees`                | Shop               | preset                                   |
| `/blouses`               | Shop               | preset                                   |
| `/women`                 | Shop               | preset (dresses, kurta sets, co-ords)    |
| `/collections`           | Collections        |                                          |
| `/collections/:slug`     | CollectionDetail   |                                          |
| `/product/:id`           | ProductDetails     |                                          |
| `/search?q=`             | SearchResults      |                                          |
| `/wishlist`              | Wishlist           |                                          |
| `/cart`                  | Cart               |                                          |
| `/checkout`              | Checkout           | Redirects to `/cart` when empty          |
| `/order-success/:id`     | OrderSuccess       |                                          |
| `/login` `/register` `/forgot-password` | Auth |                                       |
| `/account`               | Account            | Redirects to `/login` when signed out    |
| `/orders`                | Orders             |                                          |
| `/pages/:slug`           | StaticPage         | 11 content pages                         |
| `*`                      | NotFound           |                                          |

---

## 5. Reusable components

**Primitives** (`components/ui/`)

| Component          | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| `Image`            | Lazy load, tinted box, fade-in, on-brand fallback on error      |
| `Rating`           | Star rating with a true half-star, plus review count            |
| `Price`            | Price / struck MRP / discount, three sizes                      |
| `Badge`            | New · Bestseller · Sale · soft                                  |
| `QuantityStepper`  | Accessible − / value / + control                                |
| `Accordion`        | Disclosure list, single or multi-open                           |
| `Breadcrumbs`      | Semantic `nav > ol` with `aria-current`                         |
| `EmptyState`       | Icon, copy and up to two actions (link or button)               |
| `SectionHeading`   | Eyebrow + title + subtitle + "view all"                         |
| `Reveal`           | One-shot scroll-in fade/lift with stagger                       |
| `Spinner` / `PageLoader` | Inline and full-page loading                              |

**Composites**

| Component                        | Used by                                          |
| -------------------------------- | ------------------------------------------------ |
| `ProductCard` (+ `Skeleton`)     | Carousels, shop grid, search, wishlist, related  |
| `ProductCarousel`                | Home ×2, PDP ×3, order confirmation              |
| `ProductGallery`                 | PDP                                              |
| `SizeSelector` / `ColorSelector` | PDP and quick view                               |
| `WishlistButton`                 | Cards, PDP — `floating` and `inline` variants    |
| `FilterPanel`                    | Shop sidebar (desktop) and drawer (mobile)       |
| `Modal`                          | Quick view, size guide                           |
| `TrustSection`                   | Home, cart, collection detail                    |
| `Newsletter`                     | Footer, content pages                            |
| `AuthShell` / `AuthField`        | Login, register, forgot password                 |

`ProductCard` is memoised — the shop grid re-renders on every filter keystroke otherwise.

---

## 6. Architecture

### State: six providers, each with one job

```
ToastProvider                  notifications (owns a polite live region)
└── CatalogProvider            live catalogue, taxonomy, CMS and store settings
    └── AuthProvider           session, profile, orders, addresses — all from the API
        └── CartProvider       lines, quantities, coupon, totals
            └── WishlistProvider   saves; mirrors to the account; moves items into the cart
                └── RecentlyViewedProvider
                    └── UIProvider   which overlay is open
```

The nesting order is load-bearing: cart and wishlist raise toasts, the wishlist's *move to
bag* calls into the cart, and both the cart (coupons, shipping thresholds) and the
recently-viewed rail read the catalogue. `UIContext` owns the single question "which overlay is
open", so scroll locking, focus trapping and <kbd>Esc</kbd> handling live in one place
instead of being reimplemented by the drawer, the search overlay and the mobile menu.

### Filters live in the URL, not in state

`utils/filters.js` translates between `URLSearchParams` and a plain filter object. Every
filtered view is therefore shareable, bookmarkable and survives a refresh, and the back
button behaves the way shoppers expect. Facet lists and their counts are derived from
whatever products are in scope, so `/sarees` only ever offers filters that can match.

### One Shop page, seven routes

`/sarees`, `/sale`, `/new-arrivals` and the rest all render `pages/Shop.jsx` with a
different **preset** — a title, a blurb and a scope function. Filtering, sorting,
pagination and the mobile drawer are written once and behave identically everywhere.

### The catalogue comes from the admin panel

`CatalogProvider` fetches `/api/storefront/bootstrap` once — catalogue, category tree,
collections, live banners, approved reviews, coupons and store settings in a single
request — and hands the rest of the app the product shape it has always consumed.

Three pieces make that work:

- **`services/adapters.js`** is the only seam between the two models. The panel keeps a
  category tree, per-variant stock, an occasion field and a care paragraph; the shop wants
  one category name, a size list, colour swatches and care bullets. Values the panel gains
  later — a new fabric, occasion or colourway — pass straight through and appear as filter
  facets without a change here.
- **`utils/catalog.js`** holds the selectors (new arrivals, bestsellers, sale, search,
  related, collection membership) as pure functions over a product list, so the live
  catalogue and the bundled fallback behave identically.
- **`services/api.js`** wraps `fetch` with a timeout. Any failure leaves the bundled
  catalogue in place and logs a warning, so the shop degrades to a browsable demo rather
  than an empty page.

Imagery follows the same rule: whatever the panel points at is resolved by `mediaUrl()` —
an uploaded photograph, a pasted URL, or a `/media/...` path served by the API — and only
a product with no photography at all falls back to the designed SVG swatches in
`utils/images.js`. See [§7](#7-images).

The header's mega menu, the home page category tiles and the shop's category and type
filters are all built from the panel's category tree, so renaming a category or adding a
subcategory changes the navigation with no file to keep in sync.

### Changes in the panel show up without a reload

Every 30 seconds — and whenever the tab regains focus — the shop asks
`/api/storefront/version` for a short change token: four counts plus the newest product's
`updatedAt`. If it matches what the shop already holds, nothing else happens. If it
differs, the catalogue is re-fetched and a "Catalogue updated" toast confirms it. An idle
tab therefore costs a few bytes per interval rather than the whole catalogue.

Set `VITE_CATALOG_POLL_MS=0` to turn it off.

### The home page is arranged in the panel

`Homepage` in the admin panel decides which sections the home page shows, in what order,
and how many products each rail carries. `pages/Home.jsx` renders that list rather than a
fixed sequence, so switching *Featured Products* on there adds the rail here, and dragging
*Instagram* above *Reviews* re-orders the page.

The panel's own titles are admin-facing labels ("Category tiles"), so they are used as
section eyebrows only — the editorial copy stays in the components, where it was written.

### Accounts, checkout and orders

`services/api.js` is the whole client: a `fetch` wrapper with a timeout that attaches the
session token when there is one. `AuthProvider` sits on top of it.

- **Sessions.** Register or log in and the API answers with a bearer token, kept in
  `localStorage` and revalidated against `/auth/me` on every load. The account it creates
  is a customer record in the panel — the same one that shows up under Customers.
- **Checkout prices nothing itself.** `POST /storefront/checkout/quote` prices the bag
  from the catalogue and the store's settings, and the summary renders its answer.
  `utils/pricing.js` mirrors the same rules locally so the summary is correct on the first
  paint and while a keystroke settles, and says "Estimated" until the store confirms it.
- **Delivery follows the address.** Shipping rates and delivery windows come from the
  panel's shipping zones, matched to the state being typed. Payment options are whichever
  gateways are switched on in Settings → Payments; a disabled one is not merely hidden, the
  API refuses it.
- **Placing an order** writes it to the panel's order queue, takes the stock off the shelf
  with a recorded stock movement, rolls the customer's totals forward, counts the coupon
  redemption and raises the panel's "New order" notification.
- **Guests are first class.** They check out without an account; the `{ code, email }`
  handle of what they ordered stays in this browser so the receipt and the orders page can
  fetch it back. Anyone else needs the order code *and* the email to see it.
- **Coupons** are checked by the API — the window, the minimum order value, the overall
  usage limit and the per-customer limit. The published coupon list is only the fallback
  for when the API cannot be reached.

### Persistence

`utils/storage.js` wraps `localStorage` in try/catch — private-mode Safari throws on
access, and the app degrades to in-memory state rather than crashing. `useLocalStorage`
adds cross-tab sync via the `storage` event, so a bag updated in one tab is correct in the
other. Persisted keys: `sopii:cart`, `sopii:wishlist`, `sopii:recently-viewed`,
`sopii:recent-searches`, `sopii:token`, `sopii:user`, `sopii:guest-orders`.

Only the first four are the browser's own data. `sopii:token` is the session, `sopii:user`
caches the profile so the header can render a name before `/auth/me` answers, and
`sopii:guest-orders` holds `{ code, email }` handles — never the orders themselves, which
are fetched from the API.

### Performance

- Home ships in the initial bundle; all other routes are `React.lazy` chunks.
- `react`/`react-dom`/`react-router` and `lucide-react` are split into stable vendor chunks.
- Images are lazy by default; above-the-fold ones opt into `priority`.
- First load is roughly **96 KB gzipped** (app 38 KB + React 54 KB + icons 4 KB); every
  other route adds 1–5 KB.

### Accessibility

Semantic landmarks and a skip link; a single `h1` per page; focus trapping and focus
restore in every dialog; `aria-expanded` / `aria-pressed` / `aria-current` on controls;
labels on every input; a polite live region for cart and wishlist changes; visible focus
rings; and `prefers-reduced-motion` honoured globally.

---

## 7. Images

Photography comes from the admin panel's media library. Every image URL in the shop —
product galleries, category tiles, collection banners, hero slides — goes through
`mediaUrl()` in `src/utils/images.js`:

- **Absolute URLs and data URIs** (a photograph uploaded through the panel, or a pasted
  link) are used as they are.
- **Site-relative paths** (`/media/products/saree-01.jpg`, which is what the panel stores
  for a file in its media library) resolve against the API, which serves that same
  directory at `/media`. In development Vite proxies `/media` alongside `/api`, so the
  browser stays on one origin; in production set `VITE_MEDIA_URL` to a CDN, or leave it
  unset and it follows `VITE_API_URL`.

Upload a photograph in the panel, attach it to a product, and it appears here — the same
way a price does.

**Anything with no photography yet still looks deliberate.** `images.js` generates
designed textile placeholders: a deterministic SVG per image, built from that product's
own colourway and fabric. Cotton and handloom get a woven grid, silk gets folded lustre,
brocade gets a zari motif, jewellery gets a metal ground. They are inline data URIs, so
they cost no network request and can never fail to load.

The two are layered, not exclusive. A product with no images gets swatches; a product
whose image 404s gets the same swatch through `<Image fallbackSrc>`, so a missing file
degrades to the art that would have been there rather than a broken-image icon. Editorial
surfaces — category tiles, collection banners, the hero — pass their own generated art as
that fallback, which is why a half-uploaded catalogue still reads as one brand.

---

## 8. What is mocked

The catalogue, accounts and orders are real — they are whatever the admin panel holds.
What is not:

- **No payment is captured.** There is no gateway wired up and no card details are
  collected anywhere in the UI. A cash-on-delivery order is written as *confirmed*;
  everything else is written as *pending payment* for the panel to confirm, rather than
  claiming money that was never taken.
- **Password reset sends no email.** `/auth/forgot-password` answers the same way whether
  or not the address is known and says plainly that reset mail is not configured.
- **Tracking numbers and couriers** come from whatever the panel records. Nothing is
  handed to a carrier.
- **Variant pricing is not surfaced.** The panel can price each size and colour separately;
  the shop shows one price per product and the API charges that price, so nobody is billed
  more than they were shown. Showing per-variant prices is the change to make first if
  that matters.
- **Occasion tiles, the Instagram grid and the content pages** stay in `src/data/` — the
  panel has no field for them, so their imagery is still generated.
- **Announcements** are managed in the panel (Homepage → Announcements) and arrive in the
  `/bootstrap` feed. With the API unreachable the strip is hidden rather than showing copy
  the store may no longer stand behind. A store seeded before announcements existed can
  load the starting set with `npm run seed:announcements` in `SOPI-Admin/server`.
- **The Featured Collection section** (the "SOPII Signature" split block) is managed in the
  panel (Homepage → Featured Collection): on/off, eyebrow, heading, description, image and
  alt text, pillars (add, edit, delete, reorder, show/hide) and the button. It arrives in
  `/bootstrap` as `featuredCollection`; where it sits on the page is still the Curated
  Collections entry in Page Sections. A store that has never saved it is served the
  original copy, so nothing changes until someone edits it. With the API unreachable the
  bundled copy in `src/data/collections.js` stands in.
- **The footer** is managed in the panel (Storefront → Footer): columns, links, social
  channels, quick links, payment badges, policies, copyright and credit — added, edited,
  deleted, reordered and switched on or off there, and delivered in `/bootstrap`. The
  store's address, email and phone still come from Settings → Store. A store that has
  never saved its footer is served the built-in default, so no seeding is needed. The
  social channels also drive the desktop social rail. `FOOTER` in `src/data/site.js` is
  used only when there is no feed (API unreachable, or an API older than the screen).
- **Product ratings** are the panel's stored `rating` and `reviewCount`; the review list
  and star breakdown on a product page are its approved reviews, fetched per product.
  Reviews can be read but not written from the shop.
- **Newsletter signups** create a customer flagged as accepting marketing — there is no
  separate subscriber list, and nothing is emailed.

All branding, product names, descriptions and copy are original to SOPII.

---

## 9. Verification

Checked with a headless Chrome harness during development:

- **36 routes** server-render without a single React warning.
- **74 unit assertions** over filtering, sorting, facets, search, coupon rules, the
  shipping threshold, currency formatting and catalogue integrity.
- **56 end-to-end assertions** covering both required flows (shop → cart → checkout →
  confirmation, and product → wishlist → move to bag), plus search, coupons, form
  validation, focus trapping and keyboard navigation.
- **Zero horizontal overflow** across 14 routes × 10 breakpoints
  (320 · 360 · 375 · 390 · 414 · 768 · 1024 · 1280 · 1440 · 1920).

When the shop was wired to the API, the data path was re-checked against a running
server: the catalogue and settings through the adapters, registration, addresses, the
checkout quote (the browser's preview and the store's answer agree to the rupee), placing
an order, reading it back by code, the stock coming off the shelf, and the wishlist round
trip. Every page was re-rendered in Node against the bundled fallback with no React
warnings.
