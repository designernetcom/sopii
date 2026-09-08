/*
 * The gates (§12, §14, §30).
 * ===========================================================================
 * "Do not simply hide the menu item. Authorization must also be enforced on
 * the backend." This file is that enforcement. The frontend's `RoleGuard` and
 * `ProtectedRoute` decide what to *render*; nothing they do is trusted here.
 *
 * Nothing in a request body or header is believed about identity except a
 * signed access token, and even that is checked against the session it names —
 * so ending a session on the security screen takes effect immediately rather
 * than whenever the token happens to expire.
 */

import type { Request, RequestHandler } from 'express';
import type { PermissionAction, ResourceKey, Role } from '@/types';
import { forbidden, unauthorized } from '../lib/http.js';
import { authConfig } from './config.js';
import { safeEqual } from './crypto.js';
import {
  bearerToken,
  readAllCsrfCookies,
  retireLegacyCsrfCookie,
  touchSession,
  verifyAccessToken,
  findSession,
} from './sessions.js';
import { isAdminRole, type AuthRole, type UserDoc } from './models.js';
import { accountProblem, findUserWithSecret, roleFor } from './users.js';
import { authSessionKey, cacheGet, cacheKey, cacheSet, cacheDel, NAMESPACE, TTL } from '../lib/cache.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `requireUser` / `withUser`. */
      authUser?: {
        user: UserDoc;
        sessionId: string;
        role: AuthRole;
        surface: 'shop' | 'admin';
        /** The panel's permission matrix; null for a plain customer. */
        adminRole: Role | null;
      };
    }
  }
}

/* -------------------------------- resolving -------------------------------- */

/**
 * Resolves the caller from their access token, or null.
 *
 * THE COST, AND THE CACHE
 * ---------------------------------------------------------------------------
 * Three database reads — the session, the identity, the role — plus a write to
 * `lastActiveAt`, on *every authenticated request*. That is the right shape
 * and the wrong frequency: a pure-JWT check would be one signature
 * verification and no I/O, but then "Log out this device" would do nothing for
 * up to fifteen minutes, which is precisely the moment somebody uses it.
 *
 * So the reads stay, and they are cached for ten seconds keyed on the session
 * id. At a hundred requests a second from one signed-in shopper that is three
 * reads instead of three hundred, and the revocation guarantee weakens from
 * "immediate" to "within ten seconds" — still two orders of magnitude better
 * than the token's own lifetime, and the security screens call
 * `forgetAuthCache` when they revoke, so the ordinary path stays immediate.
 *
 * WHY CACHING THIS IS SAFE
 * ---------------------------------------------------------------------------
 * The key is the session id, which comes out of a *signature-verified* token.
 * A caller who cannot produce a valid signature for that session id can never
 * reach the cached entry, so this cannot leak one person's identity to
 * another. The password hash is stripped before anything is stored: it is
 * needed by the login path, not by this one, and a credential hash does not
 * belong in a cache whatever its key.
 */
interface CachedIdentity {
  user: UserDoc;
  role: AuthRole;
  adminRole: Role | null;
}

const authKey = authSessionKey;

/**
 * Drops a session's cached identity.
 *
 * Called wherever a session is revoked, a role changes or an account is
 * suspended, so the ten-second TTL is the backstop rather than the mechanism.
 */
export const forgetAuthCache = (sessionId: string) => cacheDel(authKey(sessionId));

async function resolveUser(req: Request) {
  const token = bearerToken(req);
  if (!token) return null;

  const claims = verifyAccessToken(token);
  if (!claims) return null;

  const cachedIdentity = await cacheGet<CachedIdentity>(authKey(claims.sid));
  if (cachedIdentity) {
    return {
      user: cachedIdentity.user,
      sessionId: claims.sid,
      role: cachedIdentity.role,
      surface: claims.surface,
      adminRole: cachedIdentity.adminRole,
    };
  }

  const session = await findSession(claims.sid);
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;

  const user = await findUserWithSecret({ _id: claims.sub });
  if (!user) return null;

  /*
   * The role is re-read from the database rather than taken from the token. A
   * demoted admin whose token still says `super_admin` must lose access at
   * once, not at the next refresh — §30's "never trust role information sent
   * by the frontend" applies to a token the frontend is holding too.
   */
  const adminRole = await roleFor(user);

  /*
   * The hash is removed before the identity is cached. Nothing downstream of
   * this middleware reads it — only the login and password-change paths do,
   * and they load the user themselves.
   */
  const { passwordHash: _secret, ...safeUser } = user as UserDoc & { passwordHash?: string };
  void _secret;

  await cacheSet(
    authKey(claims.sid),
    { user: safeUser as UserDoc, role: user.role, adminRole } satisfies CachedIdentity,
    TTL.auth,
  );

  return {
    user,
    sessionId: claims.sid,
    role: user.role,
    surface: claims.surface,
    adminRole,
  };
}

/** Attaches the caller when there is one, and says nothing when there is not. */
export const withUser: RequestHandler = (req, _res, next) => {
  resolveUser(req)
    .then((resolved) => {
      if (resolved && !accountProblem(resolved.user)) req.authUser = resolved;
      next();
    })
    .catch(next);
};

/** The gate. No valid token, no answer. */
export const requireUser: RequestHandler = (req, _res, next) => {
  resolveUser(req)
    .then((resolved) => {
      if (!resolved) unauthorized('Please sign in to continue.');

      const problem = accountProblem(resolved!.user);
      if (problem) forbidden(problem);

      req.authUser = resolved!;
      // Fire-and-forget, and throttled — see `touchSessionThrottled`.
      void touchSessionThrottled(resolved!.sessionId);
      next();
    })
    .catch(next);
};

/**
 * `lastActiveAt`, written at most once a minute per session.
 *
 * Unthrottled, this was **a database write on every authenticated request** —
 * at ten thousand requests a second, ten thousand writes a second updating a
 * timestamp that is displayed, rounded to the minute, on a screen almost
 * nobody opens. It is pure write amplification: it dirties a document and its
 * `lastActiveAt` index constantly, which on a replica set means that write
 * traffic is also replicated to every secondary.
 *
 * A minute of granularity is plainly enough for "last active", and the idle
 * timeout it feeds is measured in days.
 *
 * The marker lives in the shared cache, so the throttle holds across instances
 * rather than per process. On the in-memory fallback it degrades to one write
 * per minute *per instance*, which is still a reduction of several orders of
 * magnitude.
 */
async function touchSessionThrottled(sessionId: string) {
  const key = cacheKey(NAMESPACE.auth, 'touch', sessionId);
  if (await cacheGet<number>(key)) return;
  await cacheSet(key, Date.now(), TOUCH_INTERVAL_MS);
  await touchSession(sessionId);
}

const TOUCH_INTERVAL_MS = Number(process.env.AUTH_TOUCH_INTERVAL_MS ?? 60_000);

/* ---------------------------------- roles ---------------------------------- */

/**
 * §6 of the flows: an unauthorized customer reaching `/admin/*` gets a 403.
 *
 * Note what this does *not* do — redirect. The API answers 403 and the SPA
 * decides how to present it; an API that redirects is an API that cannot be
 * used by anything but a browser.
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.authUser) unauthorized('Please sign in to continue.');
  if (!isAdminRole(req.authUser!.role)) {
    forbidden('You do not have access to the SOPII admin panel.');
  }
  next();
};

/** Any of the listed roles will do. */
export function requireRole(...roles: AuthRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.authUser) unauthorized('Please sign in to continue.');
    if (!roles.includes(req.authUser!.role)) {
      forbidden('You do not have permission to do that.');
    }
    next();
  };
}

/**
 * The fine-grained check, against the panel's editable permission matrix.
 * `super_admin` short-circuits: §12 gives it full access by definition, and
 * relying on its matrix being complete would be a silent failure waiting for
 * the first person to untick a box.
 */
export function requirePermission(
  resource: ResourceKey,
  action: PermissionAction = 'view',
): RequestHandler {
  return (req, _res, next) => {
    if (!req.authUser) unauthorized('Please sign in to continue.');

    const { role, adminRole } = req.authUser!;
    if (role === 'super_admin') return next();

    if (!adminRole?.permissions?.[resource]?.[action]) {
      forbidden(`Your role cannot ${action} ${resource.replace('_', ' ')}.`);
    }
    next();
  };
}

/* ---------------------------------- CSRF ----------------------------------- */

/**
 * Double-submit CSRF, for the endpoints that authenticate by cookie.
 *
 * `/auth/refresh` and `/auth/logout` are the only ones that do — everything
 * else carries a bearer token, which a cross-site page cannot obtain and so
 * cannot forge. The check is that the `X-CSRF-Token` header equals the
 * readable CSRF cookie: same-origin JavaScript can read that cookie, a
 * cross-site form or image tag cannot.
 *
 * A request with no refresh cookie at all is let through, because there is no
 * session to attack and the handler will simply answer 401.
 */
export const requireCsrf: RequestHandler = (req, res, next) => {
  const refresh = (req.cookies as Record<string, string> | undefined)?.[
    authConfig.cookies.refreshName
  ];

  if (!refresh) return next();

  /*
   * All of them, because a browser can be holding the same cookie at two paths
   * — see `readAllCsrfCookies`. Matching any one presented value keeps a stale
   * copy from shadowing the live token and locking the session out for good,
   * and costs nothing: a cross-site page can read none of them either way.
   */
  const cookies = readAllCsrfCookies(req);
  if (cookies.length > 1) retireLegacyCsrfCookie(res);

  const header = req.get('x-csrf-token') ?? '';
  if (!header || !cookies.some((value) => safeEqual(value, header))) {
    forbidden('Your session could not be verified. Please refresh the page and try again.');
  }
  next();
};
