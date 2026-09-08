import { fetchBaseQuery, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type { FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { RootState } from '@/store/store';
import { loggedOut } from '@/store/slices/authSlice';
import type { HttpMethod } from '@/mocks/utils';

/**
 * Endpoints are written against real REST URLs. They resolve either against the
 * in-memory mock server or over HTTP, decided by `VITE_USE_MOCK_API` — the same
 * endpoint definitions either way.
 *
 * WHY THE MOCK LAYER IS IMPORTED DYNAMICALLY
 * ===========================================================================
 * `handleRequest` used to be a static import at the top of this file. Static
 * means unconditional: the mock router, its fifty handlers and the ~140 KB of
 * seeded products, orders and customers behind them were compiled into the
 * production bundle of every deployment — including the ones running against
 * a real API, where not one byte of it can ever execute.
 *
 * It arrived in the main chunk, too, not a lazy one, so it was parsed and
 * evaluated before the login screen could paint.
 *
 * Behind `import()` guarded by the flag, Rollup emits it as a separate chunk
 * that a production build never requests. The mock still works exactly as
 * before when the flag is on — it is loaded once, on the first request, and
 * cached from then on.
 */

export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== 'false';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const httpBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

/**
 * A token the backend rejects must not be allowed to strand the app. The
 * session is persisted, so without this the guards keep treating a stale token
 * (an expired JWT, or one minted by the mock layer before `VITE_USE_MOCK_API`
 * was turned off) as a live session while every screen quietly renders its
 * error state. Clearing it drops the user back on the login form instead.
 */
const realBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await httpBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401 && (api.getState() as RootState).auth.token) {
    api.dispatch(loggedOut());
  }

  return result;
};

/** Network-ish latency so loading and skeleton states are exercised honestly. */
const LATENCY = { min: 140, max: 380 };

function delay() {
  const ms = LATENCY.min + Math.random() * (LATENCY.max - LATENCY.min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toQuery(params: unknown): Record<string, string> {
  if (!params || typeof params !== 'object') return {};
  const out: Record<string, string> = {};
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    out[key] = Array.isArray(value) ? value.join(',') : String(value);
  });
  return out;
}

/**
 * The mock router, fetched once and remembered.
 *
 * The promise itself is cached rather than the module, so several requests
 * firing before the chunk lands share one download instead of racing.
 */
type MockRouter = typeof import('@/mocks/router');
let mockRouter: Promise<MockRouter> | null = null;

const loadMockRouter = () => {
  mockRouter ??= import('@/mocks/router');
  return mockRouter;
};

export const mockBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
) => {
  const request: FetchArgs = typeof args === 'string' ? { url: args } : args;
  const method = (request.method ?? 'GET').toUpperCase() as HttpMethod;

  const [{ handleRequest }] = await Promise.all([loadMockRouter(), delay()]);

  const response = handleRequest(
    method,
    request.url,
    (request.body ?? {}) as Record<string, unknown>,
    toQuery(request.params),
  );

  if (response.status >= 400) {
    return {
      error: {
        status: response.status,
        data: response.data,
      } as FetchBaseQueryError,
    };
  }

  return { data: response.data };
};

export const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = (
  args,
  api,
  extraOptions,
) => (USE_MOCK_API ? mockBaseQuery(args, api, extraOptions) : realBaseQuery(args, api, extraOptions));

/** Normalises an RTK Query error into something a toast can display. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  const maybe = error as { data?: { message?: string }; error?: string; message?: string };
  return maybe.data?.message ?? maybe.message ?? maybe.error ?? fallback;
}
