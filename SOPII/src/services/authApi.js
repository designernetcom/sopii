/**
 * The authentication client.
 * ===========================================================================
 * §30 forbids keeping authentication secrets in `localStorage`, and this file
 * is where that rule is kept. The access token lives in a module variable —
 * plain JavaScript memory — and nothing else. It is lost on reload, which is
 * the point: the durable half of the session is an HttpOnly cookie the API set
 * and this code cannot read, so `bootstrapSession()` asks the server for a new
 * access token instead of finding one lying about in storage.
 *
 * What that buys: a cross-site script that manages to run on this page can
 * make requests as the user (nothing prevents that) but cannot *exfiltrate* a
 * credential that keeps working after the tab closes.
 *
 * Everything here talks to `/api/auth`, which is served by the same Express
 * app as the storefront feed. Requests are sent with `credentials: 'include'`
 * so the refresh cookie travels; the CSRF header is attached automatically for
 * the two endpoints that authenticate by cookie.
 */

import { ApiError, setAuthToken as setStorefrontToken } from './api';

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT_MS || 12000);

/* ------------------------------- the session ------------------------------- */

/**
 * The access token. Never written to storage, never put in a URL.
 *
 * `expiresAt` is tracked alongside it so a request can refresh proactively
 * rather than discovering the expiry through a 401 and retrying.
 */
let accessToken = null;
let expiresAt = 0;
/** Read from a cookie the API sets; echoed back on cookie-authenticated calls. */
let csrfToken = null;

/** Refresh a little early, so a request never races the expiry. */
const REFRESH_SKEW_MS = 60_000;

export const getAccessToken = () => accessToken;

export function setSession({ accessToken: token, expiresIn, csrfToken: csrf } = {}) {
  accessToken = token ?? null;
  expiresAt = token && expiresIn ? Date.now() + expiresIn * 1000 : 0;
  if (csrf) csrfToken = csrf;

  /*
   * The storefront client (`api.js`) sends its own Authorization header on
   * /storefront calls — checkout, addresses, order history. Handing it the
   * same token keeps one session behind both halves of the shop rather than
   * two that can disagree about who is signed in.
   */
  setStorefrontToken(token ?? null);
}

export function clearSession() {
  accessToken = null;
  expiresAt = 0;
  csrfToken = null;
  setStorefrontToken(null);
}

/** The CSRF cookie is deliberately readable — that is the double-submit half. */
function readCsrfCookie() {
  const match = /(?:^|;\s*)sopii_csrf=([^;]+)/.exec(document.cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Asks the API which token it will check, for the loads that cannot work it
 * out locally.
 *
 * `document.cookie` is not always enough. Coming back from Google the cookies
 * are set but no login payload was ever received, so the in-memory copy is
 * empty; and a cookie issued on the old `/api/auth` path is invisible from
 * every page the SPA runs on. Both end in a refresh with no `X-CSRF-Token`
 * header and a 403 that repeats forever. `/auth/csrf` answers with the value
 * the server itself would compare against, which is the one thing that breaks
 * the loop. Answers null for a visitor with no session, which is not an error.
 */
async function seedCsrfToken() {
  try {
    const payload = await request('/csrf');
    if (payload?.csrfToken) csrfToken = payload.csrfToken;
    return payload?.csrfToken ?? null;
  } catch {
    return null;
  }
}

/* -------------------------------- requests --------------------------------- */

async function request(path, { method = 'GET', body, params, signal, withCsrf = false } = {}) {
  const url = new URL(`${BASE}/auth${path}`, window.location.origin);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), TIMEOUT);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort);

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (withCsrf) {
    const token = csrfToken || readCsrfCookie();
    if (token) headers['X-CSRF-Token'] = token;
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      // Without this the refresh cookie never leaves the browser.
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new ApiError(
        payload?.message || response.statusText || 'Request failed',
        response.status,
        payload,
      );
      // Surfaced so a throttled form can say "try again in 45 seconds" rather
      // than repeating the server's rounded sentence.
      error.retryAfter = Number(response.headers.get('Retry-After')) || null;
      throw error;
    }

    return payload;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * A call that needs a live access token.
 *
 * Refreshes first when the held token is close to expiry, and retries exactly
 * once on a 401 — the case where the server rejected a token this client still
 * thought was good (a revoked session, a restarted server). One retry, not a
 * loop: if the refresh itself fails there is nothing to recover.
 */
async function authed(path, options = {}) {
  if (accessToken && expiresAt && Date.now() > expiresAt - REFRESH_SKEW_MS) {
    await refresh().catch(() => clearSession());
  }

  try {
    return await request(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && accessToken) {
      clearSession();
      const restored = await refresh().catch(() => null);
      if (restored) return request(path, options);
    }
    throw error;
  }
}

/* -------------------------------- discovery -------------------------------- */

/** Which login methods are switched on, and the server's password rules. */
export const fetchAuthConfig = (options) => request('/config', options);

/* ------------------------------ password login ----------------------------- */

export const registerAccount = (payload) => request('/register', { method: 'POST', body: payload });

export const loginWithPassword = (payload) => request('/login', { method: 'POST', body: payload });

export const requestPasswordReset = (email) =>
  request('/forgot-password', { method: 'POST', body: { email } });

export const resetPassword = (payload) =>
  request('/reset-password', { method: 'POST', body: payload });

/* --------------------------------- otp login ------------------------------- */

export const requestOtp = (mobile) =>
  request('/otp/request', { method: 'POST', body: { mobile } });

export const verifyOtp = (mobile, otp) =>
  request('/otp/verify', { method: 'POST', body: { mobile, otp } });

export const fetchOtpStatus = (mobile) => request('/otp/status', { params: { mobile } });

/* ------------------------------- whatsapp otp ------------------------------ */

/*
 * The same three-step shape as the SMS flow above, against its own endpoints.
 * There is nothing provider-specific in this file and there cannot be: the
 * access token, the phone number ID and the template name live on the server
 * (§31), and the only thing the browser ever learns about the provider is the
 * boolean below saying whether one is configured at all.
 */

/** Whether the store offers WhatsApp login, and on what terms. */
export const fetchWhatsAppStatus = (mobile, options = {}) =>
  request('/whatsapp/status', { params: mobile ? { mobile } : undefined, ...options });

export const requestWhatsAppOtp = (mobile) =>
  request('/whatsapp/request-otp', { method: 'POST', body: { mobile } });

export const resendWhatsAppOtp = (mobile) =>
  request('/whatsapp/resend-otp', { method: 'POST', body: { mobile } });

export const verifyWhatsAppOtp = (mobile, otp) =>
  request('/whatsapp/verify-otp', { method: 'POST', body: { mobile, otp } });

/* §26: adding or removing WhatsApp on an account that is already signed in. */

export const requestWhatsAppLink = (mobile) =>
  authed('/whatsapp/link/request', { method: 'POST', body: { mobile } });

export const verifyWhatsAppLink = (mobile, otp) =>
  authed('/whatsapp/link/verify', { method: 'POST', body: { mobile, otp } });

export const removeWhatsAppLink = () => authed('/whatsapp/link', { method: 'DELETE' });

/* ---------------------------------- google --------------------------------- */

export const fetchGoogleStatus = (options) => request('/google/status', options);

/**
 * Where to send the browser to begin the Google round trip.
 *
 * A full-page navigation, not a fetch: the OAuth flow is a redirect to
 * accounts.google.com and back, and there is nothing for XHR to do with that.
 */
export function googleAuthorizeUrl(next = '/account') {
  const url = new URL(`${BASE}/auth/google`, window.location.origin);
  url.searchParams.set('surface', 'shop');
  url.searchParams.set('next', next);
  return url.toString();
}

/** Signed-in linking (§26): the server answers with the URL to navigate to. */
export const startGoogleLink = (next = '/account/security') =>
  authed('/google/link', { method: 'POST', body: { next } });

export const disconnectGoogle = () => authed('/google/link', { method: 'DELETE' });

/* ------------------------------ session lifecycle -------------------------- */

export const fetchMe = (options) => authed('/me', options);

/**
 * Trades the refresh cookie for a new access token.
 *
 * Concurrent callers share one in-flight request. Without that, a page whose
 * three panels all mount at once fires three refreshes, two of which present a
 * token the first has already rotated away — which the server correctly reads
 * as replay and ends the session.
 */
let refreshInFlight = null;

/**
 * One attempt, plus one recovery.
 *
 * The 403 is the double-submit check refusing a header this client could not
 * build — no readable cookie, or a stale duplicate shadowing the live one. It
 * is recoverable exactly once: ask the server which token it wants and send
 * that. Anything after that is a real refusal, so it is allowed to throw.
 */
async function requestRefresh() {
  if (!csrfToken && !readCsrfCookie()) await seedCsrfToken();

  try {
    return await request('/refresh', { method: 'POST', withCsrf: true });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 403) throw error;

    csrfToken = null;
    if (!(await seedCsrfToken())) throw error;
    return request('/refresh', { method: 'POST', withCsrf: true });
  }
}

export function refresh() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = requestRefresh()
    .then((payload) => {
      setSession(payload);
      return payload;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export async function logout() {
  try {
    if (!csrfToken && !readCsrfCookie()) await seedCsrfToken();

    try {
      await request('/logout', { method: 'POST', withCsrf: true });
    } catch (error) {
      // Same recovery as `refresh` — a CSRF mismatch must not be able to keep
      // someone signed in on the server after they pressed Log Out.
      if (!(error instanceof ApiError) || error.status !== 403) throw error;
      csrfToken = null;
      if (await seedCsrfToken()) await request('/logout', { method: 'POST', withCsrf: true });
    }
  } finally {
    // Local state is cleared even if the call failed — a logout button that
    // leaves you signed in because the network blipped is worse than useless.
    clearSession();
  }
}

/* --------------------------------- account --------------------------------- */

export const fetchSessions = (options) => authed('/sessions', options);

export const revokeSession = (sessionId) =>
  authed(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });

export const revokeOtherSessions = () => authed('/sessions/logout-all', { method: 'POST' });

export const fetchAuthActivity = (options) => authed('/activity', options);

export const fetchLoginMethods = (options) => authed('/methods', options);

export const updateAuthProfile = (patch) => authed('/profile', { method: 'PATCH', body: patch });

export const changePassword = (payload) => authed('/password', { method: 'POST', body: payload });

export const requestMobileVerification = (mobile) =>
  authed('/mobile/request', { method: 'POST', body: { mobile } });

export const verifyMobile = (mobile, otp) =>
  authed('/mobile/verify', { method: 'POST', body: { mobile, otp } });

export const removeMobile = () => authed('/mobile', { method: 'DELETE' });

/* -------------------------------- bootstrap -------------------------------- */

/**
 * Whether this browser looks like it holds a session at all.
 *
 * The refresh cookie is HttpOnly and cannot be read from here — but the CSRF
 * cookie is set alongside it, is readable by design, and has the same lifetime.
 * Its presence is therefore a reliable *hint* that a session exists.
 *
 * It is only a hint, and it is used only to skip work: a visitor with the
 * cookie still has to prove the session on the server, and a visitor without it
 * simply skips an request that was always going to fail. Nothing is trusted
 * here that was not already trusted.
 */
const looksSignedIn = () => Boolean(readCsrfCookie());

/**
 * Restores a session on a cold page load.
 *
 * Returns the user, or null when there is nothing to restore. A failure here
 * is the ordinary signed-out case — a first-time visitor has no cookie — so it
 * resolves rather than throwing.
 *
 * THE SHORT-CIRCUIT
 * ---------------------------------------------------------------------------
 * This runs on *every* page load, for every visitor. Unconditionally, that is
 * one POST to `/api/auth/refresh` per page view — and for the overwhelming
 * majority of shop traffic, which is anonymous, it is a round trip whose only
 * possible answer is 401. At a million users that is a large amount of load, on
 * an endpoint that does real work (a token lookup, a rotation attempt) before
 * it can say no.
 *
 * A first-time visitor has no CSRF cookie either, so there is nothing to
 * restore and nothing to ask. Skipping the call for them removes the request
 * entirely and makes the signed-out first paint faster by a full round trip.
 */
export async function bootstrapSession() {
  if (!looksSignedIn()) {
    clearSession();
    return null;
  }

  try {
    const payload = await refresh();
    return payload?.user ?? null;
  } catch {
    clearSession();
    return null;
  }
}
