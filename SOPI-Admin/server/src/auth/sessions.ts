/*
 * Sessions, access tokens and refresh rotation (§14, §16).
 * ===========================================================================
 * The shape:
 *
 *   access token   short-lived JWT, returned in the response body, held by the
 *                  SPA in memory only. Never written to localStorage — §30.
 *   refresh token  256 random bits in an HttpOnly, SameSite cookie scoped to
 *                  /api/auth. Rotated on every use. Stored as a keyed digest,
 *                  so the database does not contain anything presentable.
 *   session        the row a person recognises on the "Active sessions" screen
 *                  and can end. Killing it invalidates every token beneath it.
 *
 * Rotation carries reuse detection: refreshing marks the presented token used
 * and issues a successor. If an already-used token turns up again after a
 * short grace period, two parties hold the same secret — the honest client and
 * whoever copied it — and there is no way to tell which is which, so the whole
 * session is revoked and the person has to sign in again.
 *
 * Why the access token is not itself checked against the database on every
 * request: that would make it a session id with extra steps. It is short-lived
 * instead, and `sid` lets a revoked session be caught the moment its holder
 * next refreshes. `requireUser` additionally rejects a token whose session has
 * been revoked, at the cost of one indexed lookup — worth it here.
 */

import type { CookieOptions, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authConfig } from './config.js';
import { id, randomToken, tokenDigest } from './crypto.js';
import { describeClient } from './device.js';
import {
  RefreshTokenModel,
  SessionModel,
  type AuthProvider,
  type AuthRole,
  type SessionDoc,
} from './models.js';
import { authSessionKey, cacheDel } from '../lib/cache.js';

/* ------------------------------ access tokens ------------------------------ */

export interface AccessClaims {
  /** The identity's id. */
  sub: string;
  /** The session this token belongs to, so a revoked device dies with it. */
  sid: string;
  role: AuthRole;
  surface: 'shop' | 'admin';
  typ: 'access';
}

export function signAccessToken(claims: Omit<AccessClaims, 'typ'>) {
  return jwt.sign({ ...claims, typ: 'access' } satisfies AccessClaims, authConfig.secret, {
    expiresIn: Math.floor(authConfig.tokens.accessTtlMs / 1000),
    issuer: authConfig.issuer,
    audience: authConfig.audience,
  });
}

/** Returns the claims, or null for anything expired, forged or of the wrong type. */
export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const payload = jwt.verify(token, authConfig.secret, {
      issuer: authConfig.issuer,
      audience: authConfig.audience,
    }) as AccessClaims;
    return payload.typ === 'access' ? payload : null;
  } catch {
    return null;
  }
}

/** `Authorization: Bearer <token>`, or undefined. */
export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token || undefined;
}

/* --------------------------------- cookies --------------------------------- */

function cookieOptions(maxAgeMs: number, httpOnly: boolean): CookieOptions {
  const { sameSite, secure, domain, path, csrfPath } = authConfig.cookies;
  return {
    httpOnly,
    secure,
    sameSite,
    domain,
    // The readable half needs site-wide scope; see `cookies.csrfPath`.
    path: httpOnly ? path : csrfPath,
    maxAge: maxAgeMs,
  };
}

/**
 * Sets both halves of the session cookie pair.
 *
 * The CSRF cookie is deliberately *not* HttpOnly: the SPA has to read it to
 * echo it back in a header, which is the whole double-submit mechanism. It is
 * not a credential on its own — presenting it proves only that the request
 * came from a page able to read this site's cookies, which is exactly the
 * thing a cross-site form cannot do.
 */
export function setSessionCookies(res: Response, refreshToken: string, csrfToken: string) {
  const ttl = authConfig.tokens.refreshTtlMs;
  res.cookie(authConfig.cookies.refreshName, refreshToken, cookieOptions(ttl, true));
  setCsrfCookie(res, csrfToken);
}

/** The readable half on its own, for `/auth/csrf` re-seeding an existing session. */
export function setCsrfCookie(res: Response, csrfToken: string) {
  res.cookie(
    authConfig.cookies.csrfName,
    csrfToken,
    cookieOptions(authConfig.tokens.refreshTtlMs, false),
  );
}

export function clearSessionCookies(res: Response) {
  const { refreshName, csrfName, path, csrfPath, domain, sameSite, secure } = authConfig.cookies;
  const options: CookieOptions = { domain, sameSite, secure };
  res.clearCookie(refreshName, { ...options, path, httpOnly: true });
  // Path must match the one it was set with, or the browser keeps the cookie.
  res.clearCookie(csrfName, { ...options, path: csrfPath });
  /*
   * Sessions issued before the CSRF cookie moved to `/` left one behind on
   * `/api/auth`. It is unreadable from the app's pages but still travels to the
   * auth endpoints, where it would shadow the new one and fail every
   * double-submit check. Clearing both paths retires it on the next sign-out or
   * failed refresh; harmless once none are left.
   */
  if (csrfPath !== path) res.clearCookie(csrfName, { ...options, path });
}

export const readRefreshCookie = (req: Request): string | undefined =>
  (req.cookies as Record<string, string> | undefined)?.[authConfig.cookies.refreshName];


/**
 * Every `sopii_csrf` value the browser presented, not just the first.
 *
 * `cookie-parser` keeps one value per name, and when a browser holds the same
 * cookie at two paths — `/api/auth` from a session issued before `csrfPath`
 * moved to `/`, and `/` from every session since — it sends both, narrower
 * path first (RFC 6265 §5.4). The first one wins the parse, which is the stale
 * one, while `document.cookie` on a page like `/auth/callback` can only see the
 * site-wide one. The double-submit check then compares two different tokens and
 * fails forever: the 403 is thrown before any handler runs, so nothing ever
 * clears the cookie that is causing it.
 *
 * Reading the raw header is what breaks that deadlock. It does not widen the
 * check — every value here was still set by this origin, and a cross-site page
 * can read none of them.
 */
export function readAllCsrfCookies(req: Request): string[] {
  const header = req.headers.cookie;
  if (!header) return [];

  const name = authConfig.cookies.csrfName;
  const values: string[] = [];

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    if (pair.slice(0, eq).trim() !== name) continue;
    try {
      values.push(decodeURIComponent(pair.slice(eq + 1).trim()));
    } catch {
      values.push(pair.slice(eq + 1).trim());
    }
  }

  return values;
}

/**
 * Drops a CSRF cookie left on the refresh cookie's path by an older session.
 *
 * Called once a duplicate has been seen, so the pair heals itself on the next
 * round trip instead of shadowing the live token indefinitely. Only ever
 * removes the narrow-path copy — the site-wide one this session is using is set
 * again by the same response, and the refresh token is not touched.
 */
export function retireLegacyCsrfCookie(res: Response) {
  const { csrfName, path, csrfPath, domain, sameSite, secure } = authConfig.cookies;
  if (csrfPath === path) return;
  res.clearCookie(csrfName, { domain, sameSite, secure, path });
}

/* --------------------------------- sessions -------------------------------- */

export interface IssuedSession {
  session: SessionDoc;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  /** Seconds, for the client's refresh timer. */
  expiresIn: number;
}

/**
 * Opens a session and mints its first token pair.
 *
 * Also enforces §14's device ceiling: past `maxPerUser` concurrent sessions on
 * the same surface, the least recently used one is revoked. A person with ten
 * live devices and an eleventh sign-in is far more likely to have forgotten an
 * old laptop than to genuinely need eleven.
 */
export async function createSession(
  req: Request,
  {
    userId,
    role,
    method,
    surface,
  }: { userId: string; role: AuthRole; method: AuthProvider; surface: 'shop' | 'admin' },
): Promise<IssuedSession> {
  const client = describeClient(req);
  const now = Date.now();

  await evictOldestSessions(userId, surface);

  const session = await SessionModel.create({
    _id: id('ses'),
    userId,
    method,
    surface,
    ip: client.ip,
    userAgent: client.userAgent,
    browser: client.browser,
    os: client.os,
    deviceType: client.deviceType,
    createdAt: new Date(now),
    lastActiveAt: new Date(now),
    expiresAt: new Date(now + authConfig.tokens.refreshTtlMs),
  });

  const refreshToken = await issueRefreshToken(userId, session._id);
  const accessToken = signAccessToken({ sub: userId, sid: session._id, role, surface });

  return {
    session: session.toObject() as SessionDoc,
    accessToken,
    refreshToken,
    csrfToken: randomToken(24),
    expiresIn: Math.floor(authConfig.tokens.accessTtlMs / 1000),
  };
}

async function evictOldestSessions(userId: string, surface: 'shop' | 'admin') {
  const cap = authConfig.session.maxPerUser;
  if (cap <= 0) return;

  const live = await SessionModel.find({
    userId,
    surface,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastActiveAt: -1 })
    .select('_id')
    .lean<{ _id: string }[]>();

  // `cap - 1` because the session about to be created takes one of the slots.
  const surplus = live.slice(Math.max(0, cap - 1));
  await Promise.all(
    surplus.map((entry) => revokeSession(entry._id, 'device limit reached')),
  );
}

async function issueRefreshToken(userId: string, sessionId: string) {
  const token = randomToken(32);
  await RefreshTokenModel.create({
    _id: id('rft'),
    userId,
    sessionId,
    tokenHash: tokenDigest(token),
    expiresAt: new Date(Date.now() + authConfig.tokens.refreshTtlMs),
    createdAt: new Date(),
  });
  return token;
}

/* --------------------------------- rotation -------------------------------- */

export type RefreshOutcome =
  | { ok: true; userId: string; sessionId: string; refreshToken: string; session: SessionDoc }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' | 'reused'; userId?: string };

/**
 * Exchanges a refresh token for its successor.
 *
 * The interesting branch is the middle one. A token that has already been used
 * is either the honest client's second tab firing at the same instant — hence
 * the grace window, during which the successor is simply handed back — or a
 * copy in someone else's hands. Past the grace window there is no way to tell
 * those apart, so the safe answer is to end the session for everyone.
 */
export async function rotateRefreshToken(presented: string): Promise<RefreshOutcome> {
  const hash = tokenDigest(presented);
  const record = await RefreshTokenModel.findOne({ tokenHash: hash }).lean();

  if (!record) return { ok: false, reason: 'invalid' };
  if (record.revokedAt) return { ok: false, reason: 'revoked', userId: record.userId };
  if (record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expired', userId: record.userId };
  }

  if (record.usedAt) {
    const withinGrace =
      Date.now() - record.usedAt.getTime() <= authConfig.tokens.refreshGraceMs && record.replacedBy;

    if (!withinGrace) {
      await revokeSession(record.sessionId, 'refresh token reuse detected');
      return { ok: false, reason: 'reused', userId: record.userId };
    }

    /*
     * Inside the grace window: hand back the successor this token already
     * produced, rather than minting a third one. Two tabs then converge on the
     * same token instead of racing each other into a reuse alarm.
     */
    const successor = await RefreshTokenModel.findById(record.replacedBy).lean();
    const session = await liveSession(record.sessionId);
    if (!successor || successor.revokedAt || !session) {
      return { ok: false, reason: 'revoked', userId: record.userId };
    }
    // The successor's plaintext is gone, so a fresh one is issued in its place
    // and the successor is retired in the same breath.
    const replacement = await issueRefreshToken(record.userId, record.sessionId);
    await RefreshTokenModel.updateOne(
      { _id: successor._id },
      { $set: { usedAt: new Date(), replacedBy: tokenDigest(replacement) } },
    );
    await touchSession(record.sessionId);
    return {
      ok: true,
      userId: record.userId,
      sessionId: record.sessionId,
      refreshToken: replacement,
      session,
    };
  }

  const session = await liveSession(record.sessionId);
  if (!session) return { ok: false, reason: 'revoked', userId: record.userId };

  const next = randomToken(32);
  const successor = await RefreshTokenModel.create({
    _id: id('rft'),
    userId: record.userId,
    sessionId: record.sessionId,
    tokenHash: tokenDigest(next),
    expiresAt: new Date(Date.now() + authConfig.tokens.refreshTtlMs),
    createdAt: new Date(),
  });

  await RefreshTokenModel.updateOne(
    { _id: record._id },
    { $set: { usedAt: new Date(), replacedBy: successor._id } },
  );

  await touchSession(record.sessionId);

  return {
    ok: true,
    userId: record.userId,
    sessionId: record.sessionId,
    refreshToken: next,
    session,
  };
}

/**
 * A session that is still allowed to mint tokens.
 *
 * Three ways it can fail: revoked by hand, past its absolute lifetime, or idle
 * for longer than the timeout. The last one is why a forgotten tab on a shared
 * machine does not stay signed in indefinitely.
 */
async function liveSession(sessionId: string): Promise<SessionDoc | null> {
  const session = await SessionModel.findById(sessionId).lean<SessionDoc>();
  if (!session || session.revokedAt) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) return null;
  if (now - session.createdAt.getTime() > authConfig.session.maxLifetimeMs) {
    await revokeSession(sessionId, 'maximum session lifetime reached');
    return null;
  }
  if (now - session.lastActiveAt.getTime() > authConfig.session.idleTimeoutMs) {
    await revokeSession(sessionId, 'idle timeout');
    return null;
  }
  return session;
}

export async function touchSession(sessionId: string) {
  const now = new Date();
  await SessionModel.updateOne(
    { _id: sessionId },
    {
      $set: {
        lastActiveAt: now,
        // Sliding expiry: an active device keeps its session alive, up to the
        // absolute lifetime that `liveSession` enforces.
        expiresAt: new Date(now.getTime() + authConfig.tokens.refreshTtlMs),
      },
    },
  );
}

/** Reads a session without the liveness checks — for `requireUser`. */
export const findSession = (sessionId: string) =>
  SessionModel.findById(sessionId).lean<SessionDoc>();

/* -------------------------------- revocation ------------------------------- */

/**
 * Ends one session and every token beneath it. §15's "invalidate session".
 *
 * The cache eviction is not an optimisation — it is what keeps the guarantee.
 * `auth/middleware.ts` caches a resolved identity for ten seconds keyed on the
 * session id, so without this line "Log out this device" would leave the
 * revoked device working for up to ten more seconds, which is the one moment
 * somebody is actually watching.
 */
export async function revokeSession(sessionId: string, reason = 'signed out') {
  const now = new Date();
  await Promise.all([
    SessionModel.updateOne(
      { _id: sessionId, revokedAt: { $exists: false } },
      { $set: { revokedAt: now, revokedReason: reason } },
    ),
    RefreshTokenModel.updateMany(
      { sessionId, revokedAt: { $exists: false } },
      { $set: { revokedAt: now } },
    ),
    cacheDel(authSessionKey(sessionId)),
  ]);
}

/** §16's "Log out all other devices". */
export async function revokeOtherSessions(userId: string, keepSessionId: string) {
  const others = await SessionModel.find({
    userId,
    _id: { $ne: keepSessionId },
    revokedAt: { $exists: false },
  })
    .select('_id')
    .lean<{ _id: string }[]>();

  await Promise.all(others.map((entry) => revokeSession(entry._id, 'signed out from another device')));
  return others.length;
}

/** Used after a password change or reset — every old device has to sign in again. */
export async function revokeAllSessions(userId: string, reason: string) {
  const all = await SessionModel.find({ userId, revokedAt: { $exists: false } })
    .select('_id')
    .lean<{ _id: string }[]>();

  await Promise.all(all.map((entry) => revokeSession(entry._id, reason)));
  return all.length;
}

/* --------------------------------- listing --------------------------------- */

export interface PublicSession {
  id: string;
  browser: string;
  os: string;
  deviceType: string;
  label: string;
  ip?: string;
  location?: string;
  method: string;
  surface: string;
  current: boolean;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

/** The live sessions for one identity, current device first (§16). */
export async function listSessions(
  userId: string,
  currentSessionId: string | undefined,
): Promise<PublicSession[]> {
  const sessions = await SessionModel.find({
    userId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastActiveAt: -1 })
    .lean<SessionDoc[]>();

  return sessions
    .map((session) => ({
      id: session._id,
      browser: session.browser ?? 'Unknown browser',
      os: session.os ?? 'Unknown device',
      deviceType: session.deviceType ?? 'unknown',
      label: `${session.browser ?? 'Unknown browser'} — ${session.os ?? 'Unknown device'}`,
      ip: session.ip,
      location: session.location,
      method: session.method,
      surface: session.surface,
      current: session._id === currentSessionId,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}
