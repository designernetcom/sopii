import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Owns the app's single "which overlay is open" question.
 * Only one of cart / search / mobile-menu can be open at a time, which keeps
 * scroll locking and Escape handling in one place instead of three.
 */
const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [overlay, setOverlay] = useState(null); // 'cart' | 'search' | 'menu' | null
  const [quickView, setQuickView] = useState(null); // product object

  const close = useCallback(() => setOverlay(null), []);
  const open = useCallback((name) => setOverlay(name), []);
  const toggle = useCallback((name) => setOverlay((cur) => (cur === name ? null : name)), []);

  const openCart = useCallback(() => setOverlay('cart'), []);
  const openSearch = useCallback(() => setOverlay('search'), []);
  const openMenu = useCallback(() => setOverlay('menu'), []);

  // Escape closes whatever is on top: quick view first, then the overlay.
  useEffect(() => {
    if (!overlay && !quickView) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (quickView) setQuickView(null);
      else setOverlay(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, quickView]);

  const value = useMemo(
    () => ({
      overlay,
      isCartOpen: overlay === 'cart',
      isSearchOpen: overlay === 'search',
      isMenuOpen: overlay === 'menu',
      open,
      close,
      toggle,
      openCart,
      openSearch,
      openMenu,
      quickView,
      setQuickView,
      closeQuickView: () => setQuickView(null),
    }),
    [overlay, quickView, open, close, toggle, openCart, openSearch, openMenu],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside <UIProvider>');
  return ctx;
}
