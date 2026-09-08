/*
 * The live WhatsApp configuration.
 * ===========================================================================
 * Two sources, one answer.
 *
 *   environment   what the deployment ships with (`WHATSAPP_*` in server/.env)
 *   settings      what an admin has typed into Settings → Authentication
 *
 * The settings document wins wherever it has a value, and falls back to the
 * environment where it does not. That ordering is what makes the admin form
 * useful — an operator can turn WhatsApp on, swap a template or rotate a token
 * without a redeploy — while a deployment that would rather keep its
 * credentials in the environment simply never fills the form in.
 *
 * The access token is the one field that never travels in the clear: it is
 * AES-GCM encrypted on write (`secretBox.ts`), decrypted here for the sender,
 * and replaced by a mask on the way back to the panel. Nothing in this file is
 * ever returned to a browser directly — `redactWhatsApp()` is what the admin
 * API answers with.
 */

import { SETTINGS_ID, SettingsModel } from '../db/models.js';
import { authConfig } from './config.js';
import { decryptSecret, encryptSecret, isEncrypted, maskSecret } from './secretBox.js';

export type WhatsAppProvider = 'meta' | 'twilio' | 'webhook';

/** The resolved configuration, with a usable token. Server-side only. */
export interface WhatsAppConfig {
  enabled: boolean;
  provider: WhatsAppProvider;
  apiUrl: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  templateName: string;
  templateLanguage: string;
  /** Twilio: the WhatsApp-enabled sender, e.g. `whatsapp:+14155238886`. */
  fromNumber: string;
  /** Twilio: the account SID. The auth token is `accessToken`. */
  accountSid: string;
  otpTtlMs: number;
  maxAttempts: number;
  resendLimit: number;
}

/** The stored shape, as it sits in `settings.authentication.whatsapp`. */
export interface StoredWhatsAppSettings {
  enabled?: boolean;
  provider?: WhatsAppProvider;
  apiUrl?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  /** Ciphertext. Never a plain token once it has been through `saveWhatsAppSettings`. */
  accessToken?: string;
  templateName?: string;
  templateLanguage?: string;
  fromNumber?: string;
  accountSid?: string;
  /** Minutes, because that is the unit the admin form asks for. */
  otpExpiryMinutes?: number;
  maxAttempts?: number;
  resendLimit?: number;
  updatedAt?: string;
  updatedBy?: string;
}

/* --------------------------------- reading --------------------------------- */

/*
 * A short cache. Sending one OTP would otherwise cost a settings read, and the
 * request path already has three round trips it cannot avoid. Ten seconds is
 * long enough to matter under load and short enough that an admin saving the
 * form sees the change immediately — `invalidateWhatsAppCache()` makes that
 * immediate rather than eventual.
 */
let cache: { at: number; value: StoredWhatsAppSettings } | null = null;
const CACHE_MS = 10_000;

export function invalidateWhatsAppCache() {
  cache = null;
}

export async function readStoredWhatsAppSettings(): Promise<StoredWhatsAppSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  try {
    const doc = await SettingsModel.findById(SETTINGS_ID)
      .select('authentication')
      .lean<{ authentication?: { whatsapp?: StoredWhatsAppSettings } }>();
    const value = doc?.authentication?.whatsapp ?? {};
    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    // A settings read that fails must not take WhatsApp login down with it —
    // the environment fallback is still a complete configuration.
    console.warn('[auth] could not read WhatsApp settings:', (error as Error).message);
    return {};
  }
}

const pick = (stored: string | undefined, fallback: string) => stored?.trim() || fallback;

const positive = (stored: number | undefined, fallback: number) =>
  typeof stored === 'number' && Number.isFinite(stored) && stored > 0
    ? Math.floor(stored)
    : fallback;

/**
 * The configuration a send should actually use.
 *
 * `enabled` is deliberately conservative: switching WhatsApp on in the panel
 * is not enough on its own, the credentials the chosen provider needs have to
 * be present too. A button that leads to a 500 is worse than a hidden one.
 */
export async function resolveWhatsAppConfig(): Promise<WhatsAppConfig> {
  const stored = await readStoredWhatsAppSettings();
  const env = authConfig.whatsapp;

  const provider = (pick(stored.provider, env.provider) as WhatsAppProvider) ?? 'meta';
  const accessToken = stored.accessToken ? decryptSecret(stored.accessToken) : env.accessToken;

  const config: WhatsAppConfig = {
    enabled: stored.enabled ?? env.enabled,
    provider,
    apiUrl: pick(stored.apiUrl, env.apiUrl).replace(/\/+$/, ''),
    phoneNumberId: pick(stored.phoneNumberId, env.phoneNumberId),
    businessAccountId: pick(stored.businessAccountId, env.businessAccountId),
    accessToken,
    templateName: pick(stored.templateName, env.templateName),
    templateLanguage: pick(stored.templateLanguage, env.templateLanguage),
    fromNumber: pick(stored.fromNumber, env.fromNumber),
    accountSid: pick(stored.accountSid, env.accountSid),
    otpTtlMs: stored.otpExpiryMinutes
      ? positive(stored.otpExpiryMinutes, 5) * 60_000
      : authConfig.otp.ttlMs,
    maxAttempts: positive(stored.maxAttempts, authConfig.otp.maxAttempts),
    resendLimit: positive(stored.resendLimit, authConfig.otp.maxResends),
  };

  return { ...config, enabled: config.enabled && isConfigured(config) };
}

/** Whether the chosen provider has everything it needs to send. */
export function isConfigured(config: WhatsAppConfig): boolean {
  if (!config.accessToken) return false;

  switch (config.provider) {
    case 'meta':
      return Boolean(config.phoneNumberId && config.templateName);
    case 'twilio':
      return Boolean(config.accountSid && config.fromNumber);
    case 'webhook':
      return Boolean(config.apiUrl);
    default:
      return false;
  }
}

/**
 * What is missing, for the admin panel's benefit.
 *
 * Shown only to a signed-in admin with `settings` permission, so naming the
 * empty fields is a help rather than a leak.
 */
export function missingFields(config: WhatsAppConfig): string[] {
  const gaps: string[] = [];
  if (!config.accessToken) gaps.push('Access Token');

  if (config.provider === 'meta') {
    if (!config.phoneNumberId) gaps.push('Phone Number ID');
    if (!config.templateName) gaps.push('OTP Template Name');
  }
  if (config.provider === 'twilio') {
    if (!config.accountSid) gaps.push('Account SID');
    if (!config.fromNumber) gaps.push('From Number');
  }
  if (config.provider === 'webhook' && !config.apiUrl) gaps.push('API URL');

  return gaps;
}

/* --------------------------------- writing --------------------------------- */

const PROVIDERS: WhatsAppProvider[] = ['meta', 'twilio', 'webhook'];

/** Kept in step with the admin form's placeholder for an unchanged token. */
export const TOKEN_UNCHANGED = '__unchanged__';

const clean = (value: unknown, max = 300) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const bounded = (
  value: unknown,
  { min, max, fallback }: { min: number; max: number; fallback: number },
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

/**
 * Normalises and stores what the admin form submitted.
 *
 * Two rules the panel cannot be trusted to keep for itself:
 *
 *   - the access token is encrypted before it touches the database, and a
 *     submission carrying the mask (or the `TOKEN_UNCHANGED` sentinel) leaves
 *     the stored one alone rather than overwriting a real token with dots;
 *   - the numeric limits are clamped here, so a hand-crafted request cannot
 *     set the OTP expiry to a year or the attempt ceiling to a thousand.
 */
export async function saveWhatsAppSettings(
  input: Record<string, unknown>,
  { updatedBy }: { updatedBy?: string } = {},
): Promise<StoredWhatsAppSettings> {
  const current = await readStoredWhatsAppSettings();

  const submittedToken = clean(input.accessToken, 4096);
  const keepExisting =
    !submittedToken || submittedToken === TOKEN_UNCHANGED || submittedToken.includes('•');

  const provider = PROVIDERS.includes(input.provider as WhatsAppProvider)
    ? (input.provider as WhatsAppProvider)
    : (current.provider ?? 'meta');

  const next: StoredWhatsAppSettings = {
    enabled: Boolean(input.enabled),
    provider,
    apiUrl: clean(input.apiUrl, 500),
    phoneNumberId: clean(input.phoneNumberId, 120),
    businessAccountId: clean(input.businessAccountId, 120),
    accessToken: keepExisting
      ? current.accessToken
      : // Encrypt unless it somehow arrived already encrypted — which happens
        // if a caller round-trips a stored document rather than a form.
        isEncrypted(submittedToken)
        ? submittedToken
        : encryptSecret(submittedToken),
    templateName: clean(input.templateName, 120),
    templateLanguage: clean(input.templateLanguage, 20) || 'en',
    fromNumber: clean(input.fromNumber, 40),
    accountSid: clean(input.accountSid, 120),
    otpExpiryMinutes: bounded(input.otpExpiryMinutes, { min: 1, max: 30, fallback: 5 }),
    maxAttempts: bounded(input.maxAttempts, { min: 1, max: 10, fallback: 5 }),
    resendLimit: bounded(input.resendLimit, { min: 1, max: 10, fallback: 3 }),
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  await SettingsModel.updateOne(
    { _id: SETTINGS_ID },
    { $set: { 'authentication.whatsapp': next } },
    { upsert: true },
  );

  invalidateWhatsAppCache();
  return next;
}

/* -------------------------------- redacting -------------------------------- */

/** The shape the admin panel receives. The token is a mask, never the token. */
export interface RedactedWhatsAppSettings {
  enabled: boolean;
  provider: WhatsAppProvider;
  apiUrl: string;
  phoneNumberId: string;
  businessAccountId: string;
  /** `EAAG••••••••b7Zq`, or empty when nothing is stored. */
  accessTokenMasked: string;
  /** Whether a token exists at all, so the form can say "replace" or "add". */
  hasAccessToken: boolean;
  /** True when the token came from the environment rather than this form. */
  accessTokenFromEnv: boolean;
  templateName: string;
  templateLanguage: string;
  fromNumber: string;
  accountSid: string;
  otpExpiryMinutes: number;
  maxAttempts: number;
  resendLimit: number;
  /** Ready to send: switched on *and* completely configured. */
  ready: boolean;
  missing: string[];
  updatedAt: string | null;
}

/**
 * §31: the panel is shown everything except the credential.
 *
 * Note what is *not* here — no `accessToken`, no `apiSecret`, nothing that
 * could be replayed. The mask exists so an admin can confirm which token is
 * installed without the token crossing the wire.
 */
export async function redactWhatsApp(): Promise<RedactedWhatsAppSettings> {
  const [stored, config] = await Promise.all([
    readStoredWhatsAppSettings(),
    resolveWhatsAppConfig(),
  ]);

  return {
    enabled: stored.enabled ?? authConfig.whatsapp.enabled,
    provider: config.provider,
    apiUrl: config.apiUrl,
    phoneNumberId: config.phoneNumberId,
    businessAccountId: config.businessAccountId,
    accessTokenMasked: maskSecret(config.accessToken),
    hasAccessToken: Boolean(config.accessToken),
    accessTokenFromEnv: !stored.accessToken && Boolean(authConfig.whatsapp.accessToken),
    templateName: config.templateName,
    templateLanguage: config.templateLanguage,
    fromNumber: config.fromNumber,
    accountSid: config.accountSid,
    otpExpiryMinutes: Math.round(config.otpTtlMs / 60_000),
    maxAttempts: config.maxAttempts,
    resendLimit: config.resendLimit,
    ready: config.enabled,
    missing: missingFields(config),
    updatedAt: stored.updatedAt ?? null,
  };
}

/** Whether the shop should offer a "Login with WhatsApp" button at all. */
export async function whatsappEnabled(): Promise<boolean> {
  return (await resolveWhatsAppConfig()).enabled;
}
