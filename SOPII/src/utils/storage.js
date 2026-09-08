/**
 * localStorage wrapper that never throws.
 * Private-mode Safari and disabled-storage browsers fail on access, so every
 * call is guarded — the app degrades to in-memory state instead of crashing.
 */

const PREFIX = 'sopii:';

export function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEYS = {
  cart: 'cart',
  wishlist: 'wishlist',
  recentlyViewed: 'recently-viewed',
  recentSearches: 'recent-searches',
  /*
   * Retired. The access token lives in memory only (§30) and the durable half
   * of the session is an HttpOnly cookie the browser will not show us. The key
   * is kept so `setAuthToken` can clear a token an older build left behind.
   */
  token: 'token',
  /*
   * A *cached profile* — a name for the header to render on first paint, before
   * the session is restored. Not a credential: it proves nothing, and the API
   * ignores it entirely. It is discarded the moment /auth/refresh disagrees.
   */
  user: 'user',
  /**
   * Handles — `{ code, email }` — for orders placed in this browser without an
   * account, so the receipt survives a reload. The orders themselves live on
   * the server; only enough to ask for them again is kept here.
   */
  guestOrders: 'guest-orders',
};
