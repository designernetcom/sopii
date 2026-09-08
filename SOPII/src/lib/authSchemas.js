/**
 * Validation schemas (§23).
 * ===========================================================================
 * These exist to give someone filling in a form an answer before they press a
 * button — not to secure anything. Every rule below is enforced again on the
 * server (`server/src/auth/crypto.ts` and the route handlers), because a schema
 * that runs in the browser is a schema an attacker can edit.
 *
 * Kept in one file so the login form, the register form and the reset form
 * cannot drift apart on what a valid password or mobile number is.
 */

import { z } from 'zod';

/* -------------------------------- primitives ------------------------------- */

const email = z
  .string()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .transform((value) => value.trim().toLowerCase());

/**
 * §2 accepts an email *or* a username in one field, so this cannot be
 * `z.string().email()`. It checks only that something plausible was typed and
 * lets the server decide what it matches.
 */
const identifier = z
  .string()
  .min(1, 'Email or username is required')
  .max(160, 'That is too long')
  .transform((value) => value.trim());

/**
 * Indian mobile numbers, however they were typed.
 *
 * `superRefine` rather than a regex so that the message can distinguish "you
 * have not typed enough digits" from "that is not a mobile number" — the two
 * mistakes want different corrections.
 */
const mobile = z
  .string()
  .min(1, 'Mobile number is required')
  .transform((value) => value.replace(/\D/g, ''))
  .superRefine((digits, ctx) => {
    // A leading 0 or 91 is a trunk/country prefix, not part of the number.
    const national = digits.replace(/^(?:0|91)/, '');
    if (national.length < 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter all 10 digits' });
      return;
    }
    if (national.length > 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'That is too many digits' });
      return;
    }
    if (!/^[6-9]/.test(national)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An Indian mobile number starts with 6, 7, 8 or 9',
      });
    }
  })
  .transform((digits) => digits.replace(/^(?:0|91)/, ''));

/**
 * §4's password policy, as five separate checks.
 *
 * One combined regex would produce one message — "password not strong enough"
 * — which tells somebody nothing about what to change. Five checks produce
 * five specific corrections, and `PASSWORD_RULES` below lets the strength
 * meter show the same list live as they type.
 */
export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use no more than 128 characters')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/\d/, 'Add a number')
  .regex(/[^A-Za-z0-9]/, 'Add a special character');

/** The same rules, as data, for the strength meter to render. */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { id: 'lower', label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
  { id: 'number', label: 'One number', test: (value) => /\d/.test(value) },
  { id: 'symbol', label: 'One special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export function passwordScore(value = '') {
  return PASSWORD_RULES.filter((rule) => rule.test(value)).length;
}

/* --------------------------------- schemas --------------------------------- */

/**
 * Login is deliberately lax about the password: `min(1)`.
 *
 * The policy applies to passwords being *set*, not to one being checked — an
 * account created before the rules tightened must still be able to sign in and
 * change it, and refusing to submit a password the server would accept is a
 * lockout the person cannot escape.
 */
export const loginSchema = z.object({
  identifier,
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional(),
});

export const registerSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required').max(60, 'That is too long'),
    lastName: z.string().max(60, 'That is too long').optional().or(z.literal('')),
    email,
    mobile,
    password,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'Please accept the Terms & Conditions to continue' }),
    }),
    acceptsMarketing: z.boolean().optional(),
  })
  // Attached to `confirmPassword` rather than the object, so the message lands
  // under the field the person needs to fix.
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Both passwords must match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Both passwords must match',
    path: ['confirmPassword'],
  });

export const mobileSchema = z.object({ mobile });

export const otpSchema = z.object({
  otp: z
    .string()
    .min(6, 'Enter all 6 digits')
    .max(6, 'Enter all 6 digits')
    .regex(/^\d{6}$/, 'An OTP is 6 digits'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: password,
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Both passwords must match',
    path: ['confirmPassword'],
  });

/** Setting a first password — a Google-only account has none to confirm. */
export const setPasswordSchema = z
  .object({
    newPassword: password,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Both passwords must match',
    path: ['confirmPassword'],
  });

export const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(60, 'That is too long'),
  lastName: z.string().max(60, 'That is too long').optional().or(z.literal('')),
  acceptsMarketing: z.boolean().optional(),
});
