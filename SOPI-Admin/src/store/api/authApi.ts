/*
 * The admin panel's authentication client.
 * ===========================================================================
 * Deliberately *not* an RTK Query slice. Two reasons:
 *
 * 1. These calls sit outside the cache. A login is not a query to invalidate,
 *    and a refresh has to be callable from a middleware that RTK Query's own
 *    lifecycle sits underneath.
 * 2. `credentials: 'include'` and the CSRF header apply to these endpoints and
 *    nothing else. Putting them on the shared `baseQuery` would attach cookies
 *    to every admin API call that has no use for them.
 *
 * The same `/api/auth` module serves the shop front — one identity model, one
 * set of rules — with `surface: 'admin'` telling the server which side is
 * asking. What that flag *cannot* do is grant access: the server checks the
 * role and refuses a customer an admin session however the request is labelled.
 */

import type { AuthUser } from '@/types';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
  redirectTo: string;
}

export class AuthApiError extends Error {
  status: number;
  retryAfter: number | null;

  constructor(message: string, status: number, retryAfter: number | null = null) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** The CSRF cookie is readable on purpose — it is the double-submit half. */
function readCsrfCookie() {
  const match = /(?:^|;\s*)sopii_csrf=([^;]+)/.exec(document.cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * The token the server will check, held for the loads where the cookie cannot
 * supply it — see `seedCsrfToken`.
 */
let csrfToken: string | null = null;

/**
 * Asks the API which token it will compare against.
 *
 * `document.cookie` is not always enough. Landing back from Google the cookies
 * are set but no login payload was received, so nothing is held in memory; and
 * a cookie issued on the old `/api/auth` path is invisible from `/admin/*`
 * entirely. Either way the refresh goes out with no `X-CSRF-Token` header and
 * 403s, forever, because the rejection happens before any handler that could
 * clear the offending cookie. Answers null when there is no session to seed.
 */
async function seedCsrfToken(): Promise<string | null> {
  try {
    const payload = await request<{ csrfToken: string | null }>('/csrf');
    if (payload?.csrfToken) csrfToken = payload.csrfToken;
    return payload?.csrfToken ?? null;
  } catch {
    return null;
  }
}

/**
 * A cookie-authenticated call, with one recovery attempt.
 *
 * A 403 here is the double-submit check refusing a header this client could not
 * build. That is recoverable exactly once — seed the token and send it. A
 * second 403 is a real refusal and is allowed to throw.
 */
async function withCsrfRetry<T>(path: string): Promise<T> {
  if (!csrfToken && !readCsrfCookie()) await seedCsrfToken();

  try {
    return await request<T>(path, { method: 'POST', withCsrf: true });
  } catch (error) {
    if (!(error instanceof AuthApiError) || error.status !== 403) throw error;

    csrfToken = null;
    if (!(await seedCsrfToken())) throw error;
    return request<T>(path, { method: 'POST', withCsrf: true });
  }
}

async function request<T>(
  path: string,
  { method = 'GET', body, token, withCsrf = false }: {
    method?: string;
    body?: unknown;
    token?: string | null;
    withCsrf?: boolean;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (withCsrf) {
    /*
     * The cookie first, because `/refresh` rotates it and the browser's copy is
     * therefore always the newer of the two. The seeded value is the fallback
     * for the one case the cookie cannot cover: it is not readable from here.
     */
    const csrf = readCsrfCookie() ?? csrfToken;
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const response = await fetch(`${BASE}/auth${path}`, {
    method,
    headers,
    // Without this the refresh cookie never leaves the browser.
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new AuthApiError(
      payload?.message ?? response.statusText ?? 'Request failed',
      response.status,
      Number(response.headers.get('Retry-After')) || null,
    );
  }

  return payload as T;
}

/* ---------------------------------- calls ---------------------------------- */

/** Which methods the operator has enabled for the panel (§11). */
export interface AuthConfig {
  methods: { password: boolean; otp: boolean; google: boolean };
  admin: { otp: boolean; google: boolean };
  password: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumber: boolean;
    requireSymbol: boolean;
  };
  otp: {
    length: number;
    resendAfterSeconds: number;
    expiresInSeconds: number;
    maxAttempts: number;
  };
  defaultCallingCode: string;
}

export const fetchAuthConfig = () => request<AuthConfig>('/config');

export const loginWithPassword = (identifier: string, password: string) =>
  request<AuthSession>('/login', {
    method: 'POST',
    body: { identifier, password, surface: 'admin' },
  });

export interface OtpRequestResult {
  ok: boolean;
  message: string;
  mobileMasked: string;
  mobileFormatted: string;
  otpLength: number;
  resendAfterSeconds: number;
  expiresInSeconds: number;
  maxAttempts: number;
  delivered: boolean;
}

export const requestAdminOtp = (mobile: string) =>
  request<OtpRequestResult>('/otp/request', {
    method: 'POST',
    body: { mobile, surface: 'admin' },
  });

export const verifyAdminOtp = (mobile: string, otp: string) =>
  request<AuthSession>('/otp/verify', {
    method: 'POST',
    body: { mobile, otp, surface: 'admin' },
  });

export const requestPasswordReset = (email: string) =>
  request<{ ok: boolean; message: string }>('/forgot-password', {
    method: 'POST',
    body: { email },
  });

export const resetPassword = (token: string, password: string, confirmPassword: string) =>
  request<{ ok: boolean; message: string }>('/reset-password', {
    method: 'POST',
    body: { token, password, confirmPassword },
  });

/** A full-page navigation: the OAuth flow leaves this origin and comes back. */
export function googleAuthorizeUrl(next = '/admin/dashboard') {
  const url = new URL(`${BASE}/auth/google`, window.location.origin);
  url.searchParams.set('surface', 'admin');
  url.searchParams.set('next', next);
  return url.toString();
}

/** Trades the refresh cookie for a new access token. */
export const refreshSession = () => withCsrfRetry<AuthSession>('/refresh');

export const logoutSession = () =>
  withCsrfRetry<{ ok: boolean; message: string }>('/logout');

export interface AdminSessionRow {
  id: string;
  browser: string;
  os: string;
  deviceType: string;
  label: string;
  ip?: string;
  method: string;
  surface: string;
  current: boolean;
  createdAt: string;
  lastActiveAt: string;
}

/**
 * Re-reads the identity after a mutation that touched it.
 *
 * The panel's profile and two-factor screens still write through the legacy
 * `admin_users` handlers, which answer with a narrower projection. Dispatching
 * *that* into Redux would blank the fields only the unified identity knows —
 * the live session list, the role key, the permission matrix — so those
 * screens call this instead and store the full answer.
 */
export const fetchMe = (token: string | null) =>
  request<{ user: AuthUser; sessionId: string; surface: string }>('/me', { token });

export const fetchSessions = (token: string | null) =>
  request<{ items: AdminSessionRow[] }>('/sessions', { token });

export const revokeSession = (token: string | null, id: string) =>
  request<{ ok: boolean; message: string; selfRevoked: boolean; items: AdminSessionRow[] }>(
    `/sessions/${encodeURIComponent(id)}`,
    { method: 'DELETE', token },
  );

export const revokeOtherSessions = (token: string | null) =>
  request<{ ok: boolean; message: string; revoked: number; items: AdminSessionRow[] }>(
    '/sessions/logout-all',
    { method: 'POST', token },
  );

export const changePassword = (
  token: string | null,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
) =>
  request<{ ok: boolean; message: string; otherDevicesSignedOut: number }>('/password', {
    method: 'POST',
    token,
    body: { currentPassword, newPassword, confirmPassword },
  });
