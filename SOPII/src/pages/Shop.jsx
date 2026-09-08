import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { useCatalog } from '../context/CatalogContext';
import {
  applyFilters,
  buildFacets,
  countActiveFilters,
  parseFilters,
  serializeFilters,
  sortProducts,
  SORT_OPTIONS,
} from '../utils/filters';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { FilterPanel } from '../components/Filters/FilterPanel';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { CategorySEO } from '../components/SEO/CategorySEO';
import { EmptyState } from '../components/ui/EmptyState';
import { ProductTileSkeletons } from '../components/ui/PageSkeletons';
import NotFound from './NotFound';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { useFocusTrap } from '../hooks/useFocusTrap';

const PAGE_SIZE = 12;

/**
 * Preset scopes. Each route (/sarees, /sale, …) renders this same page with a
 * different preset, so filtering and sorting behave identically everywhere.
 *
 * `scope` receives the live catalogue helpers from `useCatalog()`, so a preset
 * always reflects what the admin panel currently publishes — including the
 * category names, which are the admin's top-level categories rather than a
 * list hard-coded here.
 */
/** Each preset's canonical route, so the SEO layer never guesses it. */
const PRESET_PATHS = {
  shop: '/shop',
  'new-arrivals': '/new-arrivals',
  bestsellers: '/bestsellers',
  sale: '/sale',
  sarees: '/sarees',
  blouses: '/blouses',
  women: '/women',
};

/**
 * The three curated category routes above are Category records too, so their
 * metadata comes from the record rather than from a `seo_pages` row. This maps
 * a preset key to the category slug it renders, and `categorySlug` covers every
 * other category through the `/:categorySlug` route.
 */
/** Stands in while an unknown category slug is on its way to a 404. */
const EMPTY_CONFIG = { title: '', blurb: '', crumb: '', scope: () => [] };

const PRESET_CATEGORY_SLUGS = {
  sarees: 'sarees',
  blouses: 'blouses',
  women: 'women',
};

const PRESETS = {
  shop: {
    title: 'Shop All',
    blurb: 'The full SOPII collection — sarees, blouses, ready-to-wear and accessories.',
    crumb: 'Shop',
    scope: ({ products }) => products,
  },
  'new-arrivals': {
    title: 'New Arrivals',
    blurb: 'Fresh off the loom and into the studio. The newest pieces, first.',
    crumb: 'New Arrivals',
    scope: ({ getNewArrivals }) => getNewArrivals(28),
    defaultSort: 'newest',
  },
  bestsellers: {
    title: 'Bestsellers',
    blurb: 'The pieces our customers come back for, ranked by what actually sells.',
    crumb: 'Bestsellers',
    scope: ({ getBestsellers }) => getBestsellers(28),
    defaultSort: 'popular',
  },
  sale: {
    title: 'Sale',
    blurb: 'A curated markdown edit. Limited pieces, while stocks last.',
    crumb: 'Sale',
    scope: ({ getOnSale }) => getOnSale(),
    defaultSort: 'discount',
  },
  sarees: {
    title: 'Sarees',
    blurb: 'Explore our collection of contemporary sarees — handloom, silk, cotton and more.',
    crumb: 'Sarees',
    scope: ({ products }) => products.filter((p) => p.category === 'Sarees'),
  },
  blouses: {
    title: 'Blouses',
    blurb: 'The piece that finishes the drape. Structured, lined and made to fit.',
    crumb: 'Blouses',
    scope: ({ products }) => products.filter((p) => p.category === 'Blouses'),
  },
  women: {
    title: 'Women',
    blurb: 'Dresses, kurta sets, co-ords and blouses for every day of the week.',
    crumb: 'Women',
    scope: ({ products }) =>
      products.filter((p) =>
        ['Women', 'Dresses', 'Kurta Sets', 'Co-ords', 'Blouses'].includes(p.category),
      ),
  },
};

export default function Shop({ preset = 'shop', categorySlug }) {
  const catalog = useCatalog();

  /* A category route builds its own config from the record, so adding a
     category in the panel gives it a page without a code change. */
  const category = useMemo(() => {
    const slug = categorySlug || PRESET_CATEGORY_SLUGS[preset];
    if (!slug) return null;
    /* `categories` is the navigation tree — roots with their children nested —
       so a child category such as `dresses` is only found by looking through
       both levels. Every category in the sitemap has to resolve here, or the
       sitemap would advertise URLs that 404.
       `depth` matters downstream: a product carries its *top* category in
       `category` and its child in `subcategory`, so the two levels have to be
       matched against different fields. */
    for (const root of catalog.categories) {
      if (root.slug === slug) return { ...root, depth: 'root' };
      const child = (root.children ?? []).find((item) => item.slug === slug);
      if (child) return { ...child, depth: 'child', parentName: root.name, parentSlug: root.slug };
    }
    return null;
  }, [catalog.categories, categorySlug, preset]);

  const resolved = useMemo(() => {
    if (!categorySlug) return PRESETS[preset] || PRESETS.shop;
    if (!category) return null;
    return {
      title: category.name,
      blurb: category.blurb || `${category.name} from the SOPII studio.`,
      crumb: category.name,
      scope: ({ products }) =>
        products.filter((p) =>
          category.depth === 'child'
            ? p.subcategory === category.name
            : p.category === category.name,
        ),
    };
  }, [categorySlug, preset, category]);

  /* `/:categorySlug` matches any single segment, so an unknown slug lands here
     rather than on the 404 route. The hooks below still have to run — React
     does not allow an early return above them — so the page falls back to an
     empty scope and renders NotFound at the end. */
  const unknownCategory = Boolean(categorySlug) && !resolved;
  const config = resolved ?? EMPTY_CONFIG;
  const [searchParams, setSearchParams] = useSearchParams();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const drawerRef = useRef(null);

  useLockBodyScroll(mobileFiltersOpen);
  useFocusTrap(drawerRef, mobileFiltersOpen);

  const filters = useMemo(() => {
    const parsed = parseFilters(searchParams);
    // A preset's natural sort wins until the shopper picks one themselves.
    if (!searchParams.get('sort') && config.defaultSort) parsed.sort = config.defaultSort;
    return parsed;
  }, [searchParams, config.defaultSort]);

  const scope = useMemo(() => config.scope(catalog), [config, catalog]);
  const facets = useMemo(() => buildFacets(scope), [scope]);

  const results = useMemo(
    () => sortProducts(applyFilters(scope, filters), filters.sort),
    [scope, filters],
  );

  const activeCount = countActiveFilters(filters);

  // A new filter selection should always start from the top of the results.
  useEffect(() => setVisible(PAGE_SIZE), [searchParams, preset]);

  const updateFilters = (next) => {
    setSearchParams(serializeFilters(next, new URLSearchParams()), { replace: true });
  };

  const clearAll = () => setSearchParams(new URLSearchParams(), { replace: true });

  const filterProps = {
    filters,
    facets,
    onChange: updateFilters,
    priceBounds: facets.priceRange,
  };

  if (unknownCategory) return <NotFound />;

  /* A child category sits under its parent, so both the visible trail and the
     BreadcrumbList reflect the real hierarchy rather than a flat two-step. */
  const crumbs = [
    { label: 'Home', to: '/' },
    ...(category?.depth === 'child' && category.parentName
      ? [{ label: category.parentName, to: `/${category.parentSlug ?? ''}` }]
      : []),
    { label: config.crumb },
  ];

  return (
    <div className="container-site py-6 lg:py-10">
      {/* `filtered` keeps the canonical on the clean route and drops the
          faceted view out of the index — one listing, not a hundred. */}
      <CategorySEO
        /* A category page's metadata comes from the Category record; the
           curated rails have a `seo_pages` row keyed on their path instead. */
        record={category}
        title={config.title}
        description={config.blurb}
        path={category ? `/${category.slug}` : PRESET_PATHS[preset] || '/shop'}
        products={results}
        breadcrumbs={crumbs}
        filtered={activeCount > 0 || Boolean(searchParams.get('sort'))}
      />

      <Breadcrumbs items={crumbs} />

      <header className="mt-5 border-b border-beige pb-6 lg:pb-8">
        <h1 className="font-display text-3xl sm:text-4xl lg:text-[46px]">{config.title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-charcoal-muted sm:text-base">{config.blurb}</p>
      </header>

      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-10 xl:grid-cols-[268px_1fr] xl:gap-14">
        {/* ---------------------------- Desktop filters --------------------- */}
        <aside className="hidden lg:block lg:py-8" aria-label="Product filters">
          <div className="sticky top-28">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[11px] font-medium uppercase tracking-widest2">Filters</h2>
              {activeCount > 0 ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11px] text-clay underline underline-offset-4 hover:text-charcoal"
                >
                  Clear all
                </button>
              ) : null}
            </div>
            <div className="mt-4 max-h-[calc(100vh-13rem)] overflow-y-auto pr-2">
              <FilterPanel {...filterProps} />
            </div>
          </div>
        </aside>

        {/* -------------------------------- Results ------------------------- */}
        <section className="min-w-0 py-6 lg:py-8" aria-labelledby="products-heading">
          {/* The grid's own heading. Visually redundant beside the page title,
              but it is the <h2> that keeps the outline from jumping straight
              from the page <h1> to each card's <h3>. */}
          <h2 id="products-heading" className="sr-only">
            Products
          </h2>

          {/* Toolbar */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-beige pb-4 lg:border-0 lg:pb-0">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="flex items-center gap-2 border border-beige px-4 py-2.5 text-[11px] font-medium uppercase tracking-widest2 lg:hidden"
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              Filters
              {activeCount > 0 ? (
                <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-charcoal px-1 text-[9px] text-cream">
                  {activeCount}
                </span>
              ) : null}
            </button>

            <p className="hidden text-[12px] text-charcoal-muted lg:block" aria-live="polite">
              {results.length} {results.length === 1 ? 'product' : 'products'}
            </p>

            {/* Takes whatever width is left beside the Filters button, so the
                labels stay readable at 390px without overflowing at 320px. */}
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
              {/* `sr-only`, not `hidden`: `display: none` removes the label
                  from the accessibility tree as well as the screen, which left
                  the sort control with no accessible name on every phone. */}
              <label
                htmlFor="sort"
                className="sr-only shrink-0 text-[11px] uppercase tracking-widest2 text-charcoal-muted sm:not-sr-only sm:block"
              >
                Sort
              </label>
              <select
                id="sort"
                value={filters.sort}
                onChange={(e) => updateFilters({ ...filters, sort: e.target.value })}
                className="w-full min-w-0 max-w-[240px] border border-beige bg-cream px-3 py-2.5 text-[11px] uppercase tracking-widest2 outline-none focus:border-charcoal sm:w-auto sm:max-w-none"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active filter chips */}
          {activeCount > 0 ? (
            <ul className="mb-5 flex flex-wrap items-center gap-2">
              {[
                ...filters.category.map((v) => ['category', v]),
                ...filters.subcategory.map((v) => ['subcategory', v]),
                ...filters.fabric.map((v) => ['fabric', v]),
                ...filters.occasion.map((v) => ['occasion', v]),
                ...filters.color.map((v) => ['color', v]),
                ...filters.size.map((v) => ['size', v]),
              ].map(([key, value]) => (
                <li key={`${key}-${value}`}>
                  <button
                    type="button"
                    onClick={() =>
                      updateFilters({ ...filters, [key]: filters[key].filter((v) => v !== value) })
                    }
                    className="flex items-center gap-1.5 border border-beige bg-sand/60 px-3 py-1.5 text-[11px] text-charcoal-soft transition-colors hover:border-charcoal"
                  >
                    {value}
                    <X size={11} aria-hidden="true" />
                    <span className="sr-only">Remove {value} filter</span>
                  </button>
                </li>
              ))}

              {filters.rating ? (
                <li>
                  <button
                    type="button"
                    onClick={() => updateFilters({ ...filters, rating: null })}
                    className="flex items-center gap-1.5 border border-beige bg-sand/60 px-3 py-1.5 text-[11px]"
                  >
                    {filters.rating}★ & above <X size={11} aria-hidden="true" />
                  </button>
                </li>
              ) : null}

              {filters.minPrice || filters.maxPrice ? (
                <li>
                  <button
                    type="button"
                    onClick={() => updateFilters({ ...filters, minPrice: null, maxPrice: null })}
                    className="flex items-center gap-1.5 border border-beige bg-sand/60 px-3 py-1.5 text-[11px]"
                  >
                    Price <X size={11} aria-hidden="true" />
                  </button>
                </li>
              ) : null}

              {filters.inStockOnly ? (
                <li>
                  <button
                    type="button"
                    onClick={() => updateFilters({ ...filters, inStockOnly: false })}
                    className="flex items-center gap-1.5 border border-beige bg-sand/60 px-3 py-1.5 text-[11px]"
                  >
                    In stock <X size={11} aria-hidden="true" />
                  </button>
                </li>
              ) : null}

              <li>
                <button
                  type="button"
                  onClick={clearAll}
                  className="px-2 py-1.5 text-[11px] text-clay underline underline-offset-4"
                >
                  Clear all
                </button>
              </li>
            </ul>
          ) : null}

          {/* Grid */}
          {results.length === 0 ? (
            <EmptyState
              icon={SlidersHorizontal}
              title="No products match those filters"
              text="Try removing a filter or two, or browse the full collection."
              action={{ label: 'Clear Filters', onClick: clearAll }}
              secondaryAction={{ label: 'Shop All', to: '/shop' }}
              className="border border-dashed border-beige"
            />
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-4 md:grid-cols-3 lg:gap-x-5 lg:gap-y-10 xl:grid-cols-4">
                {results.slice(0, visible).map((product, i) => (
                  <li key={product.id}>
                    <ProductCard product={product} priority={i < 4} />
                  </li>
                ))}

                {/* The catalogue arrives a page at a time. Until the rest of
                    it lands the grid ends in shimmer rather than in a hard
                    edge, which would read as "that is everything". */}
                {!catalog.catalogComplete && visible >= results.length ? (
                  <ProductTileSkeletons count={4} />
                ) : null}
              </ul>

              {visible < results.length ? (
                <div className="mt-12 flex flex-col items-center gap-4">
                  <p className="text-[12px] text-charcoal-muted">
                    Showing {Math.min(visible, results.length)} of {results.length}
                  </p>
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="btn-outline"
                  >
                    Load More
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {/* ---------------------------- Mobile drawer ------------------------- */}
      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-[66] lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setMobileFiltersOpen(false)}
            className="absolute inset-0 animate-fade-in cursor-default bg-charcoal/45"
          />

          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-[min(90vw,360px)] animate-slide-in-right flex-col bg-cream outline-none"
          >
            <div className="flex items-center justify-between border-b border-beige px-5 py-4">
              <h2 className="font-display text-lg">Filters</h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Close filters"
                className="-mr-2 grid h-10 w-10 place-items-center text-charcoal-muted"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5">
              <FilterPanel {...filterProps} />
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-beige px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  clearAll();
                  setMobileFiltersOpen(false);
                }}
                className="btn-outline"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="btn-primary"
              >
                Show {results.length}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
