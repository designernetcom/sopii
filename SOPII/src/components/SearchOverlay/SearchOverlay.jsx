import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, Search, SearchX, X } from 'lucide-react';
import { POPULAR_SEARCHES } from '../../data/site';
import { formatPrice } from '../../utils/format';
import { readStorage, STORAGE_KEYS, writeStorage } from '../../utils/storage';
import { Image } from '../ui/Image';
import { useUI } from '../../context/UIContext';
import { useCatalog } from '../../context/CatalogContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { productPath } from '../../utils/catalog';

const MAX_RECENT = 5;

/** Full-screen search with live results, recent terms and popular suggestions. */
export function SearchOverlay() {
  const { isSearchOpen, close } = useUI();
  const { searchProducts } = useCatalog();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(() => readStorage(STORAGE_KEYS.recentSearches, []));
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  useLockBodyScroll(isSearchOpen);
  useFocusTrap(panelRef, isSearchOpen);

  // Reset and focus each time the overlay opens.
  useEffect(() => {
    if (!isSearchOpen) return;
    setQuery('');
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [isSearchOpen]);

  const results = useMemo(
    () => (query.trim().length > 1 ? searchProducts(query, 8) : []),
    [searchProducts, query],
  );

  const commit = (term) => {
    const value = term.trim();
    if (!value) return;
    const next = [value, ...recent.filter((r) => r.toLowerCase() !== value.toLowerCase())].slice(
      0,
      MAX_RECENT,
    );
    setRecent(next);
    writeStorage(STORAGE_KEYS.recentSearches, next);
    close();
    navigate(`/search?q=${encodeURIComponent(value)}`);
  };

  const clearRecent = () => {
    setRecent([]);
    writeStorage(STORAGE_KEYS.recentSearches, []);
  };

  if (!isSearchOpen) return null;

  const hasQuery = query.trim().length > 1;

  return createPortal(
    <div className="fixed inset-0 z-[68]">
      <button
        type="button"
        aria-label="Close search"
        onClick={close}
        className="absolute inset-0 animate-fade-in cursor-default bg-charcoal/45 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search SOPII"
        tabIndex={-1}
        /* `max-h-screen-d` is `dvh`-based: with `92vh` the panel was taller
            than the visible area while the address bar was still showing, so the
            last result sat under it and could not be scrolled to. */
        className="max-h-screen-d absolute inset-x-0 top-0 animate-slide-down overflow-y-auto overscroll-contain bg-cream outline-none"
      >
        <div className="container-site py-6 sm:py-8">
          <div className="mb-5 flex items-center justify-between">
            <p className="eyebrow">Search {'—'} SOPII</p>
            <button
              type="button"
              onClick={close}
              aria-label="Close search"
              className="-mr-2 grid h-10 w-10 place-items-center text-charcoal-muted transition-colors hover:text-charcoal"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              commit(query);
            }}
            role="search"
          >
            <label htmlFor="site-search" className="sr-only">
              Search products
            </label>
            <div className="flex items-center gap-3 border-b-2 border-charcoal pb-3">
              <Search size={20} className="shrink-0 text-brand-soft" aria-hidden="true" strokeWidth={1.5} />
              <input
                ref={inputRef}
                id="site-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sarees, dresses, blouses…"
                autoComplete="off"
                className="w-full bg-transparent font-display text-xl outline-none placeholder:font-sans placeholder:text-base placeholder:text-charcoal-faint sm:text-2xl sm:placeholder:text-lg"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="shrink-0 text-charcoal-faint hover:text-charcoal"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </form>

          {/* Suggestions — shown until the shopper starts typing */}
          {!hasQuery ? (
            <div className="mt-8 grid gap-8 pb-6 sm:grid-cols-2">
              {recent.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="eyebrow">Recent Searches</p>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="text-[10px] uppercase tracking-widest2 text-charcoal-faint hover:text-charcoal"
                    >
                      Clear
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {recent.map((term) => (
                      <li key={term}>
                        <button
                          type="button"
                          onClick={() => commit(term)}
                          className="flex w-full items-center gap-2.5 py-1.5 text-left text-sm text-charcoal-soft transition-colors hover:text-brand-soft"
                        >
                          <Clock size={13} className="text-charcoal-faint" aria-hidden="true" />
                          {term}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <p className="eyebrow mb-3">Popular Searches</p>
                <ul className="flex flex-wrap gap-2">
                  {POPULAR_SEARCHES.map((term) => (
                    <li key={term}>
                      <button
                        type="button"
                        onClick={() => commit(term)}
                        className="border border-beige px-3.5 py-2 text-[12px] text-charcoal-soft transition-colors hover:border-charcoal hover:text-charcoal"
                      >
                        {term}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {/* Live results */}
          {hasQuery ? (
            <div className="mt-8 pb-6">
              {results.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <SearchX size={26} className="mb-4 text-charcoal-faint" strokeWidth={1.25} aria-hidden="true" />
                  <p className="font-display text-xl">No products found</p>
                  <p className="mt-2 max-w-sm text-sm text-charcoal-muted">
                    We could not find anything for “{query}”. Try a fabric, a colour or a category.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-baseline justify-between">
                    <p className="eyebrow">
                      {results.length} {results.length === 1 ? 'Result' : 'Results'}
                    </p>
                    <button
                      type="button"
                      onClick={() => commit(query)}
                      className="text-[11px] font-medium uppercase tracking-widest2 text-charcoal link-underline"
                    >
                      View all
                    </button>
                  </div>

                  <ul
                    className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4"
                    aria-live="polite"
                  >
                    {results.map((p) => (
                      <li key={p.id}>
                        <Link to={productPath(p)} onClick={close} className="group block">
                          <Image
                            src={p.image}
                            alt={p.name}
                            ratio="aspect-[4/5]"
                            className="transition-transform duration-700 ease-silk group-hover:scale-105"
                          />
                          <p className="mt-2 text-[10px] uppercase tracking-widest2 text-charcoal-faint">
                            {p.category}
                          </p>
                          <p className="text-[13px] leading-snug transition-colors group-hover:text-brand-soft">
                            {p.name}
                          </p>
                          <p className="mt-0.5 text-[13px] font-medium">{formatPrice(p.price)}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
