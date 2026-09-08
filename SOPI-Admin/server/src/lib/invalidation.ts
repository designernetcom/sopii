/*
 * Cache invalidation, applied at the router rather than in each handler.
 * ===========================================================================
 * §5 asks for an invalidation strategy. The obvious implementation is a call
 * to `invalidate(...)` at the end of every write handler — and it is the wrong
 * one, for a reason that shows up six months later rather than today: there
 * are roughly twenty-five write handlers across products, taxonomy, CMS and
 * marketing, and the twenty-sixth will not have the call. The symptom is an
 * admin publishing a product and not seeing it on the shop, which reads as
 * "the cache is broken" and is very hard to trace back to one missing line.
 *
 * So invalidation is attached where the routes are mounted: any successful
 * mutating request under a router drops that router's namespaces. A new
 * handler inherits it by existing.
 *
 * WHY ON `finish`, AND WHY SUCCESS ONLY
 * ---------------------------------------------------------------------------
 * `res.on('finish')` runs after the response is sent, so invalidation costs the
 * caller nothing — the admin's save has already returned by the time the keys
 * are dropped. And a 4xx changed nothing, so dropping a warm catalogue key
 * because somebody submitted an invalid form would be pure waste: a validation
 * failure is the commonest write outcome there is.
 *
 * The window this leaves is real and small: between the database write
 * committing and the eviction landing, a concurrent read can repopulate a key
 * with pre-write data, which then lives out its TTL. For a product catalogue,
 * one minute of staleness after a save that mostly is not concurrent with a
 * read is the right trade against making every admin write wait on a cache
 * round trip. Where it is not the right trade — store settings, which back
 * every checkout quote — the handler awaits the invalidation explicitly
 * instead, and `routes/platform.ts` says so at the call site.
 */

import type { RequestHandler } from 'express';
import { invalidate } from './cache.js';
import { logger } from './logger.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Drops `namespaces` after any successful write handled below this point.
 *
 * @example
 *   api.use('/products', invalidates(NAMESPACE.catalog, NAMESPACE.seo), productRoutes);
 */
export function invalidates(...namespaces: string[]): RequestHandler {
  return (req, res, next) => {
    if (!MUTATING.has(req.method)) return next();

    res.on('finish', () => {
      if (res.statusCode >= 400) return;

      void invalidate(...namespaces).catch((error) => {
        // A failed eviction means stale reads until the TTL expires, which is
        // a degradation rather than an error — but a silent one, so it is
        // logged loudly enough to correlate with "the shop is showing the old
        // price" if that is ever reported.
        logger.error('cache.invalidate_failed', {
          detail: namespaces.join(','),
          route: req.originalUrl,
          error,
        });
      });
    });

    next();
  };
}
