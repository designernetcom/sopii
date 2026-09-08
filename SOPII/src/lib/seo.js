/**
 * SEO resolution.
 * ===========================================================================
 * Turns three inputs — the site settings, whatever override applies to this
 * route, and the facts the page itself knows (a product's name, a category's
 * description) — into exactly one value per meta tag.
 *
 * Everything here is a pure function of its arguments. That matters for two
 * reasons: the same resolution can be reasoned about without a browser, and
 * `SEOHead` can render the result without deciding anything itself.
 *
 * Precedence, highest first:
 *
 *   1. the admin's override for this page (SEO Management, or the record's
 *      own SEO tab)
 *   2. the page's own content — product name, category description
 *   3. the site defaults from SEO Management → Settings
 *
 * The one rule the whole file exists to enforce: a page gets one title, one
 * description and one canonical. Never two.
 */

/* --------------------------------- limits ---------------------------------- */

/* Google truncates around these lengths. They are guidance for the panel's
   character counters, not hard limits — a description is not *wrong* at 170
   characters, it is just unlikely to be shown whole. */
export const SEO_LIMITS = {
  title: { min: 30, recommendedMin: 50, recommendedMax: 60, max: 70 },
  metaDescription: { min: 70, recommendedMin: 150, recommendedMax: 160, max: 180 },
};

/* -------------------------------- utilities -------------------------------- */

/** Strips tags and collapses whitespace, so descriptions never leak markup. */
export function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Shortens to `max` characters on a word boundary, adding an ellipsis.
 * Cutting mid-word reads as broken; cutting at a space reads as a summary.
 */
export function truncate(value, max) {
  const text = stripHtml(value);
  if (text.length <= max) return text;

  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Joins an origin and a path with exactly one slash between them. */
export function absoluteUrl(siteUrl, path = '/') {
  const origin = String(siteUrl ?? '').replace(/\/+$/, '');
  const rel = String(path ?? '/');
  const withSlash = rel.startsWith('/') ? rel : `/${rel}`;
  return `${origin}${withSlash === '/' ? '/' : withSlash}`;
}

/**
 * Resolves an image reference to an absolute URL.
 * Media paths are stored site-relative (`/media/products/x.jpg`) but Open
 * Graph requires an absolute URL — a relative one is simply ignored by every
 * scraper, which is the single most common reason a share preview is blank.
 */
export function absoluteImage(siteUrl, image, mediaOrigin = '') {
  const src = String(image ?? '').trim();
  if (!src) return '';
  if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src;
  if (src.startsWith('/media/') && mediaOrigin) return absoluteUrl(mediaOrigin, src);
  return absoluteUrl(siteUrl, src);
}

/** `%s | SOPII` + `Sarees` → `Sarees | SOPII`. */
export function applyTitleTemplate(template, title, fallback) {
  const value = String(title ?? '').trim() || String(fallback ?? '').trim();
  const tpl = String(template ?? '').trim();
  if (!tpl || !tpl.includes('%s')) return value;

  /* If the title already names the brand the template would add, leave it
     alone. Checking anywhere in the string rather than only at the end is what
     stops "SOPII — Contemporary Indian Fashion" becoming
     "SOPII — Contemporary Indian Fashion | SOPII". */
  const suffix = tpl.replace('%s', '').trim();
  const bare = suffix.replace(/^[|\-–—·:]\s*/, '').trim();
  if (bare && value.toLowerCase().includes(bare.toLowerCase())) return value;

  return tpl.replace('%s', value);
}

/** `noindex, nofollow` etc. — undefined on the override means "inherit". */
export function robotsDirective(override, settings) {
  const index = override?.robotsIndex ?? settings?.robotsIndex ?? true;
  const follow = override?.robotsFollow ?? settings?.robotsFollow ?? true;
  return `${index ? 'index' : 'noindex'}, ${follow ? 'follow' : 'nofollow'}`;
}

/** Turns a name into a URL-safe slug. Used when a record has none. */
export function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

/* -------------------------------- resolution -------------------------------- */

/**
 * The one function every page goes through.
 *
 * @param settings  site-wide SEO settings from the API
 * @param override  the admin's record for this page, or `{}`
 * @param page      what the page knows about itself:
 *                  { path, title, description, image, type, noindex }
 * @returns {import('./seoTypes').SeoResolved}
 */
export function resolveSeo(settings, override = {}, page = {}) {
  const cfg = settings ?? {};
  const ovr = override ?? {};

  /* --- canonical -----------------------------------------------------------
     An explicit canonical from the panel wins. Otherwise it is derived from
     the site origin and the page's path — deliberately without the query
     string, so ?page=2, ?sort=price and ?colour=red all point at one URL
     rather than splitting the same content across dozens of near-duplicates. */
  const canonicalUrl =
    String(ovr.canonicalUrl ?? '').trim() || absoluteUrl(cfg.siteUrl, page.path || '/');

  /* --- title --------------------------------------------------------------- */
  const rawTitle =
    String(ovr.title ?? '').trim() ||
    String(page.title ?? '').trim() ||
    cfg.defaultTitle ||
    cfg.siteName ||
    '';
  const title = applyTitleTemplate(cfg.titleTemplate, rawTitle, cfg.defaultTitle);

  /* --- description --------------------------------------------------------- */
  const rawDescription =
    String(ovr.metaDescription ?? '').trim() ||
    stripHtml(page.description) ||
    cfg.defaultMetaDescription ||
    '';
  const metaDescription = truncate(rawDescription, SEO_LIMITS.metaDescription.max);

  /* --- social -------------------------------------------------------------- */
  const mediaOrigin = cfg.mediaOrigin || '';
  const image =
    absoluteImage(cfg.siteUrl, ovr.ogImage, mediaOrigin) ||
    absoluteImage(cfg.siteUrl, page.image, mediaOrigin) ||
    absoluteImage(cfg.siteUrl, cfg.defaultOgImage, mediaOrigin);

  const ogTitle = String(ovr.ogTitle ?? '').trim() || rawTitle || title;
  const ogDescription = String(ovr.ogDescription ?? '').trim() || metaDescription;

  const twitterImage =
    absoluteImage(cfg.siteUrl, ovr.twitterImage, mediaOrigin) || image;

  /* A page the admin marked noindex stays noindex even if the site default is
     index — the more restrictive of the two always wins. */
  const robots = page.noindex
    ? 'noindex, nofollow'
    : robotsDirective(ovr, cfg);

  return {
    title,
    metaDescription,
    keywords: Array.isArray(ovr.keywords) ? ovr.keywords.filter(Boolean) : [],
    canonicalUrl,
    robots,
    og: {
      title: ogTitle,
      description: ogDescription,
      image,
      url: canonicalUrl,
      type: page.type || 'website',
      siteName: cfg.siteName || 'SOPII',
    },
    twitter: {
      card: cfg.twitterCardType || 'summary_large_image',
      title: String(ovr.twitterTitle ?? '').trim() || ogTitle,
      description: String(ovr.twitterDescription ?? '').trim() || ogDescription,
      image: twitterImage,
      site: cfg.twitterSite || undefined,
      creator: cfg.twitterCreator || undefined,
    },
  };
}

/* ------------------------------ structured data ----------------------------- */

/** Drops empty values so the emitted JSON-LD has no null or blank properties. */
function compact(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

export function organizationSchema(settings) {
  const org = settings?.organization ?? {};
  const siteUrl = settings?.siteUrl ?? '';

  const address = compact({
    '@type': 'PostalAddress',
    streetAddress: org.streetAddress,
    addressLocality: org.locality,
    addressRegion: org.region,
    postalCode: org.postalCode,
    addressCountry: org.country,
  });

  const contact = compact({
    '@type': 'ContactPoint',
    contactType: 'customer support',
    telephone: org.phone,
    email: org.email,
  });

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name || settings?.siteName,
    legalName: org.legalName,
    url: siteUrl || undefined,
    logo: absoluteImage(siteUrl, org.logo),
    description: org.description,
    // Only `@type` means the object is empty of real data.
    address: Object.keys(address).length > 1 ? address : undefined,
    contactPoint: Object.keys(contact).length > 2 ? [contact] : undefined,
    sameAs: (org.sameAs ?? []).filter(Boolean),
  });
}

/** Site-level search action, so Google may show a sitelinks search box. */
export function websiteSchema(settings) {
  const siteUrl = settings?.siteUrl ?? '';
  if (!siteUrl) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings?.siteName || 'SOPII',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl.replace(/\/+$/, '')}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Product schema.
 *
 * `availability` and `price` are the two properties a rich result actually
 * needs, so both are derived from real stock and real pricing rather than
 * hardcoded — a schema that claims InStock for a sold-out product is a
 * structured-data violation, not a white lie.
 */
export function productSchema(product, { settings, url, reviews = [] } = {}) {
  if (!product) return null;
  const siteUrl = settings?.siteUrl ?? '';
  const mediaOrigin = settings?.mediaOrigin ?? '';

  const images = (product.images ?? [])
    .map((img) => absoluteImage(siteUrl, typeof img === 'string' ? img : img?.url, mediaOrigin))
    .filter(Boolean);

  const inStock = product.stock > 0 || product.allowBackorders;

  const offers = compact({
    '@type': 'Offer',
    url,
    priceCurrency: settings?.currency || 'INR',
    price: typeof product.price === 'number' ? product.price.toFixed(2) : undefined,
    availability: inStock
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: settings?.siteName || 'SOPII' },
  });

  /* Only claim an aggregate rating when there are real reviews behind it. */
  const aggregateRating =
    product.reviewCount > 0 && product.rating > 0
      ? {
          '@type': 'AggregateRating',
          ratingValue: Number(product.rating).toFixed(1),
          reviewCount: product.reviewCount,
        }
      : undefined;

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: truncate(product.shortDescription || product.description, 300),
    image: images,
    sku: product.sku,
    brand: { '@type': 'Brand', name: product.brand || settings?.siteName || 'SOPII' },
    offers,
    aggregateRating,
    review: reviews.slice(0, 5).map((review) =>
      compact({
        '@type': 'Review',
        reviewRating: {
          '@type': 'Rating',
          ratingValue: review.rating,
          bestRating: 5,
        },
        author: { '@type': 'Person', name: review.customerName || 'Verified buyer' },
        datePublished: review.createdAt?.slice(0, 10),
        reviewBody: truncate(review.body, 500),
      }),
    ),
  });
}

/** `items`: the same [{ label, to }] the visible breadcrumb trail renders. */
export function breadcrumbSchema(items, settings) {
  const trail = (items ?? []).filter((item) => item?.label);
  if (trail.length < 2) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      // The last crumb is the current page and needs no item URL.
      ...(item.to ? { item: absoluteUrl(settings?.siteUrl, item.to) } : {}),
    })),
  };
}

/** A category or collection listing, as an ItemList of its products. */
export function itemListSchema(products, { settings, url } = {}) {
  const items = (products ?? []).slice(0, 24);
  if (!items.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url,
    numberOfItems: items.length,
    itemListElement: items.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(settings?.siteUrl, `/product/${product.slug || product.id}`),
      name: product.name,
    })),
  };
}
