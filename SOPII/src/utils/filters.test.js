import { describe, it, expect } from 'vitest';

import {
  EMPTY_FILTERS,
  applyFilters,
  buildFacets,
  countActiveFilters,
  parseFilters,
  serializeFilters,
  sortProducts,
} from './filters';

/*
 * Shop filtering and sorting (§6).
 * ===========================================================================
 * Filter state lives entirely in the URL, which is what makes a filtered view
 * shareable and survive a refresh. The property that matters most is therefore
 * the round trip: whatever `serializeFilters` writes, `parseFilters` has to
 * read back as the same filters. A drift between the two is a link that opens
 * on a different result set than the one the sender was looking at.
 */

const product = (over = {}) => ({
  id: 'prd_1',
  name: 'Kanjivaram Silk Saree',
  category: 'Sarees',
  subcategory: 'Silk Sarees',
  fabric: 'Silk',
  description: 'Handwoven in Kanchipuram.',
  occasions: ['Wedding'],
  colors: [{ name: 'Indigo' }],
  sizes: ['Free Size'],
  price: 4990,
  discount: 20,
  rating: 4.5,
  popularity: 50,
  inStock: true,
  badge: null,
  createdAt: '2026-01-01',
  ...over,
});

/* -------------------------------- the URL ---------------------------------- */

describe('parseFilters', () => {
  it('reads a comma-separated facet as a list', () => {
    const f = parseFilters(new URLSearchParams('category=Sarees,Lehengas'));
    expect(f.category).toEqual(['Sarees', 'Lehengas']);
  });

  it('drops empty entries left by a trailing comma', () => {
    const f = parseFilters(new URLSearchParams('fabric=Silk,,Cotton,'));
    expect(f.fabric).toEqual(['Silk', 'Cotton']);
  });

  it('reads numbers as numbers and nothing as null', () => {
    const f = parseFilters(new URLSearchParams('minPrice=1000&rating=4'));
    expect(f.minPrice).toBe(1000);
    expect(f.rating).toBe(4);
    expect(f.maxPrice).toBeNull();
  });

  it('ignores a non-numeric price rather than filtering on NaN', () => {
    // A hand-edited URL must not produce a comparison that hides every product.
    const f = parseFilters(new URLSearchParams('minPrice=cheap'));
    expect(f.minPrice).toBeNull();
  });

  it('reads availability as the boolean the UI holds', () => {
    expect(parseFilters(new URLSearchParams('availability=in-stock')).inStockOnly).toBe(true);
    expect(parseFilters(new URLSearchParams('availability=anything')).inStockOnly).toBe(false);
    expect(parseFilters(new URLSearchParams('')).inStockOnly).toBe(false);
  });

  it('defaults an absent sort to recommended', () => {
    expect(parseFilters(new URLSearchParams('')).sort).toBe('recommended');
  });

  it('reads an empty URL as the empty filter set', () => {
    expect(parseFilters(new URLSearchParams(''))).toEqual(EMPTY_FILTERS);
  });
});

describe('serializeFilters', () => {
  it('writes a list back as one comma-separated parameter', () => {
    const params = serializeFilters({ ...EMPTY_FILTERS, category: ['Sarees', 'Lehengas'] });
    expect(params.get('category')).toBe('Sarees,Lehengas');
  });

  it('omits the default sort, keeping a plain listing URL clean', () => {
    expect(serializeFilters({ ...EMPTY_FILTERS, sort: 'recommended' }).get('sort')).toBeNull();
    expect(serializeFilters({ ...EMPTY_FILTERS, sort: 'price-asc' }).get('sort')).toBe('price-asc');
  });

  it('removes a parameter when its filter is cleared', () => {
    // Unticking a facet has to delete the key, not write an empty one — an
    // empty `category=` reads back as no category, but leaves a URL that grows
    // every time somebody touches a filter.
    const params = serializeFilters({ ...EMPTY_FILTERS }, new URLSearchParams('category=Sarees'));
    expect(params.has('category')).toBe(false);
  });

  it('preserves parameters it does not own', () => {
    const params = serializeFilters({ ...EMPTY_FILTERS }, new URLSearchParams('utm_source=email'));
    expect(params.get('utm_source')).toBe('email');
  });

  it('round-trips every filter it can express', () => {
    const filters = {
      ...EMPTY_FILTERS,
      category: ['Sarees'],
      subcategory: ['Silk Sarees'],
      fabric: ['Silk', 'Cotton'],
      occasion: ['Wedding'],
      color: ['Indigo'],
      size: ['Free Size'],
      minPrice: 1000,
      maxPrice: 9000,
      rating: 4,
      inStockOnly: true,
      badge: 'Sale',
      q: 'kanjivaram',
      sort: 'price-desc',
    };

    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
  });
});

/* ------------------------------- filtering --------------------------------- */

describe('applyFilters', () => {
  const catalogue = [
    product({ id: 'a', category: 'Sarees', subcategory: 'Silk Sarees', fabric: 'Silk', price: 4990, rating: 4.5 }),
    product({ id: 'b', category: 'Lehengas', subcategory: 'Cotton Lehengas', fabric: 'Cotton', price: 1990, rating: 3.5 }),
    product({ id: 'c', category: 'Sarees', subcategory: 'Cotton Sarees', fabric: 'Cotton', price: 9990, rating: 5, inStock: false }),
  ];

  const ids = (filters) => applyFilters(catalogue, { ...EMPTY_FILTERS, ...filters }).map((p) => p.id);

  it('returns everything when nothing is filtered', () => {
    expect(ids({})).toEqual(['a', 'b', 'c']);
  });

  it('treats several values in one facet as OR', () => {
    expect(ids({ fabric: ['Silk', 'Cotton'] })).toEqual(['a', 'b', 'c']);
  });

  it('treats two different facets as AND', () => {
    expect(ids({ category: ['Sarees'], fabric: ['Cotton'] })).toEqual(['c']);
  });

  it('filters an inclusive price range', () => {
    // Boundaries included: a shopper who sets "up to ₹4990" expects to see the
    // ₹4990 product.
    expect(ids({ minPrice: 1990, maxPrice: 4990 })).toEqual(['a', 'b']);
  });

  it('filters by minimum rating', () => {
    expect(ids({ rating: 4 })).toEqual(['a', 'c']);
  });

  it('hides out-of-stock products only when asked', () => {
    expect(ids({ inStockOnly: true })).toEqual(['a', 'b']);
    expect(ids({ inStockOnly: false })).toEqual(['a', 'b', 'c']);
  });

  it('matches a query across name, category, subcategory, fabric and description', () => {
    // Every product shares the name and description, so these terms separate
    // the fields being searched rather than the products.
    expect(ids({ q: 'kanjivaram' })).toEqual(['a', 'b', 'c']); // description
    expect(ids({ q: 'lehengas' })).toEqual(['b']); // category
    expect(ids({ q: 'silk sarees' })).toEqual(['a']); // subcategory
    expect(ids({ q: 'cotton' })).toEqual(['b', 'c']); // fabric
  });

  it('matches a query case-insensitively and ignores surrounding space', () => {
    expect(ids({ q: '  LEHENGAS ' })).toEqual(['b']);
  });

  it('returns nothing rather than everything for a query that matches nothing', () => {
    expect(ids({ q: 'snowboard' })).toEqual([]);
  });

  it('matches a colour by name and a size by value', () => {
    expect(ids({ color: ['Indigo'] })).toEqual(['a', 'b', 'c']);
    expect(ids({ color: ['Chartreuse'] })).toEqual([]);
    expect(ids({ size: ['Free Size'] })).toEqual(['a', 'b', 'c']);
  });
});

/* -------------------------------- sorting ---------------------------------- */

describe('sortProducts', () => {
  const catalogue = [
    product({ id: 'mid', price: 4990, discount: 10, popularity: 10, createdAt: '2026-02-01' }),
    product({ id: 'cheap', price: 990, discount: 40, popularity: 90, createdAt: '2026-01-01' }),
    product({ id: 'dear', price: 9990, discount: 25, popularity: 50, createdAt: '2026-03-01' }),
  ];

  const ids = (sort) => sortProducts(catalogue, sort).map((p) => p.id);

  it('sorts by price in both directions', () => {
    expect(ids('price-asc')).toEqual(['cheap', 'mid', 'dear']);
    expect(ids('price-desc')).toEqual(['dear', 'mid', 'cheap']);
  });

  it('sorts newest first and by biggest saving', () => {
    expect(ids('newest')).toEqual(['dear', 'mid', 'cheap']);
    expect(ids('discount')).toEqual(['cheap', 'dear', 'mid']);
  });

  it('sorts by popularity', () => {
    expect(ids('popular')).toEqual(['cheap', 'dear', 'mid']);
  });

  it('does not mutate the list it was given', () => {
    // The caller holds the catalogue from context; sorting a listing must not
    // reorder it for every other component reading the same array.
    const before = catalogue.map((p) => p.id);
    sortProducts(catalogue, 'price-desc');
    expect(catalogue.map((p) => p.id)).toEqual(before);
  });

  it('falls back to recommended for an unknown sort from a hand-edited URL', () => {
    expect(ids('nonsense')).toEqual(ids('recommended'));
  });

  it('puts in-stock products before out-of-stock ones under recommended', () => {
    const mixed = [
      product({ id: 'out', inStock: false, popularity: 100 }),
      product({ id: 'in', inStock: true, popularity: 1 }),
    ];
    expect(sortProducts(mixed, 'recommended').map((p) => p.id)).toEqual(['in', 'out']);
  });

  it('ranks bestsellers above new above unbadged under recommended', () => {
    const badged = [
      product({ id: 'none', badge: null, popularity: 100 }),
      product({ id: 'new', badge: 'New', popularity: 100 }),
      product({ id: 'best', badge: 'Bestseller', popularity: 100 }),
    ];
    expect(sortProducts(badged, 'recommended').map((p) => p.id)).toEqual(['best', 'new', 'none']);
  });
});

/* --------------------------------- facets ---------------------------------- */

describe('buildFacets', () => {
  const catalogue = [
    product({ category: 'Sarees', fabric: 'Silk', price: 4990 }),
    product({ category: 'Sarees', fabric: 'Cotton', price: 990 }),
    product({ category: 'Lehengas', fabric: 'Silk', price: 9990 }),
  ];

  it('counts each facet value', () => {
    const facets = buildFacets(catalogue);
    expect(facets.category).toEqual([
      { value: 'Lehengas', count: 1 },
      { value: 'Sarees', count: 2 },
    ]);
  });

  it('reports the real price range of what is in scope', () => {
    expect(buildFacets(catalogue).priceRange).toEqual({ min: 990, max: 9990 });
  });

  it('reports a zero range for an empty result rather than Infinity', () => {
    // `Math.min()` of nothing is Infinity, which renders as a broken slider.
    expect(buildFacets([]).priceRange).toEqual({ min: 0, max: 0 });
  });

  it('omits a facet value no product carries', () => {
    const facets = buildFacets([product({ subcategory: null })]);
    expect(facets.subcategory).toEqual([]);
  });
});

describe('countActiveFilters', () => {
  it('counts nothing for the empty set', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it('counts each selected value, not each facet', () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, fabric: ['Silk', 'Cotton'] })).toBe(2);
  });

  it('counts each scalar filter once', () => {
    expect(
      countActiveFilters({
        ...EMPTY_FILTERS,
        minPrice: 1000,
        maxPrice: 5000,
        rating: 4,
        inStockOnly: true,
        badge: 'Sale',
      }),
    ).toBe(5);
  });

  it('does not count the query or the sort, which have their own controls', () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, q: 'silk', sort: 'price-asc' })).toBe(0);
  });
});
