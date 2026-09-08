/*
 * SEO configuration and derived documents.
 * ---------------------------------------------------------------------------
 * The panel writes two collections — `seo_settings` (one document) and
 * `seo_pages` (one row per non-catalogue route) — and products, categories and
 * collections carry their own embedded `seo` block. Everything the shop front
 * renders, plus /sitemap.xml and /robots.txt, is derived from those three
 * sources and nothing else, so changing metadata in the panel changes the live
 * site without a deploy.
 *
 * Resolution of the actual <meta> tags happens in the shop front, where the
 * route and its query string are known. What lives here is only what the
 * server itself has to decide: the defaults a half-filled settings document
 * falls back to, and which URLs may appear in the sitemap.
 */

import type { SeoSettings } from '@/types';
import { SEO_SETTINGS_ID, SeoSettingsModel } from '../db/models.js';

export const SEO_DEFAULTS: SeoSettings = {
  siteUrl: 'https://sopii.com',
  siteName: 'SOPII',
  /* `%s` is the page's own title. Keeping the brand in the template rather
     than in every title is what stops "SOPII" being repeated twice on a page
     whose title already mentions it. */
  titleTemplate: '%s | SOPII',
  defaultTitle: 'SOPII — Contemporary Indian Fashion',
  defaultMetaDescription:
    'Handwoven sarees, blouses and considered silhouettes, made with craftspeople across India. Free shipping on orders above the threshold, easy returns.',
  defaultOgImage: '/final_logo.png',

  twitterSite: '',
  twitterCreator: '',
  twitterCardType: 'summary_large_image',

  robotsIndex: true,
  robotsFollow: true,
  robotsTxtExtra: '',

  organization: {
    name: 'SOPII',
    legalName: '',
    logo: '/final_logo.png',
    description: 'Contemporary Indian fashion — handwoven textiles and considered silhouettes.',
    email: '',
    phone: '',
    streetAddress: '',
    locality: '',
    region: '',
    postalCode: '',
    country: 'IN',
    sameAs: [],
  },

  sitemap: {
    enabled: true,
    includeProducts: true,
    includeCategories: true,
    includeCollections: true,
    includeStaticPages: true,
    /* Routes that are useless or harmful in an index: anything personal,
       transactional, or an infinite filter surface. */
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

/** Deep-merges the stored document over the defaults, one level per section. */
export async function loadSeoSettings(): Promise<SeoSettings> {
  const doc = await SeoSettingsModel.findById(SEO_SETTINGS_ID).lean();
  if (!doc) return SEO_DEFAULTS;

  const { _id, ...stored } = doc as Record<string, unknown> & { _id: string };
  void _id;
  const partial = stored as Partial<SeoSettings>;

  return {
    ...SEO_DEFAULTS,
    ...stripUndefined(partial),
    organization: { ...SEO_DEFAULTS.organization, ...stripUndefined(partial.organization ?? {}) },
    sitemap: { ...SEO_DEFAULTS.sitemap, ...stripUndefined(partial.sitemap ?? {}) },
    verification: { ...SEO_DEFAULTS.verification, ...stripUndefined(partial.verification ?? {}) },
  };
}

/** Mongo stores absent keys as `undefined`; those must not beat a default. */
function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null),
  ) as Partial<T>;
}

/**
 * `https://sopii.com` + `/sarees` → `https://sopii.com/sarees`, exactly one
 * slash. The root is `https://sopii.com/` **with** the trailing slash, matching
 * what the shop front emits as its canonical — a sitemap entry that disagrees
 * with the page's own canonical is a conflicting signal, not a cosmetic
 * difference.
 */
export function absoluteUrl(siteUrl: string, path: string) {
  const origin = (siteUrl || '').replace(/\/+$/, '');
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${rel}`;
}

export interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

/** XML-escapes the five characters that would otherwise break the document. */
function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSitemapXml(settings: SeoSettings, entries: SitemapEntry[]) {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const entry of entries) {
    const loc = absoluteUrl(settings.siteUrl, entry.path);
    // One <url> per location: a duplicated loc is an indexing signal conflict.
    if (seen.has(loc)) continue;
    seen.add(loc);

    const parts = [`    <loc>${xmlEscape(loc)}</loc>`];
    if (entry.lastmod) parts.push(`    <lastmod>${xmlEscape(entry.lastmod.slice(0, 10))}</lastmod>`);
    if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
    if (entry.priority !== undefined) {
      parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
    }
    urls.push(`  <url>\n${parts.join('\n')}\n  </url>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

export function buildRobotsTxt(settings: SeoSettings) {
  const lines: string[] = ['User-agent: *'];

  if (!settings.robotsIndex) {
    /* The whole site is switched to noindex — say so once, plainly, rather
       than listing every path. */
    lines.push('Disallow: /');
  } else {
    for (const path of settings.sitemap.excludePaths ?? []) {
      lines.push(`Disallow: ${path.startsWith('/') ? path : `/${path}`}`);
    }
    // Never let a crawler burn budget on the API or media originals.
    lines.push('Disallow: /api/');
  }

  lines.push('');
  if (settings.sitemap.enabled) {
    lines.push(`Sitemap: ${absoluteUrl(settings.siteUrl, '/sitemap.xml')}`);
  }

  const extra = (settings.robotsTxtExtra ?? '').trim();
  if (extra) lines.push('', extra);

  return `${lines.join('\n')}\n`;
}
