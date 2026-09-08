/*
 * The pieces every auth route needs.
 * ===========================================================================
 * Mostly one function: `completeLogin`. Every one of the three methods ends
 * the same way — open a session, set the cookies, write the audit line, answer
 * with the user — and having that in one place is what keeps password login,
 * OTP login and Google login from drifting apart in what they set or forget to
 * set.
 */

import type { Request, Response } from 'express';
import { forbidden } from '../../lib/http.js';
import { audit } from '../audit.js';
import { authConfig } from '../config.js';
import { createSession, setSessionCookies } from '../sessions.js';
import { isAdminRole, type AuthProvider, type UserDoc } from '../models.js';
import { markLoginSuccess, toPublicUser, type PublicUser } from '../users.js';

/* -------------------------------- surfaces --------------------------------- */

export type Surface = 'shop' | 'admin';

/**
 * Which front end is asking. Sent by the client, and *not* trusted for
 * anything but presentation — `assertSurfaceAccess` below is what actually
 * decides whether the identity may have an admin session.
 */
export function readSurface(req: Request): Surface {
  const raw = (req.body?.surface ?? req.query?.surface ?? '').toString();
  return raw === 'admin' ? 'admin' : 'shop';
}

/**
 * §11: "Public customers must never be able to access /admin/*."
 *
 * Enforced at the point a session is created, not only at the point one is
 * used — a customer signing in on the admin login page is refused a session
 * rather than given one that every later request has to remember to reject.
 */
export function assertSurfaceAccess(user: UserDoc, surface: Surface) {
  if (surface === 'admin' && !isAdminRole(user.role)) {
    forbidden('You do not have access to the SOPII admin panel.');
  }
}

/* ------------------------------- the response ------------------------------ */

export interface AuthPayload {
  user: PublicUser;
  accessToken: string;
  /** Seconds until the access token expires, for the client's refresh timer. */
  expiresIn: number;
  /** Echoed so the SPA can send it back in `X-CSRF-Token`. */
  csrfToken: string;
  /** Where §2 says this role belongs after signing in. */
  redirectTo: string;
}

/** §2's post-login destinations, decided by the server, not the browser. */
export function landingFor(user: UserDoc, surface: Surface) {
  if (surface === 'admin') return '/admin/dashboard';
  return isAdminRole(user.role) ? '/admin/dashboard' : '/account';
}

/**
 * Opens a session and builds the answer every login route returns.
 *
 * Note the order: the surface check happens before anything is written, so a
 * customer probing the admin login leaves no session behind — only an audit
 * line, which is exactly what an operator wants to see.
 */
export async function completeLogin(
  req: Request,
  res: Response,
  {
    user,
    method,
    surface,
  }: { user: UserDoc; method: AuthProvider; surface: Surface },
): Promise<AuthPayload> {
  assertSurfaceAccess(user, surface);

  const issued = await createSession(req, {
    userId: user._id,
    role: user.role,
    method,
    surface,
  });

  setSessionCookies(res, issued.refreshToken, issued.csrfToken);
  await markLoginSuccess(user._id);

  await audit(req, {
    action: method === 'google' ? 'google_login' : 'login',
    userId: user._id,
    identifier: user.email ?? user.mobile,
    provider: method,
    surface,
    sessionId: issued.session._id,
  });

  return {
    user: await toPublicUser(
      { ...user, lastLoginAt: new Date() },
      { currentSessionId: issued.session._id },
    ),
    accessToken: issued.accessToken,
    expiresIn: issued.expiresIn,
    csrfToken: issued.csrfToken,
    redirectTo: landingFor(user, surface),
  };
}

/* --------------------------------- messages -------------------------------- */

/**
 * §27's vocabulary, in one object.
 *
 * These are deliberately vague. "Invalid email or password" for both halves of
 * a failed login is the whole point: an error that distinguishes them is a
 * free account-enumeration oracle, and one that names the account status tells
 * an attacker which addresses are worth returning to.
 */
export const MESSAGES = {
  invalidCredentials: 'Invalid email or password.',
  inactive: 'Your account is inactive.',
  locked: 'Too many failed attempts. Please try again later.',
  unavailable: 'This account is currently unavailable.',
  generic: 'Unable to complete login. Please try again.',
  otpInvalid: 'Invalid OTP. Please try again.',
  otpExpired: 'OTP expired. Please request a new OTP.',
  otpAttempts: 'Too many attempts. Please try again later.',
  otpUnverifiable: 'OTP could not be verified.',
  resetSent:
    'If an account exists for this email, password reset instructions have been sent.',
  resetInvalid: 'That password reset link is invalid or has expired. Please request a new one.',
  noAdminAccess: 'You do not have access to the SOPII admin panel.',
} as const;

/* --------------------------------- parsing --------------------------------- */

export const text = (value: unknown, max = 200) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Passwords are not trimmed — a leading space is a legitimate character. */
export const secret = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Keeps a `next` parameter inside one of the configured front ends.
 *
 * Anything absolute, protocol-relative (`//evil.example`) or otherwise not a
 * plain path is discarded, which is what stops the OAuth callback from being
 * used as an open redirect.
 */
export function safeRedirect(next: unknown, surface: Surface): string {
  const base = surface === 'admin' ? authConfig.frontends.admin : authConfig.frontends.shop;
  const fallback = surface === 'admin' ? '/admin/dashboard' : '/account';

  const raw = typeof next === 'string' ? next.trim() : '';
  if (!raw) return new URL(fallback, base).toString();

  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return new URL(raw, base).toString();
  }

  // An absolute URL is honoured only when it lands on a configured front end.
  try {
    const target = new URL(raw);
    for (const origin of [authConfig.frontends.shop, authConfig.frontends.admin]) {
      if (target.origin === new URL(origin).origin) return target.toString();
    }
  } catch {
    /* not a URL — fall through */
  }

  return new URL(fallback, base).toString();
}
