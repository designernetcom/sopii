/*
 * Google sign-in over OAuth 2.0 / OpenID Connect (§7).
 * ===========================================================================
 * The client secret never leaves this file's process, the browser never sees a
 * Google password, and the ID token is verified against Google's published
 * signing keys rather than being taken at face value.
 *
 * Two entry points, both ending in the same verified profile:
 *
 *   Authorization code   the redirect flow. `/api/auth/google` sends the
 *                        browser to Google with PKCE and a nonce; the callback
 *                        exchanges the code server-side.
 *   ID token             Google Identity Services in the browser hands the SPA
 *                        a credential; the SPA POSTs it here and the server
 *                        verifies it. The client *id* is public and belongs in
 *                        the frontend; the secret is not involved at all.
 *
 * Verification is done locally against the JWKS at Google's discovery endpoint
 * rather than by calling `tokeninfo`: it is one cached fetch instead of a
 * network round trip per sign-in, and it cannot be fooled by a compromised
 * egress path in the way a plain HTTPS "please confirm this for me" can.
 */

import crypto from 'node:crypto';
import jwt, { type JwtHeader } from 'jsonwebtoken';
import { authConfig } from './config.js';
import { randomToken } from './crypto.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
/* Google mints both spellings; a token carrying either is legitimate. */
const ISSUERS: [string, ...string[]] = ['https://accounts.google.com', 'accounts.google.com'];

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

/* ---------------------------------- PKCE ----------------------------------- */

export interface Pkce {
  verifier: string;
  challenge: string;
}

/**
 * PKCE is not strictly required for a confidential client, but it closes the
 * authorization-code interception window at essentially no cost, and it means
 * the same code path works if this ever moves to a public client.
 */
export function createPkce(): Pkce {
  const verifier = randomToken(48);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/* ------------------------------ authorization ------------------------------ */

/**
 * Where to send the browser.
 *
 * Only `openid email profile` is asked for — §7 is explicit that nothing
 * unnecessary should be requested, and those three cover the Google ID, name,
 * email and picture the identity model stores.
 */
export function authorizationUrl({ state, nonce, challenge }: {
  state: string;
  nonce: string;
  challenge: string;
}) {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', authConfig.google.clientId);
  url.searchParams.set('redirect_uri', authConfig.google.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', authConfig.google.scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Consent is not forced: a returning shopper should not have to approve the
  // same three scopes every time they sign in.
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

/* ------------------------------ code exchange ------------------------------ */

interface TokenResponse {
  id_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: authConfig.google.clientId,
    client_secret: authConfig.google.clientSecret,
    redirect_uri: authConfig.google.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  const payload = (await response.json().catch(() => ({}))) as TokenResponse;

  if (!response.ok || !payload.id_token) {
    /*
     * Google's error text can name the client id and the exact misconfiguration
     * — useful in the server log, not something to hand a browser. The caller
     * turns this into a generic message.
     */
    console.warn('[auth] Google token exchange failed:', payload.error, payload.error_description);
    throw new GoogleAuthError('Google did not complete the sign-in.');
  }

  return payload.id_token;
}

/* --------------------------------- JWKS ------------------------------------ */

/*
 * Indexed rather than a closed shape: `crypto.createPublicKey` takes a
 * `JsonWebKey`, which is an open record, and Google is free to add members to
 * its JWKS entries without this failing to compile.
 */
interface Jwk extends crypto.JsonWebKey {
  kid: string;
  kty: string;
}

let jwksCache: { keys: Jwk[]; expiresAt: number } | null = null;

/**
 * Google's signing keys, cached.
 *
 * They rotate roughly daily and the response carries a `max-age`, which is
 * honoured — refetching per sign-in would add a round trip to every login, and
 * never refetching would break the morning after a rotation.
 */
async function fetchJwks(force = false): Promise<Jwk[]> {
  if (!force && jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;

  const response = await fetch(JWKS_URI, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new GoogleAuthError('Could not reach Google to verify the sign-in.');

  const payload = (await response.json()) as { keys: Jwk[] };
  const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1];
  const ttlMs = Math.min(Number(maxAge ?? 3600), 86_400) * 1000;

  jwksCache = { keys: payload.keys ?? [], expiresAt: Date.now() + ttlMs };
  return jwksCache.keys;
}

/**
 * A JWK becomes a key object without any third-party conversion: Node has
 * understood `format: 'jwk'` since 16, which is what keeps this module free of
 * a JOSE dependency.
 */
function toPublicKey(jwk: Jwk) {
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

async function keyForHeader(header: JwtHeader) {
  if (!header.kid) throw new GoogleAuthError('Google sent a token without a key id.');

  let keys = await fetchJwks();
  let jwk = keys.find((entry) => entry.kid === header.kid);

  // A key id we have never seen usually means a rotation happened since the
  // cache was filled, so it is worth exactly one forced refetch.
  if (!jwk) {
    keys = await fetchJwks(true);
    jwk = keys.find((entry) => entry.kid === header.kid);
  }

  if (!jwk) throw new GoogleAuthError('Google signed the token with an unknown key.');
  return toPublicKey(jwk);
}

/* ------------------------------- verification ------------------------------ */

export interface GoogleProfile {
  /** Google's stable subject id. The only field safe to key an identity on. */
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName?: string;
  name: string;
  picture?: string;
}

interface GoogleIdTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  nonce?: string;
}

/**
 * Verifies an ID token and returns the profile inside it.
 *
 * Signature, issuer, audience and expiry are all checked. The nonce is checked
 * when one was sent — it binds the token to the authorization request this
 * server started, so a token minted for some other site's flow cannot be
 * replayed here.
 *
 * `email_verified` is enforced rather than noted: §8 links a Google login to
 * an existing SOPII account by email, and doing that on an unverified address
 * would let anyone who can set an unverified Gmail alias take over an account.
 */
export async function verifyIdToken(
  idToken: string,
  { nonce }: { nonce?: string } = {},
): Promise<GoogleProfile> {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    throw new GoogleAuthError('That Google sign-in could not be read.');
  }

  const key = await keyForHeader(decoded.header);

  let claims: GoogleIdTokenClaims;
  try {
    claims = jwt.verify(idToken, key, {
      algorithms: ['RS256'],
      audience: authConfig.google.clientId,
      issuer: ISSUERS,
    }) as GoogleIdTokenClaims;
  } catch {
    throw new GoogleAuthError('That Google sign-in could not be verified.');
  }

  if (nonce && claims.nonce !== nonce) {
    throw new GoogleAuthError('That Google sign-in could not be verified.');
  }

  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (!claims.email || !emailVerified) {
    throw new GoogleAuthError(
      'Your Google account does not have a verified email address, so it cannot be used to sign in.',
    );
  }

  const given = claims.given_name?.trim();
  const family = claims.family_name?.trim();
  const full = claims.name?.trim() || claims.email.split('@')[0];

  return {
    googleId: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified,
    // Google does not always send the name parts, so `name` is split as a
    // fallback rather than leaving the first name blank.
    firstName: given || full.split(' ')[0],
    lastName: family || full.split(' ').slice(1).join(' ') || undefined,
    name: full,
    picture: claims.picture,
  };
}
