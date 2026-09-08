/*
 * Mobile OTP login (§5).
 * ===========================================================================
 *   POST /api/auth/otp/request
 *   POST /api/auth/otp/verify
 *
 * The code never appears in either response — not in a body, not in a header,
 * not in an error. What comes back is the resend countdown, how long the code
 * is good for, and a masked echo of the number it went to, which is everything
 * the OTP screen needs to render itself.
 *
 * A number nobody has registered still gets a code. That is deliberate: `/otp/
 * request` answering "no such number" would be a free directory check, and
 * §32's Flow 2 (mobile → OTP → verify → account) expects a new shopper to be
 * able to sign in with nothing but a phone. The account is created on
 * *successful verification*, when the number has actually been proved.
 */

import { Router } from 'express';
import { ah, badRequest, HttpError } from '../../lib/http.js';
import { audit } from '../audit.js';
import { authConfig } from '../config.js';
import { clientIp } from '../device.js';
import { formatMobile, maskMobile, normaliseMobile } from '../identifiers.js';
import { isAdminRole, UserModel } from '../models.js';
import { requestOtp, resendCooldownFor, verifyOtpCode } from '../otp.js';
import { retryAfterSeconds, throttleMessage } from '../rateLimit.js';
import {
  accountProblem,
  createUser,
  ensureCustomerRecord,
  findUserByMobile,
  findUserWithSecret,
  linkIdentity,
} from '../users.js';
import { completeLogin, MESSAGES, readSurface, text } from './shared.js';

export const otpRoutes = Router();

function throttled(retryAfterMs: number): never {
  const error = new HttpError(429, throttleMessage(retryAfterMs));
  (error as HttpError & { retryAfter?: number }).retryAfter = retryAfterSeconds(retryAfterMs);
  throw error;
}

/** §11: an admin may only use OTP when the operator has switched it on. */
async function assertOtpAllowed(mobile: string, surface: 'shop' | 'admin') {
  if (surface !== 'admin') return;
  if (!authConfig.adminOtpEnabled) {
    badRequest('Mobile sign-in is not enabled for the admin panel.');
  }
  const user = await findUserByMobile(mobile);
  if (user && !isAdminRole(user.role)) badRequest(MESSAGES.noAdminAccess);
}

/* --------------------------------- request --------------------------------- */

otpRoutes.post(
  '/otp/request',
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const surface = readSurface(req);
    const ip = clientIp(req);

    const mobile = normaliseMobile(text(body.mobile ?? body.phone, 24));
    if (!mobile) badRequest('Enter a valid mobile number.');

    await assertOtpAllowed(mobile, surface);

    const user = await findUserByMobile(mobile);

    /*
     * A blocked account is refused here rather than at verification. That does
     * leak that the number is known — but the alternative is spending an SMS
     * on an account that cannot sign in anyway, and "this account is currently
     * unavailable" names no reason.
     */
    if (user) {
      const problem = accountProblem(user);
      if (problem) badRequest(problem);
    }

    const result = await requestOtp({ mobile, userId: user?._id, purpose: 'login', ip });

    if (!result.ok) {
      await audit(req, {
        action: 'otp_requested',
        status: 'failure',
        userId: user?._id,
        identifier: mobile,
        provider: 'otp',
        surface,
        reason: result.reason,
      });
      if (result.reason === 'cooldown') {
        badRequest(
          `Please wait ${retryAfterSeconds(result.retryAfterMs)} seconds before requesting another OTP.`,
        );
      }
      throttled(result.retryAfterMs);
    }

    await audit(req, {
      action: 'otp_requested',
      userId: user?._id,
      identifier: mobile,
      provider: 'otp',
      surface,
    });

    res.json({
      ok: true,
      message: 'OTP sent successfully.',
      /* Everything the screen needs, and nothing that identifies the account. */
      mobileMasked: maskMobile(mobile),
      mobileFormatted: formatMobile(mobile),
      otpLength: authConfig.otp.length,
      resendAfterSeconds: Math.ceil(result.resendAfterMs / 1000),
      expiresInSeconds: Math.ceil(result.expiresInMs / 1000),
      maxAttempts: authConfig.otp.maxAttempts,
      /*
       * False when no SMS provider is wired up. The shop shows a "check the
       * server log" hint in development off the back of this; it says nothing
       * about the code itself.
       */
      delivered: result.delivered,
    });
  }),
);

/* --------------------------------- verify ---------------------------------- */

otpRoutes.post(
  '/otp/verify',
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const surface = readSurface(req);

    const mobile = normaliseMobile(text(body.mobile ?? body.phone, 24));
    const code = text(body.otp ?? body.code, 12).replace(/\D/g, '');

    if (!mobile) badRequest('Enter a valid mobile number.');
    if (!code) badRequest(MESSAGES.otpInvalid);

    await assertOtpAllowed(mobile, surface);

    const result = await verifyOtpCode({ mobile, code, purpose: 'login' });

    if (!result.ok) {
      await audit(req, {
        action: 'otp_failed',
        status: 'failure',
        identifier: mobile,
        provider: 'otp',
        surface,
        reason: result.reason,
      });

      // §5's three distinct messages. Each says what the person should do
      // next, and none of them says anything about the account.
      if (result.reason === 'expired' || result.reason === 'not_found') {
        badRequest(MESSAGES.otpExpired);
      }
      if (result.reason === 'too_many_attempts') badRequest(MESSAGES.otpAttempts);
      badRequest(MESSAGES.otpInvalid);
    }

    let user = await findUserWithSecret({ mobile });

    if (!user) {
      /*
       * Flow 2: a number that has just proved itself becomes an account. The
       * name is a placeholder the shopper is asked to correct on `/account` —
       * demanding one before letting them in would put a form between them and
       * the thing they came to do.
       */
      if (surface === 'admin') badRequest(MESSAGES.noAdminAccess);

      user = await createUser({
        firstName: 'SOPII',
        lastName: 'Shopper',
        mobile,
        role: 'customer',
        mobileVerified: true,
      });

      await audit(req, {
        action: 'account_created',
        userId: user._id,
        identifier: mobile,
        provider: 'otp',
        surface,
      });
    }

    const problem = accountProblem(user);
    if (problem) badRequest(problem);

    await Promise.all([
      linkIdentity({ userId: user._id, provider: 'otp', providerUserId: mobile }),
      // Verifying a code is proof of the number, so the flag is set whether or
      // not this was the account's first OTP.
      user.mobileVerifiedAt
        ? Promise.resolve()
        : UserModel.updateOne({ _id: user._id }, { $set: { mobileVerifiedAt: new Date() } }),
      ensureCustomerRecord(user),
    ]);

    await audit(req, {
      action: 'otp_verified',
      userId: user._id,
      identifier: mobile,
      provider: 'otp',
      surface,
    });

    const payload = await completeLogin(req, res, { user, method: 'otp', surface });
    res.json({ ...payload, message: 'Mobile number verified successfully.' });
  }),
);

/* -------------------------------- countdown -------------------------------- */

/**
 * Lets the OTP screen restore its resend countdown after a reload, instead of
 * cheerfully offering a resend that the server will refuse.
 */
otpRoutes.get(
  '/otp/status',
  ah(async (req, res) => {
    const mobile = normaliseMobile(text(req.query.mobile, 24));
    if (!mobile) badRequest('Enter a valid mobile number.');

    res.json({
      resendAfterSeconds: Math.ceil((await resendCooldownFor(mobile)) / 1000),
      otpLength: authConfig.otp.length,
      maxAttempts: authConfig.otp.maxAttempts,
    });
  }),
);
