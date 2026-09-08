import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import fs from 'node:fs';

import { env, isProduction } from './env.js';
import { connectDb, dbBackend, disconnectDb } from './db/connect.js';
import { ensureIndexes } from './db/indexes.js';
import { seedIfEmpty } from './db/seed.js';
import { seedSeo } from './db/seedSeo.js';
import { cacheStats, initCache } from './lib/cache.js';
import { logger } from './lib/logger.js';
import {
  accessLog,
  metricsSnapshot,
  requestContext,
  securityHeaders,
} from './lib/observability.js';
import { limits, rateLimit } from './lib/rateLimit.js';
import { NAMESPACE } from './lib/cache.js';
import { invalidates } from './lib/invalidation.js';
import { flushDeliveryLog } from './lib/emailLog.js';
import { closeTransport } from './lib/mailtrap.js';
import { queueStats, startWorker, stopWorker } from './lib/queue.js';
/* Imported for its side effects: registering every job handler. */
import './jobs/handlers.js';
import { alignOrderCodeSequence } from './routes/shop.js';
import { authConfig } from './auth/config.js';
import { seedAuthIdentities } from './auth/seed.js';
import { requireAuth } from './lib/auth.js';
import { errorHandler } from './lib/http.js';
import { authModuleRoutes } from './auth/routes/index.js';

import { authRoutes } from './routes/auth.js';
import { storefrontRoutes } from './routes/storefront.js';
import { seoFeedRoutes, seoRootRoutes } from './routes/publicSeo.js';
import { seoRoutes } from './routes/seo.js';
import { shopRoutes } from './routes/shop.js';
import { paymentRoutes } from './payments/routes.js';
import { productRoutes } from './routes/products.js';
import { categoryRoutes, collectionRoutes } from './routes/taxonomy.js';
import { customerRoutes, inventoryRoutes, orderRoutes } from './routes/commerce.js';
import { couponRoutes, reviewRoutes } from './routes/marketing.js';
import { homepageRoutes, mediaRoutes, notificationRoutes } from './routes/cms.js';
import { uploadRoutes } from './routes/uploads.js';
import {
  adminUserRoutes,
  dashboardRoutes,
  reportRoutes,
  roleRoutes,
  searchRoutes,
  settingsRoutes,
} from './routes/platform.js';
import { authSettingsRoutes } from './routes/authSettings.js';

/**
 * Origins allowed to make credentialed calls to /api/auth: whatever CORS_ORIGIN
 * lists, plus the two configured front ends, so the shop and the panel work
 * without a second variable having to repeat them.
 */
const authOrigins = [
  ...new Set([
    ...env.corsOrigins,
    authConfig.frontends.shop,
    authConfig.frontends.admin,
  ]),
];

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  /*
   * A correlation id first, before anything can fail, so even a rejected
   * request is traceable. `accessLog` follows it: both attach listeners rather
   * than doing work, so they cost effectively nothing and must not be behind
   * anything that can throw.
   */
  app.use(requestContext);
  app.use(securityHeaders);
  app.use(accessLog);

  /*
   * Gzip every response above a few hundred bytes.
   *
   * The storefront's catalogue feed is the reason: `/api/storefront/bootstrap`
   * is 1.2 MB of JSON, and on a phone that was the whole critical path — the
   * shop cannot paint a product until it lands, so it dominated Largest
   * Contentful Paint. The same payload gzips to 121 KB, a 90% reduction, for
   * about a millisecond of CPU.
   *
   * Images and fonts are already compressed formats, so `compression` skips
   * them on its own via the Content-Type filter.
   */
  app.use(compression());

  /*
   * Behind a reverse proxy, `req.ip` and `req.secure` are only meaningful once
   * Express is told to trust the forwarding headers. The auth module's rate
   * limits and audit log are keyed on the client address, so without this
   * every request in production would look as if it came from the load
   * balancer — one IP, one shared limit.
   *
   * Left off in development, where the headers are attacker-controlled and
   * there is no proxy to trust.
   */
  if (isProduction) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  /* The refresh and CSRF cookies the auth module issues (§14). */
  app.use(cookieParser());

  /*
   * Three CORS policies, chosen per request.
   *
   * /api/auth carries cookies, so it must name its origins explicitly — the
   * spec forbids `Access-Control-Allow-Origin: *` alongside credentials, and
   * for good reason. Both front ends are allowed by default, which is what
   * lets one auth API serve the shop and the panel from separate origins.
   *
   * /api/storefront is public, credential-free, read-only data, so it answers
   * any origin — that is what lets the shop front call it from its own dev
   * port without anyone editing CORS_ORIGIN first.
   *
   * Everything else is the admin API: pinned origins, credentials on.
   */
  app.use(
    cors((req, callback) => {
      if (req.path.startsWith('/api/auth')) {
        callback(null, { origin: authOrigins, credentials: true, maxAge: 600 });
        return;
      }
      if (req.path.startsWith('/api/storefront') || req.path.startsWith('/media')) {
        callback(null, { origin: true, credentials: false });
        return;
      }
      callback(null, { origin: env.corsOrigins, credentials: true });
    }),
  );

  /*
   * The media library, served straight off disk.
   *
   * Product, category, collection and banner records store site-relative paths
   * like `/media/products/saree-01.jpg`. The admin panel resolves those against
   * its own dev server, which serves `public/`; the shop front runs on another
   * origin entirely and cannot. Serving the same directory here gives both a
   * single absolute source for imagery, and is the seam to replace with a CDN
   * origin later — nothing but this mount would change.
   */
  if (fs.existsSync(env.mediaDir)) {
    app.use(
      '/media',
      express.static(env.mediaDir, {
        index: false,
        // Filenames are stable and files are replaced rather than edited, so a
        // week of browser cache is safe and revalidation stays cheap.
        maxAge: '7d',
        fallthrough: true,
      }),
    );
    console.log(`[api] serving /media from ${env.mediaDir}`);
  } else {
    console.warn(`[api] no media directory at ${env.mediaDir} — /media will 404`);
  }

  /*
   * Body limits, per surface rather than one global 25 MB.
   *
   * The 25 MB ceiling exists for one reason — the admin panel posts images as
   * base64 data URIs — and applying it everywhere meant every unauthenticated
   * endpoint on the public API would also accept a 25 MB body. A handful of
   * concurrent 25 MB posts to `/api/storefront/newsletter` is a memory
   * exhaustion attack that needs no credentials and no cleverness.
   *
   * So the large limit is scoped to the two authenticated routes that need it,
   * and everything else gets 256 KB — comfortably more than the largest
   * legitimate checkout body and far too small to be a weapon.
   */
  const uploadLimit = process.env.UPLOAD_BODY_LIMIT ?? '25mb';
  app.use('/api/uploads', express.json({ limit: uploadLimit }));
  app.use('/api/media', express.json({ limit: uploadLimit }));
  app.use(express.json({ limit: process.env.BODY_LIMIT ?? '256kb' }));

  /**
   * The load balancer's health check, and the one place that says which
   * optional pieces are actually live.
   *
   * `cache: "memory"` in a multi-instance deployment is the single most useful
   * warning this endpoint can give — it means REDIS_URL is unset, so every
   * instance is caching separately and every rate limit is per-instance.
   * Reporting it beats leaving an operator to infer it from a graph.
   */
  app.get('/api/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    /*
     * A failover to the embedded mongod is reported as `degraded`, not `ok`.
     * The process is connected and fast, and answering from the wrong
     * catalogue — so a check that only asks "is the database up?" passes while
     * the store serves data nobody configured. Anything watching this endpoint
     * should treat it as an incident, which is what the non-200 is for.
     */
    const backend = dbBackend();
    const healthy = dbUp && backend === 'configured';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      db: dbUp ? (backend === 'embedded-fallback' ? 'embedded-fallback' : 'connected') : 'disconnected',
      cache: cacheStats().backend,
      uptime: Math.round(process.uptime()),
    });
  });

  /**
   * §18's numbers, and §22's: latency percentiles per route, error rate, memory,
   * cache hit rate and queue depth.
   *
   * Not a replacement for a real APM — it is what makes a load test readable
   * with no infrastructure at all, and the shape an exporter would scrape.
   * Behind a token when METRICS_TOKEN is set, because route-level latency is a
   * map of what the system does and how slow each part is, which is
   * reconnaissance if it is left open.
   */
  app.get('/api/metrics', (req, res) => {
    const token = process.env.METRICS_TOKEN?.trim();

    /*
     * Closed by default in production.
     *
     * Route-level latency and error counts are a map of what the system does
     * and which parts of it are slow — useful to an operator and equally
     * useful to somebody deciding where to point a load. In development it is
     * open because that is the point of it; in production an unset
     * METRICS_TOKEN means the endpoint does not exist, rather than meaning it
     * is public. Failing closed is the only safe default for a switch somebody
     * will forget to set.
     */
    if (isProduction && !token) {
      res.status(404).json({ message: 'Not found' });
      return;
    }

    if (token && req.get('x-metrics-token') !== token) {
      res.status(404).json({ message: 'Not found' });
      return;
    }

    void queueStats()
      .then((queue) => res.json({ ...metricsSnapshot(), cache: cacheStats(), queue }))
      .catch(() => res.json({ ...metricsSnapshot(), cache: cacheStats(), queue: null }));
  });

  /*
   * Crawler-facing documents, at the root where crawlers look for them.
   * Mounted before the auth gate: a robots.txt behind a login is useless.
   */
  app.use('/', seoRootRoutes);

  /*
   * The blanket ceiling on the public API, in front of every storefront route.
   *
   * Per-route limits (search, checkout, payment) sit inside and are tighter;
   * this one is the backstop that stops a single client walking the whole
   * catalogue, and it is deliberately generous enough that a shopper browsing
   * quickly never meets it.
   */
  app.use('/api/storefront', rateLimit(limits.publicApi));

  // The shop front's feed: public, read-only, mounted before the auth gate.
  app.use('/api/storefront', storefrontRoutes);
  app.use('/api/storefront', seoFeedRoutes);
  // …and its write half: shop accounts, checkout and order lookups. Its own
  // routes carry their own customer-session guards.
  app.use('/api/storefront', shopRoutes);
  /*
   * …and the online-payment half. Mounted separately because it is the only
   * place a paid order is written: a Razorpay order is created here, the
   * signature is verified here, and only then does the shared order writer in
   * shop.ts run. Nothing in shopRoutes can produce a paid order.
   */
  app.use('/api/storefront', paymentRoutes);

  /*
   * The unified auth module (§1-§32). Serves the shop front and the admin
   * panel from one place: the same three login methods, one identity model,
   * and a role check that decides which surface a session is allowed on.
   *
   * Mounted *before* the panel's older router so that where the two define the
   * same path — /login, /me, /logout — the unified one answers. What remains
   * of the legacy router (profile, two-factor) falls through to it, so the
   * panel screens that still call those keep working.
   */
  app.use('/api/auth', authModuleRoutes);
  app.use('/api/auth', authRoutes);

  const api = express.Router();
  api.use(requireAuth);
  /*
   * Keyed per admin account rather than per IP (see `userOrIpKey`), so one
   * misbehaving integration is throttled without taking the whole office's
   * shared address down with it.
   */
  api.use(rateLimit(limits.adminApi));

  api.use('/dashboard', dashboardRoutes);
  api.use('/reports', reportRoutes);
  api.use('/search', searchRoutes);

  /*
   * §5's invalidation, attached at the mount rather than inside each handler —
   * see `lib/invalidation.ts` for why. Each line reads as "writing here makes
   * these caches stale", which is the fact somebody debugging a stale shop
   * actually wants to find.
   */
  api.use(
    '/products',
    invalidates(NAMESPACE.catalog, NAMESPACE.seo, NAMESPACE.analytics),
    productRoutes,
  );
  api.use(
    '/categories',
    invalidates(NAMESPACE.taxonomy, NAMESPACE.catalog, NAMESPACE.seo),
    categoryRoutes,
  );
  api.use(
    '/collections',
    invalidates(NAMESPACE.taxonomy, NAMESPACE.catalog, NAMESPACE.seo),
    collectionRoutes,
  );

  api.use('/orders', invalidates(NAMESPACE.analytics), orderRoutes);
  api.use('/customers', invalidates(NAMESPACE.analytics), customerRoutes);
  /* Adjusting stock changes what the shop shows as available. */
  api.use('/inventory', invalidates(NAMESPACE.catalog, NAMESPACE.analytics), inventoryRoutes);

  api.use('/coupons', invalidates(NAMESPACE.catalog), couponRoutes);
  /* Approving a review moves a product's rating and its testimonial rail. */
  api.use('/reviews', invalidates(NAMESPACE.reviews, NAMESPACE.catalog), reviewRoutes);

  api.use('/homepage', invalidates(NAMESPACE.cms, NAMESPACE.catalog), homepageRoutes);
  api.use('/media', rateLimit(limits.upload), invalidates(NAMESPACE.cms), mediaRoutes);
  /* The panel's one door to Cloudinary. Kept apart from /media because it
     uploads bytes without writing a library record — a product gallery image
     belongs to its product, not to the library. */
  api.use('/uploads', rateLimit(limits.upload), uploadRoutes);
  api.use('/notifications', notificationRoutes);

  api.use('/seo', invalidates(NAMESPACE.seo), seoRoutes);

  api.use('/admin-users', adminUserRoutes);
  api.use('/roles', roleRoutes);
  /*
   * Mounted before the generic settings router so that the authentication
   * section is served by the handler that knows how to encrypt and redact its
   * credential, rather than by the passthrough that would store it in the
   * clear and hand it back on the next read.
   */
  api.use('/settings/authentication', authSettingsRoutes);
  api.use('/settings', settingsRoutes);

  app.use('/api', api);

  app.use((req, res) => {
    res.status(404).json({ message: `No route for ${req.method} ${req.originalUrl}` });
  });
  app.use(errorHandler);

  return app;
}

async function start() {
  await connectDb();
  await initCache();

  /*
   * Indexes before seeding, so the seed writes into an indexed collection
   * rather than provoking a build afterwards. Idempotent, and a failure is
   * logged rather than fatal — see `ensureIndexes`.
   */
  await ensureIndexes();

  await seedIfEmpty();
  // Gives every seeded admin an identity in the unified model, so the demo
  // logins keep working through the new /api/auth/login.
  await seedAuthIdentities();
  /* Idempotent: gives every route the panel manages exactly one metadata
     row, without touching rows an admin has already edited. */
  await seedSeo();
  /* Points the order-code counter at the highest code already issued, so a
     store upgrading from the old generator does not restart the series. */
  await alignOrderCodeSequence();

  startWorker();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info('api.listening', {
      detail: `http://localhost:${env.port}/api`,
      cache: cacheStats().backend,
      cors: env.corsOrigins.join(', '),
    });
  });

  /*
   * Keep-alive tuning, and it matters behind a load balancer.
   *
   * Node's default `keepAliveTimeout` is 5 s and most load balancers idle at
   * 60 s. When the shorter one wins, Node closes a connection the balancer
   * still believes is open, and the next request through it fails as a 502 —
   * intermittently, under load, for no reason visible in any log. The fix is
   * for the origin's timeout to be longer than the balancer's, and for the
   * headers timeout to be longer still.
   */
  server.keepAliveTimeout = Number(process.env.KEEPALIVE_TIMEOUT_MS ?? 65_000);
  server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS ?? 70_000);

  /**
   * Graceful shutdown — the half that makes a rolling deploy invisible.
   *
   * `server.close()` stops accepting new connections and lets in-flight
   * requests finish, so a checkout that was mid-write is not severed by a
   * deploy. The timeout is the backstop for a request that will never finish:
   * waiting forever turns one stuck connection into a stuck deployment.
   */
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('api.shutdown', { detail: signal });

    stopWorker();
    /* The SMTP pool holds open sockets to Mailtrap; closing it is what lets
       the process exit promptly rather than waiting on their idle timeout. */
    closeTransport();

    const forced = setTimeout(() => {
      logger.error('api.shutdown_forced', { detail: 'in-flight requests did not finish in time' });
      process.exit(1);
    }, Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 15_000));
    forced.unref();

    await new Promise<void>((resolve) => server.close(() => resolve()));
    /* Same reason as the mail pool above: the delivery log is written without
       being awaited, so a deploy would otherwise lose the last few entries. */
    await flushDeliveryLog();
    await disconnectDb();
    clearTimeout(forced);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  /*
   * A rejected promise nobody caught would otherwise terminate the process on
   * newer Node versions with a stack trace and no context. Logged structurally
   * instead, so it lands in the same place as everything else — and the
   * process is left running, because one unhandled rejection in a background
   * task is not a reason to drop every in-flight checkout.
   */
  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandled_rejection', { error: reason });
  });
  process.on('uncaughtException', (error) => {
    // An uncaught exception *is* a reason to restart: the process may be in an
    // unknown state. Shut down cleanly so the orchestrator replaces it.
    logger.error('process.uncaught_exception', { error });
    void shutdown('uncaughtException');
  });
}

start().catch((error) => {
  logger.error('api.start_failed', { error });
  process.exit(1);
});
