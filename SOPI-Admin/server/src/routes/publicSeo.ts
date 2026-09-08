/*
 * The public face of SEO.
 * ---------------------------------------------------------------------------
 * Three things, all unauthenticated and all derived from what the panel wrote:
 *
 *   GET /api/storefront/seo   settings + the `seo_pages` rows, for the shop
 *                             front to resolve <meta> tags against.
 *   GET /sitemap.xml          every indexable, canonical URL.
 *   GET /robots.txt           crawl policy, pointing at the sitemap.
 *
 * The last two are mounted at the site root rather than under /api because
 * that is where crawlers look for them. In production the shop front's host
 * should proxy /sitemap.xml and /robots.txt through to this API so both live
 * on the same origin as the pages they describe — see README.
 */

import { Router } from 'express';
import {
  CategoryModel,
  CollectionModel,
  ProductModel,
  SeoPageModel,
} from '../db/models.js';
import { buildRobotsTxt, buildSitemapXml, loadSeoSettings, type SitemapEntry } from '../lib/seo.js';
import { ah, notFound, serializeMany } from '../lib/http.js';
import { cached, cacheKey, NAMESPACE, TTL } from '../lib/cache.js';
import { publicCache } from '../lib/observability.js';
import type { SeoMeta } from '@/types';

export const seoFeedRoutes = Router();
export const seoRootRoutes = Router();

/* ------------------------------- shop feed ---------------------------------- */

/**
 * Everything the shop front needs to build a page's metadata, minus anything
 * operational. The verification tokens are included on purpose: they are meta
 * tags that have to render in the page's <head> to do their job.
 */
/**
 * The most `seo_pages` rows the shop's feed will carry.
 *
 * These are metadata for routes the catalogue does not own — static pages,
 * blog posts, system routes — so a store will realistically have tens, not
 * thousands. The cap exists so that a store which grows a large blog does not
 * silently turn this endpoint into a multi-megabyte response on every cold
 * load; past it, a page resolves its own metadata through the product and
 * category feeds it already fetches.
 */
const SEO_FEED_LIMIT = Number(process.env.SEO_FEED_LIMIT ?? 500);

seoFeedRoutes.get(
  '/seo',
  ah(async (_req, res) => {
    const payload = await cached(cacheKey(NAMESPACE.seo, 'feed'), TTL.seo, async () => {
      const [settings, pages] = await Promise.all([
        loadSeoSettings(),
        SeoPageModel.find({}).sort({ path: 1 }).limit(SEO_FEED_LIMIT).lean(),
      ]);

      return {
        settings,
        pages: serializeMany(pages),
        fetchedAt: new Date().toISOString(),
      };
    });

    publicCache(res, { browserSeconds: 300, cdnSeconds: 3600, staleSeconds: 86_400 });
    res.json(payload);
  }),
);

/* -------------------------------- sitemap ----------------------------------- */

/** A record is only listed if its own metadata does not say noindex. */
const indexable = (seo: SeoMeta | undefined) => seo?.robotsIndex !== false;

/*
 * THE SITEMAP, AT SCALE (§20)
 * ---------------------------------------------------------------------------
 * What was here built *one* sitemap containing every URL in the store, by
 * loading every published product, every category and every collection into
 * memory and serialising them into a single XML document.
 *
 * That has a hard ceiling and it is not a soft one. The sitemap protocol caps
 * a single file at 50,000 URLs and 50 MB uncompressed; past either, crawlers
 * reject the file outright — so a store with 200,000 products does not get a
 * partial sitemap, it gets none. And building it means holding 200,000
 * documents in the Node process, on an endpoint that is public and
 * unauthenticated.
 *
 * The protocol's own answer is a **sitemap index**: `/sitemap.xml` becomes a
 * list of child sitemaps, and each child holds one bounded page of URLs.
 * That is what these three routes are.
 *
 *   /sitemap.xml                 the index — a list of the children below
 *   /sitemap-pages.xml           static, blog and system routes
 *   /sitemap-categories.xml      categories and collections
 *   /sitemap-products-N.xml      products, N pages of CHUNK_SIZE each
 *
 * Each child is a `.skip().limit()` over an indexed query, so memory is
 * bounded by the chunk size rather than by the catalogue, and each is cached
 * and served with a long CDN TTL — crawlers re-fetch these constantly.
 */

/** Well under the protocol's 50,000 ceiling, so a chunk is never rejected. */
const CHUNK_SIZE = Number(process.env.SITEMAP_CHUNK_SIZE ?? 20_000);

/** Guards the index against a store whose catalogue outruns the URL scheme. */
const MAX_PRODUCT_CHUNKS = Number(process.env.SITEMAP_MAX_CHUNKS ?? 500);

async function sitemapSettings() {
  const settings = await loadSeoSettings();
  return settings.sitemap.enabled ? settings : null;
}

/** Serialises one bounded page of entries, cached and CDN-friendly. */
async function sendSitemap(
  res: Parameters<Parameters<typeof seoRootRoutes.get>[1]>[1],
  key: string,
  load: () => Promise<SitemapEntry[]>,
) {
  const settings = await sitemapSettings();
  if (!settings) {
    res.status(404).type('text/plain').send('Sitemap is disabled.');
    return;
  }

  const excluded = new Set(settings.sitemap.excludePaths ?? []);
  const entries = await cached(cacheKey(NAMESPACE.seo, key), TTL.seo, load);

  res.type('application/xml');
  publicCache(res, { browserSeconds: 3600, cdnSeconds: 21_600, staleSeconds: 86_400 });
  res.send(buildSitemapXml(settings, entries.filter((entry) => !excluded.has(entry.path))));
}

/**
 * The index. One count query, and no document leaves the database.
 *
 * `countDocuments` on an indexed filter is what decides how many product
 * chunks to advertise — which is the whole reason this can scale: the index
 * costs the same whether the catalogue holds a thousand products or a million.
 */
seoRootRoutes.get(
  '/sitemap.xml',
  ah(async (_req, res) => {
    const settings = await sitemapSettings();
    if (!settings) {
      res.status(404).type('text/plain').send('Sitemap is disabled.');
      return;
    }

    const body = await cached(cacheKey(NAMESPACE.seo, 'sitemap-index'), TTL.seo, async () => {
      const productCount = settings.sitemap.includeProducts
        ? await ProductModel.countDocuments({ status: 'published' })
        : 0;

      const chunks = Math.min(MAX_PRODUCT_CHUNKS, Math.ceil(productCount / CHUNK_SIZE));
      const base = (settings.siteUrl ?? '').replace(/\/$/, '');
      const now = new Date().toISOString();

      const children = [
        ...(settings.sitemap.includeStaticPages ? ['/sitemap-pages.xml'] : []),
        ...(settings.sitemap.includeCategories || settings.sitemap.includeCollections
          ? ['/sitemap-categories.xml']
          : []),
        ...Array.from({ length: chunks }, (_, i) => `/sitemap-products-${i + 1}.xml`),
      ];

      return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...children.map(
          (path) => `  <sitemap><loc>${base}${path}</loc><lastmod>${now}</lastmod></sitemap>`,
        ),
        '</sitemapindex>',
      ].join('\n');
    });

    res.type('application/xml');
    publicCache(res, { browserSeconds: 3600, cdnSeconds: 21_600, staleSeconds: 86_400 });
    res.send(body);
  }),
);

/** Static, blog and system routes — plus the homepage, which leads the index. */
seoRootRoutes.get(
  '/sitemap-pages.xml',
  ah(async (_req, res) => {
    await sendSitemap(res, 'sitemap-pages', async () => {
      const entries: SitemapEntry[] = [
        /* The homepage is always first and always the highest priority — it is
           the only page whose rank is not a judgement call. */
        { path: '/', changefreq: 'daily', priority: 1.0 },
      ];

      const pages = await SeoPageModel.find(
        { pageType: { $in: ['static', 'blog', 'system', 'home'] } },
        { path: 1, robotsIndex: 1, updatedAt: 1 },
      )
        .limit(CHUNK_SIZE)
        .lean();

      for (const page of pages) {
        const row = page as unknown as SeoMeta & { path: string; updatedAt?: string };
        if (row.path === '/') continue;
        if (!indexable(row)) continue;
        entries.push({
          path: row.path,
          lastmod: row.updatedAt,
          changefreq: 'monthly',
          priority: 0.5,
        });
      }

      return entries;
    });
  }),
);

seoRootRoutes.get(
  '/sitemap-categories.xml',
  ah(async (_req, res) => {
    await sendSitemap(res, 'sitemap-categories', async () => {
      const settings = await loadSeoSettings();
      const entries: SitemapEntry[] = [];

      const [categories, collections] = await Promise.all([
        settings.sitemap.includeCategories
          ? CategoryModel.find({ status: 'active' }, { slug: 1, seo: 1 }).limit(CHUNK_SIZE).lean()
          : [],
        settings.sitemap.includeCollections
          ? CollectionModel.find({ status: 'active' }, { slug: 1, seo: 1 }).limit(CHUNK_SIZE).lean()
          : [],
      ]);

      for (const doc of categories) {
        const row = doc as unknown as { slug?: string; seo?: SeoMeta };
        if (!indexable(row.seo)) continue;
        const slug = row.seo?.slug || row.slug;
        if (slug) entries.push({ path: `/${slug}`, changefreq: 'weekly', priority: 0.8 });
      }

      for (const doc of collections) {
        const row = doc as unknown as { slug?: string; seo?: SeoMeta };
        if (!indexable(row.seo)) continue;
        const slug = row.seo?.slug || row.slug;
        if (slug) {
          entries.push({ path: `/collections/${slug}`, changefreq: 'weekly', priority: 0.7 });
        }
      }

      return entries;
    });
  }),
);

/**
 * One page of products.
 *
 * The sort is `_id` rather than `createdAt`: a stable, unique key is what makes
 * `.skip().limit()` a partition rather than a sample. Sorting on a non-unique
 * field lets a document appear in two chunks or in none when ties are broken
 * differently between two queries — so a product would be listed twice, or
 * silently never crawled.
 */
seoRootRoutes.get(
  '/sitemap-products-:chunk.xml',
  ah(async (req, res) => {
    const chunk = Number(req.params.chunk);
    if (!Number.isInteger(chunk) || chunk < 1 || chunk > MAX_PRODUCT_CHUNKS) notFound('Sitemap');

    await sendSitemap(res, `sitemap-products-${chunk}`, async () => {
      const products = await ProductModel.find(
        { status: 'published' },
        { slug: 1, seo: 1, updatedAt: 1 },
      )
        .sort({ _id: 1 })
        .skip((chunk - 1) * CHUNK_SIZE)
        .limit(CHUNK_SIZE)
        .lean();

      const entries: SitemapEntry[] = [];
      for (const doc of products) {
        const row = doc as unknown as { slug?: string; seo?: SeoMeta; updatedAt?: string };
        if (!indexable(row.seo)) continue;
        const slug = row.seo?.slug || row.slug;
        if (slug) {
          entries.push({
            path: `/product/${slug}`,
            lastmod: row.updatedAt,
            changefreq: 'weekly',
            priority: 0.6,
          });
        }
      }
      return entries;
    });
  }),
);

/* -------------------------------- robots ------------------------------------ */

seoRootRoutes.get(
  '/robots.txt',
  ah(async (_req, res) => {
    const body = await cached(cacheKey(NAMESPACE.seo, 'robots'), TTL.seo, async () =>
      buildRobotsTxt(await loadSeoSettings()),
    );

    res.type('text/plain');
    publicCache(res, { browserSeconds: 3600, cdnSeconds: 21_600, staleSeconds: 86_400 });
    res.send(body);
  }),
);
