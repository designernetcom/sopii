/**
 * Catalogue selectors.
 * ===========================================================================
 * Pure functions over a product list — no module-level dataset, because the
 * catalogue now arrives from the API at runtime (see `context/CatalogContext`).
 * The bundled `data/products.js` list is passed through these same helpers when
 * the API is unreachable, so both paths behave identically.
 */

/**
 * Resolves a product from whatever the URL carries.
 *
 * Product pages are addressed by slug — `/product/ivory-chanderi-saree-12` —
 * because that is the URL a search engine and a shopper can both read. The id
 * is still accepted so older links, and anything that only has the id to hand,
 * keep working.
 */
export const getProductById = (products, key) => {
  if (!key) return undefined;
  return products.find(
    (p) => p.slug === key || p.seo?.slug === key || p.id === key,
  );
};

/** The address a product lives at. Slug first, id only as a fallback. */
export const productPath = (product) =>
  `/product/${product?.seo?.slug || product?.slug || product?.id || ''}`;

export const getProductsByCategory = (products, category) =>
  products.filter((p) => p.category === category);

export const getNewArrivals = (products, limit = 12) =>
  [...products].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);

export const getBestsellers = (products, limit = 12) =>
  products
    .filter((p) => p.badge === 'Bestseller')
    .concat([...products].sort((a, b) => b.popularity - a.popularity))
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
    .slice(0, limit);

/** Sale threshold — tuned so the Sale page is a curated edit, not the catalogue. */
export const SALE_MIN_DISCOUNT = 23;

export const getOnSale = (products, limit) => {
  const list = products
    .filter((p) => p.discount >= SALE_MIN_DISCOUNT)
    .sort((a, b) => b.discount - a.discount);
  return limit ? list.slice(0, limit) : list;
};

/** Same category first, then anything sharing an occasion tag. */
export function getRelatedProducts(products, product, limit = 8) {
  if (!product) return [];

  const sameCategory = products.filter(
    (p) => p.id !== product.id && p.category === product.category,
  );
  const sharedOccasion = products.filter(
    (p) =>
      p.id !== product.id &&
      p.category !== product.category &&
      p.occasions.some((o) => product.occasions.includes(o)),
  );

  return [...sameCategory, ...sharedOccasion].slice(0, limit);
}

/** "Complete the look" — deliberately pulls from *other* categories. */
export function getCompleteTheLook(products, product, limit = 4) {
  if (!product) return [];

  /* Prefer the accessory-ish categories, but fall back to whatever else the
     catalogue actually holds — the category names come from the admin panel
     now, so they cannot be assumed. */
  const preferred = ['Jewellery', 'Accessories', 'Blouses'];
  const others = [...new Set(products.map((p) => p.category))].filter(
    (name) => name !== product.category && !preferred.includes(name),
  );

  return [...preferred, ...others]
    .flatMap((category) =>
      products.filter((p) => p.category === category && p.id !== product.id).slice(0, 2),
    )
    .slice(0, limit);
}

/** Lightweight weighted search across the fields shoppers actually type. */
export function searchProducts(products, query, limit = 24) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);

  return products
    .map((p) => {
      const haystack = [
        p.name,
        p.category,
        p.subcategory,
        p.fabric,
        p.description,
        p.occasions.join(' '),
        p.colors.map((c) => c.name).join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      let score = 0;
      terms.forEach((term) => {
        if (p.name.toLowerCase().includes(term)) score += 6;
        else if (p.category.toLowerCase().includes(term)) score += 4;
        else if (p.fabric.toLowerCase().includes(term)) score += 3;
        else if (haystack.includes(term)) score += 1;
      });

      return { product: p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.product.popularity - a.product.popularity)
    .slice(0, limit)
    .map((r) => r.product);
}

/**
 * Products in a collection.
 *
 * Admin collections curate an explicit product list; the bundled fallback
 * collections declare a filter instead. Both are supported so the shop renders
 * the same either way.
 */
export function resolveCollection(collection, products) {
  if (!collection) return [];

  if (collection.productIds?.length) {
    const ids = new Set(collection.productIds);
    return products.filter((p) => ids.has(p.id) || p.collectionIds?.includes(collection.id));
  }

  const { filter } = collection;
  if (!filter) return [];

  return products.filter((p) => {
    if (filter.occasion && !p.occasions.includes(filter.occasion)) return false;
    if (filter.fabric && !filter.fabric.includes(p.fabric)) return false;
    if (filter.badge && p.badge !== filter.badge) return false;
    if (filter.category && p.category !== filter.category) return false;
    return true;
  });
}
