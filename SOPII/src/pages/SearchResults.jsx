import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { POPULAR_SEARCHES } from '../data/site';
import { sortProducts, SORT_OPTIONS } from '../utils/filters';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { ProductTileSkeletons } from '../components/ui/PageSkeletons';
import { SEOHead } from '../components/SEO/SEOHead';
import { useUI } from '../context/UIContext';
import { useCatalog } from '../context/CatalogContext';

export default function SearchResults() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [sort, setSort] = useState('recommended');
  const { openSearch } = useUI();
  const { searchProducts, catalogComplete } = useCatalog();

  const results = useMemo(
    () => sortProducts(searchProducts(query, 100), sort),
    [searchProducts, query, sort],
  );

  return (
    <div className="container-site py-6 lg:py-10">
      {/* Search results are noindex by design: every query would otherwise
          mint a thin, near-duplicate URL competing with the real listings. */}
      <SEOHead
        path="/search"
        title={query ? `Search: ${query}` : 'Search'}
        description="Search the SOPII collection by piece, fabric or occasion."
        noindex
      />

      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Search' }]} />

      <header className="mt-5 border-b border-beige pb-6">
        <p className="eyebrow">Search Results</p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl">
          “{query}”
        </h1>
        <p className="mt-3 text-sm text-charcoal-muted" aria-live="polite">
          {results.length} {results.length === 1 ? 'product' : 'products'} found
        </p>
      </header>

      {results.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-16 text-center sm:py-24">
          <span className="mb-6 grid h-16 w-16 place-items-center rounded-full border border-beige bg-cream">
            <SearchX size={24} className="text-brand-soft" strokeWidth={1.25} aria-hidden="true" />
          </span>

          <h2 className="font-display text-2xl sm:text-3xl">No products found</h2>
          <p className="mt-3 max-w-md text-sm text-charcoal-muted">
            We could not find anything matching “{query}”. Try a broader term — a fabric, a colour
            or a category usually works well.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={openSearch} className="btn-primary">
              Search Again
            </button>
            <Link to="/shop" className="btn-outline">
              Browse All
            </Link>
          </div>

          <div className="mt-12 w-full max-w-lg border-t border-beige pt-8">
            <p className="eyebrow mb-4">Popular Searches</p>
            <ul className="flex flex-wrap justify-center gap-2">
              {POPULAR_SEARCHES.map((term) => (
                <li key={term}>
                  <Link
                    to={`/search?q=${encodeURIComponent(term)}`}
                    className="inline-block border border-beige px-3.5 py-2 text-[12px] text-charcoal-soft transition-colors hover:border-charcoal hover:text-charcoal"
                  >
                    {term}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-end py-5">
            <div className="flex items-center gap-2">
              <label
                htmlFor="search-sort"
                className="text-[11px] uppercase tracking-widest2 text-charcoal-muted"
              >
                Sort
              </label>
              <select
                id="search-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="border border-beige bg-cream px-3 py-2.5 text-[11px] uppercase tracking-widest2 outline-none focus:border-charcoal"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-x-3 gap-y-8 pb-8 sm:gap-x-4 md:grid-cols-3 lg:gap-x-5 lg:gap-y-10 xl:grid-cols-4">
            {results.map((product, i) => (
              <li key={product.id}>
                <ProductCard product={product} priority={i < 4} />
              </li>
            ))}

            {/* A search over a half-loaded catalogue is a half-answer; the
                shimmer says so rather than letting it read as the full set. */}
            {!catalogComplete ? <ProductTileSkeletons count={4} /> : null}
          </ul>
        </>
      )}
    </div>
  );
}
