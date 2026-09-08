import type { NextFunction, Request, RequestHandler, Response } from 'express';

/* --------------------------------- errors ---------------------------------- */

export class HttpError extends Error {
  status: number;
  /** Seconds, echoed as a `Retry-After` header. Set by the rate limiters. */
  retryAfter?: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

export function notFound(what: string): never {
  throw new HttpError(404, `${what} not found`);
}

export function badRequest(message: string): never {
  throw new HttpError(400, message);
}

export function unauthorized(message = 'Authentication required'): never {
  throw new HttpError(401, message);
}

export function forbidden(message = 'You do not have permission to do that'): never {
  throw new HttpError(403, message);
}

/**
 * Express 4 does not forward rejected promises to the error handler, so every
 * async route is wrapped. The client only ever sees `{ message }`, which is the
 * shape `errorMessage()` in the admin panel reads.
 */
export function ah(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  if (error instanceof HttpError) {
    // A throttled caller is told when to come back, in the header a well-
    // behaved client already knows how to read.
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    res.status(error.status).json({ message: error.message });
    return;
  }

  // Mongoose validation / cast problems are the client's fault, not ours.
  const err = error as { name?: string; message?: string; code?: number; keyValue?: object };
  if (err?.name === 'ValidationError' || err?.name === 'CastError') {
    res.status(400).json({ message: err.message ?? 'Invalid request payload' });
    return;
  }
  if (err?.code === 11000) {
    res.status(400).json({ message: `That ${Object.keys(err.keyValue ?? {})[0] ?? 'value'} already exists` });
    return;
  }

  console.error('[api] unhandled error:', error);
  res.status(500).json({ message: err?.message ?? 'Unexpected server error' });
}

/* ------------------------------ query parsing ------------------------------ */

type Query = Request['query'];

export function str(query: Query, key: string): string | undefined {
  const value = query[key];
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}

export function num(query: Query, key: string, fallback: number): number {
  const raw = str(query, key);
  const parsed = Number(raw);
  return raw !== undefined && Number.isFinite(parsed) ? parsed : fallback;
}

export function bool(query: Query, key: string): boolean | undefined {
  const raw = str(query, key);
  if (raw === undefined) return undefined;
  return raw === 'true' || raw === '1';
}

/** RTK Query serialises array params as `a,b,c`. */
export function list(query: Query, key: string): string[] {
  const raw = str(query, key);
  if (!raw) return [];
  return raw.split(',').filter(Boolean);
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive contains-match across several fields. */
export function searchFilter(term: string | undefined, fields: string[]) {
  if (!term?.trim()) return null;
  const rx = new RegExp(escapeRegex(term.trim()), 'i');
  return { $or: fields.map((field) => ({ [field]: rx })) };
}

export function sortSpec(
  query: Query,
  defaultBy: string,
  defaultDir: 'asc' | 'desc',
  map: Record<string, string> = {},
): Record<string, 1 | -1> {
  const by = str(query, 'sortBy') ?? defaultBy;
  const dir = (str(query, 'sortDir') ?? defaultDir) === 'asc' ? 1 : -1;
  return { [map[by] ?? by]: dir };
}

/* -------------------------------- responses -------------------------------- */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function pageParams(query: Query, defaultSize = 10) {
  const pageSize = Math.max(1, num(query, 'pageSize', defaultSize));
  const page = Math.max(1, num(query, 'page', 1));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Pagination for result sets that had to be assembled in memory. */
export function paginateArray<T>(items: T[], page: number, pageSize: number): Paginated<T> {
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

/* ------------------------------- serialising ------------------------------- */

/**
 * `.lean()` queries and aggregations skip the schema's toJSON transform, so
 * this is the single place that turns a raw document into the `{ id, ... }`
 * shape the client's types describe.
 */
export function serialize<T extends { _id: unknown }>(doc: T, drop: string[] = []) {
  const { _id, ...rest } = doc as Record<string, unknown> & { _id: unknown };
  drop.forEach((key) => delete rest[key]);
  delete rest.__v;
  delete rest.passwordHash;
  return { id: _id, ...rest } as Record<string, unknown>;
}

export function serializeMany<T extends { _id: unknown }>(docs: T[], drop: string[] = []) {
  return docs.map((doc) => serialize(doc, drop));
}

/** Drops `undefined` values so a PATCH-style body never blanks a field. */
export function clean<T extends object>(patch: T): Partial<T> {
  const out: Record<string, unknown> = {};
  Object.entries(patch).forEach(([key, value]) => {
    if (value !== undefined) out[key] = value;
  });
  return out as Partial<T>;
}

export function nowIso() {
  return new Date().toISOString();
}

/*
 * Human-readable ids in the same `prefix_xxx` shape as the seed data.
 *
 * Re-exported from `ids.ts` rather than implemented here. The version that
 * used to live at this spot appended a per-process counter, which is unique on
 * one instance and emphatically not unique across three behind a load balancer
 * — see the note in `ids.ts`. Keeping the name and the import path means every
 * existing call site got the fix without being touched.
 */
export { nextId } from './ids.js';
