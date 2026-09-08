import type { Category, CategoryNode, Collection } from '@/types';
import { db, nextId, nowIso } from '../db';
import { applyPatch, badRequest, matchesSearch, notFound, num, paginate, route, sortBy } from '../utils';
import { slugify } from '@/utils/format';

function withCounts(category: Category): Category {
  const direct = db.products.filter((p) => p.categoryId === category.id).length;
  const children = db.categories.filter((c) => c.parentId === category.id);
  const nested = children.reduce(
    (sum, child) => sum + db.products.filter((p) => p.categoryId === child.id).length,
    0,
  );
  return { ...category, productCount: direct + nested };
}

function buildTree(): CategoryNode[] {
  const sorted = [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const roots = sorted.filter((c) => c.parentId === null);
  return roots.map((root) => ({
    ...withCounts(root),
    children: sorted
      .filter((c) => c.parentId === root.id)
      .map((child) => ({ ...withCounts(child), children: [] })),
  }));
}

export const categoryRoutes = [
  route('GET', '/categories', ({ query }) => {
    if (query.tree === 'true') return buildTree();
    const filtered = db.categories
      .filter((c) => matchesSearch(query.search, [c.name, c.slug]))
      .filter((c) => (query.status ? c.status === query.status : true))
      .filter((c) => (query.parentId ? c.parentId === query.parentId : true))
      .map(withCounts);
    return sortBy(filtered, query.sortBy ?? 'sortOrder', query.sortDir ?? 'asc', (c, key) =>
      key === 'sortOrder' ? c.sortOrder : (c as unknown as Record<string, string>)[key],
    );
  }),

  route('GET', '/categories/:id', ({ params }) => {
    const category = db.categories.find((c) => c.id === params.id);
    if (!category) notFound('Category');
    return withCounts(category);
  }),

  route('POST', '/categories', ({ body }) => {
    const payload = body as Partial<Category>;
    if (!payload.name) badRequest('Category name is required');

    const category: Category = {
      id: nextId('cat'),
      name: payload.name,
      slug: payload.slug || slugify(payload.name),
      description: payload.description,
      image: payload.image,
      parentId: payload.parentId ?? null,
      sortOrder: payload.sortOrder ?? db.categories.length,
      status: payload.status ?? 'active',
      productCount: 0,
      createdAt: nowIso(),
    };
    db.categories.push(category);
    return category;
  }),

  route('PUT', '/categories/:id', ({ params, body }) => {
    const category = db.categories.find((c) => c.id === params.id);
    if (!category) notFound('Category');
    const patch = body as Partial<Category>;
    if (patch.parentId === params.id) badRequest('A category cannot be its own parent');
    applyPatch(category, patch);
    return withCounts(category);
  }),

  route('DELETE', '/categories/:id', ({ params }) => {
    const index = db.categories.findIndex((c) => c.id === params.id);
    if (index === -1) notFound('Category');
    if (db.categories.some((c) => c.parentId === params.id)) {
      badRequest('Remove or reassign the subcategories first');
    }
    if (db.products.some((p) => p.categoryId === params.id)) {
      badRequest('This category still has products assigned to it');
    }
    const [removed] = db.categories.splice(index, 1);
    return { id: removed.id };
  }),

  route('PUT', '/categories/reorder', ({ body }) => {
    const { ids } = body as { ids: string[] };
    ids.forEach((id, index) => {
      const category = db.categories.find((c) => c.id === id);
      if (category) category.sortOrder = index;
    });
    return buildTree();
  }),
];

/* ------------------------------- collections ------------------------------- */

export const collectionRoutes = [
  route('GET', '/collections', ({ query }) => {
    const filtered = db.collections
      .filter((c) => matchesSearch(query.search, [c.name, c.slug, c.description]))
      .filter((c) => (query.status ? c.status === query.status : true));
    const sorted = sortBy(filtered, query.sortBy ?? 'sortOrder', query.sortDir ?? 'asc', (c, key) =>
      key === 'sortOrder'
        ? c.sortOrder
        : key === 'products'
          ? c.productIds.length
          : key === 'createdAt'
            ? new Date(c.createdAt).getTime()
            : (c as unknown as Record<string, string>)[key],
    );
    if (query.page) return paginate(sorted, num(query.page, 1), num(query.pageSize, 12));
    return sorted;
  }),

  route('GET', '/collections/:id', ({ params }) => {
    const collection = db.collections.find((c) => c.id === params.id);
    if (!collection) notFound('Collection');
    return {
      ...collection,
      products: collection.productIds
        .map((id) => db.products.find((p) => p.id === id))
        .filter(Boolean),
    };
  }),

  route('POST', '/collections', ({ body }) => {
    const payload = body as Partial<Collection>;
    if (!payload.name) badRequest('Collection name is required');

    const collection: Collection = {
      id: nextId('col'),
      name: payload.name,
      slug: payload.slug || slugify(payload.name),
      description: payload.description,
      banner: payload.banner,
      productIds: payload.productIds ?? [],
      startDate: payload.startDate,
      endDate: payload.endDate,
      status: payload.status ?? 'active',
      featured: payload.featured ?? false,
      sortOrder: db.collections.length,
      createdAt: nowIso(),
    };
    db.collections.push(collection);
    collection.productIds.forEach((id) => {
      const product = db.products.find((p) => p.id === id);
      if (product && !product.collectionIds.includes(collection.id)) {
        product.collectionIds.push(collection.id);
      }
    });
    return collection;
  }),

  route('PUT', '/collections/:id', ({ params, body }) => {
    const collection = db.collections.find((c) => c.id === params.id);
    if (!collection) notFound('Collection');
    const previous = new Set(collection.productIds);
    applyPatch(collection, body as Partial<Collection>);

    const next = new Set(collection.productIds);
    db.products.forEach((product) => {
      const shouldHave = next.has(product.id);
      const had = previous.has(product.id) || product.collectionIds.includes(collection.id);
      if (shouldHave && !product.collectionIds.includes(collection.id)) {
        product.collectionIds.push(collection.id);
      } else if (!shouldHave && had) {
        product.collectionIds = product.collectionIds.filter((id) => id !== collection.id);
      }
    });
    return collection;
  }),

  route('DELETE', '/collections/:id', ({ params }) => {
    const index = db.collections.findIndex((c) => c.id === params.id);
    if (index === -1) notFound('Collection');
    const [removed] = db.collections.splice(index, 1);
    db.products.forEach((product) => {
      product.collectionIds = product.collectionIds.filter((id) => id !== removed.id);
    });
    return { id: removed.id };
  }),

  route('PUT', '/collections/reorder', ({ body }) => {
    const { ids } = body as { ids: string[] };
    ids.forEach((id, index) => {
      const collection = db.collections.find((c) => c.id === id);
      if (collection) collection.sortOrder = index;
    });
    return db.collections;
  }),
];
