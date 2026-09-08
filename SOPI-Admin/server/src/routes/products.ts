import { Router } from 'express';
import type { PipelineStage } from 'mongoose';
import type { Product } from '@/types';
import { slugify } from '@/utils/format';
import { CategoryModel, ProductModel } from '../db/models.js';
import { destroyImages, isDataUri } from '../lib/cloudinary.js';
import { requirePermission } from '../lib/auth.js';
import {
  ah,
  badRequest,
  clean,
  list,
  nextId,
  notFound,
  nowIso,
  num,
  pageParams,
  paginated,
  searchFilter,
  serialize,
  serializeMany,
  sortSpec,
  str,
} from '../lib/http.js';

export const productRoutes = Router();

/** Fields the list pipeline computes but the client's `Product` type has not. */
const DERIVED = ['category', 'categoryName', 'stockStatus', 'placedAtDate', 'createdAtDate'];

/**
 * Drops gallery entries that must never reach the database.
 *
 * Two kinds:
 *
 * - **`blob:` URLs** are pointers into the memory of the one browser tab that
 *   created them. Persisting one looks fine in the panel that uploaded it and
 *   renders nowhere else — not after a reload, and not on the shop front,
 *   which is a different origin.
 * - **`data:` URIs** are the base64 payloads this catalogue was built on and
 *   is being moved off. One five-image gallery was megabytes of BSON that every
 *   shopper then downloaded in full through `/storefront/bootstrap`. Bytes now
 *   go to Cloudinary through `/api/uploads/image`, and a document keeps the
 *   URL and public id that came back.
 *
 * Rejecting both here keeps them out of the database whatever the client does.
 */
function usableImages<T extends Partial<Product>>(payload: T): T {
  if (!Array.isArray(payload.images)) return payload;
  const images = payload.images.filter(
    (image) => !/^blob:/i.test(image?.url ?? '') && !isDataUri(image?.url),
  );
  return images.length === payload.images.length ? payload : { ...payload, images };
}

/**
 * Cloudinary assets the gallery used to reference and no longer does.
 *
 * Reconciling on the server rather than in the panel is what makes the cleanup
 * correct: an admin who removes an image and then abandons the form has
 * changed nothing, and an image dropped from one product but still on another
 * (a duplicate) keeps its asset. Only a saved edit destroys anything, and only
 * what the saved record itself stopped pointing at.
 */
function orphanedPublicIds(before: Product['images'] = [], after: Product['images'] = []) {
  const kept = new Set(after.map((image) => image?.publicId).filter(Boolean));
  return before
    .map((image) => image?.publicId)
    .filter((id): id is string => Boolean(id) && !kept.has(id));
}

/**
 * Best-effort asset cleanup. A Cloudinary hiccup is not a reason to fail a save
 * the database has already accepted — the worst case is an orphaned asset,
 * which is a billing footnote, not a broken product.
 */
function reap(publicIds: string[]) {
  if (!publicIds.length) return;
  void destroyImages(publicIds).catch((error) => {
    console.warn('[products] could not clean up replaced images:', error?.message ?? error);
  });
}

/**
 * Destroys assets no *surviving* product still points at — the only entry
 * point; `reap` above is just its last step.
 *
 * Sharing is normal, from three directions: `POST /:id/duplicate` copies a
 * gallery rather than re-uploading it, the media picker copies a library
 * reference, and the migration files each `/media/...` file once and points
 * every record that used that path at the one asset. Destroying on "this
 * product stopped referencing it" would blank every other product that still
 * does, which is why this asks the database before it asks Cloudinary.
 *
 * `deletedIds` are rows that are already gone and so cannot answer for
 * themselves; pass `[]` on an update, where the saved record is part of the
 * answer.
 */
async function reapUnreferenced(publicIds: string[], deletedIds: string[]) {
  const ids = [...new Set(publicIds.filter(Boolean))];
  if (!ids.length) return;

  const stillUsed = await ProductModel.distinct('images.publicId', {
    _id: { $nin: deletedIds },
    'images.publicId': { $in: ids },
  }).catch(() => [] as string[]);

  const used = new Set(stillUsed as string[]);
  reap(ids.filter((id) => !used.has(id)));
}

const SORT_MAP: Record<string, string> = {
  category: 'categoryName',
  createdAt: 'createdAtDate',
};

/**
 * One aggregation does the whole job: joins the category so rows can be sorted
 * by category name, derives stock status so it can be filtered on, and pages
 * the result — all inside MongoDB rather than in Node.
 */
productRoutes.get(
  '/',
  requirePermission('products'),
  ah(async (req, res) => {
    const { page, pageSize, skip } = pageParams(req.query, 10);

    const match: Record<string, unknown> = {};

    const search = searchFilter(str(req.query, 'search'), ['name', 'sku', 'slug', 'tags']);
    if (search) Object.assign(match, search);

    const categoryIds = list(req.query, 'categoryId');
    if (categoryIds.length) {
      // Selecting a parent category should include everything beneath it.
      const children = await CategoryModel.find({ parentId: { $in: categoryIds } })
        .select('_id')
        .lean<{ _id: string }[]>();
      match.categoryId = { $in: [...categoryIds, ...children.map((c) => c._id)] };
    }

    const statuses = list(req.query, 'status');
    if (statuses.length) match.status = { $in: statuses };

    const stockStatuses = list(req.query, 'stockStatus');
    if (stockStatuses.length) match.stockStatus = { $in: stockStatuses };

    const collectionIds = list(req.query, 'collectionId');
    if (collectionIds.length) match.collectionIds = { $in: collectionIds };

    const minPrice = str(req.query, 'minPrice');
    const maxPrice = str(req.query, 'maxPrice');
    if (minPrice !== undefined || maxPrice !== undefined) {
      match.price = {
        ...(minPrice !== undefined ? { $gte: num(req.query, 'minPrice', 0) } : {}),
        ...(maxPrice !== undefined ? { $lte: num(req.query, 'maxPrice', 0) } : {}),
      };
    }

    if (str(req.query, 'featured') === 'true') match.featured = true;

    const pipeline: PipelineStage[] = [
      {
        $lookup: { from: 'categories', localField: 'categoryId', foreignField: '_id', as: '_cat' },
      },
      {
        $addFields: {
          categoryName: { $ifNull: [{ $first: '$_cat.name' }, ''] },
          createdAtDate: { $toDate: '$createdAt' },
          stockStatus: {
            $switch: {
              branches: [
                { case: { $lte: ['$stock', 0] }, then: 'out_of_stock' },
                { case: { $lte: ['$stock', '$lowStockThreshold'] }, then: 'low_stock' },
              ],
              default: 'in_stock',
            },
          },
        },
      },
      { $project: { _cat: 0 } },
      { $match: match },
      { $sort: sortSpec(req.query, 'createdAt', 'desc', SORT_MAP) },
      {
        $facet: {
          items: [{ $skip: skip }, { $limit: pageSize }],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await ProductModel.aggregate(pipeline);
    const items = (result?.items ?? []) as ({ _id: string } & Product)[];
    const total = (result?.total?.[0]?.count ?? 0) as number;

    res.json(paginated(serializeMany(items, DERIVED), total, page, pageSize));
  }),
);

productRoutes.get(
  '/:id',
  requirePermission('products'),
  ah(async (req, res) => {
    const product = await ProductModel.findById(req.params.id).lean();
    if (!product) notFound('Product');
    res.json(serialize(product));
  }),
);

productRoutes.post(
  '/bulk',
  requirePermission('products', 'edit'),
  ah(async (req, res) => {
    const { action, ids, status } = req.body as {
      action: 'delete' | 'status' | 'feature' | 'unfeature';
      ids: string[];
      status?: Product['status'];
    };
    if (!ids?.length) badRequest('No products selected');

    if (action === 'delete') {
      const doomed = await ProductModel.find({ _id: { $in: ids } }, { images: 1 }).lean();
      const publicIds = doomed.flatMap((product) =>
        (product.images ?? []).map((image) => image?.publicId).filter((id): id is string => Boolean(id)),
      );

      const result = await ProductModel.deleteMany({ _id: { $in: ids } });
      void reapUnreferenced(publicIds, ids);

      res.json({ affected: result.deletedCount ?? 0 });
      return;
    }

    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (action === 'status' && status) update.status = status;
    if (action === 'feature') update.featured = true;
    if (action === 'unfeature') update.featured = false;

    const result = await ProductModel.updateMany({ _id: { $in: ids } }, { $set: update });
    res.json({ affected: result.modifiedCount ?? 0 });
  }),
);

productRoutes.post(
  '/',
  requirePermission('products', 'create'),
  ah(async (req, res) => {
    const payload = usableImages(clean(req.body as Partial<Product>));
    if (!payload.name) badRequest('Product name is required');

    const slug = payload.slug || slugify(payload.name);
    const variants = payload.variants ?? [];

    const created = await ProductModel.create({
      _id: nextId('prd'),
      brand: 'SOPII',
      taxRate: 12,
      lowStockThreshold: 10,
      details: { countryOfOrigin: 'India' },
      seo: {},
      status: 'draft',
      ...payload,
      slug,
      sku: payload.sku || `SOP-${slug.slice(0, 6).toUpperCase()}-${Date.now() % 10000}`,
      stock: variants.length
        ? variants.reduce((sum, variant) => sum + (variant.stock || 0), 0)
        : (payload.stock ?? 0),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    res.status(201).json(created.toJSON());
  }),
);

productRoutes.post(
  '/:id/duplicate',
  requirePermission('products', 'create'),
  ah(async (req, res) => {
    const source = await ProductModel.findById(req.params.id).lean();
    if (!source) notFound('Product');

    const { _id, ...rest } = source;
    const copy = await ProductModel.create({
      ...rest,
      _id: nextId('prd'),
      name: `${source.name} (Copy)`,
      sku: `${source.sku}-C`,
      slug: `${source.slug}-copy`,
      status: 'draft',
      unitsSold: 0,
      revenue: 0,
      reviewCount: 0,
      rating: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    res.status(201).json(copy.toJSON());
  }),
);

productRoutes.put(
  '/:id',
  requirePermission('products', 'edit'),
  ah(async (req, res) => {
    const product = await ProductModel.findById(req.params.id);
    if (!product) notFound('Product');

    /*
     * Snapshot before the edit, so replaced and removed images can be traced
     * back to the assets nothing will reference once this save lands.
     *
     * `toObject()`, not a spread: a gallery entry is a Mongoose subdocument,
     * and spreading one copies its internals (`$__`, `_doc`, `__parentArray`)
     * rather than its schema fields — so `publicId` came back undefined and
     * nothing was ever reaped.
     */
    const previousImages = (product.toObject().images ?? []) as Product['images'];

    product.set(usableImages(clean(req.body as Partial<Product>)));
    // Variant stock is the source of truth once variants exist.
    if (product.variants?.length) {
      product.stock = product.variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
    }
    product.updatedAt = nowIso();
    await product.save();

    const saved = product.toJSON() as unknown as Product;

    /*
     * Only after the write succeeded — a failed save must not take the assets
     * the unchanged record still points at with it.
     *
     * And `reapUnreferenced` rather than `reap`, because an asset can be shared:
     * the media picker copies a library reference instead of re-uploading, and
     * the migration files a `/media/...` file once and points every record that
     * used that path at the one asset. Destroying on "this product stopped
     * referencing it" would blank the images on every other product that still
     * does. Passing no deleted ids means the query counts this product's own
     * newly-saved gallery too, which is exactly right.
     */
    void reapUnreferenced(orphanedPublicIds(previousImages, saved.images ?? []), []);

    res.json(saved);
  }),
);

productRoutes.delete(
  '/:id',
  requirePermission('products', 'delete'),
  ah(async (req, res) => {
    const removed = await ProductModel.findByIdAndDelete(req.params.id).lean();
    if (!removed) notFound('Product');

    void reapUnreferenced(
      (removed.images ?? [])
        .map((image) => image?.publicId)
        .filter((id): id is string => Boolean(id)),
      [removed._id],
    );

    res.json({ id: removed._id });
  }),
);
