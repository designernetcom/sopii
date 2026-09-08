/**
 * Admin payload → storefront shape.
 * ===========================================================================
 * The admin panel models a catalogue the way a merchandiser thinks about it:
 * a category tree, per-variant stock, an occasion field, a care paragraph. The
 * shop front renders a flatter thing: one category name, a size list, a colour
 * swatch list, care bullets. This file is the single seam between the two, so
 * every component downstream keeps consuming exactly the product shape it
 * always did.
 *
 * Three rules worth knowing:
 *
 * - **Unknown values pass through.** A fabric, occasion or colour the admin
 *   adds tomorrow appears as a filter facet without a change here; the maps
 *   below only normalise the vocabulary the two sides already share.
 * - **Imagery degrades gracefully.** Real uploads (data URIs, or anything on
 *   http/https) are shown as-is. The seeded `/media/products/...` paths point
 *   at files that do not exist, so those products fall back to the designed
 *   SVG swatches in `utils/images.js` rather than broken-image icons.
 * - **Nothing throws on a missing field.** A half-filled product from the
 *   panel still renders; it just carries fewer details.
 */

import { cdn, cdnMedia, mediaUrl, productImage, photo } from '../utils/images';
import { discountPercent, slugify } from '../utils/format';
import { COLOR_SWATCHES, SIZE_ORDER } from '../data/categories';

/* --------------------------------- helpers --------------------------------- */

/** Stable small integer from a string — drives deterministic placeholder art. */
function hash(value) {
  const text = String(value ?? '');
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) % 100000;
  }
  return h;
}

const unique = (values) => [...new Set(values.filter(Boolean))];

const titleCase = (value) =>
  String(value)
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');

/* Panel imagery — uploads, pasted URLs, media-library paths — is resolved by
   `mediaUrl`; see utils/images.js for where a path points. */

/* ------------------------------- vocabulary -------------------------------- */

/** Admin occasion wording → the six tags the shop's filters are built around. */
const OCCASION_ALIASES = {
  casual: 'Everyday',
  'daily wear': 'Everyday',
  daily: 'Everyday',
  everyday: 'Everyday',
  office: 'Office Wear',
  'office wear': 'Office Wear',
  work: 'Office Wear',
  workwear: 'Office Wear',
  festive: 'Festive',
  festival: 'Festive',
  wedding: 'Wedding',
  bridal: 'Wedding',
  party: 'Party',
  evening: 'Party',
  vacation: 'Vacation',
  holiday: 'Vacation',
  summer: 'Vacation',
  resort: 'Vacation',
};

const normaliseOccasion = (value) => {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return null;
  return OCCASION_ALIASES[key] ?? titleCase(key);
};

/** Colours the admin uses that the storefront palette has no swatch for. */
const EXTRA_SWATCHES = {
  Pink: '#D89AA4',
  Oxidised: '#8C8C88',
  Brass: '#B08D57',
  'Sterling Silver': '#B9BCC0',
  Grey: '#8B8880',
  White: '#FAF7F1',
  Blue: '#2E4374',
  Green: '#2C6B52',
  Red: '#8E2B2B',
  Yellow: '#C89B3C',
  Orange: '#D2743C',
  Purple: '#6B5B95',
  Brown: '#7A5B44',
};

/**
 * Hex for a colour name. Known names keep their brand swatch; anything new is
 * given a stable, muted colour derived from its own name, so a colourway added
 * in the panel still renders a sensible swatch and placeholder.
 */
export function swatchFor(name) {
  const key = String(name ?? '').trim();
  const known =
    COLOR_SWATCHES[key] ??
    EXTRA_SWATCHES[key] ??
    COLOR_SWATCHES[titleCase(key)] ??
    EXTRA_SWATCHES[titleCase(key)];
  if (known) return known;

  const h = hash(key.toLowerCase());
  // Kept desaturated and mid-toned so a generated colour never jars against
  // the palette the rest of the catalogue uses.
  const hue = h % 360;
  const sat = 26 + (h % 18);
  const light = 42 + (h % 16);
  return hslToHex(hue, sat, light);
}

function hslToHex(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    const value = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const sortSizes = (sizes) =>
  [...sizes].sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a);
    const bi = SIZE_ORDER.indexOf(b);
    // Sizes the storefront does not know about sort last, alphabetically.
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

/* -------------------------------- categories -------------------------------- */

/** Keyword → placeholder art family, for category and collection imagery. */
const IMAGE_TAGS = [
  [/saree|drape/i, 'saree'],
  [/silk|banarasi/i, 'silk'],
  [/blouse/i, 'blouse'],
  [/dress|gown/i, 'dress'],
  [/kurta|suit/i, 'kurta'],
  [/co-?ord|women|new/i, 'fashion'],
  [/jewel|earring|necklace/i, 'jewellery'],
  [/bag|potli|accessor/i, 'handbag'],
  [/handloom|heritage|weave|textile/i, 'textile'],
  [/cotton|everyday/i, 'cotton'],
  [/office|work/i, 'workwear'],
  [/wedding|bridal/i, 'wedding'],
  [/party|evening/i, 'evening'],
  [/summer|vacation/i, 'summer'],
];

function imageTagFor(text) {
  const found = IMAGE_TAGS.find(([pattern]) => pattern.test(String(text ?? '')));
  return found ? found[1] : 'fashion';
}

/** Shop routes that exist as their own page rather than a filtered /shop view. */
const CATEGORY_ROUTES = {
  sarees: '/sarees',
  blouses: '/blouses',
  women: '/women',
};

/**
 * The home page's "Shop by Category" tiles — the top level of the admin's
 * category tree, with its children carried along for the mega menu.
 */
export function adaptCategories(raw = []) {
  const roots = raw
    .filter((category) => !category.parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return roots.map((category) => {
    const slug = category.slug || slugify(category.name);
    const children = raw
      .filter((child) => child.parentId === category.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((child) => ({
        id: child.id,
        name: child.name,
        slug: child.slug || slugify(child.name),
        /* A child category has its own page too, so the mega menu links to a
           real URL rather than to the parent listing with a facet applied. */
        to: `/${child.slug || slugify(child.name)}`,
        productCount: child.productCount ?? 0,
        seo: child.seo ?? {},
      }));

    return {
      id: category.id,
      name: category.name,
      slug,
      /* Every category has its own address now — `/dresses`, not
         `/shop?category=Dresses`. A filtered /shop view is the same products
         at a URL no search engine should index, and it gave the category no
         page of its own to rank. */
      to: CATEGORY_ROUTES[slug] ?? `/${slug}`,
      blurb: category.description || `${category.name} from the SOPII studio`,
      seed: 300 + (hash(category.id) % 200),
      tags: imageTagFor(`${category.name} ${slug}`),
      image: cdnMedia(category.image, 'tile'),
      productCount: category.productCount ?? 0,
      children,
      /* The panel's SEO tab writes this onto the category record; the category
         page resolves its metadata against it. */
      seo: category.seo ?? {},
    };
  });
}

/**
 * Index of category id → `{ top, leaf }` names. Products hang off leaf
 * categories ("Cotton Sarees"), but the shop filters on the top-level name
 * ("Sarees"), so both are resolved once here rather than per product.
 */
function buildCategoryIndex(raw = []) {
  const byId = new Map(raw.map((category) => [category.id, category]));
  const index = new Map();

  raw.forEach((category) => {
    const parent = category.parentId ? byId.get(category.parentId) : null;
    index.set(category.id, {
      top: parent?.name ?? category.name,
      topSlug: parent?.slug ?? category.slug ?? slugify(category.name),
      leaf: category.name,
      leafSlug: category.slug ?? slugify(category.name),
    });
  });

  return index;
}

/* --------------------------------- products --------------------------------- */

const DEFAULT_CARE = [
  'Hand wash separately in cold water',
  'Do not bleach',
  'Warm iron on reverse',
  'Dry in shade',
];

/** "Dry clean only. Do not bleach." → two bullets. */
function careBullets(text) {
  if (!text) return DEFAULT_CARE;
  const parts = String(text)
    .split(/(?:\.\s+|\.$|\n)/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : DEFAULT_CARE;
}

/** How recently a product has to have been created to wear the "New" badge. */
const NEW_FOR_DAYS = 45;

function badgeFor(raw) {
  const created = Date.parse(raw.createdAt);
  const age = Number.isNaN(created) ? Infinity : (Date.now() - created) / 86400000;
  if (age <= NEW_FOR_DAYS) return 'New';
  if (raw.featured) return 'Bestseller';
  return null;
}

/**
 * Product imagery: whatever the panel actually holds, or designed swatches.
 *
 * A product with one real photograph shows that one photograph — padding it
 * with generated swatches would read as a gallery of mismatched images.
 */
function productImages(raw, { colors, fabric, seed }) {
  /* Whatever the panel holds for this product, main image first — that is the
     one the card and the gallery lead with.
     
     The API hands back three sizes of each Cloudinary asset (`url` for cards,
     `detailUrl` for the product page, `thumbUrl` for the gallery rail), so the
     browser fetches the crop it is about to render rather than a 4000 px
     original it will scale down. Older records carry only `url`; `cdn()` sizes
     those here, and leaves a `/media/...` path or a pasted URL alone. */
  const stored = (raw.images || [])
    .slice()
    .sort((a, b) => Number(Boolean(b?.isMain)) - Number(Boolean(a?.isMain)))
    .map((image) => {
      const base = mediaUrl(image?.url);
      if (!base) return null;
      return {
        card: cdn(base, 'card') || base,
        detail: cdnMedia(image?.detailUrl, 'detail') || cdn(base, 'detail') || base,
        thumb: cdnMedia(image?.thumbUrl, 'gallery') || cdn(base, 'gallery') || base,
      };
    })
    .filter(Boolean);
  if (stored.length) return stored;

  /* No photography yet: one designed swatch stands in at every size, so a
     half-filled catalogue still reads as one brand rather than a grid of
     broken-image icons. */
  return Array.from({ length: 5 }, (_, i) => {
    const art = productImage({
      seed: seed + i,
      color: colors[i % colors.length].hex,
      fabric,
      label: colors[i % colors.length].name,
      w: 900,
      h: 1125,
    });
    return { card: art, detail: art, thumb: art };
  });
}

/** One admin product → the shape ProductCard, the filters and the PDP read. */
export function adaptProduct(raw, categoryIndex) {
  const category = categoryIndex.get(raw.categoryId);
  const categoryName = category?.top ?? 'Other';
  const variants = raw.variants || [];

  const fabric = raw.details?.fabric || variants[0]?.fabric || 'Cotton';

  const colorNames = unique(variants.map((variant) => variant.color));
  const colors = (colorNames.length ? colorNames : [defaultColorFor(raw.id)]).map((name) => ({
    name,
    hex: swatchFor(name),
  }));

  const sizes = sortSizes(unique(variants.map((variant) => variant.size)));

  const occasions = unique([
    normaliseOccasion(raw.details?.occasion),
    // Tags carry a mix of fabrics and occasions; only the occasions are kept,
    // so the fabric facet and the occasion facet stay distinct.
    ...(raw.tags || [])
      .map((tag) => OCCASION_ALIASES[String(tag).toLowerCase()])
      .filter(Boolean),
  ]);

  const seed = 1000 + (hash(raw.id) % 8000);
  const price = Number(raw.price) || 0;
  const originalPrice = Number(raw.mrp) > price ? Number(raw.mrp) : price;
  const rating = Number(raw.rating) || 0;
  const reviews = Number(raw.reviewCount) || 0;
  const stock = Number(raw.stock) || 0;
  const sized = productImages(raw, { colors, fabric, seed });
  /* `images` stays a flat list of URLs — it is what the gallery, the SEO head
     and every existing call site already read. The extra sizes ride alongside
     it rather than replacing it. */
  const images = sized.map((image) => image.detail);

  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug || slugify(raw.name),
    sku: raw.sku,

    category: categoryName,
    categorySlug: category?.topSlug ?? slugify(categoryName),
    subcategory: category?.leaf ?? null,

    fabric,
    description: raw.description || raw.shortDescription || '',
    shortDescription: raw.shortDescription || '',

    price,
    originalPrice,
    discount: discountPercent(price, originalPrice),

    rating,
    reviews,
    badge: badgeFor(raw),

    sizes: sizes.length ? sizes : ['Free Size'],
    colors,
    occasions,

    images,
    /* The gallery rail renders these at 80 px wide, so it asks for 160 rather
       than reusing the 1200 px detail crop above it. */
    thumbnails: sized.map((image) => image.thumb),
    /* Cards and the cart line — a card-sized crop, not the detail one. */
    image: sized[0]?.card,
    hoverImage: sized[1]?.card ?? sized[0]?.card,

    stock,
    inStock: stock > 0 || Boolean(raw.allowBackorders),

    collectionIds: raw.collectionIds || [],
    tags: raw.tags || [],
    featured: Boolean(raw.featured),

    createdAt: raw.createdAt || new Date().toISOString(),
    popularity: reviews * rating,

    details: productDetails(raw, { categoryName, category, fabric, colors, occasions }),
    care: careBullets(raw.details?.careInstructions),

    /* The panel's SEO tab writes this block onto the product; the product page
       resolves its metadata against it. Passed through untouched so the shop
       renders exactly what an admin saved. */
    seo: raw.seo ?? {},
  };
}

/** Fallback colourway for a product with no variants, stable per product. */
function defaultColorFor(id) {
  const names = Object.keys(COLOR_SWATCHES);
  return names[hash(id) % names.length];
}

/** The "Product Details" bullet list on the PDP, built from what is filled in. */
function productDetails(raw, { categoryName, category, fabric, colors, occasions }) {
  const bullets = [`${fabric} · ${category?.leaf ?? categoryName}`];

  if (raw.details?.pattern) bullets.push(`${raw.details.pattern} pattern`);
  if (raw.details?.fit) bullets.push(`${raw.details.fit} fit`);

  bullets.push(`Available in ${colors.length} ${colors.length === 1 ? 'colour' : 'colours'}`);

  if (occasions.length) bullets.push(`Styled for ${listPhrase(occasions).toLowerCase()}`);
  bullets.push(`Handcrafted in ${raw.details?.countryOfOrigin || 'India'}`);

  return bullets;
}

/** ["a","b","c","d"] -> "a, b & c" — three is as many as the bullet can carry. */
function listPhrase(values, max = 3) {
  const kept = values.slice(0, max);
  if (kept.length <= 1) return kept.join('');
  return `${kept.slice(0, -1).join(', ')} & ${kept[kept.length - 1]}`;
}

/** The whole catalogue, in the order the shop's "newest" sort expects. */
export function adaptProducts(rawProducts = [], rawCategories = []) {
  const index = buildCategoryIndex(rawCategories);
  return rawProducts.map((raw) => adaptProduct(raw, index));
}

/* ------------------------------- collections -------------------------------- */

export function adaptCollections(raw = []) {
  return raw
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((collection, index) => ({
      id: collection.id,
      slug: collection.slug || slugify(collection.name),
      name: collection.name,
      eyebrow: `Collection ${String(index + 1).padStart(2, '0')}`,
      headline: collection.name,
      blurb: collection.description || '',
      seed: 200 + (hash(collection.id) % 300),
      tags: imageTagFor(`${collection.name} ${collection.description ?? ''}`),
      banner: cdnMedia(collection.banner, 'bannerDesktop'),
      featured: Boolean(collection.featured),
      /* The admin curates collections by picking products, so membership is an
         explicit id list rather than the declarative filter the bundled
         fallback data uses. `resolveCollection` handles both. */
      productIds: collection.productIds || [],
      seo: collection.seo ?? {},
    }));
}

/* ---------------------------------- banners --------------------------------- */

/** A live banner → a hero slide. */
export function adaptHeroSlide(banner) {
  const seed = 100 + (hash(banner.id) % 200);
  const tags = imageTagFor(`${banner.title} ${banner.heading} ${banner.buttonLink ?? ''}`);

  return {
    id: banner.id,
    eyebrow: banner.title || 'SOPII',
    title: banner.heading || '',
    text: banner.subheading || '',
    cta: banner.buttonText || 'Shop Now',
    to: banner.buttonLink || '/shop',
    image: cdnMedia(banner.desktopImage, 'bannerDesktop') ?? photo({ seed, tags, w: 1920, h: 1280 }),
    /* A phone hero is portrait; serving it the desktop crop means paying for
       pixels CSS then throws away. */
    mobileImage: cdnMedia(banner.mobileImage, 'bannerMobile'),
    seed,
    tags,
  };
}

/** A live banner → an editorial mid-page banner. */
export function adaptEditorialBanner(banner, index) {
  const seed = 210 + (hash(banner.id) % 200);
  const tags = imageTagFor(`${banner.title} ${banner.heading} ${banner.buttonLink ?? ''}`);

  return {
    id: banner.id,
    eyebrow: banner.title || 'SOPII',
    title: banner.heading || '',
    text: banner.subheading || '',
    cta: banner.buttonText || 'Explore',
    to: banner.buttonLink || '/shop',
    image: cdnMedia(banner.desktopImage, 'bannerDesktop') ?? photo({ seed, tags, w: 1400, h: 900 }),
    seed,
    tags,
    // Alternating alignment keeps two consecutive banners from reading as a
    // repeated block.
    align: index % 2 === 0 ? 'left' : 'right',
  };
}

/* ------------------------------- testimonials -------------------------------- */

export function adaptTestimonials(raw = []) {
  return raw
    .filter((review) => review.body)
    .map((review) => ({
      id: review.id,
      rating: review.rating ?? 5,
      title: review.title || 'A lovely piece',
      body: review.body,
      author: review.customerName || 'A SOPII customer',
      location: review.verifiedPurchase ? 'Verified purchase' : '',
      product: review.productName || '',
    }));
}

/** Reviews on a product page. */
export function adaptProductReviews(raw = []) {
  return raw.map((review) => ({
    id: review.id,
    rating: review.rating ?? 5,
    title: review.title || '',
    body: review.body || '',
    author: review.customerName || 'A SOPII customer',
    date: review.createdAt,
    verified: Boolean(review.verifiedPurchase),
    reply: review.reply?.body || null,
  }));
}

/* ---------------------------------- coupons ---------------------------------- */

const DISCOUNT_TYPES = {
  percentage: 'percent',
  fixed: 'flat',
  free_shipping: 'shipping',
};

export function adaptCoupons(raw = []) {
  return raw.map((coupon) => ({
    code: coupon.code,
    type: DISCOUNT_TYPES[coupon.discountType] ?? 'flat',
    value: Number(coupon.discountValue) || 0,
    minimum: Number(coupon.minOrderValue) || 0,
    maxDiscount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null,
    label: coupon.description || coupon.code,
  }));
}

/* --------------------------------- settings ---------------------------------- */

/** Store settings → the brand block the header, footer and cart read. */
export function adaptSettings(raw, fallbackBrand) {
  const store = raw?.store ?? {};
  const shipping = raw?.shipping ?? {};
  const address = store.address ?? {};

  const addressLine = [address.line1, address.line2, address.city, address.pincode]
    .filter(Boolean)
    .join(', ');

  return {
    brand: {
      ...fallbackBrand,
      name: store.storeName || fallbackBrand.name,
      email: store.supportEmail || fallbackBrand.email,
      phone: store.phone || fallbackBrand.phone,
      address: addressLine || fallbackBrand.address,
    },
    currencySymbol: store.currencySymbol || '₹',
    freeShippingThreshold: Number(shipping.freeShippingThreshold) || 0,
    shippingFee: Number(shipping.flatRate) || 0,
    codCharge: Number(shipping.codCharge) || 0,
    processingTime: shipping.processingTime || '',

    /* Delivery regions, in the order the panel lists them. The checkout reads
       the one covering the address being typed to quote a rate and an ETA. */
    shippingZones: (shipping.zones ?? []).map((zone) => ({
      id: zone.id,
      name: zone.name,
      states: zone.states ?? [],
      charge: Number(zone.charge) || 0,
      etaDays: zone.etaDays || '',
    })),

    /* Only the gateways switched on in Settings → Payments reach the checkout. */
    paymentMethods: (raw?.payments ?? []).map((gateway) => ({
      key: gateway.key,
      name: gateway.name,
      description: gateway.description || '',
    })),

    pricesIncludeTax: raw?.tax?.pricesIncludeTax !== false,
    taxRate: Number(raw?.tax?.defaultRate) || 0,
  };
}

/* ------------------------------- home sections -------------------------------- */

/**
 * Home page layout, as arranged in the panel's Homepage screen: which sections
 * are switched on, their order, their headings and how many items each shows.
 * `Home` renders from this list, so re-ordering there re-orders here.
 */
export function adaptHomeSections(raw = []) {
  return raw.map((section) => ({
    key: section.key,
    title: section.title || '',
    subtitle: section.subtitle || '',
    limit: Number(section.itemLimit) || 0,
    sortOrder: Number(section.sortOrder) || 0,
  }));
}

/* -------------------------------- the shopper --------------------------------- */

/** An address as the API stores it → the field names the shop's forms use. */
export function adaptAddress(raw = {}) {
  return {
    id: raw.id,
    fullName: raw.name || '',
    phone: raw.phone || '',
    line1: raw.line1 || '',
    line2: raw.line2 || '',
    city: raw.city || '',
    state: raw.state || '',
    pincode: raw.pincode || '',
    isDefault: Boolean(raw.isDefault),
  };
}

export const adaptAddresses = (raw = []) => raw.map(adaptAddress);

/** The signed-in shopper, as the header, account page and checkout read them. */
export function adaptCustomer(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name || '',
    email: raw.email || '',
    phone: raw.phone || '',
    tier: raw.tier || 'new',
    acceptsMarketing: Boolean(raw.acceptsMarketing),
    ordersCount: Number(raw.ordersCount) || 0,
    joinedAt: raw.joinedAt || new Date().toISOString(),
  };
}

/* ---------------------------------- orders ------------------------------------ */

/** The panel's status vocabulary → what the shop puts in front of a shopper. */
const ORDER_STATUS_LABELS = {
  pending: 'Awaiting Payment',
  confirmed: 'Confirmed',
  processing: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

/** The fulfilment steps the order pages draw, in order. */
export const ORDER_STAGES = ['Confirmed', 'Packed', 'Shipped', 'Delivered'];

const STAGE_BY_STATUS = {
  pending: -1,
  confirmed: 0,
  processing: 1,
  shipped: 2,
  delivered: 3,
};

const PAYMENT_STATUS_LABELS = {
  paid: 'Payment received',
  pending: 'Awaiting payment',
  failed: 'Payment failed',
  refunded: 'Refunded',
};

const PAYMENT_METHOD_LABELS = {
  razorpay: 'Razorpay',
  stripe: 'Card (Stripe)',
  upi: 'UPI',
  card: 'Credit / Debit Card',
  netbanking: 'Net Banking',
  cod: 'Cash on Delivery',
};

/**
 * An API order → the receipt shape the order pages render.
 *
 * `id` is the order *code* (`SOP10245`) because that is what a shopper is
 * quoted, types into the tracking box and sees in the URL; the database id
 * rides along as `orderId` for the routes that want it.
 */
export function adaptOrder(raw) {
  if (!raw) return null;

  const address = raw.shippingAddress ?? {};
  const codCharge = Number(raw.codCharge) || 0;

  return {
    id: raw.code || raw.id,
    orderId: raw.id,
    placedAt: raw.placedAt,
    updatedAt: raw.updatedAt,

    status: ORDER_STATUS_LABELS[raw.status] ?? raw.status,
    statusKey: raw.status,
    stage: STAGE_BY_STATUS[raw.status] ?? -1,
    cancelled: raw.status === 'cancelled' || raw.status === 'returned',

    email: raw.customerEmail || '',
    address: adaptAddress(address),

    paymentMethod: raw.paymentMethod,
    paymentLabel: PAYMENT_METHOD_LABELS[raw.paymentMethod] ?? raw.paymentMethod,
    paymentStatus: raw.paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[raw.paymentStatus] ?? raw.paymentStatus,

    shippingLabel: raw.shippingLabel || 'Standard Delivery',
    shippingEta: raw.shippingEta || '',
    trackingNumber: raw.trackingNumber || null,
    courier: raw.courier || null,

    items: (raw.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      image: item.image,
      size: item.size || '',
      color: item.color || '',
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 1,
    })),

    coupon: raw.couponCode || null,
    totals: {
      subtotal: Number(raw.subtotal) || 0,
      discount: Number(raw.discount) || 0,
      shipping: Number(raw.shipping) || 0,
      codCharge,
      tax: Number(raw.tax) || 0,
      total: Number(raw.total) || 0,
    },

    /* Only the events a shopper should see — internal notes stay in the panel. */
    timeline: (raw.timeline ?? [])
      .filter((event) => event.status !== 'note')
      .map((event) => ({ status: event.status, label: event.label, at: event.at })),
  };
}

export const adaptOrders = (raw = []) => raw.map(adaptOrder);

/* -------------------------------- navigation --------------------------------- */

/**
 * Header navigation, built from the live category tree and collection list.
 *
 * The shape matches what `Header`, `MegaMenu` and `MobileMenu` already render:
 * a flat item for a plain link, `columns` for a mega panel, `feature` for the
 * promo tile. Renaming a category or adding a subcategory in the admin panel
 * therefore changes the menu, with no navigation file to keep in sync.
 */
export function buildNavigation(categories = [], collections = []) {
  const items = [{ label: 'New Arrivals', to: '/new-arrivals' }];

  categories.forEach((category) => {
    const shopColumn = {
      title: `Shop ${category.name}`,
      links: [
        { label: `All ${category.name}`, to: category.to },
        { label: 'New Arrivals', to: withParam(category.to, 'badge', 'New') },
        { label: 'Bestsellers', to: withParam(category.to, 'badge', 'Bestseller') },
      ],
    };

    const columns = [shopColumn];
    if (category.children.length) {
      columns.push({
        title: 'By Type',
        links: category.children.map((child) => ({ label: child.name, to: child.to })),
      });
    }

    /* A category with nothing under it gets a plain link rather than a mega
       panel holding a single column. */
    const featured = collections.find((collection) => collection.featured) ?? collections[0];

    items.push({
      label: category.name,
      to: category.to,
      ...(category.children.length
        ? {
            columns,
            feature: featured
              ? {
                  eyebrow: featured.eyebrow,
                  title: featured.name,
                  to: `/collections/${featured.slug}`,
                  image: featured.banner,
                  seed: featured.seed,
                  tags: featured.tags,
                }
              : undefined,
          }
        : {}),
    });
  });

  items.push(
    { label: 'Collections', to: '/collections' },
    { label: 'Bestsellers', to: '/bestsellers' },
    { label: 'Sale', to: '/sale', accent: true },
  );

  return items;
}

/** Adds a query parameter to a path that may already carry one. */
function withParam(path, key, value) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}
