import type { Paginated } from '@/types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface MockRequest {
  url: string;
  method: HttpMethod;
  body: Record<string, unknown>;
  /** Path params extracted from the route pattern, e.g. `/products/:id`. */
  params: Record<string, string>;
  /** Query string values passed through RTK Query's `params` option. */
  query: Record<string, string>;
}

export type MockHandler = (req: MockRequest) => unknown;

export interface Route {
  method: HttpMethod;
  pattern: string;
  handler: MockHandler;
}

export function route(method: HttpMethod, pattern: string, handler: MockHandler): Route {
  return { method, pattern, handler };
}

/** Thrown by handlers to produce a non-200 response. */
export class MockHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'MockHttpError';
  }
}

export function notFound(what: string): never {
  throw new MockHttpError(404, `${what} not found`);
}

export function badRequest(message: string): never {
  throw new MockHttpError(400, message);
}

/* --------------------------------- querying -------------------------------- */

export function num(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== undefined && value !== '' ? parsed : fallback;
}

export function bool(value: string | undefined) {
  return value === 'true' || value === '1';
}

export function list(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').filter(Boolean);
}

export function matchesSearch(term: string | undefined, fields: (string | undefined | null)[]) {
  if (!term) return true;
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle));
}

type Primitive = string | number | boolean | undefined | null;

export function sortBy<T>(
  items: T[],
  key: string | undefined,
  dir: string | undefined,
  accessor: (item: T, key: string) => Primitive,
) {
  if (!key) return items;
  const direction = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = accessor(a, key);
    const right = accessor(b, key);
    if (left === right) return 0;
    if (left === undefined || left === null) return 1;
    if (right === undefined || right === null) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
    return String(left).localeCompare(String(right), 'en', { numeric: true }) * direction;
  });
}

export function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

/** Shallow-merges a patch into a record, ignoring `undefined` values. */
export function applyPatch<T extends object>(target: T, patch: Partial<T>): T {
  Object.entries(patch).forEach(([key, value]) => {
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  });
  return target;
}
