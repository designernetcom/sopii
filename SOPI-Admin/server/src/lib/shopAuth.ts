/*
 * Shop-account sessions.
 * ---------------------------------------------------------------------------
 * Separate from `lib/auth.ts`, which authenticates *admins*. A shopper's token
 * is signed with a different audience claim, so an admin token cannot be used
 * to read a customer's orders and a customer token cannot reach the panel API
 * even though both are verified with the same secret.
 */

import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { CustomerModel, type CustomerDoc } from '../db/models.js';
import { findSession, verifyAccessToken } from '../auth/sessions.js';
import { ensureCustomerRecord, findUserById } from '../auth/users.js';
import { forbidden, unauthorized } from './http.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `withCustomer`; present only for a signed-in shopper. */
      customer?: CustomerDoc;
    }
  }
}

/** Marks a token as a shop session rather than an admin one. */
const AUDIENCE = 'sopii-shop';

export function signCustomerToken(customerId: string) {
  return jwt.sign({ sub: customerId }, env.jwtSecret, {
    audience: AUDIENCE,
    expiresIn: env.shopSessionExpiresIn,
  } as jwt.SignOptions);
}

/**
 * The customer this bearer token belongs to, or null for anything invalid.
 *
 * Two token shapes are accepted, and the order is deliberate. The unified auth
 * module (`src/auth`) is now what issues sessions, and its access token names
 * an *identity*, not a customer — so it is resolved through
 * `user.customerId`, with the commerce record materialised on demand for a
 * shopper who signed in by OTP and has never bought anything.
 *
 * The legacy `sopii-shop` token is still honoured underneath so that sessions
 * issued before the auth module landed keep working until they expire on their
 * own. That fallback can be deleted once `SHOP_SESSION_EXPIRES_IN` has elapsed
 * since the deploy.
 */
async function customerFromRequest(header: string | undefined) {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const claims = verifyAccessToken(token);
  if (claims) {
    const session = await findSession(claims.sid);
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;

    const user = await findUserById(claims.sub);
    if (!user || user.status !== 'active') return null;

    if (user.customerId) {
      const customer = await CustomerModel.findById(user.customerId).lean<CustomerDoc>();
      if (customer) return customer;
    }
    // First time this identity has needed a commerce record.
    return ensureCustomerRecord(user);
  }

  let sub: string;
  try {
    sub = (jwt.verify(token, env.jwtSecret, { audience: AUDIENCE }) as { sub: string }).sub;
  } catch {
    return null;
  }

  return CustomerModel.findById(sub).lean<CustomerDoc>();
}

/**
 * Attaches `req.customer` when a valid token is present and says nothing when
 * it is not — guest checkout has to keep working, so most routes want this
 * rather than a hard gate.
 */
export const withCustomer: RequestHandler = (req, _res, next) => {
  customerFromRequest(req.headers.authorization)
    .then((customer) => {
      if (customer && customer.status !== 'blocked') req.customer = customer;
      next();
    })
    .catch(next);
};

/** The gate for /account/*: no valid session, no answer. */
export const requireCustomer: RequestHandler = (req, _res, next) => {
  customerFromRequest(req.headers.authorization)
    .then((customer) => {
      if (!customer) unauthorized('Please sign in to continue');
      if (customer!.status === 'blocked') forbidden('This account has been suspended');
      req.customer = customer!;
      next();
    })
    .catch(next);
};
