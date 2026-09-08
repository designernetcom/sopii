import { createContext, useCallback, useContext, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { STORAGE_KEYS } from '../utils/storage';
import { useCatalog } from './CatalogContext';

const RecentlyViewedContext = createContext(null);
const MAX_ITEMS = 8;

export function RecentlyViewedProvider({ children }) {
  const [ids, setIds] = useLocalStorage(STORAGE_KEYS.recentlyViewed, []);
  const { products } = useCatalog();

  const record = useCallback(
    (productId) => {
      setIds((current) => [productId, ...current.filter((id) => id !== productId)].slice(0, MAX_ITEMS));
    },
    [setIds],
  );

  /* Resolve against the live catalogue, so a product unpublished in the admin
     panel drops out of the rail instead of lingering as a stale copy. */
  const viewed = useMemo(
    () => ids.map((id) => products.find((p) => p.id === id)).filter(Boolean),
    [ids, products],
  );

  const clear = useCallback(() => setIds([]), [setIds]);

  const value = useMemo(
    () => ({ ids, products: viewed, record, clear }),
    [ids, viewed, record, clear],
  );

  return (
    <RecentlyViewedContext.Provider value={value}>{children}</RecentlyViewedContext.Provider>
  );
}

export function useRecentlyViewed() {
  const ctx = useContext(RecentlyViewedContext);
  if (!ctx) throw new Error('useRecentlyViewed must be used inside <RecentlyViewedProvider>');
  return ctx;
}
