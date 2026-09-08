# SEO

How search metadata gets from the admin panel onto the live shop, what is
generated automatically, and the one deployment step that still needs doing by
hand.

---

## Where metadata lives

Three stores, and **each page's metadata comes from exactly one of them**. That
is the rule the whole design turns on: if two stores could describe the same
route, a page could end up with two titles or two canonical URLs, which is
worse than having none.

| Store | Holds | Edited in |
|---|---|---|
| `seo_settings` | One document: site URL, title template, defaults, organisation schema, robots and sitemap policy, verification tokens | Admin → SEO Management → **Settings** |
| `seo_pages` | One row per route the catalogue does not own — homepage, static pages, blog posts, system routes like `/cart` | Admin → SEO Management → **Homepage / Static Pages / Blog** |
| embedded `seo` | The metadata block on a product, category or collection record | The record's **SEO tab**, or SEO Management → Products / Categories / Collections |

`seo_pages.path` is unique at the database level. A second record for the same
route is rejected rather than silently created.

## How a page resolves its tags

`SOPII/src/lib/seo.js` → `resolveSeo(settings, override, page)`. Precedence,
highest first:

1. the admin's override for this page
2. what the page knows about itself — product name, category description
3. the site defaults

Everything flows through that one function, so the fallback behaviour is
identical on every route. `SEOHead` then writes the result into `<head>`,
removing the previous page's tags first — including the static ones in
`index.html`, which is why the first render *replaces* the baseline description
rather than adding a second one.

## What is generated automatically

- **Canonical URLs** — `siteUrl` + the route's path, deliberately without the
  query string. `?sort=price`, `?colour=red` and `?page=2` are the same content
  filtered, so they all canonicalise to the clean listing rather than splitting
  it into dozens of near-duplicates.
- **Filtered listings are `noindex`.** Applying a facet or a non-default sort
  marks the view noindex while the canonical stays on the clean path.
- **Structured data** — `Organization` and `WebSite` once per site (mounted in
  `Layout`), plus `Product`, `BreadcrumbList` and `ItemList` per page.
  `availability` and `aggregateRating` are derived from real stock and real
  review counts; a product with no reviews emits no rating rather than a fake
  one.
- **`sitemap.xml`** — every indexable canonical URL, filtered by the toggles in
  Settings and by each record's own noindex flag.
- **`robots.txt`** — the exclusion list from Settings plus `/api/`, and a
  `Sitemap:` pointer.
- **Private routes are `noindex, nofollow`** — cart, checkout, account, orders,
  wishlist, search and every authentication screen. Auth screens get theirs from
  `AuthLayout`, so all six share one rule.

## Deployment: two things to wire up

### 1. Proxy `/sitemap.xml` and `/robots.txt` to the API

Both are generated from what the panel publishes, so the API owns them — but a
crawler will only accept them from the shop's own origin. Vite's dev server
already proxies them (`vite.config.js`). Production needs the same rule.

nginx:

```nginx
location = /sitemap.xml { proxy_pass https://api.sopii.com/sitemap.xml; }
location = /robots.txt  { proxy_pass https://api.sopii.com/robots.txt; }
```

Netlify / Vercel equivalent:

```
/sitemap.xml  https://api.sopii.com/sitemap.xml  200
/robots.txt   https://api.sopii.com/robots.txt   200
```

### 2. Return a real 404 status for unknown paths

This is a single-page app: the host serves `index.html` for every path, so an
unknown URL renders the 404 page with an HTTP **200**. The page is marked
`noindex`, which keeps it out of the index, but a genuine `404` status is
better — it tells a crawler to drop the URL rather than merely skip it.

If your host supports it, serve `index.html` with a 404 status for paths that
match no known route. Where it does not, the `noindex` on the 404 page is the
fallback and is sufficient in practice.

---

## The client-rendering limit — read this

Metadata here is written by JavaScript after the app mounts.

- **Google** renders JavaScript and sees these tags. Search indexing works.
- **Social scrapers do not.** Facebook, X, LinkedIn, WhatsApp, Slack and iMessage
  fetch the raw HTML and never execute the bundle. They will only ever see the
  static tags in `index.html` — meaning **every shared link previews as the
  homepage**, whatever page was actually shared.

`index.html` carries a sensible homepage-level title, description and OG image
so those previews are coherent rather than blank. But per-page share cards need
the tags present in the served HTML, which needs one of:

1. **Prerendering at build time** — render each route to static HTML with its
   tags baked in. Good fit for the homepage, static pages and top categories;
   awkward for a catalogue that changes often.
2. **A meta-injecting edge middleware** — intercept requests from known bot
   user-agents, look the route's metadata up from `/api/storefront/seo`, and
   return `index.html` with the tags substituted in. Keeps the SPA for humans
   and gives scrapers real HTML.
3. **Server-side rendering** — moving the shop to a framework that renders on
   the server. The most work, and the only option that removes the caveat
   entirely.

The architecture is ready for any of the three: metadata is already resolved by
a pure function (`resolveSeo`) from data the API already serves, so a
prerenderer or middleware can call the same code path the browser does.

---

## Reference

| File | Role |
|---|---|
| `src/lib/seo.js` | Resolution and schema builders. Pure functions, no React. |
| `src/context/SeoContext.jsx` | Fetches `/api/storefront/seo`; bundled fallback for offline. |
| `src/components/SEO/SEOHead.jsx` | `usePageSeo` hook + `SEOHead` component — writes the tags. |
| `src/components/SEO/ProductSEO.jsx` | Product metadata + `Product` / `BreadcrumbList` schema. |
| `src/components/SEO/CategorySEO.jsx` | Listing metadata + filter/canonical handling. |
| `src/components/SEO/StructuredData.jsx` | Site-level graphs that survive navigation. |

Server side, in `SOPI-Admin/server`:

| File | Role |
|---|---|
| `src/lib/seo.ts` | Defaults, settings loader, sitemap and robots builders. |
| `src/routes/seo.ts` | Admin CRUD, behind the `seo` permission. |
| `src/routes/publicSeo.ts` | `/api/storefront/seo`, `/sitemap.xml`, `/robots.txt`. |
| `src/db/seedSeo.ts` | Idempotent seed — one row per managed route. |
