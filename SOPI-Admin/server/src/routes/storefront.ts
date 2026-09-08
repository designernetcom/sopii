/*
 * Public storefront API.
 * ---------------------------------------------------------------------------
 * Everything under /api/storefront is unauthenticated and read-only: it is the
 * feed the SOPII shop front (../../SOPII) renders from, so whatever the admin
 * panel publishes shows up on the shop without a second dataset.
 *
 * Two rules keep it safe to expose:
 *
 * 1. **Projections, not whole documents.** Cost price, margin, revenue,
 *    barcodes and customer identities never leave the building — every handler
 *    below picks its fields explicitly.
 * 2. **Published only.** Draft/archived products, inactive categories and
 *    collections, out-of-window banners and unapproved reviews are filtered
 *    out here rather than in the client, so an unpublished draft is not one
 *    devtools request away from being public.
 *
 * And one rule keeps it fast:
 *
 * 3. **No image bytes, ever.** Imagery used to be stored as base64 data URIs
 *    inside the documents these projections read, which made `/bootstrap` a
 *    19.6 MB response that took ~115 s to build and transfer — past the shop's
 *    own request timeout, so the storefront gave up and rendered its bundled
 *    demo catalogue instead. Images now live on Cloudinary and a document
 *    keeps a URL; the `public*` views below rewrite those URLs to carry a
 *    size-appropriate transformation, and drop any base64 a not-yet-migrated
 *    record still holds rather than shipping it.
 *
 * The write half of the shop front — accounts, checkout, orders — lives in
 * `shop.ts` and mounts under this same prefix.
 */

import { Router } from 'express';
import type { PipelineStage } from 'mongoose';
import {
  BannerModel,
  CategoryModel,
  CollectionModel,
  CouponModel,
  HomeSectionModel,
  ProductModel,
  ReviewModel,
} from '../db/models.js';
import { isDataUri, withTransform, type ImagePreset } from '../lib/cloudinary.js';
import { enabledGateways, liveZones, loadSettings } from '../lib/settings.js';
import {
  ah,
  escapeRegex,
  notFound,
  num,
  pageParams,
  paginated,
  serialize,
  serializeMany,
  str,
} from '../lib/http.js';
import { cached, cacheKey, NAMESPACE, TTL } from '../lib/cache.js';
import { publicCache } from '../lib/observability.js';
import { limits, rateLimit } from '../lib/rateLimit.js';

export const storefrontRoutes = Router();

/* --------------------------------- imagery ---------------------------------- */

/**
 * How many gallery images the catalogue feed carries per product.
 *
 * The shop front's cards use the first two (main, and the hover swap); the
 * product page loads the rest with the product itself. Six is generous for the
 * gallery and bounds the feed against a product somebody uploaded thirty
 * photographs to.
 */
const BOOTSTRAP_IMAGES_PER_PRODUCT = 6;

/**
 * A gallery entry, made light enough to ship a few hundred of.
 *
 * `publicId` is deliberately not exposed: it is the write handle for the
 * Cloudinary asset and the storefront has no use for it. Anything still held
 * as a base64 data URI is dropped rather than sent — a record that has not
 * been migrated shows its generated placeholder, which is what the shop was
 * already rendering while the feed was timing out.
 */
function lightImages(
  images: { url?: string; alt?: string; isMain?: boolean }[] | undefined,
  /**
   * `list` emits the card URL alone; `detail` adds the two larger derivations.
   *
   * The three URLs are the same asset at three sizes, and a listing card
   * renders exactly one of them — but all three were shipped for every product
   * in the feed. At two images each that is ~700 bytes per product of URLs
   * nothing on the page will request, which on a 200-product feed is 140 KB
   * over a phone connection to describe images at sizes no card uses.
   *
   * The product page fetches `/products/:idOrSlug`, which passes `detail`, so
   * the gallery still gets its full-size and thumbnail crops.
   */
  mode: 'list' | 'detail' = 'detail',
) {
  return (images ?? [])
    .filter((image) => image?.url && !isDataUri(image.url))
    .slice(0, mode === 'list' ? 2 : BOOTSTRAP_IMAGES_PER_PRODUCT)
    .map((image) =>
      mode === 'list'
        ? { url: withTransform(image.url, 'card'), alt: image.alt, isMain: image.isMain }
        : {
            url: withTransform(image.url, 'card'),
            /* The same asset at the size the product page wants, so the gallery
               does not fetch a card-sized crop and upscale it. Both are the one
               stored original — Cloudinary derives and caches each on first
               request. */
            detailUrl: withTransform(image.url, 'detail'),
            thumbUrl: withTransform(image.url, 'gallery'),
            alt: image.alt,
            isMain: image.isMain,
          },
    );
}

/** One image field on a category, collection or variant. */
const lightImage = (url: string | undefined | null, preset: ImagePreset = 'tile') =>
  !url || isDataUri(url) ? undefined : withTransform(url, preset);

/* ------------------------------- projections -------------------------------- */

/**
 * The public face of a product. Anything not listed here — costPrice, revenue,
 * unitsSold, barcode, reserved — stays server-side.
 *
 * `images` is projected in full and then trimmed by `lightImages()` on the way
 * out: MongoDB can slice an array but cannot rewrite the URLs inside it, and
 * doing both in one pass in Node is simpler than a projection expression
 * nobody will be able to read in a year.
 */
const PRODUCT_FIELDS = {
  name: 1,
  slug: 1,
  sku: 1,
  categoryId: 1,
  brand: 1,
  shortDescription: 1,
  description: 1,
  price: 1,
  mrp: 1,
  images: 1,
  variants: 1,
  details: 1,
  featured: 1,
  collectionIds: 1,
  tags: 1,
  rating: 1,
  reviewCount: 1,
  stock: 1,
  allowBackorders: 1,
  /* The record's own metadata. The shop front resolves it against the site
     defaults, so one page still renders exactly one title and one canonical. */
  seo: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

/*
 * WHY THERE ARE NOW TWO PRODUCT SHAPES
 * ---------------------------------------------------------------------------
 * The note that used to be here argued that `description` and `seo` had to
 * ship in the feed, because the shop renders the *whole* catalogue from one
 * payload and the product page reads its copy out of that same client-side
 * store. That was true, and it is exactly the design that does not survive a
 * large catalogue: the argument for shipping every field is really an argument
 * for shipping every product, and at ten thousand products the payload is tens
 * of megabytes before a single image loads.
 *
 * So the feed is split rather than trimmed:
 *
 *   PRODUCT_LIST_FIELDS    what a card needs. Name, price, one or two images,
 *                          the few attributes filters read. ~1 KB a product.
 *   PRODUCT_FIELDS         everything, for one product's own page. Description,
 *                          the full gallery, variants, structured data.
 *
 * `/bootstrap` serves the list shape and `/products/:idOrSlug` serves the full
 * one, which the product page already calls. Nothing renders blank, and the
 * feed drops by roughly 70% per product — before the pagination below, which
 * is what actually bounds it.
 */

/**
 * A product as a listing card needs it.
 *
 * Deliberately excludes `description` (paragraphs nobody reads on a card),
 * `seo` (only the product page emits JSON-LD) and `variants` beyond what a
 * swatch row shows. Everything a filter or a sort touches is here, so the
 * shop's client-side filtering keeps working unchanged.
 */
const PRODUCT_LIST_FIELDS = {
  name: 1,
  slug: 1,
  sku: 1,
  categoryId: 1,
  brand: 1,
  shortDescription: 1,
  price: 1,
  mrp: 1,
  images: { $slice: 2 },
  variants: 1,
  details: 1,
  featured: 1,
  collectionIds: 1,
  tags: 1,
  rating: 1,
  reviewCount: 1,
  stock: 1,
  allowBackorders: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

const CATEGORY_FIELDS = {
  name: 1,
  slug: 1,
  description: 1,
  image: 1,
  parentId: 1,
  sortOrder: 1,
  productCount: 1,
  seo: 1,
} as const;

const COLLECTION_FIELDS = {
  name: 1,
  slug: 1,
  description: 1,
  banner: 1,
  productIds: 1,
  featured: 1,
  sortOrder: 1,
  seo: 1,
} as const;

/**
 * A banner is text plus two images, and the images are the whole cost. The
 * Cloudinary handles (`desktopImagePublicId`, `mobileImagePublicId`) are
 * deliberately absent: they are write handles, and the hero has no use for one.
 */
const BANNER_FIELDS = {
  title: 1,
  heading: 1,
  subheading: 1,
  desktopImage: 1,
  mobileImage: 1,
  buttonText: 1,
  buttonLink: 1,
  sortOrder: 1,
} as const;

const REVIEW_FIELDS = {
  productId: 1,
  productName: 1,
  rating: 1,
  title: 1,
  body: 1,
  customerName: 1,
  verifiedPurchase: 1,
  helpfulCount: 1,
  reply: 1,
  createdAt: 1,
} as const;

/* ------------------------------- public views ------------------------------- */

/*
 * One place each record type is made fit to publish: gallery entries trimmed
 * and resized, single image fields resized, base64 dropped. Applied on the way
 * out of every handler rather than inside the loaders, so a projection change
 * cannot quietly skip it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Lean = Record<string, any>;

function publicProduct(product: Lean, mode: 'list' | 'detail' = 'detail'): Lean {
  const base = {
    ...product,
    images: lightImages(product.images, mode),
  };

  /*
   * Variants carry a SKU, a price, a stock count and an image for every
   * size/colour combination — on a heavily varied product that is more bytes
   * than everything else on the card put together, and a listing card renders
   * only the swatch colours. The full set travels with the product page, which
   * is where the buy box that needs them lives.
   */
  if (mode === 'list') {
    return {
      ...base,
      variants: (product.variants ?? []).map((variant: Lean) => ({
        id: variant?.id,
        color: variant?.color,
        size: variant?.size,
        stock: variant?.stock,
      })),
    };
  }

  return {
    ...base,
    /* A variant swatch is rendered at chip size next to the buy box, so it
       gets the smallest preset of the three. */
    variants: (product.variants ?? []).map((variant: Lean) => ({
      ...variant,
      image: lightImage(variant?.image, 'thumb'),
    })),
  };
}

/** The listing shape, for the two places that serve cards rather than a page. */
const listProduct = (product: Lean): Lean => publicProduct(product, 'list');

const publicCategory = (category: Lean): Lean => ({
  ...category,
  image: lightImage(category.image, 'tile'),
});

const publicCollection = (collection: Lean): Lean => ({
  ...collection,
  banner: lightImage(collection.banner, 'bannerDesktop'),
});

/**
 * Two crops of one upload. The desktop hero is wide and the phone hero is
 * portrait, so serving the same file to both means one of them is cropped by
 * CSS after the browser has already paid for the pixels it threw away.
 */
const publicBanner = (banner: Lean): Lean => ({
  ...banner,
  desktopImage: lightImage(banner.desktopImage, 'bannerDesktop'),
  mobileImage: lightImage(banner.mobileImage, 'bannerMobile'),
});

/* --------------------------------- filters ---------------------------------- */

const publishedProducts = { status: 'published' };

/**
 * A banner is live when it is switched on *and* today falls inside its window.
 * The dates are ISO strings, which sort lexicographically, so a plain string
 * comparison is the right comparison.
 */
function liveBannerFilter() {
  const now = new Date().toISOString();
  return {
    status: 'active',
    $and: [
      { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
    ],
  };
}

function liveCouponFilter() {
  const now = new Date().toISOString();
  return {
    status: { $ne: 'disabled' },
    $and: [
      { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
    ],
  };
}

/* --------------------------------- loaders ---------------------------------- */

const loadProducts = (limit: number) =>
  ProductModel.find(publishedProducts, PRODUCT_LIST_FIELDS)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

const loadCategories = () =>
  CategoryModel.find({ status: 'active' }, CATEGORY_FIELDS).sort({ sortOrder: 1 }).lean();

const loadCollections = () =>
  CollectionModel.find({ status: 'active' }, COLLECTION_FIELDS).sort({ sortOrder: 1 }).lean();

const loadBanners = () =>
  BannerModel.find(liveBannerFilter(), BANNER_FIELDS).sort({ sortOrder: 1 }).lean();

const loadCoupons = () =>
  CouponModel.find(liveCouponFilter(), {
    code: 1,
    description: 1,
    discountType: 1,
    discountValue: 1,
    minOrderValue: 1,
    maxDiscount: 1,
  })
    .sort({ minOrderValue: 1 })
    .lean();

/** Approved, quotable reviews — the home page testimonial rail. */
const loadTestimonials = (limit: number) =>
  ReviewModel.find({ status: 'approved', rating: { $gte: 4 } }, REVIEW_FIELDS)
    .sort({ helpfulCount: -1, createdAt: -1 })
    .limit(limit)
    .lean();

/**
 * Only the settings the shop front actually renders: the store identity in the
 * header/footer and the shipping thresholds the cart quotes. Payment keys,
 * SMTP credentials and tax registration stay private.
 */
async function loadPublicSettings() {
  const { store, shipping, tax, payments } = await loadSettings();
  if (!store) return null;

  return {
    store: {
      storeName: store.storeName,
      /* The header logo is on every page, so it goes through the CDN like
         everything else — and a logo somebody pasted in as base64 is dropped
         rather than re-sent on every cold load. */
      logo: lightImage(typeof store.logo === 'string' ? store.logo : undefined, 'thumb'),
      supportEmail: store.supportEmail,
      phone: store.phone,
      address: store.address,
      currency: store.currency,
      currencySymbol: store.currencySymbol,
    },
    shipping: {
      flatRate: shipping.flatRate,
      freeShippingThreshold: shipping.freeShippingThreshold,
      codCharge: shipping.codCharge,
      processingTime: shipping.processingTime,
      /* Rates by delivery region, so the checkout can quote the right one for
         the address being typed. Disabled zones are not the shopper's business. */
      zones: liveZones(shipping).map((zone) => ({
        id: zone.id,
        name: zone.name,
        states: zone.states,
        charge: zone.charge,
        etaDays: zone.etaDays,
      })),
    },
    /* Which payment options the checkout may offer. Keys and secrets stay here. */
    payments: enabledGateways(payments).map((gateway) => ({
      key: gateway.key,
      name: gateway.name,
      description: gateway.description,
    })),
    tax: {
      pricesIncludeTax: tax.pricesIncludeTax,
      defaultRate: tax.defaultRate,
    },
  };
}

/** Which home page sections are switched on, in the order the panel set. */
const loadHomeSections = () =>
  HomeSectionModel.find({ enabled: true }, { key: 1, title: 1, subtitle: 1, sortOrder: 1, itemLimit: 1 })
    .sort({ sortOrder: 1 })
    .lean();

/* -------------------------------- endpoints --------------------------------- */

/**
 * The default number of products in the feed.
 *
 * The old default was 1000 with a ceiling of 5000, which is a decision about
 * *the browser's* memory made by a query parameter. 200 is what the home page
 * and the first two screens of a listing actually need; beyond that the shop
 * pages through `/products`, which is indexed, cached and cheap.
 *
 * The ceiling stays high enough for an operator to pull a large feed
 * deliberately, and low enough that a scraper cannot ask for the whole
 * catalogue in one request.
 */
const BOOTSTRAP_DEFAULT_PRODUCTS = Number(process.env.STOREFRONT_BOOTSTRAP_LIMIT ?? 200);
const BOOTSTRAP_MAX_PRODUCTS = Number(process.env.STOREFRONT_BOOTSTRAP_MAX ?? 1000);

/**
 * Everything the shop front needs for its first paint, in one request.
 *
 * WHAT CHANGED, AND WHY
 * ---------------------------------------------------------------------------
 * This endpoint used to ship the entire published catalogue — full
 * descriptions, full galleries, full SEO blocks — to every browser on every
 * cold load, and the note above it said so plainly, ending "split this into
 * per-section endpoints once the catalogue outgrows `?limit`". At a million
 * users it has outgrown it in both directions at once: the payload is too big
 * for a phone, and rebuilding it per visitor is too expensive for the database.
 *
 * Three changes:
 *
 *   1. **Cached.** One build per minute serves every visitor in that minute,
 *      whichever API instance they land on. This is the single largest
 *      reduction in database load in the system — it turns the busiest query in
 *      the store from once-per-visitor into once-per-minute.
 *   2. **Bounded and slimmed.** The list projection, and a sane default limit.
 *   3. **Cacheable by the CDN.** `Cache-Control` with `s-maxage` and
 *      `stale-while-revalidate`, plus an ETag — so most requests never reach
 *      this process at all, and the ones that do usually get a 304.
 *
 * `fetchedAt` is deliberately part of the cached payload rather than stamped
 * per response: it describes when the catalogue was read, which is the
 * question the shop is actually asking, and stamping it per request would
 * change the body every time and defeat the ETag.
 */
storefrontRoutes.get(
  '/bootstrap',
  ah(async (req, res) => {
    const limit = Math.min(
      num(req.query, 'limit', BOOTSTRAP_DEFAULT_PRODUCTS),
      BOOTSTRAP_MAX_PRODUCTS,
    );

    const payload = await cached(
      cacheKey(NAMESPACE.catalog, 'bootstrap', limit),
      TTL.catalog,
      async () => {
        const [
          products,
          categories,
          collections,
          banners,
          coupons,
          testimonials,
          homeSections,
          settings,
        ] = await Promise.all([
          loadProducts(limit),
          loadCategories(),
          loadCollections(),
          loadBanners(),
          loadCoupons(),
          loadTestimonials(12),
          loadHomeSections(),
          loadPublicSettings(),
        ]);

        return {
          products: serializeMany(products).map(listProduct),
          categories: serializeMany(categories).map(publicCategory),
          collections: serializeMany(collections).map(publicCollection),
          banners: serializeMany(banners).map(publicBanner),
          coupons: serializeMany(coupons),
          testimonials: serializeMany(testimonials),
          homeSections: serializeMany(homeSections),
          settings,
          /*
           * The shop pages through `/products` for anything past this, and it
           * needs to know whether there *is* anything past it.
           */
          productLimit: limit,
          hasMoreProducts: products.length >= limit,
          fetchedAt: new Date().toISOString(),
        };
      },
    );

    // A minute in the browser, five at the CDN, and a stale copy served
    // instantly while the CDN refreshes behind it — which is what carries a
    // sale without a thundering herd at the origin.
    publicCache(res, { browserSeconds: 60, cdnSeconds: 300, staleSeconds: 600 });
    res.json(payload);
  }),
);

/**
 * A cheap change token. The storefront polls this and only re-downloads the
 * bootstrap payload when the string differs, so an idle tab costs one tiny
 * query rather than the whole catalogue every interval.
 */
storefrontRoutes.get(
  '/version',
  ah(async (_req, res) => {
    /*
     * The single most-called endpoint in the system, and the reason it is
     * cached hardest.
     *
     * Every open shop tab polls this on a timer. At a hundred thousand
     * concurrent tabs on a thirty-second interval that is ~3,300 requests a
     * second — and each one used to run six queries, five of them
     * `countDocuments` over the whole collection. Twenty thousand collection
     * counts per second is not a load the database survives, and none of it
     * tells anybody anything new: the answer is identical for every caller and
     * changes only when an admin publishes something.
     *
     * Cached for fifteen seconds, it becomes six queries per fifteen seconds
     * for the entire store, and the CDN absorbs almost all of the requests
     * before they arrive.
     */
    const payload = await cached(
      cacheKey(NAMESPACE.catalog, 'version'),
      TTL.version,
      async () => {
        const [products, categories, collections, banners, sections, latest] = await Promise.all([
          ProductModel.countDocuments(publishedProducts),
          CategoryModel.countDocuments({ status: 'active' }),
          CollectionModel.countDocuments({ status: 'active' }),
          BannerModel.countDocuments(liveBannerFilter()),
          HomeSectionModel.countDocuments({ enabled: true }),
          ProductModel.findOne(publishedProducts, { updatedAt: 1 })
            .sort({ updatedAt: -1 })
            .lean(),
        ]);

        return {
          token: [
            products,
            categories,
            collections,
            banners,
            sections,
            latest?.updatedAt ?? '',
          ].join(':'),
          products,
          categories,
          collections,
          banners,
          sections,
        };
      },
    );

    publicCache(res, { browserSeconds: 15, cdnSeconds: 15, staleSeconds: 60 });
    res.json(payload);
  }),
);

/**
 * Sorts the shop may ask for, mapped to index-friendly specs.
 *
 * An allow-list rather than a passthrough, for two reasons. A caller-supplied
 * sort field is an easy way to make the database sort a million documents on
 * an unindexed column — a denial of service in a query parameter — and every
 * entry here is backed by a compound index in `db/indexes.ts`, so none of them
 * can.
 */
const PRODUCT_SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating: { rating: -1 },
  popular: { unitsSold: -1 },
  name: { name: 1 },
};

/**
 * The catalogue, paginated, filtered and sorted **on the server** (§3, §6).
 *
 * This is the endpoint the shop moves onto as the catalogue grows past what
 * `/bootstrap` should carry. It supports everything a listing page needs —
 * search, category (including children), collection, price range, in-stock,
 * featured, and seven sorts — so filtering never requires the browser to hold
 * the whole catalogue.
 *
 * `search` uses the text index when a term is present and falls back to an
 * anchored prefix regex if that index is missing. The unanchored
 * `/term/i` this used to run could not use an index at all: at a million
 * products every search was a full collection scan.
 */
storefrontRoutes.get(
  '/products',
  rateLimit(limits.search),
  ah(async (req, res) => {
    const { page, pageSize: rawSize, skip } = pageParams(req.query, 24);
    // Capped, so `?pageSize=100000` is not a way to ask for the whole catalogue.
    const pageSize = Math.min(rawSize, 60);

    const filter: Record<string, unknown> = { ...publishedProducts };
    const search = str(req.query, 'search')?.trim();
    let sort = PRODUCT_SORTS[str(req.query, 'sort') ?? 'newest'] ?? PRODUCT_SORTS.newest;
    let projection: Record<string, unknown> = { ...PRODUCT_LIST_FIELDS };

    /*
     * `useText` is false when the text index has not been built yet — a fresh
     * database, or one where `ensureIndexes` degraded. The fallback is an
     * *anchored* prefix regex rather than the unanchored one this endpoint used
     * to run: anchored, MongoDB can range-scan the `name` index; unanchored, it
     * has no choice but to read every document.
     */
    let useText = Boolean(search);

    if (search) {
      filter.$text = { $search: search };
      // Relevance is the only sensible default order for a search; an explicit
      // sort still wins, because "cheapest match" is a real thing to want.
      if (!str(req.query, 'sort')) {
        sort = { score: { $meta: 'textScore' } } as unknown as Record<string, 1 | -1>;
        projection = { ...projection, score: { $meta: 'textScore' } };
      }
    }

    const categoryId = str(req.query, 'categoryId');
    if (categoryId) {
      /*
       * One level of children, cached: the taxonomy changes a few times a year
       * and this ran on every category page load.
       */
      const childIds = await cached(
        cacheKey(NAMESPACE.taxonomy, 'children', categoryId),
        TTL.taxonomy,
        async () => {
          const children = await CategoryModel.find({ parentId: categoryId }, { _id: 1 }).lean<
            { _id: string }[]
          >();
          return children.map((child) => child._id);
        },
      );
      filter.categoryId = { $in: [categoryId, ...childIds] };
    }

    const collectionId = str(req.query, 'collectionId');
    if (collectionId) filter.collectionIds = collectionId;

    if (str(req.query, 'featured') === 'true') filter.featured = true;
    if (str(req.query, 'inStock') === 'true') filter.stock = { $gt: 0 };

    const minPrice = num(req.query, 'minPrice', NaN);
    const maxPrice = num(req.query, 'maxPrice', NaN);
    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      filter.price = {
        ...(Number.isFinite(minPrice) ? { $gte: minPrice } : {}),
        ...(Number.isFinite(maxPrice) ? { $lte: maxPrice } : {}),
      };
    }

    const brand = str(req.query, 'brand');
    if (brand) filter.brand = brand;

    /** Swaps the text clause for the prefix fallback described above. */
    const withoutTextIndex = () => {
      const prefix = new RegExp(`^${escapeRegex(search ?? '')}`, 'i');
      const { $text: _dropped, ...rest } = filter as Record<string, unknown>;
      void _dropped;
      return {
        ...rest,
        $or: [{ name: prefix }, { sku: prefix }, { brand: prefix }, { tags: prefix }],
      };
    };

    const run = async () => {
      const effectiveFilter = useText ? filter : withoutTextIndex();
      const effectiveSort = useText ? sort : PRODUCT_SORTS.newest;
      const effectiveProjection = useText ? projection : PRODUCT_LIST_FIELDS;

      const [items, total] = await Promise.all([
        ProductModel.find(effectiveFilter, effectiveProjection)
          .sort(effectiveSort)
          .skip(skip)
          .limit(pageSize)
          .lean(),
        /*
         * `countDocuments` on a filtered set is an index scan, which is fine —
         * but on an *unfiltered* one it counts the whole collection, so it is
         * capped. A shopper needs to know roughly how many pages there are, not
         * that there are exactly 1,284,391 products.
         */
        ProductModel.countDocuments(effectiveFilter).limit(10_000),
      ]);
      return paginated(serializeMany(items).map(listProduct), total, page, pageSize);
    };

    /** One retry without the text index, for a database that has not built it. */
    const runWithFallback = async () => {
      try {
        return await run();
      } catch (error) {
        if (!useText) throw error;
        useText = false;
        return run();
      }
    };

    /*
     * Only unsearched pages are cached. A search term is effectively unbounded
     * — caching one key per phrase anybody types fills the cache with entries
     * that will never be read again, and evicts the catalogue pages that would
     * have been.
     */
    const payload = search
      ? await runWithFallback()
      : await cached(
          cacheKey(
            NAMESPACE.catalog,
            'products',
            page,
            pageSize,
            categoryId,
            collectionId,
            brand,
            str(req.query, 'sort'),
            str(req.query, 'featured'),
            str(req.query, 'inStock'),
            Number.isFinite(minPrice) ? minPrice : undefined,
            Number.isFinite(maxPrice) ? maxPrice : undefined,
          ),
          TTL.catalog,
          runWithFallback,
        );

    publicCache(res, {
      browserSeconds: search ? 0 : 60,
      cdnSeconds: search ? 30 : 300,
      staleSeconds: 600,
    });
    res.json(payload);
  }),
);

/**
 * One product, in full. Accepts either its id or its slug.
 *
 * This is the *full* projection — description, whole gallery, variants,
 * structured data — which is what makes the slim listing shape safe: the
 * product page fetches this, so nothing it renders was dropped from the feed.
 */
storefrontRoutes.get(
  '/products/:idOrSlug',
  ah(async (req, res) => {
    const { idOrSlug } = req.params;

    const product = await cached(
      cacheKey(NAMESPACE.catalog, 'product', idOrSlug),
      TTL.product,
      async () => {
        const doc = await ProductModel.findOne(
          { ...publishedProducts, $or: [{ _id: idOrSlug }, { slug: idOrSlug }] },
          PRODUCT_FIELDS,
        ).lean();
        return doc ? publicProduct(serialize(doc)) : null;
      },
    );

    if (!product) notFound('Product');

    publicCache(res, { browserSeconds: 60, cdnSeconds: 300, staleSeconds: 600 });
    res.json(product);
  }),
);

/** Approved reviews for one product, plus the star breakdown the PDP draws. */
storefrontRoutes.get(
  '/products/:id/reviews',
  ah(async (req, res) => {
    const page = Math.max(1, num(req.query, 'page', 1));
    const pageSize = Math.min(50, Math.max(1, num(req.query, 'pageSize', 10)));

    /*
     * Paginated, where it used to return a flat fifty.
     *
     * The star breakdown is computed over *all* approved reviews by an
     * aggregation that never leaves the database — so the summary stays
     * correct for a product with ten thousand reviews while the page of text
     * stays ten reviews long.
     */
    const payload = await cached(
      cacheKey(NAMESPACE.reviews, req.params.id, page, pageSize),
      TTL.reviews,
      async () => {
        const match = { productId: req.params.id, status: 'approved' };

        const [items, grouped] = await Promise.all([
          ReviewModel.find(match, REVIEW_FIELDS)
            .sort({ createdAt: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .lean(),
          ReviewModel.aggregate([
            { $match: match },
            { $group: { _id: '$rating', count: { $sum: 1 } } },
          ] as PipelineStage[]),
        ]);

        const counts = new Map<number, number>(
          (grouped as { _id: number; count: number }[]).map((row) => [row._id, row.count]),
        );
        const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
        const weighted = [...counts.entries()].reduce(
          (sum, [stars, count]) => sum + stars * count,
          0,
        );

        return {
          items: serializeMany(items),
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          average: total ? Number((weighted / total).toFixed(2)) : 0,
          breakdown: [5, 4, 3, 2, 1].map((stars) => ({
            stars,
            count: counts.get(stars) ?? 0,
            percent: total ? Math.round(((counts.get(stars) ?? 0) / total) * 100) : 0,
          })),
        };
      },
    );

    publicCache(res, { browserSeconds: 120, cdnSeconds: 300, staleSeconds: 600 });
    res.json(payload);
  }),
);

storefrontRoutes.get(
  '/categories',
  ah(async (_req, res) => {
    const payload = await cached(cacheKey(NAMESPACE.taxonomy, 'categories'), TTL.taxonomy, async () =>
      serializeMany(await loadCategories()).map(publicCategory),
    );
    // Taxonomy changes a few times a year; an hour at the CDN is conservative.
    publicCache(res, { browserSeconds: 300, cdnSeconds: 3600, staleSeconds: 86_400 });
    res.json(payload);
  }),
);

storefrontRoutes.get(
  '/collections',
  ah(async (_req, res) => {
    const payload = await cached(
      cacheKey(NAMESPACE.taxonomy, 'collections'),
      TTL.taxonomy,
      async () => serializeMany(await loadCollections()).map(publicCollection),
    );
    publicCache(res, { browserSeconds: 300, cdnSeconds: 3600, staleSeconds: 86_400 });
    res.json(payload);
  }),
);

/**
 * One collection and its products.
 *
 * The product query used to be unbounded — every product in a collection, with
 * the full projection. A "Sale" collection holding half the catalogue made this
 * the same problem `/bootstrap` had, on a page nobody thought of as a listing.
 * It is now paged and uses the list projection, which is all a grid of cards
 * needs.
 */
storefrontRoutes.get(
  '/collections/:slug',
  ah(async (req, res) => {
    const page = Math.max(1, num(req.query, 'page', 1));
    const pageSize = Math.min(60, Math.max(1, num(req.query, 'pageSize', 24)));

    const payload = await cached(
      cacheKey(NAMESPACE.catalog, 'collection', req.params.slug, page, pageSize),
      TTL.catalog,
      async () => {
        const collection = await CollectionModel.findOne(
          { status: 'active', $or: [{ _id: req.params.slug }, { slug: req.params.slug }] },
          COLLECTION_FIELDS,
        ).lean();
        if (!collection) return null;

        const filter = {
          ...publishedProducts,
          $or: [
            { _id: { $in: collection.productIds ?? [] } },
            { collectionIds: collection._id },
          ],
        };

        const [products, total] = await Promise.all([
          ProductModel.find(filter, PRODUCT_LIST_FIELDS)
            .sort({ createdAt: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .lean(),
          ProductModel.countDocuments(filter),
        ]);

        return {
          collection: publicCollection(serialize(collection)),
          products: serializeMany(products).map(listProduct),
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        };
      },
    );

    if (!payload) notFound('Collection');

    publicCache(res, { browserSeconds: 60, cdnSeconds: 300, staleSeconds: 600 });
    res.json(payload);
  }),
);

storefrontRoutes.get(
  '/banners',
  ah(async (_req, res) => {
    const payload = await cached(cacheKey(NAMESPACE.cms, 'banners'), TTL.catalog, async () =>
      serializeMany(await loadBanners()).map(publicBanner),
    );
    publicCache(res, { browserSeconds: 60, cdnSeconds: 300, staleSeconds: 600 });
    res.json(payload);
  }),
);

storefrontRoutes.get(
  '/coupons',
  ah(async (_req, res) => {
    const payload = await cached(cacheKey(NAMESPACE.catalog, 'coupons'), TTL.catalog, async () =>
      serializeMany(await loadCoupons()),
    );
    publicCache(res, { browserSeconds: 60, cdnSeconds: 300, staleSeconds: 600 });
    res.json(payload);
  }),
);

storefrontRoutes.get(
  '/settings',
  ah(async (_req, res) => {
    const payload = await cached(
      cacheKey(NAMESPACE.settings, 'public'),
      TTL.settings,
      loadPublicSettings,
    );
    publicCache(res, { browserSeconds: 60, cdnSeconds: 300, staleSeconds: 600 });
    res.json(payload);
  }),
);
