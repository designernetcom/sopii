/*
 * Google sign-in (§7) and account linking (§8).
 * ===========================================================================
 *   GET  /api/auth/google           start the redirect flow
 *   GET  /api/auth/google/callback  finish it
 *   POST /api/auth/google           verify an ID token from Google Identity Services
 *   GET  /api/auth/google/status    whether Google is configured at all
 *
 * The callback does not hand the browser a token in a query string. It sets
 * the refresh cookie and redirects to the SPA, which then calls `/auth/refresh`
 * to mint an access token. A token in a URL ends up in browser history, in the
 * Referer header of the next request, and in every log between here and there;
 * a cookie does not.
 *
 * §8's linking rule lives in `resolveGoogleUser`: a verified Google email that
 * matches an existing SOPII account attaches to it rather than creating a
 * second one. The email must be verified by Google for that to happen, or
 * anyone able to set an unverified address could claim somebody's account.
 */

import { Router } from 'express';
import { ah, badRequest, forbidden, HttpError } from '../../lib/http.js';
import { audit } from '../audit.js';
import { authConfig } from '../config.js';
import { id, randomToken } from '../crypto.js';
import { clientIp } from '../device.js';
import {
  authorizationUrl,
  createPkce,
  exchangeCode,
  GoogleAuthError,
  verifyIdToken,
  type GoogleProfile,
} from '../google.js';
import { requireUser } from '../middleware.js';
import { isAdminRole, OAuthStateModel, UserIdentityModel, UserModel, type UserDoc } from '../models.js';
import { checkFixedLimit, recordAttempt } from '../rateLimit.js';
import {
  accountProblem,
  countAuthMethods,
  createUser,
  ensureCustomerRecord,
  findIdentity,
  findUserByEmail,
  findUserWithSecret,
  linkIdentity,
  toPublicUserById,
  unlinkIdentity,
} from '../users.js';
import {
  completeLogin,
  MESSAGES,
  readSurface,
  returnOrigin,
  safeRedirect,
  text,
  type Surface,
} from './shared.js';

export const googleRoutes = Router();

/** The cookie holding the id of the pending authorization request. */
const STATE_COOKIE = 'sopii_oauth';

function assertConfigured() {
  if (!authConfig.google.enabled) {
    throw new HttpError(
      503,
      'Google sign-in is not configured on this store.',
    );
  }
}

/* --------------------------------- status ---------------------------------- */

/**
 * Lets each login page decide whether to render the Google button at all,
 * rather than showing one that leads to a 503.
 */
googleRoutes.get('/google/status', (req, res) => {
  const surface = readSurface(req);
  res.json({
    enabled:
      authConfig.google.enabled && (surface !== 'admin' || authConfig.adminGoogleEnabled),
    // The client id is public by design — it appears in the redirect URL. The
    // secret is not here and never will be (§30).
    clientId: authConfig.google.clientId || null,
  });
});

/* ---------------------------------- start ---------------------------------- */

googleRoutes.get(
  '/google',
  ah(async (req, res) => {
    assertConfigured();

    const surface = readSurface(req);
    if (surface === 'admin' && !authConfig.adminGoogleEnabled) {
      forbidden('Google sign-in is not enabled for the admin panel.');
    }

    const { verifier, challenge } = createPkce();
    const nonce = randomToken(16);
    const stateId = id('oas');

    await OAuthStateModel.create({
      _id: stateId,
      provider: 'google',
      codeVerifier: verifier,
      nonce,
      surface,
      redirectTo: text(req.query.next, 300) || (surface === 'admin' ? '/admin/dashboard' : '/account'),
      /*
       * Where to come back to. Captured here rather than read from config in
       * the callback, because by then the browser is arriving from
       * accounts.google.com and has forgotten which of our front ends it left.
       */
      returnOrigin: returnOrigin(req, surface),
      // Set when an already-signed-in person is connecting Google from
      // /account/security rather than logging in with it (§26).
      linkUserId: req.authUser?.user._id,
      ip: clientIp(req),
      expiresAt: new Date(Date.now() + authConfig.oauth.stateTtlMs),
      createdAt: new Date(),
    });

    /*
     * The state parameter Google echoes back is a random value bound to this
     * cookie, and the cookie is HttpOnly. An attacker who can make the victim's
     * browser follow a callback URL still cannot produce the matching cookie,
     * which is what defeats login CSRF.
     */
    res.cookie(STATE_COOKIE, stateId, {
      httpOnly: true,
      secure: authConfig.cookies.secure,
      // The callback is a top-level cross-site GET from accounts.google.com, so
      // a strict cookie would not be sent at all.
      sameSite: authConfig.cookies.sameSite === 'strict' ? 'lax' : authConfig.cookies.sameSite,
      domain: authConfig.cookies.domain,
      path: '/api/auth',
      maxAge: authConfig.oauth.stateTtlMs,
    });

    res.redirect(authorizationUrl({ state: stateId, nonce, challenge }));
  }),
);

/* -------------------------------- callback --------------------------------- */

googleRoutes.get(
  '/google/callback',
  ah(async (req, res) => {
    assertConfigured();

    const ip = clientIp(req);
    const perIp = await checkFixedLimit('oauth_callback@ip', ip ?? 'unknown', {
      max: authConfig.oauth.maxCallbacksPerWindow,
      windowMs: authConfig.oauth.callbackWindowMs,
    });
    if (!perIp.allowed) throw new HttpError(429, 'Too many sign-in attempts. Please try again later.');
    await recordAttempt('oauth_callback@ip', ip ?? 'unknown', {
      ip,
      windowMs: authConfig.oauth.callbackWindowMs,
    });

    const stateId = (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];
    const returnedState = text(req.query.state, 100);

    res.clearCookie(STATE_COOKIE, { path: '/api/auth', domain: authConfig.cookies.domain });

    /*
     * Both halves have to agree: the cookie this browser holds and the state
     * Google echoed. Checking only one would leave the flow forgeable.
     */
    if (!stateId || !returnedState || stateId !== returnedState) {
      return fail(res, 'shop', 'state_mismatch');
    }

    // `findOneAndUpdate` rather than a read-then-write, so a replayed callback
    // cannot consume the same state twice.
    const state = await OAuthStateModel.findOneAndUpdate(
      { _id: stateId, consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
      { $set: { consumedAt: new Date() } },
    ).lean();

    if (!state) return fail(res, 'shop', 'expired');

    const surface = state.surface as Surface;
    // Recorded when the flow started; the Referer here is accounts.google.com,
    // which tells us nothing about which of our front ends to go back to.
    const origin = state.returnOrigin;

    if (req.query.error) {
      // The person pressed Cancel on Google's consent screen. Not an error
      // worth a stack trace — send them back to where they started.
      return fail(res, surface, 'cancelled', state.redirectTo, origin);
    }

    const code = text(req.query.code, 512);
    if (!code) return fail(res, surface, 'no_code', state.redirectTo, origin);

    let profile: GoogleProfile;
    try {
      const idToken = await exchangeCode(code, state.codeVerifier);
      profile = await verifyIdToken(idToken, { nonce: state.nonce });
    } catch (error) {
      console.warn('[auth] Google callback failed:', (error as Error).message);
      await audit(req, {
        action: 'google_login',
        status: 'failure',
        provider: 'google',
        surface,
        reason: error instanceof GoogleAuthError ? error.message : 'verification failed',
      });
      return fail(res, surface, 'verification_failed', state.redirectTo, origin);
    }

    /* ---- linking an account that is already signed in (§26) ---- */
    if (state.linkUserId) {
      const outcome = await attachGoogle(state.linkUserId, profile);
      if (!outcome.ok) return fail(res, surface, outcome.reason, state.redirectTo, origin);

      await audit(req, {
        action: 'google_linked',
        userId: state.linkUserId,
        identifier: profile.email,
        provider: 'google',
        surface,
      });
      return done(res, surface, state.redirectTo, 'linked', origin);
    }

    /* ---- signing in ---- */
    const resolved = await resolveGoogleUser(profile, surface);
    if (!resolved.ok) {
      await audit(req, {
        action: 'google_login',
        status: 'failure',
        identifier: profile.email,
        provider: 'google',
        surface,
        reason: resolved.reason,
      });
      return fail(res, surface, resolved.reason, state.redirectTo, origin);
    }

    const user = resolved.user;

    if (surface === 'admin' && !isAdminRole(user.role)) {
      await audit(req, {
        action: 'access_denied',
        status: 'failure',
        userId: user._id,
        identifier: profile.email,
        provider: 'google',
        surface,
        reason: 'not an admin role',
      });
      return fail(res, surface, 'no_admin_access', state.redirectTo, origin);
    }

    const payload = await completeLogin(req, res, { user, method: 'google', surface });
    /*
     * The cookies are already set by `completeLogin`; the access token in
     * `payload` is deliberately dropped rather than put in the URL. The SPA
     * calls /auth/refresh on landing and gets one over a POST body.
     */
    void payload;

    return done(res, surface, state.redirectTo, 'ok', origin);
  }),
);

/**
 * The origin this flow is owed a return trip to.
 *
 * `state.returnOrigin` is the one the browser actually started from — which in
 * development is the Vite dev server, not the public domain that `SHOP_URL`
 * names for the benefit of emailed links. Falls back to the configured front
 * end for states written before this field existed.
 */
function landing(surface: Surface, origin?: string) {
  return origin || (surface === 'admin' ? authConfig.frontends.admin : authConfig.frontends.shop);
}

/** Back to the SPA's callback route, which finishes by calling /auth/refresh. */
function done(
  res: import('express').Response,
  surface: Surface,
  next: string,
  status: string,
  origin?: string,
) {
  const base = landing(surface, origin);
  const url = new URL(surface === 'admin' ? '/admin/auth/callback' : '/auth/callback', base);
  url.searchParams.set('status', status);
  url.searchParams.set('next', new URL(safeRedirect(next, surface, base)).pathname);
  res.redirect(url.toString());
}

/** Same landing page, with a reason code the SPA turns into a message. */
function fail(
  res: import('express').Response,
  surface: Surface,
  reason: string,
  next = '/',
  origin?: string,
) {
  const base = landing(surface, origin);
  const url = new URL(surface === 'admin' ? '/admin/auth/callback' : '/auth/callback', base);
  url.searchParams.set('status', 'error');
  url.searchParams.set('reason', reason);
  url.searchParams.set('next', new URL(safeRedirect(next, surface, base)).pathname);
  res.redirect(url.toString());
}

/* ------------------------------- ID token POST ----------------------------- */

/**
 * The Google Identity Services path: the browser gets a credential from
 * Google's own script and posts it here. The server still verifies the
 * signature, issuer, audience and expiry — a credential arriving from the
 * client is a claim, not a fact.
 */
googleRoutes.post(
  '/google',
  ah(async (req, res) => {
    if (!authConfig.google.clientId) {
      throw new HttpError(503, 'Google sign-in is not configured on this store.');
    }

    const surface = readSurface(req);
    const credential = text((req.body as Record<string, unknown>).credential, 4096);
    if (!credential) badRequest('No Google credential was supplied.');

    const ip = clientIp(req);
    const perIp = await checkFixedLimit('google_idtoken@ip', ip ?? 'unknown', {
      max: authConfig.oauth.maxCallbacksPerWindow,
      windowMs: authConfig.oauth.callbackWindowMs,
    });
    if (!perIp.allowed) throw new HttpError(429, 'Too many sign-in attempts. Please try again later.');
    await recordAttempt('google_idtoken@ip', ip ?? 'unknown', {
      ip,
      windowMs: authConfig.oauth.callbackWindowMs,
    });

    let profile: GoogleProfile;
    try {
      profile = await verifyIdToken(credential);
    } catch (error) {
      await audit(req, {
        action: 'google_login',
        status: 'failure',
        provider: 'google',
        surface,
        reason: 'id token verification failed',
      });
      badRequest(error instanceof GoogleAuthError ? error.message : MESSAGES.generic);
    }

    const resolved = await resolveGoogleUser(profile!, surface);
    if (!resolved.ok) {
      await audit(req, {
        action: 'google_login',
        status: 'failure',
        identifier: profile!.email,
        provider: 'google',
        surface,
        reason: resolved.reason,
      });
      badRequest(explain(resolved.reason));
    }

    res.json(
      await completeLogin(req, res, { user: resolved.user, method: 'google', surface }),
    );
  }),
);

/* ------------------------------- resolution -------------------------------- */

type Resolution = { ok: true; user: UserDoc } | { ok: false; reason: string };

/**
 * §8, the whole rule in one function.
 *
 * Three cases, in order:
 *   1. this Google account is already linked — sign that identity in;
 *   2. a SOPII account exists with the same verified email — link and sign in,
 *      never create a duplicate;
 *   3. nobody matches — create a customer, if auto-registration is on.
 *
 * Case 2 is the one §8 is about, and it is why `emailVerified` was insisted on
 * back in `verifyIdToken`: the email is being used as proof of ownership of an
 * existing account, so an unverified one would be a takeover.
 */
async function resolveGoogleUser(profile: GoogleProfile, surface: Surface): Promise<Resolution> {
  const existingIdentity = await findIdentity('google', profile.googleId);

  if (existingIdentity) {
    const user = await findUserWithSecret({ _id: existingIdentity.userId });
    if (!user) return { ok: false, reason: 'account_missing' };
    if (accountProblem(user)) return { ok: false, reason: 'account_unavailable' };

    // Keep the profile picture and any name Google now has.
    await refreshProfile(user, profile);
    await linkIdentity({
      userId: user._id,
      provider: 'google',
      providerUserId: profile.googleId,
      providerEmail: profile.email,
    });
    return { ok: true, user };
  }

  const byEmail = await findUserByEmail(profile.email);

  if (byEmail) {
    const user = await findUserWithSecret({ _id: byEmail._id });
    if (!user) return { ok: false, reason: 'account_missing' };
    if (accountProblem(user)) return { ok: false, reason: 'account_unavailable' };

    await linkIdentity({
      userId: user._id,
      provider: 'google',
      providerUserId: profile.googleId,
      providerEmail: profile.email,
    });
    /*
     * Signing in through Google proves the address, so an account created with
     * a password and never verified becomes verified here. It is the same
     * proof an emailed confirmation link would have given.
     */
    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          profileImage: user.profileImage ?? profile.picture,
        },
      },
    );
    await ensureCustomerRecord(user);
    return { ok: true, user: { ...user, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } };
  }

  if (!authConfig.googleAutoRegister) return { ok: false, reason: 'no_account' };
  // Nobody signs into the panel for the first time through Google — an admin
  // account has to be created by an admin (§10).
  if (surface === 'admin') return { ok: false, reason: 'no_admin_access' };

  const user = await createUser({
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    profileImage: profile.picture,
    role: 'customer',
    emailVerified: true,
  });

  await linkIdentity({
    userId: user._id,
    provider: 'google',
    providerUserId: profile.googleId,
    providerEmail: profile.email,
  });
  await ensureCustomerRecord(user);

  return { ok: true, user };
}

async function refreshProfile(user: UserDoc, profile: GoogleProfile) {
  const patch: Record<string, unknown> = {};
  // Only fills gaps: a shopper who edited their name on /account should not
  // have it overwritten by Google on their next sign-in.
  if (!user.profileImage && profile.picture) patch.profileImage = profile.picture;
  if (!user.email) patch.email = profile.email;
  if (!user.emailVerifiedAt && profile.emailVerified) patch.emailVerifiedAt = new Date();
  if (Object.keys(patch).length) await UserModel.updateOne({ _id: user._id }, { $set: patch });
}

function explain(reason: string) {
  switch (reason) {
    case 'no_account':
      return 'No SOPII account matches that Google address. Please register first.';
    case 'no_admin_access':
      return MESSAGES.noAdminAccess;
    case 'account_unavailable':
      return MESSAGES.unavailable;
    default:
      return MESSAGES.generic;
  }
}

/* ------------------------- connect / disconnect (§26) ---------------------- */

/**
 * Attaches a Google account to an identity that is already signed in.
 *
 * The refusal in the middle matters: if that Google account is already linked
 * to a *different* SOPII identity, linking it here would leave one Google
 * login able to open two accounts. It has to be disconnected from the first
 * one before it can join the second.
 */
async function attachGoogle(
  userId: string,
  profile: GoogleProfile,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const existing = await findIdentity('google', profile.googleId);
  if (existing && existing.userId !== userId) return { ok: false, reason: 'google_already_linked' };

  await linkIdentity({
    userId,
    provider: 'google',
    providerUserId: profile.googleId,
    providerEmail: profile.email,
  });

  const user = await findUserWithSecret({ _id: userId });
  if (user && !user.profileImage && profile.picture) {
    await UserModel.updateOne({ _id: userId }, { $set: { profileImage: profile.picture } });
  }

  return { ok: true };
}

/**
 * §26: "Do not allow the user to remove their only authentication method
 * without setting another valid authentication method first."
 */
googleRoutes.delete(
  '/google/link',
  requireUser,
  ah(async (req, res) => {
    const user = req.authUser!.user;

    const methods = await countAuthMethods(user);
    if (methods <= 1) {
      badRequest(
        'Google is currently your only way to sign in. Set a password or verify a mobile number first.',
      );
    }

    const linked = await UserIdentityModel.findOne({ userId: user._id, provider: 'google' }).lean();
    if (!linked) badRequest('No Google account is connected.');

    await unlinkIdentity(user._id, 'google');
    await audit(req, {
      action: 'google_unlinked',
      userId: user._id,
      identifier: linked.providerEmail,
      provider: 'google',
    });

    res.json({
      ok: true,
      message: 'Google account disconnected.',
      user: await toPublicUserById(user._id),
    });
  }),
);

/**
 * Starts the connect flow for someone already signed in.
 *
 * A POST rather than a link, because the browser has to carry a bearer token
 * to prove who is connecting — `GET /google` cannot, since a top-level
 * navigation sends no Authorization header. The answer is the URL for the SPA
 * to navigate to.
 */
googleRoutes.post(
  '/google/link',
  requireUser,
  ah(async (req, res) => {
    assertConfigured();

    const user = req.authUser!.user;
    const surface = req.authUser!.surface;

    const { verifier, challenge } = createPkce();
    const nonce = randomToken(16);
    const stateId = id('oas');

    await OAuthStateModel.create({
      _id: stateId,
      provider: 'google',
      codeVerifier: verifier,
      nonce,
      surface,
      redirectTo: text((req.body as Record<string, unknown>).next, 300) || '/account/security',
      returnOrigin: returnOrigin(req, surface),
      linkUserId: user._id,
      ip: clientIp(req),
      expiresAt: new Date(Date.now() + authConfig.oauth.stateTtlMs),
      createdAt: new Date(),
    });

    res.cookie(STATE_COOKIE, stateId, {
      httpOnly: true,
      secure: authConfig.cookies.secure,
      sameSite: authConfig.cookies.sameSite === 'strict' ? 'lax' : authConfig.cookies.sameSite,
      domain: authConfig.cookies.domain,
      path: '/api/auth',
      maxAge: authConfig.oauth.stateTtlMs,
    });

    res.json({ url: authorizationUrl({ state: stateId, nonce, challenge }) });
  }),
);
