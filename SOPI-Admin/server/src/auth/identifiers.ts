/*
 * Normalising what people type.
 * ===========================================================================
 * A login form accepts an email, a username or a mobile number in one box, and
 * an Indian shopper will write the same number as `98200 11223`,
 * `+91 98200-11223` or `09820011223`. Unless all of those collapse to one
 * canonical value before they reach the database, "unique mobile number" is a
 * promise the schema cannot keep and rate limiting counts the same person as
 * five different ones.
 *
 * Everything stored or counted goes through here first.
 */

import { authConfig } from './config.js';

/* --------------------------------- email ----------------------------------- */

/*
 * Deliberately permissive. Address syntax is far stranger than any regexp
 * admits, and the only test that really settles whether an address exists is
 * sending mail to it; over-strict validation just rejects real customers.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (value: string) => EMAIL_RE.test(value.trim());

export const normaliseEmail = (value: string) => value.trim().toLowerCase();

/* --------------------------------- mobile ---------------------------------- */

/**
 * To E.164, or null if it cannot be.
 *
 * A bare 10-digit number gets the configured calling code (+91), because that
 * is what an Indian storefront's customers type. Anything already carrying a
 * `+` is kept as it is, so an international number survives.
 */
export function normaliseMobile(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) {
    // 8 is the shortest national number in use; 15 is E.164's ceiling.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  // `09820011223` — the trunk prefix an Indian dialler adds.
  const national = digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;

  if (national.length === 10) {
    // Indian mobile numbers begin 6-9; a landline here is a typo, not a phone
    // that can receive an SMS.
    if (authConfig.defaultCallingCode === '+91' && !/^[6-9]/.test(national)) return null;
    return `${authConfig.defaultCallingCode}${national}`;
  }

  // A full international number typed without its plus.
  if (national.length >= 11 && national.length <= 15) return `+${national}`;

  return null;
}

export const isMobile = (value: string) => normaliseMobile(value) !== null;

/**
 * `+919820011223` becomes `+91 98200 11223`, which is how the OTP screen shows
 * a number back to the person who typed it.
 */
export function formatMobile(mobile: string): string {
  const match = /^(\+91)(\d{5})(\d{5})$/.exec(mobile);
  if (match) return `${match[1]} ${match[2]} ${match[3]}`;
  return mobile;
}

/**
 * §5's masked confirmation: `+91 XXXXX X1223`. Enough for the owner to
 * recognise their own number, not enough for anyone else to learn it.
 */
export function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  const tail = digits.slice(-4);
  const code = mobile.startsWith('+') ? `+${digits.slice(0, digits.length - 10) || ''}` : '';
  return `${code} ${'X'.repeat(5)} ${'X'.repeat(1)}${tail}`.trim();
}

/** `rajesh@sopii.in` becomes `r••••h@sopii.in`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  if (local.length <= 2) return `${local[0]}•••@${domain}`;
  return `${local[0]}${'•'.repeat(Math.min(local.length - 2, 6))}${local.slice(-1)}@${domain}`;
}

/* -------------------------------- username --------------------------------- */

/**
 * §2 accepts "Email / Username" in one field. The store has no separate
 * username column, so the local part of an email doubles as one: typing
 * `rajesh` matches `rajesh@sopii.in`. This is the shape that is allowed to try.
 */
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/i;

export const isUsername = (value: string) => USERNAME_RE.test(value.trim());

/* -------------------------------- dispatch --------------------------------- */

export type IdentifierKind = 'email' | 'mobile' | 'username';

export interface ParsedIdentifier {
  kind: IdentifierKind;
  /** The canonical form: lower-cased email, E.164 mobile, lower-cased handle. */
  value: string;
  /** Exactly what was typed, for the audit log. */
  raw: string;
}

/**
 * Works out what a single "Email / Username" box was given.
 *
 * Email first, then mobile, then username — an all-digit string is a phone
 * number long before it is a handle, and an `@` settles it either way.
 */
export function parseIdentifier(raw: string): ParsedIdentifier | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (isEmail(trimmed)) {
    return { kind: 'email', value: normaliseEmail(trimmed), raw: trimmed };
  }

  const mobile = normaliseMobile(trimmed);
  if (mobile) return { kind: 'mobile', value: mobile, raw: trimmed };

  if (isUsername(trimmed)) {
    return { kind: 'username', value: trimmed.toLowerCase(), raw: trimmed };
  }

  return null;
}
