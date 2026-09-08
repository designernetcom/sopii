import { SIZE_ORDER } from '../data/categories';

/**
 * Shop filtering + sorting.
 * ---------------------------------------------------------------------------
 * Filter state lives entirely in the URL, so every filtered view is
 * shareable, bookmarkable and survives a refresh. These helpers translate
 * between URLSearchParams and a plain filter object.
 */

export const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Popular' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'discount', label: 'Biggest Saving' },
];

/** Multi-value facets are comma-separated in the URL. */
const MULTI_KEYS = ['category', 'subcategory', 'fabric', 'occasion', 'color', 'size'];

export function parseFilters(searchParams) {
  const get = (key) => searchParams.get(key) || '';
  const getMulti = (key) =>
    get(key)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    category: getMulti('category'),
    // The admin's child categories ("Cotton Sarees" under "Sarees").
    subcategory: getMulti('subcategory'),
    fabric: getMulti('fabric'),
    occasion: getMulti('occasion'),
    color: getMulti('color'),
    size: getMulti('size'),
    minPrice: Number(get('minPrice')) || null,
    maxPrice: Number(get('maxPrice')) || null,
    rating: Number(get('rating')) || null,
    inStockOnly: get('availability') === 'in-stock',
    badge: get('badge') || null,
    q: get('q'),
    sort: get('sort') || 'recommended',
  };
}

/** Writes a filter object back onto URLSearchParams, dropping empty values. */
export function serializeFilters(filters, base = new URLSearchParams()) {
  const params = new URLSearchParams(base);

  MULTI_KEYS.forEach((key) => {
    const value = filters[key];
    if (value?.length) params.set(key, value.join(','));
    else params.delete(key);
  });

  const setOrDelete = (key, value) => {
    if (value) params.set(key, String(value));
    else params.delete(key);
  };

  setOrDelete('minPrice', filters.minPrice);
  setOrDelete('maxPrice', filters.maxPrice);
  setOrDelete('rating', filters.rating);
  setOrDelete('availability', filters.inStockOnly ? 'in-stock' : null);
  setOrDelete('badge', filters.badge);
  setOrDelete('q', filters.q);
  setOrDelete('sort', filters.sort !== 'recommended' ? filters.sort : null);

  return params;
}

export function applyFilters(products, filters) {
  const q = filters.q?.trim().toLowerCase();

  return products.filter((p) => {
    if (filters.category.length && !filters.category.includes(p.category)) return false;
    if (filters.subcategory.length && !filters.subcategory.includes(p.subcategory)) return false;
    if (filters.fabric.length && !filters.fabric.includes(p.fabric)) return false;
    if (filters.occasion.length && !filters.occasion.some((o) => p.occasions.includes(o))) {
      return false;
    }
    if (filters.color.length && !filters.color.some((c) => p.colors.some((pc) => pc.name === c))) {
      return false;
    }
    if (filters.size.length && !filters.size.some((s) => p.sizes.includes(s))) return false;

    if (filters.minPrice && p.price < filters.minPrice) return false;
    if (filters.maxPrice && p.price > filters.maxPrice) return false;
    if (filters.rating && p.rating < filters.rating) return false;
    if (filters.inStockOnly && !p.inStock) return false;
    if (filters.badge && p.badge !== filters.badge) return false;

    if (q) {
      const haystack =
        `${p.name} ${p.category} ${p.subcategory ?? ''} ${p.fabric} ${p.description}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

export function sortProducts(products, sort) {
  const list = [...products];

  switch (sort) {
    case 'newest':
      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    case 'popular':
      return list.sort((a, b) => b.popularity - a.popularity);
    case 'price-asc':
      return list.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return list.sort((a, b) => b.price - a.price);
    case 'discount':
      return list.sort((a, b) => b.discount - a.discount);
    case 'recommended':
    default:
      /* In-stock first, then badged products, then by popularity — a
         reasonable stand-in for a real merchandising ranking. */
      return list.sort((a, b) => {
        if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
        const rank = (p) => (p.badge === 'Bestseller' ? 0 : p.badge === 'New' ? 1 : 2);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return b.popularity - a.popularity;
      });
  }
}

/** Builds the facet lists (with counts) from whatever products are in scope. */
export function buildFacets(products) {
  const tally = (getValues) => {
    const map = new Map();
    products.forEach((p) => {
      getValues(p).forEach((v) => map.set(v, (map.get(v) || 0) + 1));
    });
    return [...map.entries()].map(([value, count]) => ({ value, count }));
  };

  const byName = (a, b) => a.value.localeCompare(b.value);

  return {
    category: tally((p) => [p.category]).sort(byName),
    subcategory: tally((p) => (p.subcategory ? [p.subcategory] : [])).sort(byName),
    fabric: tally((p) => [p.fabric]).sort(byName),
    occasion: tally((p) => p.occasions).sort(byName),
    color: tally((p) => p.colors.map((c) => c.name)).sort(byName),
    size: tally((p) => p.sizes).sort(
      (a, b) => SIZE_ORDER.indexOf(a.value) - SIZE_ORDER.indexOf(b.value),
    ),
    priceRange: products.length
      ? {
          min: Math.min(...products.map((p) => p.price)),
          max: Math.max(...products.map((p) => p.price)),
        }
      : { min: 0, max: 0 },
  };
}

/** Count of active filters, used for the mobile "Filters (3)" pill. */
export function countActiveFilters(filters) {
  return (
    filters.category.length +
    filters.subcategory.length +
    filters.fabric.length +
    filters.occasion.length +
    filters.color.length +
    filters.size.length +
    (filters.minPrice ? 1 : 0) +
    (filters.maxPrice ? 1 : 0) +
    (filters.rating ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0) +
    (filters.badge ? 1 : 0)
  );
}

export const EMPTY_FILTERS = {
  category: [],
  subcategory: [],
  fabric: [],
  occasion: [],
  color: [],
  size: [],
  minPrice: null,
  maxPrice: null,
  rating: null,
  inStockOnly: false,
  badge: null,
  q: '',
  sort: 'recommended',
};
