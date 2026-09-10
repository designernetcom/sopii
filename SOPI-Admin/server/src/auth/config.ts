/*
 * Authentication configuration.
 * ===========================================================================
 * Every limit, window and lifetime the auth module enforces is read here, from
 * the environment, with a sane default. Nothing below is hard-coded at its use
 * site — §18 of the brief asks for exactly that, and it is what lets an
 * operator tighten OTP throttling or shorten a session without a deploy.
 *
 * Durations are written as strings ("15m", "7d") and parsed once into
 * milliseconds, so the .env stays readable.
 */

import crypto from 'node:crypto';
import { env, isProduction } from '../env.js';

/* ------------------------------- primitives -------------------------------- */

const UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** `"15m"` becomes 900000. A bare number is read as milliseconds. */
export function duration(value: string | undefined, fallback: string): number {
  const raw = (value ?? fallback).trim();
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i.exec(raw);
  if (!match) return duration(undefined, fallback);
  return Number(match[1]) * UNITS[(match[2] ?? 'ms').toLowerCase()];
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * A comma-separated list of origins, normalised and de-duplicated.
 *
 * Anything that is not a parseable absolute URL is dropped rather than kept as
 * a string that would later fail an origin comparison in a way nobody could
 * read — an allowlist that silently contains junk is worse than a short one.
 */
function originList(value: string | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of (value ?? '').split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      seen.add(new URL(trimmed).origin);
    } catch {
      console.warn(`[auth] Ignoring unparseable origin in SHOP_ALT_URLS: ${trimmed}`);
    }
  }
  return [...seen];
}

/* --------------------------------- secrets --------------------------------- */

/*
 * AUTH_SECRET is separate from JWT_SECRET on purpose: the admin panel's legacy
 * tokens are signed with JWT_SECRET, and rotating the auth module's secret
 * should not invalidate those (or the reverse). It falls back to JWT_SECRET so
 * an existing deployment keeps booting.
 */
const authSecret = process.env.AUTH_SECRET?.trim() || env.jwtSecret;

if (isProduction && authSecret === 'sopii-dev-secret-change-me') {
  // Loud, but not fatal: a crash here would take the whole store offline over
  // what is a configuration mistake the operator can fix in a minute.
  console.error(
    '[auth] AUTH_SECRET is still the development default in production. ' +
      'Set AUTH_SECRET to a long random value immediately.',
  );
}

/* ---------------------------------- config --------------------------------- */

export const authConfig = {
  secret: authSecret,

  /** Signed into every access token, and checked on the way back in. */
  issuer: process.env.AUTH_ISSUER ?? 'sopii',
  audience: process.env.AUTH_AUDIENCE ?? 'sopii-app',

  password: {
    /** bcrypt cost. 12 is roughly 250ms on modern hardware, deliberately. */
    rounds: int(process.env.AUTH_BCRYPT_ROUNDS, 12),
    minLength: int(process.env.AUTH_PASSWORD_MIN_LENGTH, 8),
    maxLength: 128,
    requireUppercase: flag(process.env.AUTH_PASSWORD_REQUIRE_UPPERCASE, true),
    requireLowercase: flag(process.env.AUTH_PASSWORD_REQUIRE_LOWERCASE, true),
    requireNumber: flag(process.env.AUTH_PASSWORD_REQUIRE_NUMBER, true),
    requireSymbol: flag(process.env.AUTH_PASSWORD_REQUIRE_SYMBOL, true),
  },

  tokens: {
    /** Short-lived, held in memory by the SPA, never written to storage. */
    accessTtlMs: duration(process.env.AUTH_ACCESS_TTL, '15m'),
    /** HttpOnly cookie. Rotated on every use; reuse revokes the family. */
    refreshTtlMs: duration(process.env.AUTH_REFRESH_TTL, '30d'),
    /*
     * A rotated token stays usable this long so that two tabs waking at the
     * same moment do not look like a stolen-token replay.
     */
    refreshGraceMs: duration(process.env.AUTH_REFRESH_GRACE, '30s'),
  },

  session: {
    /** Absolute cap, regardless of refresh activity. */
    maxLifetimeMs: duration(process.env.AUTH_SESSION_MAX_LIFETIME, '90d'),
    /** Sessions idle longer than this stop refreshing. */
    idleTimeoutMs: duration(process.env.AUTH_SESSION_IDLE_TIMEOUT, '30d'),
    /** Most concurrent devices one identity may hold; the oldest is evicted. */
    maxPerUser: int(process.env.AUTH_MAX_SESSIONS_PER_USER, 10),
  },

  otp: {
    length: int(process.env.OTP_LENGTH, 6),
    ttlMs: duration(process.env.OTP_TTL, '5m'),
    /** Wrong guesses allowed against one OTP before it is burned. */
    maxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 5),
    /** How long the UI counts down before Resend becomes clickable. */
    resendCooldownMs: duration(process.env.OTP_RESEND_COOLDOWN, '30s'),
    /** Requests per mobile number per window, counted across every channel. */
    maxRequestsPerWindow: int(process.env.OTP_MAX_REQUESTS_PER_WINDOW, 5),
    requestWindowMs: duration(process.env.OTP_REQUEST_WINDOW, '1h'),
    /*
     * How many times one code may be re-sent before the person has to start
     * over with the number. Distinct from the window limit above: that caps
     * messages per hour, this caps how long a single verification attempt can
     * be kept alive by pressing Resend.
     */
    maxResends: int(process.env.OTP_MAX_RESENDS, 3),
    /*
     * Development convenience only. With no SMS provider wired up the code has
     * to reach the developer somehow, so this prints it to the server log. It
     * is force-disabled in production, and the OTP never appears in an HTTP
     * response either way.
     */
    logToConsole: !isProduction && flag(process.env.OTP_LOG_TO_CONSOLE, true),
  },

  passwordReset: {
    ttlMs: duration(process.env.AUTH_RESET_TTL, '1h'),
    maxRequestsPerWindow: int(process.env.AUTH_RESET_MAX_REQUESTS, 5),
    requestWindowMs: duration(process.env.AUTH_RESET_WINDOW, '1h'),
  },

  /** Progressive throttling for password login (§18). */
  login: {
    maxAttempts: int(process.env.AUTH_LOGIN_MAX_ATTEMPTS, 5),
    windowMs: duration(process.env.AUTH_LOGIN_WINDOW, '15m'),
    /*
     * Lockout grows with each further failure past the threshold — 1x base,
     * 2x, 4x, 8x, capped — which turns a slow guesser into a stopped one.
     */
    baseLockoutMs: duration(process.env.AUTH_LOGIN_LOCKOUT_BASE, '1m'),
    maxLockoutMs: duration(process.env.AUTH_LOGIN_LOCKOUT_MAX, '1h'),
  },

  /** Per-IP ceiling on the OAuth callback, which is otherwise unauthenticated. */
  oauth: {
    maxCallbacksPerWindow: int(process.env.AUTH_OAUTH_MAX_CALLBACKS, 20),
    callbackWindowMs: duration(process.env.AUTH_OAUTH_WINDOW, '15m'),
    /** How long a pending authorization request may sit unfinished. */
    stateTtlMs: duration(process.env.AUTH_OAUTH_STATE_TTL, '10m'),
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
    /** Must match a redirect URI registered on the Google credential. */
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI?.trim() ||
      `http://localhost:${env.port}/api/auth/google/callback`,
    /** Only what §7 asks for: who they are and how to reach them. */
    scopes: ['openid', 'email', 'profile'],
    get enabled() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },

  /*
   * WhatsApp OTP.
   * -------------------------------------------------------------------------
   * Every value here is a *fallback*. The live configuration is whatever the
   * admin panel has stored (Settings -> Authentication -> WhatsApp), and
   * `auth/whatsappConfig.ts` merges the two — environment first at boot, the
   * database once an operator has filled the form in. That is what lets a
   * deployment ship with credentials in the environment and still be
   * reconfigured without a redeploy.
   *
   * Only an official WhatsApp Business API provider is supported. There is no
   * transport here that drives WhatsApp Web or a personal account, and adding
   * one would breach WhatsApp's terms as well as this module's threat model.
   */
  whatsapp: {
    /** `meta` | `twilio` | `webhook` — see auth/whatsapp.ts. */
    provider: (process.env.WHATSAPP_PROVIDER?.trim() || 'meta') as 'meta' | 'twilio' | 'webhook',
    apiUrl: process.env.WHATSAPP_API_URL?.trim() || 'https://graph.facebook.com/v21.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ?? '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? '',
    /** The approved authentication template. Meta will not send free text. */
    templateName: process.env.WHATSAPP_OTP_TEMPLATE?.trim() || 'sopii_login_otp',
    templateLanguage: process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE?.trim() || 'en',
    /** Twilio only: the WhatsApp-enabled sender, e.g. `whatsapp:+14155238886`. */
    fromNumber: process.env.WHATSAPP_FROM_NUMBER?.trim() ?? '',
    /** Twilio only: account SID; the auth token is `accessToken` above. */
    accountSid: process.env.WHATSAPP_ACCOUNT_SID?.trim() ?? '',
    /** Off until an operator turns it on, in the panel or here. */
    enabled: flag(process.env.WHATSAPP_ENABLED, false),
  },

  /*
   * The §11 switch again, for WhatsApp. Off by default for the same reason
   * `adminOtpEnabled` is: whoever holds the SIM should not thereby hold the
   * admin panel.
   */
  adminWhatsappEnabled: flag(process.env.ADMIN_WHATSAPP_ENABLED, false),

  cookies: {
    refreshName: process.env.AUTH_REFRESH_COOKIE ?? 'sopii_rt',
    /** Readable by JS on purpose: it is the double-submit half of CSRF. */
    csrfName: process.env.AUTH_CSRF_COOKIE ?? 'sopii_csrf',
    /*
     * Scoped to the auth API so the refresh token is not attached to every
     * request the browser makes, only to the endpoints that consume it.
     */
    path: process.env.AUTH_COOKIE_PATH ?? '/api/auth',
    /*
     * The CSRF half is scoped to the whole site, and has to be.
     *
     * A cookie is only visible to `document.cookie` on request-paths that match
     * its own Path (RFC 6265 §5.1.4), so one scoped to `/api/auth` cannot be
     * read from `/checkout` — or from any other page the SPA actually runs on.
     * The refresh token stays narrow because the browser sends it for us; this
     * one exists to be read by JavaScript, so narrowing it only guarantees that
     * the double-submit header is never sent and every refresh is a 403.
     */
    csrfPath: process.env.AUTH_CSRF_COOKIE_PATH ?? '/',
    domain: process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined,
    /*
     * `none` is required when the SPA and the API sit on different sites, and
     * browsers only accept it alongside Secure — hence the pairing below.
     */
    sameSite: (process.env.AUTH_COOKIE_SAMESITE ?? (isProduction ? 'none' : 'lax')) as
      | 'lax'
      | 'strict'
      | 'none',
    get secure() {
      return flag(process.env.AUTH_COOKIE_SECURE, isProduction || this.sameSite === 'none');
    },
  },

  /*
   * Where a browser is sent back to after the Google round trip. A `next`
   * parameter is honoured only when it resolves inside one of these origins,
   * so the callback cannot be turned into an open redirect.
   *
   * `shop` is the *canonical* origin: the one baked into emailed links, where
   * localhost is useless because the mail is opened on a phone. It is not
   * necessarily the origin the browser is on. A developer running the shop at
   * localhost:5174 against this server would be thrown out to the public
   * domain at the end of a Google sign-in and never come back, so
   * `shopAlternates` lists the other origins the OAuth callback may return
   * to. Order matters only for `shop`; the rest are an allowlist.
   */
  frontends: {
    shop: process.env.SHOP_URL?.trim() || 'https://sopiistore.com',
    admin: process.env.ADMIN_URL?.trim() || 'http://localhost:5173',
    /** Extra shop origins the OAuth callback may return to, e.g. a dev server. */
    shopAlternates: originList(process.env.SHOP_ALT_URLS),
  },

  /*
   * §11: admins may sign in with a mobile OTP only when this is switched on.
   * Off by default — an admin account should not be reachable through whatever
   * SIM happens to be in someone's pocket unless that is a deliberate choice.
   */
  adminOtpEnabled: flag(process.env.ADMIN_OTP_ENABLED, false),
  /** §11: the same switch for Google on the admin panel. */
  adminGoogleEnabled: flag(process.env.ADMIN_GOOGLE_ENABLED, true),

  /*
   * When true, a Google sign-in may create a brand-new customer. Turn it off
   * to make Google a linking-only method for accounts that already exist.
   */
  googleAutoRegister: flag(process.env.AUTH_GOOGLE_AUTO_REGISTER, true),

  /** Default country code applied to a bare 10-digit Indian mobile number. */
  defaultCallingCode: process.env.AUTH_DEFAULT_CALLING_CODE ?? '+91',
} as const;

/* --------------------------------- helpers --------------------------------- */

/** Deterministic keyed hash, for tokens we must look up rather than compare. */
export function hmac(value: string) {
  return crypto.createHmac('sha256', authConfig.secret).update(value).digest('hex');
}

export const isProd = isProduction;
