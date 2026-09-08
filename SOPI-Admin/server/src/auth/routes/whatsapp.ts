/*
 * WhatsApp OTP login (§5, §6, §8).
 * ===========================================================================
 *   GET    /api/auth/whatsapp/status          is it available, and on what terms
 *   POST   /api/auth/whatsapp/request-otp     start a verification
 *   POST   /api/auth/whatsapp/resend-otp      send the same attempt again
 *   POST   /api/auth/whatsapp/verify-otp      finish it, and sign in
 *   POST   /api/auth/whatsapp/link/request    signed-in: add WhatsApp to an account
 *   POST   /api/auth/whatsapp/link/verify     …and finish that
 *   DELETE /api/auth/whatsapp/link            …or remove it
 *
 * The code never appears in any response — not in a body, not in a header, not
 * in an error. What comes back is the resend countdown, how long the code is
 * good for, how many guesses remain, and a masked echo of the number it went
 * to, which is everything the OTP screen needs to render itself.
 *
 * A number nobody has registered still gets a code. That is deliberate:
 * answering "no such number" would be a free directory check, and a new
 * shopper must be able to sign in with nothing but a phone. The account is
 * created on *successful verification*, when the number has actually been
 * proved — and always as a `customer`, never anything else.
 */

import { Router } from 'express';
import { ah, badRequest, HttpError } from '../../lib/http.js';
import { audit } from '../audit.js';
import { authConfig } from '../config.js';
import { clientIp } from '../device.js';
import { formatMobile, maskMobile, normaliseMobile } from '../identifiers.js';
import { requireUser } from '../middleware.js';
import { isAdminRole, UserModel } from '../models.js';
import { limitsFor, otpSessionFor, requestOtp, resendCooldownFor, verifyOtpCode } from '../otp.js';
import { retryAfterSeconds, throttleMessage } from '../rateLimit.js';
import {
  accountProblem,
  countAuthMethods,
  createUser,
  ensureCustomerRecord,
  findUserByMobile,
  findUserWithSecret,
  linkIdentity,
  syncCommerceProfile,
  toPublicUserById,
  unlinkIdentity,
} from '../users.js';
import { resolveWhatsAppConfig } from '../whatsappConfig.js';
import { completeLogin, MESSAGES, readSurface, text } from './shared.js';

export const whatsappRoutes = Router();

/* --------------------------------- helpers --------------------------------- */

function throttled(retryAfterMs: number): never {
  const error = new HttpError(429, throttleMessage(retryAfterMs));
  (error as HttpError & { retryAfter?: number }).retryAfter = retryAfterSeconds(retryAfterMs);
  throw error;
}

/**
 * Refuses everything when WhatsApp is switched off or half-configured.
 *
 * Checked on every entry point rather than only on `request-otp`: turning the
 * feature off while somebody is mid-flow must close the flow, not leave a
 * verify endpoint that still mints sessions.
 */
async function assertAvailable() {
  const config = await resolveWhatsAppConfig();
  if (!config.enabled) {
    badRequest('WhatsApp login is not available right now. Please use another sign-in method.');
  }
  return config;
}

/**
 * §10 and §11, together.
 *
 * A verified WhatsApp number proves a *phone*, and a phone is not an
 * authorization. An admin session over WhatsApp is refused unless an operator
 * has deliberately switched it on, and a customer asking for one is refused
 * whatever the switch says — the role check is the authority, not the channel.
 */
async function assertSurfaceAllowed(mobile: string, surface: 'shop' | 'admin') {
  if (surface !== 'admin') return;
  if (!authConfig.adminWhatsappEnabled) {
    badRequest('WhatsApp sign-in is not enabled for the admin panel.');
  }
  const user = await findUserByMobile(mobile);
  if (user && !isAdminRole(user.role)) badRequest(MESSAGES.noAdminAccess);
}

/** The mobile number from a request body, normalised to E.164 or refused. */
function readMobile(body: Record<string, unknown>): string {
  const mobile = normaliseMobile(text(body.mobile ?? body.phone ?? body.whatsapp, 24));
  if (!mobile) badRequest('Enter a valid mobile number.');
  return mobile!;
}

/**
 * The one shape `request-otp` and `resend-otp` both answer with.
 *
 * Everything the screen needs, and nothing that identifies the account: the
 * number is masked, and the response is byte-for-byte the same whether or not
 * a SOPII account exists behind it.
 */
function sentPayload(
  mobile: string,
  result: Extract<Awaited<ReturnType<typeof requestOtp>>, { ok: true }>,
  message: string,
) {
  return {
    ok: true,
    message,
    channel: 'whatsapp' as const,
    mobileMasked: maskMobile(mobile),
    mobileFormatted: formatMobile(mobile),
    otpLength: authConfig.otp.length,
    resendAfterSeconds: Math.ceil(result.resendAfterMs / 1000),
    expiresInSeconds: Math.ceil(result.expiresInMs / 1000),
    maxAttempts: result.maxAttempts,
    resendsLeft: result.resendsLeft,
    /*
     * False when no provider accepted the message. The shop shows a "check the
     * server log" hint in development off the back of this; it says nothing
     * about the code, and nothing about whether the number is on WhatsApp.
     */
    delivered: result.delivered,
  };
}

/** Turns a refusal into §27's vocabulary. Never names the account. */
function refuse(reason: 'rate_limited' | 'cooldown' | 'resend_limit', retryAfterMs: number): never {
  if (reason === 'cooldown') {
    badRequest(
      `Please wait ${retryAfterSeconds(retryAfterMs)} seconds before requesting another OTP.`,
    );
  }
  if (reason === 'resend_limit') {
    badRequest(
      'You have requested this code too many times. Please start again with your mobile number.',
    );
  }
  throttled(retryAfterMs);
}

/* --------------------------------- status ---------------------------------- */

/**
 * Whether to render the WhatsApp button at all, and on what terms.
 *
 * Public and credential-free by design — it answers a question about the
 * *store's* configuration, not about any account. `mobile` is optional and,
 * when given, restores a countdown that survived a reload.
 */
whatsappRoutes.get(
  '/whatsapp/status',
  ah(async (req, res) => {
    const config = await resolveWhatsAppConfig();
    const limits = await limitsFor('whatsapp');

    const mobile = normaliseMobile(text(req.query.mobile, 24));
    const session = mobile ? await otpSessionFor(mobile, 'login') : null;

    res.json({
      enabled: config.enabled,
      /* Never the token, the SID or the URL — only which kind of provider. */
      provider: config.enabled ? config.provider : null,
      otpLength: authConfig.otp.length,
      expiresInSeconds: Math.ceil(limits.ttlMs / 1000),
      maxAttempts: limits.maxAttempts,
      resendLimit: limits.maxResends,
      resendAfterSeconds: mobile ? Math.ceil((await resendCooldownFor(mobile)) / 1000) : 0,
      pending: session,
      defaultCallingCode: authConfig.defaultCallingCode,
    });
  }),
);

/* ------------------------------- request-otp ------------------------------- */

whatsappRoutes.post(
  '/whatsapp/request-otp',
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const surface = readSurface(req);
    const ip = clientIp(req);

    await assertAvailable();
    const mobile = readMobile(body);
    await assertSurfaceAllowed(mobile, surface);

    const user = await findUserByMobile(mobile);

    /*
     * A blocked account is refused here rather than at verification. That does
     * leak that the number is known — but the alternative is spending a
     * message on an account that cannot sign in anyway, and "this account is
     * currently unavailable" names no reason.
     */
    if (user) {
      const problem = accountProblem(user);
      if (problem) badRequest(problem);
    }

    const result = await requestOtp({
      mobile,
      userId: user?._id,
      purpose: 'login',
      ip,
      channel: 'whatsapp',
    });

    if (!result.ok) {
      await audit(req, {
        action: 'whatsapp_otp_requested',
        status: 'failure',
        userId: user?._id,
        identifier: mobile,
        provider: 'whatsapp',
        surface,
        reason: result.reason,
      });
      refuse(result.reason, result.retryAfterMs);
    }

    await audit(req, {
      action: 'whatsapp_otp_requested',
      userId: user?._id,
      identifier: mobile,
      provider: 'whatsapp',
      surface,
      // The transport, not the outcome per number — see sentPayload.
      reason: result.delivered ? undefined : `not delivered via ${result.transport}`,
    });

    res.json(sentPayload(mobile, result, 'OTP sent on WhatsApp.'));
  }),
);

/* -------------------------------- resend-otp ------------------------------- */

/**
 * The same work as `request-otp`, under its own address.
 *
 * §5 asks for the endpoint separately and the shop calls it from the "Resend"
 * button, so the audit trail can tell a first send from a re-send. The limits
 * are not relaxed for it: the resend ceiling is counted from the live code's
 * chain inside `requestOtp`, so calling `request-otp` in a loop instead buys
 * nothing.
 */
whatsappRoutes.post(
  '/whatsapp/resend-otp',
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const surface = readSurface(req);
    const ip = clientIp(req);

    await assertAvailable();
    const mobile = readMobile(body);
    await assertSurfaceAllowed(mobile, surface);

    const user = await findUserByMobile(mobile);
    if (user) {
      const problem = accountProblem(user);
      if (problem) badRequest(problem);
    }

    const result = await requestOtp({
      mobile,
      userId: user?._id,
      purpose: 'login',
      ip,
      channel: 'whatsapp',
    });

    if (!result.ok) {
      await audit(req, {
        action: 'whatsapp_otp_requested',
        status: 'failure',
        userId: user?._id,
        identifier: mobile,
        provider: 'whatsapp',
        surface,
        reason: `resend: ${result.reason}`,
      });
      refuse(result.reason, result.retryAfterMs);
    }

    await audit(req, {
      action: 'whatsapp_otp_requested',
      userId: user?._id,
      identifier: mobile,
      provider: 'whatsapp',
      surface,
      reason: 'resend',
    });

    res.json(sentPayload(mobile, result, 'A new OTP is on its way to WhatsApp.'));
  }),
);

/* -------------------------------- verify-otp ------------------------------- */

whatsappRoutes.post(
  '/whatsapp/verify-otp',
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const surface = readSurface(req);

    const config = await assertAvailable();
    const mobile = readMobile(body);
    const code = text(body.otp ?? body.code, 12).replace(/\D/g, '');
    if (!code) badRequest(MESSAGES.otpInvalid);

    await assertSurfaceAllowed(mobile, surface);

    const result = await verifyOtpCode({
      mobile,
      code,
      purpose: 'login',
      maxAttempts: config.maxAttempts,
    });

    if (!result.ok) {
      await audit(req, {
        action: 'whatsapp_otp_failed',
        status: 'failure',
        identifier: mobile,
        provider: 'whatsapp',
        surface,
        reason: result.reason,
      });

      // Three distinct messages, each saying what to do next and none of them
      // saying anything about the account.
      if (result.reason === 'expired' || result.reason === 'not_found') {
        badRequest(MESSAGES.otpExpired);
      }
      if (result.reason === 'too_many_attempts') badRequest(MESSAGES.otpAttempts);
      badRequest(MESSAGES.otpInvalid);
    }

    /* ------------------------- §8: link, or create ------------------------- */

    let user = await findUserWithSecret({ mobile });

    if (!user) {
      /*
       * A number that has just proved itself becomes an account. The name is a
       * placeholder the shopper is asked to correct on `/account` — demanding
       * one before letting them in would put a form between them and the thing
       * they came to do.
       *
       * `role` is not read from the request and never could be: `createUser`
       * defaults to `customer`, and this is the only role a public entry point
       * may produce (§10).
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
        provider: 'whatsapp',
        surface,
      });
    }

    const problem = accountProblem(user);
    if (problem) badRequest(problem);

    /*
     * §8's account linking, and it really is this small: an identity row
     * pointing at the account that already owns the number. An account that
     * signs in with email and password, or with Google, and whose mobile is
     * this one, gains WhatsApp as a method rather than a duplicate account —
     * because the number is the join key and `users.mobile` is unique.
     */
    const firstTime = !user.whatsappVerifiedAt;
    const now = new Date();

    await Promise.all([
      linkIdentity({ userId: user._id, provider: 'whatsapp', providerUserId: mobile }),
      UserModel.updateOne(
        { _id: user._id },
        {
          $set: {
            whatsappVerifiedAt: now,
            // Verifying a code is proof of the number itself, whichever
            // channel carried it.
            ...(user.mobileVerifiedAt ? {} : { mobileVerifiedAt: now }),
          },
        },
      ),
      ensureCustomerRecord(user),
    ]);

    await audit(req, {
      action: 'whatsapp_otp_verified',
      userId: user._id,
      identifier: mobile,
      provider: 'whatsapp',
      surface,
    });

    if (firstTime) {
      await audit(req, {
        action: 'whatsapp_linked',
        userId: user._id,
        identifier: mobile,
        provider: 'whatsapp',
        surface,
      });
    }

    const payload = await completeLogin(req, res, {
      user: { ...user, whatsappVerifiedAt: now, mobileVerifiedAt: user.mobileVerifiedAt ?? now },
      method: 'whatsapp',
      surface,
    });

    res.json({ ...payload, message: 'WhatsApp number verified successfully.' });
  }),
);

/* --------------------------------- linking --------------------------------- */

/**
 * §26, from the other direction: somebody already signed in adding WhatsApp.
 *
 * Uses `verify_mobile` rather than `login` as the purpose, so a code minted
 * here can never be presented to `/whatsapp/verify-otp` to open a session on
 * another account — which is the whole reason the two purposes exist.
 */
whatsappRoutes.post(
  '/whatsapp/link/request',
  requireUser,
  ah(async (req, res) => {
    await assertAvailable();

    const body = req.body as Record<string, unknown>;
    const user = req.authUser!.user;
    const mobile = readMobile(body);

    /*
     * A number that already belongs to somebody else cannot be claimed. The
     * message is deliberately the same one an unusable number gets, so this is
     * not a way to test whether a number has a SOPII account — the caller is
     * signed in, but they are still not entitled to that.
     */
    const owner = await findUserByMobile(mobile);
    if (owner && owner._id !== user._id) {
      badRequest('That mobile number cannot be used on this account.');
    }

    const result = await requestOtp({
      mobile,
      userId: user._id,
      purpose: 'verify_mobile',
      ip: clientIp(req),
      channel: 'whatsapp',
    });

    if (!result.ok) {
      await audit(req, {
        action: 'whatsapp_otp_requested',
        status: 'failure',
        userId: user._id,
        identifier: mobile,
        provider: 'whatsapp',
        reason: `link: ${result.reason}`,
      });
      refuse(result.reason, result.retryAfterMs);
    }

    await audit(req, {
      action: 'whatsapp_otp_requested',
      userId: user._id,
      identifier: mobile,
      provider: 'whatsapp',
      reason: 'link',
    });

    res.json(sentPayload(mobile, result, 'OTP sent on WhatsApp.'));
  }),
);

whatsappRoutes.post(
  '/whatsapp/link/verify',
  requireUser,
  ah(async (req, res) => {
    const config = await assertAvailable();

    const body = req.body as Record<string, unknown>;
    const user = req.authUser!.user;
    const mobile = readMobile(body);
    const code = text(body.otp ?? body.code, 12).replace(/\D/g, '');
    if (!code) badRequest(MESSAGES.otpInvalid);

    const owner = await findUserByMobile(mobile);
    if (owner && owner._id !== user._id) {
      badRequest('That mobile number cannot be used on this account.');
    }

    const result = await verifyOtpCode({
      mobile,
      code,
      purpose: 'verify_mobile',
      maxAttempts: config.maxAttempts,
    });

    if (!result.ok) {
      await audit(req, {
        action: 'whatsapp_otp_failed',
        status: 'failure',
        userId: user._id,
        identifier: mobile,
        provider: 'whatsapp',
        reason: `link: ${result.reason}`,
      });
      if (result.reason === 'expired' || result.reason === 'not_found') {
        badRequest(MESSAGES.otpExpired);
      }
      if (result.reason === 'too_many_attempts') badRequest(MESSAGES.otpAttempts);
      badRequest(MESSAGES.otpInvalid);
    }

    const now = new Date();
    await UserModel.updateOne(
      { _id: user._id },
      { $set: { mobile, mobileVerifiedAt: now, whatsappVerifiedAt: now } },
    );
    await linkIdentity({ userId: user._id, provider: 'whatsapp', providerUserId: mobile });
    await syncCommerceProfile({ ...user, mobile });

    await audit(req, {
      action: 'whatsapp_linked',
      userId: user._id,
      identifier: mobile,
      provider: 'whatsapp',
    });

    res.json({
      ok: true,
      message: 'WhatsApp linked to your SOPII account.',
      user: await toPublicUserById(user._id),
    });
  }),
);

/**
 * Removing WhatsApp as a login method.
 *
 * Refused when it is the last one. The rule holds on the API rather than in
 * the browser, because a client that decides for itself which method is
 * removable is a client that can be edited — and the failure mode is somebody
 * permanently locked out of their own orders.
 */
whatsappRoutes.delete(
  '/whatsapp/link',
  requireUser,
  ah(async (req, res) => {
    const user = await findUserWithSecret({ _id: req.authUser!.user._id });
    if (!user) badRequest('We could not find your account.');

    if (!user!.whatsappVerifiedAt) {
      badRequest('WhatsApp is not connected to your account.');
    }

    if ((await countAuthMethods(user!)) <= 1) {
      badRequest('Set up another sign-in method before removing WhatsApp.');
    }

    await Promise.all([
      unlinkIdentity(user!._id, 'whatsapp'),
      UserModel.updateOne({ _id: user!._id }, { $unset: { whatsappVerifiedAt: '' } }),
    ]);

    await audit(req, {
      action: 'whatsapp_unlinked',
      userId: user!._id,
      identifier: user!.mobile,
      provider: 'whatsapp',
    });

    res.json({
      ok: true,
      message: 'WhatsApp removed from your login methods.',
      user: await toPublicUserById(user!._id),
    });
  }),
);
