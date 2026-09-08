import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { STORAGE_KEYS } from '../utils/storage';
import { fetchWishlist, saveWishlist } from '../services/api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { useCart } from './CartContext';

const WishlistContext = createContext(null);

/** Wait this long after the last change before pushing the list to the API. */
const SYNC_DEBOUNCE_MS = 600;

/**
 * The wishlist lives in localStorage so it works signed out, and is mirrored to
 * the shopper's account when there is one — so a piece saved on a phone is
 * still there on a laptop, and the panel's customer page shows what they are
 * eyeing.
 */
export function WishlistProvider({ children }) {
  const [ids, setIds] = useLocalStorage(STORAGE_KEYS.wishlist, []);
  const { toast } = useToast();
  const { addItem, removeItem } = useCart();
  const { user, isAuthenticated } = useAuth();

  /* Which account this browser's list has been merged with, and which one a
     merge is already running for — the second stops a re-render restarting it. */
  const mergedFor = useRef(null);
  const mergingFor = useRef(null);

  const idsRef = useRef(ids);
  idsRef.current = ids;

  /* On sign-in, the account's list and this browser's are unioned: signing in
     should never lose a saved piece from either side. */
  useEffect(() => {
    if (!isAuthenticated) {
      mergedFor.current = null;
      mergingFor.current = null;
      return undefined;
    }
    if (mergingFor.current === user.id) return undefined;
    mergingFor.current = user.id;

    let live = true;
    fetchWishlist()
      .then(({ productIds = [] }) => {
        if (!live) return;
        const merged = [...new Set([...idsRef.current, ...productIds])];
        setIds(merged);
        mergedFor.current = user.id;
        // Only worth a write if this browser knew something the account did not.
        if (merged.length !== productIds.length) saveWishlist(merged).catch(() => {});
      })
      .catch(() => {
        // Offline or signed out mid-flight; the local list stands.
        mergingFor.current = null;
      });

    return () => {
      live = false;
    };
  }, [isAuthenticated, user?.id, setIds]);

  /* Push later changes up, debounced so dropping five things into the list is
     one request rather than five. */
  useEffect(() => {
    if (!isAuthenticated || mergedFor.current !== user.id) return undefined;
    const timer = setTimeout(() => {
      saveWishlist(ids).catch(() => {});
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [ids, isAuthenticated, user?.id]);

  const has = useCallback((productId) => ids.includes(productId), [ids]);

  const add = useCallback(
    (product) => {
      setIds((current) => (current.includes(product.id) ? current : [product.id, ...current]));
      toast(`${product.name} saved to wishlist`, { type: 'wishlist' });
    },
    [setIds, toast],
  );

  const remove = useCallback(
    (productId) => setIds((current) => current.filter((id) => id !== productId)),
    [setIds],
  );

  const toggle = useCallback(
    (product) => {
      if (ids.includes(product.id)) {
        remove(product.id);
        toast(`${product.name} removed from wishlist`, { type: 'info' });
        return false;
      }
      add(product);
      return true;
    },
    [ids, add, remove, toast],
  );

  const clear = useCallback(() => setIds([]), [setIds]);

  /** Wishlist -> bag, removing it from the wishlist as it goes. */
  const moveToCart = useCallback(
    (product, options = {}) => {
      addItem(product, { ...options, silent: true });
      remove(product.id);
      toast(`${product.name} moved to your bag`);
    },
    [addItem, remove, toast],
  );

  /** Bag -> wishlist, used by the "save for later" action in the cart. */
  const saveForLater = useCallback(
    (cartLine, product) => {
      setIds((current) =>
        current.includes(cartLine.productId) ? current : [cartLine.productId, ...current],
      );
      removeItem(cartLine.id);
      toast(`${product?.name || cartLine.name} saved for later`, { type: 'wishlist' });
    },
    [setIds, removeItem, toast],
  );

  const value = useMemo(
    () => ({ ids, count: ids.length, has, add, remove, toggle, clear, moveToCart, saveForLater }),
    [ids, has, add, remove, toggle, clear, moveToCart, saveForLater],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>');
  return ctx;
}
