/*
 * SEO management — the panel's write side.
 * ---------------------------------------------------------------------------
 * Two resources:
 *
 *   /api/seo/settings   the singleton: site identity, defaults, organisation
 *                       schema, robots policy, sitemap policy.
 *   /api/seo/pages      one row per route the catalogue does not own.
 *
 * Product, category and collection metadata is NOT edited here — it lives on
 * the record itself, saved from the SEO tab in that record's edit screen. The
 * split is deliberate: one page's metadata has exactly one owner, so no route
 * can end up with two titles or two canonicals.
 */

import { Router } from 'express';
import type { Model } from 'mongoose';
import { requirePermission } from '../lib/auth.js';
import {
  CategoryModel,
  CollectionModel,
  ProductModel,
  SEO_SETTINGS_ID,
  SeoPageModel,
  SeoSettingsModel,
} from '../db/models.js';
import { SEO_DEFAULTS, loadSeoSettings } from '../lib/seo.js';
import {
  ah,
  badRequest,
  clean,
  nextId,
  notFound,
  nowIso,
  serialize,
  serializeMany,
  str,
} from '../lib/http.js';
import type { SeoMeta, SeoPageType } from '@/types';

export const seoRoutes = Router();

const PAGE_TYPES: SeoPageType[] = [
  'home',
  'category',
  'collection',
  'product',
  'static',
  'blog',
  'system',
];

/** The metadata fields, in one list, so every writer accepts the same set. */
const META_FIELDS = [
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
] as const;

/**
 * Narrows an arbitrary body to the metadata fields and normalises the two that
 * need it. Anything else a client sends is dropped rather than stored.
 */
export function pickSeoMeta(body: Record<string, unknown>): Partial<SeoMeta> {
  const out: Record<string, unknown> = {};

  for (const field of META_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];

    if (field === 'keywords') {
      /* Accepts either an array or the comma-separated string the form sends.
         Blank entries are dropped, so a trailing comma cannot create an empty
         keyword. */
      const list = Array.isArray(value)
        ? value.map((item) => String(item))
        : String(value ?? '').split(',');
      out.keywords = list.map((item) => item.trim()).filter(Boolean);
      continue;
    }

    if (field === 'robotsIndex' || field === 'robotsFollow') {
      // null is meaningful here: "inherit the site default".
      out[field] = value === null || value === undefined ? undefined : Boolean(value);
      continue;
    }

    out[field] = typeof value === 'string' ? value.trim() : value;
  }

  return out as Partial<SeoMeta>;
}

/** Rejects structured data that is not parseable JSON before it reaches a page. */
function assertValidJsonLd(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return;
  try {
    JSON.parse(raw);
  } catch {
    badRequest('Schema / JSON-LD must be valid JSON.');
  }
}

/** Leading slash, no trailing slash, no origin, no query string. */
function normalisePath(input: unknown): string {
  let path = String(input ?? '').trim();
  if (!path) badRequest('A page path is required.');

  // Tolerate a full URL being pasted in.
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      badRequest('That does not look like a valid URL or path.');
    }
  }

  path = path.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

/* -------------------------------- settings --------------------------------- */

seoRoutes.get(
  '/settings',
  requirePermission('seo'),
  ah(async (_req, res) => {
    res.json(await loadSeoSettings());
  }),
);

seoRoutes.put(
  '/settings',
  requirePermission('seo', 'edit'),
  ah(async (req, res) => {
    const body = { ...((req.body ?? {}) as Record<string, unknown>) };

    /* siteUrl anchors every canonical and every sitemap entry, so a malformed
       one poisons the whole site rather than a single page. */
    if (typeof body.siteUrl === 'string' && body.siteUrl.trim()) {
      try {
        const url = new URL(body.siteUrl.trim());
        body.siteUrl = `${url.protocol}//${url.host}`;
      } catch {
        badRequest('Site URL must be a full URL, for example https://sopii.com');
      }
    }

    await SeoSettingsModel.findByIdAndUpdate(
      SEO_SETTINGS_ID,
      { $set: clean(body) },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    res.json(await loadSeoSettings());
  }),
);

/** The shipped defaults, so the panel can offer "reset to default". */
seoRoutes.get(
  '/settings/defaults',
  requirePermission('seo'),
  ah(async (_req, res) => {
    res.json(SEO_DEFAULTS);
  }),
);

/* ---------------------------------- pages ---------------------------------- */

seoRoutes.get(
  '/pages',
  requirePermission('seo'),
  ah(async (req, res) => {
    const pageType = str(req.query, 'pageType');
    const filter = pageType && PAGE_TYPES.includes(pageType as SeoPageType) ? { pageType } : {};

    const pages = await SeoPageModel.find(filter).sort({ pageType: 1, path: 1 }).lean();
    res.json(serializeMany(pages));
  }),
);

seoRoutes.get(
  '/pages/:id',
  requirePermission('seo'),
  ah(async (req, res) => {
    const page = await SeoPageModel.findById(req.params.id).lean();
    if (!page) notFound('SEO page');
    res.json(serialize(page));
  }),
);

seoRoutes.post(
  '/pages',
  requirePermission('seo', 'create'),
  ah(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const pageType = String(body.pageType ?? '') as SeoPageType;
    if (!PAGE_TYPES.includes(pageType)) badRequest('Unknown page type.');
    assertValidJsonLd(body.structuredData);

    const path = normalisePath(body.path);
    if (await SeoPageModel.exists({ path })) {
      badRequest(`${path} already has an SEO record — edit that one instead.`);
    }

    const now = nowIso();
    const created = await SeoPageModel.create({
      _id: nextId('seo'),
      pageType,
      label: String(body.label ?? '').trim() || path,
      path,
      refId: body.refId ? String(body.refId) : null,
      system: false,
      ...pickSeoMeta(body),
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json(serialize(created.toObject()));
  }),
);

seoRoutes.put(
  '/pages/:id',
  requirePermission('seo', 'edit'),
  ah(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    assertValidJsonLd(body.structuredData);

    const existing = await SeoPageModel.findById(req.params.id).lean();
    if (!existing) notFound('SEO page');

    const patch: Record<string, unknown> = { ...pickSeoMeta(body), updatedAt: nowIso() };
    if (body.label !== undefined) patch.label = String(body.label).trim() || existing.path;

    /* A system row's path is the route it describes — moving it would leave
       that route with no metadata at all. */
    if (body.path !== undefined && !existing.system) {
      const path = normalisePath(body.path);
      if (path !== existing.path && (await SeoPageModel.exists({ path }))) {
        badRequest(`${path} already has an SEO record.`);
      }
      patch.path = path;
    }

    const updated = await SeoPageModel.findByIdAndUpdate(
      req.params.id,
      { $set: patch },
      { new: true },
    ).lean();

    res.json(serialize(updated as NonNullable<typeof updated>));
  }),
);

seoRoutes.delete(
  '/pages/:id',
  requirePermission('seo', 'delete'),
  ah(async (req, res) => {
    const page = await SeoPageModel.findById(req.params.id).lean();
    if (!page) notFound('SEO page');
    if (page.system) {
      badRequest('This route always needs metadata, so its record cannot be deleted.');
    }

    await SeoPageModel.findByIdAndDelete(req.params.id);
    res.status(204).end();
  }),
);

/* ------------------------------ catalogue SEO ------------------------------- */

type CatalogKind = 'products' | 'categories' | 'collections';

/**
 * Widened to `Model<any>` for the same reason `allModels` is: the union of
 * three distinct model types has no callable common signature, and every use
 * here is a plain find/update that reads only `name`, `slug`, `status` and
 * `seo` — fields all three schemas share.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CATALOG_MODELS: Record<CatalogKind, Model<any>> = {
  products: ProductModel,
  categories: CategoryModel,
  collections: CollectionModel,
};

/** Where each kind of record renders on the shop front. */
function catalogPath(kind: CatalogKind, slug: string) {
  if (kind === 'products') return `/product/${slug}`;
  if (kind === 'collections') return `/collections/${slug}`;
  return `/${slug}`;
}

/**
 * Catalogue records listed with their SEO block, so the panel's overview can
 * show at a glance which ones still have no title or description. Editing
 * happens on the record's own SEO tab.
 */
seoRoutes.get(
  '/catalog/:kind',
  requirePermission('seo'),
  ah(async (req, res) => {
    const kind = req.params.kind as CatalogKind;
    const model = CATALOG_MODELS[kind];
    if (!model) notFound('Catalogue kind');

    const rows = await model
      .find({}, { name: 1, slug: 1, status: 1, seo: 1 })
      .sort({ name: 1 })
      .lean();

    res.json(
      rows.map((row: unknown) => {
        const record = row as {
          _id: string;
          name: string;
          slug?: string;
          status?: string;
          seo?: SeoMeta;
        };
        const seo = record.seo ?? {};
        return {
          id: record._id,
          label: record.name,
          path: catalogPath(kind, seo.slug || record.slug || record._id),
          status: record.status,
          seo,
        };
      }),
    );
  }),
);

/**
 * Saves the SEO block on one catalogue record. The record's edit screen posts
 * here from its SEO tab, which keeps the metadata shape identical across
 * products, categories and collections.
 */
seoRoutes.put(
  '/catalog/:kind/:id',
  requirePermission('seo', 'edit'),
  ah(async (req, res) => {
    const model = CATALOG_MODELS[req.params.kind as CatalogKind];
    if (!model) notFound('Catalogue kind');

    const body = (req.body ?? {}) as Record<string, unknown>;
    assertValidJsonLd(body.structuredData);

    const updated = await model
      .findByIdAndUpdate(req.params.id, { $set: { seo: pickSeoMeta(body) } }, { new: true })
      .lean();
    if (!updated) notFound('Record');

    const record = updated as unknown as { _id: string; seo?: SeoMeta };
    res.json({ id: record._id, seo: record.seo ?? {} });
  }),
);
