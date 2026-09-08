import type { Category, Collection, Product, SeoMeta, SeoPage, SeoSettings } from '@/types';
import { db, nextId, nowIso } from '../db';
import { applyPatch, badRequest, notFound, route } from '../utils';

/**
 * Mock SEO module.
 *
 * Mirrors `server/src/routes/seo.ts` closely enough that the panel behaves the
 * same with or without the API running — including the rules that matter:
 * paths are unique, JSON-LD is validated before it is stored, and catalogue
 * metadata is written onto the record rather than into a second table.
 */

export const seoSettings: SeoSettings = {
  siteUrl: 'https://sopii.com',
  siteName: 'SOPII',
  titleTemplate: '%s | SOPII',
  defaultTitle: 'SOPII — Contemporary Indian Fashion',
  defaultMetaDescription:
    'Handwoven sarees, blouses and considered silhouettes, made with craftspeople across India. Free shipping over the threshold, easy returns.',
  defaultOgImage: '/final_logo.png',
  twitterSite: '',
  twitterCreator: '',
  twitterCardType: 'summary_large_image',
  robotsIndex: true,
  robotsFollow: true,
  robotsTxtExtra: '',
  organization: {
    name: 'SOPII',
    legalName: 'SOPII Retail Private Limited',
    logo: '/final_logo.png',
    description:
      'Contemporary Indian fashion — handwoven textiles and considered silhouettes.',
    email: 'care@sopii.com',
    phone: '+91 98200 00000',
    streetAddress: 'Studio 4, Kala Ghoda',
    locality: 'Mumbai',
    region: 'Maharashtra',
    postalCode: '400001',
    country: 'IN',
    sameAs: ['https://instagram.com/sopii.fashion'],
  },
  sitemap: {
    enabled: true,
    includeProducts: true,
    includeCategories: true,
    includeCollections: true,
    includeStaticPages: true,
    excludePaths: [
      '/cart',
      '/checkout',
      '/account',
      '/orders',
      '/wishlist',
      '/login',
      '/register',
      '/search',
    ],
  },
  verification: {},
};

const page = (
  id: string,
  pageType: SeoPage['pageType'],
  label: string,
  path: string,
  extra: Partial<SeoPage> = {},
): SeoPage => ({
  id,
  pageType,
  label,
  path,
  refId: null,
  system: true,
  keywords: [],
  createdAt: nowIso(),
  updatedAt: nowIso(),
  ...extra,
});

/** Kept deliberately small — enough to exercise every tab in the panel. */
export const seoPages: SeoPage[] = [
  page('seo_home', 'home', 'Homepage', '/', {
    title: 'SOPII — Contemporary Indian Fashion',
    metaDescription:
      'Handwoven sarees, blouses and everyday silhouettes, made with craftspeople across India.',
  }),
  page('seo_shop', 'system', 'Shop — All Products', '/shop', {
    title: 'Shop All',
    metaDescription:
      'Browse the full SOPII collection — sarees, blouses, dresses and jewellery.',
  }),
  page('seo_new_arrivals', 'system', 'New Arrivals', '/new-arrivals', {
    title: 'New Arrivals',
    metaDescription: 'The newest pieces in the studio, added in limited runs.',
  }),
  page('seo_search', 'system', 'Search Results', '/search', {
    title: 'Search',
    robotsIndex: false,
    robotsFollow: false,
  }),
  page('seo_cart', 'system', 'Cart', '/cart', {
    title: 'Your Bag',
    robotsIndex: false,
    robotsFollow: false,
  }),
  page('seo_pages_our_story', 'static', 'Our Story', '/pages/our-story', {
    title: 'Our Story',
    metaDescription:
      'How SOPII began, and the weavers and printers the studio works with across India.',
  }),
  page('seo_pages_faq', 'static', 'FAQ', '/pages/faq', {
    title: 'Frequently Asked Questions',
    metaDescription:
      'Answers to common questions about SOPII orders, fabrics, care, sizing and delivery.',
  }),
  page('seo_pages_shipping', 'static', 'Shipping', '/pages/shipping', {
    title: 'Shipping',
    metaDescription: 'Delivery timelines, charges and free-shipping thresholds.',
  }),
];

const META_FIELDS: (keyof SeoMeta)[] = [
  'title',
  'metaDescription',
  'keywords',
  'slug',
  'canonicalUrl',
  'ogTitle',
  'ogDescription',
  'ogImage',
  'twitterTitle',
  'twitterDescription',
  'twitterImage',
  'robotsIndex',
  'robotsFollow',
  'structuredData',
];

function pickMeta(body: Record<string, unknown>): SeoMeta {
  const out: Record<string, unknown> = {};
  for (const field of META_FIELDS) {
    if (field in body) out[field] = body[field];
  }
  return out as SeoMeta;
}

function assertJsonLd(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return;
  try {
    JSON.parse(raw);
  } catch {
    badRequest('Schema / JSON-LD must be valid JSON.');
  }
}

function normalisePath(input: unknown) {
  let path = String(input ?? '').trim();
  if (!path) badRequest('A page path is required.');
  path = path.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

type CatalogRecord = (Product | Category | Collection) & { seo?: SeoMeta };

const CATALOG: Record<string, { rows: () => CatalogRecord[]; path: (slug: string) => string }> = {
  products: { rows: () => db.products, path: (slug) => `/product/${slug}` },
  categories: { rows: () => db.categories, path: (slug) => `/${slug}` },
  collections: { rows: () => db.collections, path: (slug) => `/collections/${slug}` },
};

export const seoRoutes = [
  /* -------------------------------- settings ------------------------------- */

  route('GET', '/seo/settings', () => seoSettings),
  route('GET', '/seo/settings/defaults', () => seoSettings),

  route('PUT', '/seo/settings', ({ body }) => {
    applyPatch(seoSettings, body as Partial<SeoSettings>);
    return seoSettings;
  }),

  /* --------------------------------- pages --------------------------------- */

  route('GET', '/seo/pages', ({ query }) => {
    const pageType = query.pageType;
    return pageType ? seoPages.filter((row) => row.pageType === pageType) : seoPages;
  }),

  route('GET', '/seo/pages/:id', ({ params }) => {
    const found = seoPages.find((row) => row.id === params.id);
    if (!found) notFound('SEO page');
    return found;
  }),

  route('POST', '/seo/pages', ({ body }) => {
    const payload = body as Record<string, unknown>;
    assertJsonLd(payload.structuredData);

    const path = normalisePath(payload.path);
    if (seoPages.some((row) => row.path === path)) {
      badRequest(`${path} already has an SEO record — edit that one instead.`);
    }

    const created: SeoPage = {
      id: nextId('seo'),
      pageType: (payload.pageType as SeoPage['pageType']) ?? 'static',
      label: String(payload.label ?? '').trim() || path,
      path,
      refId: null,
      system: false,
      keywords: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...pickMeta(payload),
    };
    seoPages.push(created);
    return created;
  }),

  route('PUT', '/seo/pages/:id', ({ params, body }) => {
    const found = seoPages.find((row) => row.id === params.id);
    if (!found) notFound('SEO page');

    const payload = body as Record<string, unknown>;
    assertJsonLd(payload.structuredData);

    if (payload.path !== undefined && !found.system) {
      const path = normalisePath(payload.path);
      if (path !== found.path && seoPages.some((row) => row.path === path)) {
        badRequest(`${path} already has an SEO record.`);
      }
      found.path = path;
    }
    if (payload.label !== undefined) found.label = String(payload.label);

    applyPatch(found, pickMeta(payload));
    found.updatedAt = nowIso();
    return found;
  }),

  route('DELETE', '/seo/pages/:id', ({ params }) => {
    const index = seoPages.findIndex((row) => row.id === params.id);
    if (index === -1) notFound('SEO page');
    if (seoPages[index].system) {
      badRequest('This route always needs metadata, so its record cannot be deleted.');
    }
    seoPages.splice(index, 1);
    return null;
  }),

  /* ------------------------------- catalogue -------------------------------- */

  route('GET', '/seo/catalog/:kind', ({ params }) => {
    const config = CATALOG[params.kind];
    if (!config) notFound('Catalogue kind');

    return config.rows().map((record) => {
      const seo = record.seo ?? {};
      return {
        id: record.id,
        label: record.name,
        path: config.path(seo.slug || record.slug || record.id),
        status: (record as { status?: string }).status,
        seo,
      };
    });
  }),

  route('PUT', '/seo/catalog/:kind/:id', ({ params, body }) => {
    const config = CATALOG[params.kind];
    if (!config) notFound('Catalogue kind');

    const record = config.rows().find((row) => row.id === params.id);
    if (!record) notFound('Record');

    assertJsonLd((body as Record<string, unknown>).structuredData);
    record.seo = pickMeta(body as Record<string, unknown>);

    return { id: record.id, seo: record.seo };
  }),
];
