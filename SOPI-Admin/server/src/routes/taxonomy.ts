import { Router } from 'express';
import type { Category, CategoryNode, Collection } from '@/types';
import { slugify } from '@/utils/format';
import { CategoryModel, CollectionModel, ProductModel } from '../db/models.js';
import { requirePermission } from '../lib/auth.js';
import {
  ah,
  badRequest,
  clean,
  nextId,
  notFound,
  nowIso,
  num,
  paginateArray,
  serialize,
  serializeMany,
  str,
} from '../lib/http.js';

/* -------------------------------- categories -------------------------------- */

export const categoryRoutes = Router();

type CategoryDoc = Category & { _id: string };

/** One grouped count query, then counts roll up from children to parents. */
async function productCounts() {
  const rows = await ProductModel.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

function withCounts(category: CategoryDoc, direct: Map<string, number>, all: CategoryDoc[]) {
  const own = direct.get(category._id) ?? 0;
  const nested = all
    .filter((child) => child.parentId === category._id)
    .reduce((sum, child) => sum + (direct.get(child._id) ?? 0), 0);
  return { ...category, productCount: own + nested };
}

async function loadCategories() {
  const [all, direct] = await Promise.all([
    CategoryModel.find().sort({ sortOrder: 1 }).lean<CategoryDoc[]>(),
    productCounts(),
  ]);
  return { all, direct };
}

async function buildTree(): Promise<CategoryNode[]> {
  const { all, direct } = await loadCategories();
  return all
    .filter((category) => category.parentId === null || category.parentId === undefined)
    .map((root) => ({
      ...(serialize(withCounts(root, direct, all)) as unknown as Category),
      children: all
        .filter((child) => child.parentId === root._id)
        .map((child) => ({
          ...(serialize(withCounts(child, direct, all)) as unknown as Category),
          children: [],
        })),
    }));
}

categoryRoutes.get(
  '/',
  requirePermission('categories'),
  ah(async (req, res) => {
    if (str(req.query, 'tree') === 'true') {
      res.json(await buildTree());
      return;
    }

    const { all, direct } = await loadCategories();
    const search = str(req.query, 'search')?.trim().toLowerCase();
    const status = str(req.query, 'status');
    const parentId = str(req.query, 'parentId');

    let rows = all.map((category) => withCounts(category, direct, all));
    if (search) {
      rows = rows.filter(
        (row) =>
          row.name.toLowerCase().includes(search) ||
          (row.slug ?? '').toLowerCase().includes(search),
      );
    }
    if (status) rows = rows.filter((row) => row.status === status);
    if (parentId) rows = rows.filter((row) => row.parentId === parentId);

    const sortBy = str(req.query, 'sortBy') ?? 'sortOrder';
    const dir = (str(req.query, 'sortDir') ?? 'asc') === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const left = (a as unknown as Record<string, string | number>)[sortBy];
      const right = (b as unknown as Record<string, string | number>)[sortBy];
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
      return String(left ?? '').localeCompare(String(right ?? ''), 'en', { numeric: true }) * dir;
    });

    res.json(serializeMany(rows));
  }),
);

categoryRoutes.put(
  '/reorder',
  requirePermission('categories', 'edit'),
  ah(async (req, res) => {
    const { ids } = req.body as { ids: string[] };
    await CategoryModel.bulkWrite(
      ids.map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { sortOrder: index } } },
      })),
    );
    res.json(await buildTree());
  }),
);

categoryRoutes.get(
  '/:id',
  requirePermission('categories'),
  ah(async (req, res) => {
    const { all, direct } = await loadCategories();
    const category = all.find((item) => item._id === req.params.id);
    if (!category) notFound('Category');
    res.json(serialize(withCounts(category, direct, all)));
  }),
);

categoryRoutes.post(
  '/',
  requirePermission('categories', 'create'),
  ah(async (req, res) => {
    const payload = clean(req.body as Partial<Category>);
    if (!payload.name) badRequest('Category name is required');

    const created = await CategoryModel.create({
      _id: nextId('cat'),
      ...payload,
      slug: payload.slug || slugify(payload.name),
      parentId: payload.parentId ?? null,
      sortOrder: payload.sortOrder ?? (await CategoryModel.estimatedDocumentCount()),
      status: payload.status ?? 'active',
      productCount: 0,
      createdAt: nowIso(),
    });

    res.status(201).json(created.toJSON());
  }),
);

categoryRoutes.put(
  '/:id',
  requirePermission('categories', 'edit'),
  ah(async (req, res) => {
    const patch = clean(req.body as Partial<Category>);
    if (patch.parentId === req.params.id) badRequest('A category cannot be its own parent');

    const updated = await CategoryModel.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true });
    if (!updated) notFound('Category');
    res.json(updated.toJSON());
  }),
);

categoryRoutes.delete(
  '/:id',
  requirePermission('categories', 'delete'),
  ah(async (req, res) => {
    const id = req.params.id;
    if (await CategoryModel.exists({ parentId: id })) {
      badRequest('Remove or reassign the subcategories first');
    }
    if (await ProductModel.exists({ categoryId: id })) {
      badRequest('This category still has products assigned to it');
    }
    const removed = await CategoryModel.findByIdAndDelete(id).lean();
    if (!removed) notFound('Category');
    res.json({ id: removed._id });
  }),
);

/* ------------------------------- collections -------------------------------- */

export const collectionRoutes = Router();

collectionRoutes.get(
  '/',
  requirePermission('collections'),
  ah(async (req, res) => {
    const search = str(req.query, 'search')?.trim().toLowerCase();
    const status = str(req.query, 'status');

    let rows = await CollectionModel.find(status ? { status } : {}).lean<
      (Collection & { _id: string })[]
    >();

    if (search) {
      rows = rows.filter((row) =>
        [row.name, row.slug, row.description].some((field) =>
          (field ?? '').toLowerCase().includes(search),
        ),
      );
    }

    const sortBy = str(req.query, 'sortBy') ?? 'sortOrder';
    const dir = (str(req.query, 'sortDir') ?? 'asc') === 'asc' ? 1 : -1;
    const value = (row: Collection & { _id: string }) => {
      if (sortBy === 'products') return row.productIds.length;
      if (sortBy === 'createdAt') return new Date(row.createdAt).getTime();
      return (row as unknown as Record<string, string | number>)[sortBy];
    };
    rows.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
      return String(left ?? '').localeCompare(String(right ?? ''), 'en', { numeric: true }) * dir;
    });

    const serialized = serializeMany(rows);
    // The collections screen asks for every card; product pickers page it.
    if (str(req.query, 'page')) {
      res.json(paginateArray(serialized, num(req.query, 'page', 1), num(req.query, 'pageSize', 12)));
      return;
    }
    res.json(serialized);
  }),
);

collectionRoutes.put(
  '/reorder',
  requirePermission('collections', 'edit'),
  ah(async (req, res) => {
    const { ids } = req.body as { ids: string[] };
    await CollectionModel.bulkWrite(
      ids.map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { sortOrder: index } } },
      })),
    );
    const rows = await CollectionModel.find().sort({ sortOrder: 1 }).lean();
    res.json(serializeMany(rows));
  }),
);

collectionRoutes.get(
  '/:id',
  requirePermission('collections'),
  ah(async (req, res) => {
    const collection = await CollectionModel.findById(req.params.id).lean();
    if (!collection) notFound('Collection');
    const products = await ProductModel.find({ _id: { $in: collection.productIds } }).lean();
    res.json({ ...serialize(collection), products: serializeMany(products) });
  }),
);

/** Keeps `product.collectionIds` in step with `collection.productIds`. */
async function syncMembership(collectionId: string, productIds: string[]) {
  await ProductModel.updateMany(
    { _id: { $in: productIds } },
    { $addToSet: { collectionIds: collectionId } },
  );
  await ProductModel.updateMany(
    { _id: { $nin: productIds }, collectionIds: collectionId },
    { $pull: { collectionIds: collectionId } },
  );
}

collectionRoutes.post(
  '/',
  requirePermission('collections', 'create'),
  ah(async (req, res) => {
    const payload = clean(req.body as Partial<Collection>);
    if (!payload.name) badRequest('Collection name is required');

    const created = await CollectionModel.create({
      _id: nextId('col'),
      ...payload,
      slug: payload.slug || slugify(payload.name),
      productIds: payload.productIds ?? [],
      status: payload.status ?? 'active',
      featured: payload.featured ?? false,
      sortOrder: await CollectionModel.estimatedDocumentCount(),
      createdAt: nowIso(),
    });

    await syncMembership(created._id, created.productIds ?? []);
    res.status(201).json(created.toJSON());
  }),
);

collectionRoutes.put(
  '/:id',
  requirePermission('collections', 'edit'),
  ah(async (req, res) => {
    const updated = await CollectionModel.findByIdAndUpdate(
      req.params.id,
      { $set: clean(req.body as Partial<Collection>) },
      { new: true },
    );
    if (!updated) notFound('Collection');

    await syncMembership(updated._id, updated.productIds ?? []);
    res.json(updated.toJSON());
  }),
);

collectionRoutes.delete(
  '/:id',
  requirePermission('collections', 'delete'),
  ah(async (req, res) => {
    const removed = await CollectionModel.findByIdAndDelete(req.params.id).lean();
    if (!removed) notFound('Collection');
    await ProductModel.updateMany(
      { collectionIds: removed._id },
      { $pull: { collectionIds: removed._id } },
    );
    res.json({ id: removed._id });
  }),
);
