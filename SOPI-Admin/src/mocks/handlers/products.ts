import type { Product } from '@/types';
import { db, nextId, nowIso } from '../db';
import {
  applyPatch,
  badRequest,
  list,
  matchesSearch,
  notFound,
  num,
  paginate,
  route,
  sortBy,
} from '../utils';
import { slugify } from '@/utils/format';

function categoryName(product: Product) {
  return db.categories.find((c) => c.id === product.categoryId)?.name ?? '';
}

function stockStatusOf(product: Product) {
  if (product.stock <= 0) return 'out_of_stock';
  if (product.stock <= product.lowStockThreshold) return 'low_stock';
  return 'in_stock';
}

const accessor = (product: Product, key: string) => {
  switch (key) {
    case 'name':
      return product.name;
    case 'sku':
      return product.sku;
    case 'category':
      return categoryName(product);
    case 'price':
      return product.price;
    case 'stock':
      return product.stock;
    case 'status':
      return product.status;
    case 'unitsSold':
      return product.unitsSold;
    case 'revenue':
      return product.revenue;
    case 'createdAt':
      return new Date(product.createdAt).getTime();
    default:
      return (product as unknown as Record<string, string>)[key];
  }
};

function filterProducts(query: Record<string, string>) {
  const categoryIds = list(query.categoryId);
  const statuses = list(query.status);
  const stockStatuses = list(query.stockStatus);
  const collectionIds = list(query.collectionId);

  return db.products.filter((product) => {
    if (!matchesSearch(query.search, [product.name, product.sku, product.slug, ...product.tags]))
      return false;

    if (categoryIds.length) {
      const category = db.categories.find((c) => c.id === product.categoryId);
      const matched =
        categoryIds.includes(product.categoryId) ||
        (category?.parentId ? categoryIds.includes(category.parentId) : false);
      if (!matched) return false;
    }

    if (statuses.length && !statuses.includes(product.status)) return false;
    if (stockStatuses.length && !stockStatuses.includes(stockStatusOf(product))) return false;
    if (collectionIds.length && !collectionIds.some((id) => product.collectionIds.includes(id)))
      return false;

    const minPrice = num(query.minPrice, -Infinity);
    const maxPrice = num(query.maxPrice, Infinity);
    if (product.price < minPrice || product.price > maxPrice) return false;

    if (query.featured === 'true' && !product.featured) return false;

    return true;
  });
}

function blankProduct(): Product {
  return {
    id: nextId('prd'),
    name: '',
    sku: '',
    slug: '',
    categoryId: '',
    brand: 'SOPII',
    price: 0,
    mrp: 0,
    taxRate: 12,
    stock: 0,
    lowStockThreshold: 10,
    reserved: 0,
    trackInventory: true,
    allowBackorders: false,
    variants: [],
    images: [],
    details: { countryOfOrigin: 'India' },
    seo: {},
    status: 'draft',
    featured: false,
    collectionIds: [],
    tags: [],
    rating: 0,
    reviewCount: 0,
    unitsSold: 0,
    revenue: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export const productRoutes = [
  route('GET', '/products', ({ query }) => {
    const filtered = filterProducts(query);
    const sorted = sortBy(filtered, query.sortBy ?? 'createdAt', query.sortDir ?? 'desc', accessor);
    return paginate(sorted, num(query.page, 1), num(query.pageSize, 10));
  }),

  route('GET', '/products/:id', ({ params }) => {
    const product = db.products.find((p) => p.id === params.id);
    if (!product) notFound('Product');
    return product;
  }),

  route('POST', '/products', ({ body }) => {
    const payload = body as Partial<Product>;
    if (!payload.name) badRequest('Product name is required');

    const product = applyPatch(blankProduct(), payload);
    product.slug = payload.slug || slugify(product.name);
    product.sku = payload.sku || `SOP-${product.slug.slice(0, 6).toUpperCase()}-${Date.now() % 10000}`;
    product.stock = product.variants.length
      ? product.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
      : (payload.stock ?? 0);
    product.createdAt = nowIso();
    product.updatedAt = nowIso();

    db.products.unshift(product);
    return product;
  }),

  route('PUT', '/products/:id', ({ params, body }) => {
    const product = db.products.find((p) => p.id === params.id);
    if (!product) notFound('Product');

    applyPatch(product, body as Partial<Product>);
    if (product.variants.length) {
      product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    }
    product.updatedAt = nowIso();
    return product;
  }),

  route('DELETE', '/products/:id', ({ params }) => {
    const index = db.products.findIndex((p) => p.id === params.id);
    if (index === -1) notFound('Product');
    const [removed] = db.products.splice(index, 1);
    return { id: removed.id };
  }),

  route('POST', '/products/:id/duplicate', ({ params }) => {
    const source = db.products.find((p) => p.id === params.id);
    if (!source) notFound('Product');

    const copy: Product = {
      ...structuredClone(source),
      id: nextId('prd'),
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
    };
    db.products.unshift(copy);
    return copy;
  }),

  route('POST', '/products/bulk', ({ body }) => {
    const { action, ids, status } = body as {
      action: 'delete' | 'status' | 'feature' | 'unfeature';
      ids: string[];
      status?: Product['status'];
    };
    if (!ids?.length) badRequest('No products selected');

    if (action === 'delete') {
      const set = new Set(ids);
      for (let i = db.products.length - 1; i >= 0; i -= 1) {
        if (set.has(db.products[i].id)) db.products.splice(i, 1);
      }
      return { affected: ids.length };
    }

    const targets = db.products.filter((p) => ids.includes(p.id));
    targets.forEach((product) => {
      if (action === 'status' && status) product.status = status;
      if (action === 'feature') product.featured = true;
      if (action === 'unfeature') product.featured = false;
      product.updatedAt = nowIso();
    });
    return { affected: targets.length };
  }),
];
