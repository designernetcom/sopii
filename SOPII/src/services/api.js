/**
 * Storefront API client.
 * ===========================================================================
 * One thin wrapper over `fetch` pointed at the admin panel's public feed
 * (`SOPI-Admin/server` → `/api/storefront`). Nothing here knows about product
 * or order shapes — see `adapters.js` for the translation into what the UI
 * renders.
 *
 * The base URL comes from `VITE_API_URL`:
 *
 *   VITE_API_URL=/api                     dev — Vite proxies to the API server
 *   VITE_API_URL=https://api.sopii.in/api production
 *
 * The catalogue half is public and anonymous. The shopper half — addresses,
 * checkout, order history — carries the access token issued by `/api/auth`
 * (see `authApi.js`), which hands it down through `setAuthToken` so one
 * session stands behind both halves of the client.
 *
 * Signing in is NOT here. It moved to `authApi.js` when the unified auth
 * module landed, because a login has to set cookies and carry a CSRF header
 * that none of the calls below want.
 */

import { removeStorage, STORAGE_KEYS } from '../utils/storage';

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

/** Milliseconds before a request is abandoned, so a dead API fails fast. */
const TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT_MS || 12000);

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    /** The parsed error payload, for callers that want more than the message. */
    this.body = body ?? null;
  }
}

/* ------------------------------- the session ------------------------------- */

/*
 * The access token, in a module variable and nowhere else.
 *
 * It used to be mirrored into `localStorage` so a reload could pick it up.
 * §30 forbids that, and the reason is worth stating plainly: anything in
 * `localStorage` is readable by every script on the page, survives the tab
 * closing, and can be posted to another origin in one line. A token held in a
 * closure can be *used* by injected script while the page is open, but not
 * carried away and replayed tomorrow.
 *
 * The durable half of the session is now an HttpOnly cookie that this code
 * cannot read at all. `authApi.js` owns it, and pushes each fresh access token
 * down here via `setAuthToken` so both halves of the client — the auth
 * endpoints and the storefront ones — speak for the same session.
 */
let token = null;

export const getAuthToken = () => token;

/** Passing `null` signs the shopper out for the purposes of this client. */
export function setAuthToken(next) {
  token = next || null;
  // A token written by an older build of the shop would otherwise sit in
  // storage indefinitely. Clearing it on the first call retires it.
  removeStorage(STORAGE_KEYS.token);
}

/* -------------------------------- requests --------------------------------- */

/**
 * One request, parsed as JSON.
 *
 * @param {string} path   Path below the API base, e.g. `/storefront/bootstrap`.
 * @param {object} [opts]
 * @param {string} [opts.method]        Defaults to GET.
 * @param {object} [opts.body]          Serialised as JSON when present.
 * @param {object} [opts.params]        Query parameters; empty values are dropped.
 * @param {AbortSignal} [opts.signal]   Caller's cancellation, merged with the timeout.
 */
async function request(path, { method = 'GET', body, params, signal } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), TIMEOUT);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort);

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // Sent whenever we hold one: the API ignores it on the public endpoints and
  // uses it to recognise the shopper everywhere else.
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The API answers errors as `{ message }`; fall back to the status text.
      const payload = await response.json().catch(() => null);
      throw new ApiError(
        payload?.message || response.statusText || 'Request failed',
        response.status,
        payload,
      );
    }

    // 204s and empty bodies are legitimate answers to a DELETE.
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export const apiGet = (path, options) => request(path, { ...options, method: 'GET' });
export const apiPost = (path, body, options) => request(path, { ...options, method: 'POST', body });
export const apiPatch = (path, body, options) =>
  request(path, { ...options, method: 'PATCH', body });
export const apiPut = (path, body, options) => request(path, { ...options, method: 'PUT', body });
export const apiDelete = (path, options) => request(path, { ...options, method: 'DELETE' });

/* --------------------------- catalogue (public) ---------------------------- */

/**
 * The shop's first paint in one request: the first page of the catalogue, the
 * taxonomy, the CMS content and the store settings.
 *
 * It used to carry the *entire* catalogue. It now carries a bounded first
 * slice, and `fetchProductPage` brings the rest in behind the first paint —
 * see `CatalogContext`. The answer includes `hasMoreProducts` so the caller
 * knows whether there is anything to fetch.
 */
export const fetchBootstrap = (options) => apiGet('/storefront/bootstrap', options);

/**
 * One page of the catalogue.
 *
 * Used for the background fill, and available to any screen that would rather
 * page through the server than filter in the browser. The server supports
 * `search`, `categoryId`, `collectionId`, `brand`, `minPrice`, `maxPrice`,
 * `inStock`, `featured` and seven `sort` values — every filter the shop draws,
 * so a catalogue too large to hold in memory is a change of caller, not a loss
 * of features.
 */
export const fetchProductPage = ({ page = 1, pageSize = 60, ...filters } = {}, options) =>
  apiGet('/storefront/products', { ...options, params: { page, pageSize, ...filters } });

/** Cheap change token — polled to decide whether a re-fetch is worth it. */
export const fetchVersion = (options) => apiGet('/storefront/version', options);

/** Approved reviews plus the star breakdown for one product. */
export const fetchProductReviews = (productId, options) =>
  apiGet(`/storefront/products/${encodeURIComponent(productId)}/reviews`, options);

/* ------------------------------ shop accounts ------------------------------ */

/*
 * Register / login / forgot-password used to live here, against
 * `/storefront/auth/*`. They are now in `authApi.js`, against `/api/auth` —
 * one identity model serving the shop and the panel (§9). The storefront
 * handlers still exist on the server so that sessions issued before the change
 * keep working until they expire, but nothing in this application calls them.
 */

/** Name and marketing preference on the *commerce* record. */
export const updateCustomerProfile = (patch) => apiPatch('/storefront/account/profile', patch);

/* Address handlers all answer with the full list, so the client never has to
   guess how the server resolved which one is the default. */
export const fetchAddresses = (options) => apiGet('/storefront/account/addresses', options);
export const createAddress = (address) => apiPost('/storefront/account/addresses', address);
export const updateAddress = (id, address) =>
  apiPut(`/storefront/account/addresses/${encodeURIComponent(id)}`, address);
export const deleteAddress = (id) =>
  apiDelete(`/storefront/account/addresses/${encodeURIComponent(id)}`);

export const fetchWishlist = (options) => apiGet('/storefront/account/wishlist', options);
export const saveWishlist = (productIds) =>
  apiPut('/storefront/account/wishlist', { productIds });

/* -------------------------- checkout and orders ---------------------------- */

/**
 * Prices a bag exactly the way the order will be written — the checkout
 * summary is this call's answer, not the browser's own arithmetic.
 */
export const quoteCheckout = (payload, options) =>
  apiPost('/storefront/checkout/quote', payload, options);

/** Answers `{ order }`. */
export const placeOrder = (payload) => apiPost('/storefront/orders', payload);

export const fetchMyOrders = (options) => apiGet('/storefront/account/orders', options);

/**
 * One order by code. A signed-in shopper gets their own; a guest has to supply
 * the email it was placed with.
 */
export const fetchOrder = (code, { email, ...options } = {}) =>
  apiGet(`/storefront/orders/${encodeURIComponent(code)}`, { ...options, params: { email } });

/**
 * Server-side coupon check — the code, its window, the minimum order value and
 * both usage limits. Answers 422 with `{ ok: false, message }` for a code that
 * exists but cannot be used yet, which callers read off `error.body`.
 */
export const validateCoupon = (code, subtotal) =>
  apiPost('/storefront/coupons/validate', { code, subtotal });

/* -------------------------------- marketing -------------------------------- */

export const subscribeToNewsletter = (email) => apiPost('/storefront/newsletter', { email });
