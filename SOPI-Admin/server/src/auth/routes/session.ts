/*
 * Session lifecycle (§13, §14, §15, §16).
 * ===========================================================================
 *   GET    /api/auth/me
 *   POST   /api/auth/refresh
 *   POST   /api/auth/logout
 *   GET    /api/auth/sessions
 *   DELETE /api/auth/sessions/:id
 *   POST   /api/auth/sessions/logout-all
 *
 * `/refresh` is the interesting one. It is the only endpoint authenticated by
 * cookie rather than by bearer token, which is why it — and `/logout`, for the
 * same reason — carry the CSRF check. It is also how a page load recovers a
 * session without anything sensitive ever having been written to storage: the
 * SPA holds its access token in a JavaScript variable, loses it on reload, and
 * asks for a new one here.
 */

import { Router } from 'express';
import { ah, notFound, unauthorized } from '../../lib/http.js';
import { audit, recentActivity } from '../audit.js';
import { authConfig } from '../config.js';
import { resolveWhatsAppConfig } from '../whatsappConfig.js';
import { randomToken } from '../crypto.js';
import { requireCsrf, requireUser } from '../middleware.js';
import { SessionModel } from '../models.js';
import {
  clearSessionCookies,
  listSessions,
  readAllCsrfCookies,
  readRefreshCookie,
  retireLegacyCsrfCookie,
  revokeOtherSessions,
  revokeSession,
  rotateRefreshToken,
  setCsrfCookie,
  setSessionCookies,
  signAccessToken,
} from '../sessions.js';
import { accountProblem, findUserWithSecret, toPublicUser } from '../users.js';
import { landingFor, MESSAGES } from './shared.js';

export const sessionRoutes = Router();

/* ----------------------------------- me ------------------------------------ */

/**
 * §13's `user`, `role` and `permissions`, from the server rather than from
 * whatever the client last cached. `useAuth()` calls this after every refresh,
 * so a role changed in the panel takes effect on the customer's next reload.
 */
sessionRoutes.get(
  '/me',
  requireUser,
  ah(async (req, res) => {
    const { user, sessionId, surface } = req.authUser!;
    res.json({
      user: await toPublicUser(user, { currentSessionId: sessionId }),
      sessionId,
      surface,
      redirectTo: landingFor(user, surface),
    });
  }),
);

/* --------------------------------- refresh --------------------------------- */

/**
 * Exchanges the refresh cookie for a fresh access token, rotating the cookie.
 *
 * Every failure clears the cookies. Leaving a token that the server has just
 * refused sitting in the browser only produces a client that retries forever;
 * clearing it makes the SPA fall through to its signed-out state immediately.
 */
sessionRoutes.post(
  '/refresh',
  requireCsrf,
  ah(async (req, res) => {
    const presented = readRefreshCookie(req);
    if (!presented) {
      clearSessionCookies(res);
      unauthorized('Your session has ended. Please sign in again.');
    }

    const outcome = await rotateRefreshToken(presented!);

    if (!outcome.ok) {
      clearSessionCookies(res);

      if (outcome.reason === 'reused') {
        /*
         * Two parties presented the same refresh token. `rotateRefreshToken`
         * has already killed the session; this records why, because it is the
         * single most useful line in the audit log when investigating a
         * compromise.
         */
        await audit(req, {
          action: 'token_reuse_detected',
          status: 'failure',
          userId: outcome.userId,
          reason: 'refresh token replayed after rotation',
        });
        unauthorized('Your session has ended for security reasons. Please sign in again.');
      }

      unauthorized('Your session has ended. Please sign in again.');
    }

    const user = await findUserWithSecret({ _id: outcome.userId });
    if (!user || accountProblem(user)) {
      // Suspended between one refresh and the next.
      await revokeSession(outcome.sessionId, 'account is no longer active');
      clearSessionCookies(res);
      unauthorized(user ? MESSAGES.unavailable : 'Your session has ended. Please sign in again.');
    }

    const csrfToken = randomToken(24);
    setSessionCookies(res, outcome.refreshToken, csrfToken);

    res.json({
      user: await toPublicUser(user!, { currentSessionId: outcome.sessionId }),
      accessToken: signAccessToken({
        sub: user!._id,
        sid: outcome.sessionId,
        // Re-read from the database, so a demotion applies at the next refresh
        // rather than whenever the old token happened to run out.
        role: user!.role,
        surface: outcome.session.surface,
      }),
      expiresIn: Math.floor(authConfig.tokens.accessTtlMs / 1000),
      csrfToken,
      redirectTo: landingFor(user!, outcome.session.surface),
    });
  }),
);

/* ---------------------------------- logout --------------------------------- */

/**
 * §15. Invalidates the session server-side and clears the cookies.
 *
 * Deliberately tolerant: a logout with no session, or an expired one, still
 * answers 200 and still clears the cookies. A 401 here would leave a client
 * that cannot sign out of a session it believes it has, which is the one
 * outcome a logout button must never produce.
 */
sessionRoutes.post(
  '/logout',
  requireCsrf,
  ah(async (req, res) => {
    const presented = readRefreshCookie(req);

    if (presented) {
      const outcome = await rotateRefreshToken(presented);
      if (outcome.ok) {
        await revokeSession(outcome.sessionId, 'signed out');
        await audit(req, {
          action: 'logout',
          userId: outcome.userId,
          sessionId: outcome.sessionId,
        });
      }
    } else if (req.authUser) {
      // No cookie — a native client, or a browser that lost it. The bearer
      // token still names the session to end.
      await revokeSession(req.authUser.sessionId, 'signed out');
      await audit(req, {
        action: 'logout',
        userId: req.authUser.user._id,
        sessionId: req.authUser.sessionId,
      });
    }

    clearSessionCookies(res);
    res.json({ ok: true, message: 'You have been logged out successfully.' });
  }),
);

/* --------------------------------- sessions -------------------------------- */

/** §16's "Active Sessions", current device first. */
sessionRoutes.get(
  '/sessions',
  requireUser,
  ah(async (req, res) => {
    const { user, sessionId } = req.authUser!;
    res.json({ items: await listSessions(user._id, sessionId) });
  }),
);

/**
 * Ends one device.
 *
 * The ownership check is the point: without `userId` in the filter, anyone
 * holding a valid token could revoke any session id they could guess.
 */
sessionRoutes.delete(
  '/sessions/:id',
  requireUser,
  ah(async (req, res) => {
    const { user, sessionId } = req.authUser!;

    const target = await SessionModel.findOne({ _id: req.params.id, userId: user._id }).lean();
    if (!target) notFound('Session');

    await revokeSession(target!._id, 'signed out from the security screen');
    await audit(req, {
      action: 'session_revoked',
      userId: user._id,
      sessionId: target!._id,
      reason: target!._id === sessionId ? 'current device' : 'another device',
    });

    // Revoking the device you are holding is a logout, cookies and all.
    if (target!._id === sessionId) clearSessionCookies(res);

    res.json({
      ok: true,
      message: 'That device has been signed out.',
      selfRevoked: target!._id === sessionId,
      items: await listSessions(user._id, sessionId),
    });
  }),
);

/** §16's "Logout all other devices" — this one stays signed in. */
sessionRoutes.post(
  '/sessions/logout-all',
  requireUser,
  ah(async (req, res) => {
    const { user, sessionId } = req.authUser!;
    const count = await revokeOtherSessions(user._id, sessionId);

    await audit(req, {
      action: 'session_revoked',
      userId: user._id,
      sessionId,
      reason: `signed out ${count} other device(s)`,
    });

    res.json({
      ok: true,
      message:
        count === 0
          ? 'There were no other devices signed in.'
          : `Signed out of ${count} other device${count === 1 ? '' : 's'}.`,
      revoked: count,
      items: await listSessions(user._id, sessionId),
    });
  }),
);

/* --------------------------------- activity -------------------------------- */

/**
 * §19's log, scoped to the person reading it. An admin-wide view belongs in
 * the panel behind a permission check, not on a customer's security page.
 */
sessionRoutes.get(
  '/activity',
  requireUser,
  ah(async (req, res) => {
    const limit = Number(req.query.limit ?? 20);
    const entries = await recentActivity(
      req.authUser!.user._id,
      Number.isFinite(limit) ? limit : 20,
    );

    res.json({
      items: entries.map((entry) => ({
        id: entry._id,
        action: entry.action,
        status: entry.status,
        provider: entry.provider ?? null,
        surface: entry.surface ?? null,
        ip: entry.ip ?? null,
        browser: entry.browser ?? null,
        os: entry.os ?? null,
        at: entry.createdAt.toISOString(),
      })),
    });
  }),
);

/* --------------------------------- csrf seed ------------------------------- */

/**
 * Hands the SPA the token to double-submit when it cannot read one itself.
 *
 * Two cases need this, and both end in a permanent 403 without it. The Google
 * round trip lands on `/auth/callback` with the cookies set but no login
 * payload, so the client's in-memory copy is empty and `document.cookie` is all
 * it has — which reads nothing at all if the cookie was issued on the old
 * `/api/auth` path. And a browser holding *both* copies sends the stale one
 * first, so what the server compares against is not what the page can see.
 *
 * Answering with the value the server itself would check is what makes the
 * double-submit line up again. Nothing is minted for a visitor with no refresh
 * cookie: there is no session to protect, and `/refresh` will simply say 401.
 */
sessionRoutes.get(
  '/csrf',
  ah(async (req, res) => {
    const refresh = readRefreshCookie(req);
    if (!refresh) {
      res.json({ csrfToken: null });
      return;
    }

    const presented = readAllCsrfCookies(req);

    /*
     * Exactly one, and it is the one `requireCsrf` will compare against — hand
     * it back rather than rotating, so a second tab mid-request is not
     * invalidated by this call.
     */
    if (presented.length === 1) {
      res.json({ csrfToken: presented[0] });
      return;
    }

    /*
     * None, or a duplicate pair. Either way the browser needs a clean single
     * cookie: mint one on the site-wide path and retire whatever an older
     * session left behind on `/api/auth`, which would otherwise keep shadowing
     * it on every request to these endpoints.
     */
    const csrfToken = randomToken(24);
    retireLegacyCsrfCookie(res);
    setCsrfCookie(res, csrfToken);
    res.json({ csrfToken });
  }),
);

/* -------------------------------- config echo ------------------------------ */

/**
 * What the login pages need to know before rendering: which methods are on,
 * and what the password rules are, so the client-side Zod schema and the
 * server agree instead of drifting.
 */
sessionRoutes.get(
  '/config',
  ah(async (_req, res) => {
    const { password, otp } = authConfig;
    /*
     * WhatsApp is the one method whose availability lives in the database
     * rather than the environment, because an admin turns it on in the panel.
     * Only the boolean crosses the wire — never the provider's credentials,
     * and never enough to tell which account is configured.
     */
    const whatsapp = await resolveWhatsAppConfig();

    res.json({
      methods: {
        password: true,
        otp: true,
        google: authConfig.google.enabled,
        whatsapp: whatsapp.enabled,
      },
      admin: {
        otp: authConfig.adminOtpEnabled,
        google: authConfig.google.enabled && authConfig.adminGoogleEnabled,
        whatsapp: whatsapp.enabled && authConfig.adminWhatsappEnabled,
      },
      password: {
        minLength: password.minLength,
        requireUppercase: password.requireUppercase,
        requireLowercase: password.requireLowercase,
        requireNumber: password.requireNumber,
        requireSymbol: password.requireSymbol,
      },
      otp: {
        length: otp.length,
        resendAfterSeconds: Math.ceil(otp.resendCooldownMs / 1000),
        expiresInSeconds: Math.ceil(otp.ttlMs / 1000),
        maxAttempts: otp.maxAttempts,
        maxResends: otp.maxResends,
      },
      whatsapp: {
        enabled: whatsapp.enabled,
        length: otp.length,
        resendAfterSeconds: Math.ceil(otp.resendCooldownMs / 1000),
        expiresInSeconds: Math.ceil(whatsapp.otpTtlMs / 1000),
        maxAttempts: whatsapp.maxAttempts,
        maxResends: whatsapp.resendLimit,
      },
      defaultCallingCode: authConfig.defaultCallingCode,
    });
  }),
);
