/*
 * Account security and login methods (§26).
 * ===========================================================================
 *   PATCH  /api/auth/profile
 *   POST   /api/auth/password          change, or set for the first time
 *   POST   /api/auth/mobile/request    start verifying a mobile number
 *   POST   /api/auth/mobile/verify     finish it
 *   DELETE /api/auth/mobile            remove the number
 *
 * One rule governs the whole file: **an identity must always keep at least one
 * working way to sign in.** Removing a Google link, a password or a verified
 * mobile is refused when it would be the last one — otherwise a single
 * mis-click locks somebody permanently out of their own orders, and no support
 * process can undo it without becoming an account-takeover mechanism itself.
 */

import { Router } from 'express';
import { ah, badRequest } from '../../lib/http.js';
import { audit } from '../audit.js';
import { checkPasswordStrength, hashPassword, verifyPassword } from '../crypto.js';
import { clientIp } from '../device.js';
import { formatMobile, maskMobile, normaliseMobile } from '../identifiers.js';
import { requireUser } from '../middleware.js';
import { UserModel } from '../models.js';
import { requestOtp, verifyOtpCode } from '../otp.js';
import { resolveWhatsAppConfig } from '../whatsappConfig.js';
import { retryAfterSeconds } from '../rateLimit.js';
import { revokeOtherSessions } from '../sessions.js';
import {
  countAuthMethods,
  findUserByMobile,
  findUserWithSecret,
  linkIdentity,
  listIdentities,
  syncCommerceProfile,
  toPublicUserById,
  unlinkIdentity,
} from '../users.js';
import { secret, text } from './shared.js';

export const accountRoutes = Router();

/* --------------------------------- profile --------------------------------- */

accountRoutes.patch(
  '/profile',
  requireUser,
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const user = req.authUser!.user;

    const patch: Record<string, unknown> = {};

    if (body.firstName !== undefined) {
      const firstName = text(body.firstName, 60);
      if (!firstName) badRequest('Please tell us your first name.');
      patch.firstName = firstName;
    }
    if (body.lastName !== undefined) patch.lastName = text(body.lastName, 60) || undefined;
    if (body.acceptsMarketing !== undefined) patch.acceptsMarketing = Boolean(body.acceptsMarketing);
    if (body.profileImage !== undefined) patch.profileImage = text(body.profileImage, 500) || undefined;

    /*
     * Email is not editable here. It identifies the account, it is what a
     * guest order is matched on, and changing it is an account-takeover
     * primitive unless the new address is proved first — which is a verified-
     * email flow this store does not have yet.
     */
    if (Object.keys(patch).length) {
      await UserModel.updateOne({ _id: user._id }, { $set: patch });
      await syncCommerceProfile({ ...user, ...patch } as typeof user);
    }

    res.json({ ok: true, user: await toPublicUserById(user._id) });
  }),
);

/* -------------------------------- password --------------------------------- */

/**
 * Change a password, or set one for the first time.
 *
 * The branch is on whether a hash exists, not on whether the client sent a
 * current password: a Google-only identity adding a password has nothing to
 * prove and would otherwise be stuck, while an identity that *has* one must
 * always present it — being signed in is not sufficient, because a borrowed
 * unlocked laptop is a signed-in session.
 */
accountRoutes.post(
  '/password',
  requireUser,
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const current = await findUserWithSecret({ _id: req.authUser!.user._id });
    if (!current) badRequest('We could not find your account.');

    const newPassword = secret(body.newPassword ?? body.password);
    const confirmPassword = secret(body.confirmPassword);

    const strength = checkPasswordStrength(newPassword);
    if (!strength.ok) badRequest(strength.problems.join('. ') + '.');
    if (confirmPassword && newPassword !== confirmPassword) badRequest('Both passwords must match.');

    const isChange = Boolean(current!.passwordHash);

    if (isChange) {
      const currentPassword = secret(body.currentPassword);
      if (!currentPassword) badRequest('Enter your current password.');

      const matches = await verifyPassword(currentPassword, current!.passwordHash);
      if (!matches) {
        await audit(req, {
          action: 'password_changed',
          status: 'failure',
          userId: current!._id,
          provider: 'password',
          reason: 'current password incorrect',
        });
        badRequest('Your current password is not correct.');
      }

      if (currentPassword === newPassword) {
        badRequest('Choose a password you have not used on this account before.');
      }
    }

    await UserModel.updateOne(
      { _id: current!._id },
      { $set: { passwordHash: await hashPassword(newPassword), passwordUpdatedAt: new Date() } },
    );

    await linkIdentity({
      userId: current!._id,
      provider: 'password',
      providerUserId: current!.email ?? current!._id,
      providerEmail: current!.email,
    });

    /*
     * Every *other* device is signed out. Changing a password is what somebody
     * does when they think another person has access, and leaving those
     * sessions alive would make the change cosmetic. This device keeps its
     * session, so the person is not thrown out of the screen they are on.
     */
    const revoked = await revokeOtherSessions(current!._id, req.authUser!.sessionId);

    await audit(req, {
      action: 'password_changed',
      userId: current!._id,
      identifier: current!.email,
      provider: 'password',
      reason: isChange ? undefined : 'password set for the first time',
    });

    res.json({
      ok: true,
      message: 'Password updated successfully.',
      otherDevicesSignedOut: revoked,
      user: await toPublicUserById(current!._id),
    });
  }),
);

/* --------------------------------- mobile ---------------------------------- */

/** §26's "Verify Mobile" — sends a code to a number the account wants to claim. */
accountRoutes.post(
  '/mobile/request',
  requireUser,
  ah(async (req, res) => {
    const user = req.authUser!.user;
    const mobile = normaliseMobile(text((req.body as Record<string, unknown>).mobile, 24));
    if (!mobile) badRequest('Enter a valid mobile number.');

    // The unique index would reject it later anyway; this is the readable version.
    const owner = await findUserByMobile(mobile);
    if (owner && owner._id !== user._id) {
      badRequest('That mobile number is already in use on another account.');
    }

    const result = await requestOtp({
      mobile,
      userId: user._id,
      purpose: 'verify_mobile',
      ip: clientIp(req),
    });

    if (!result.ok) {
      if (result.reason === 'cooldown') {
        badRequest(
          `Please wait ${retryAfterSeconds(result.retryAfterMs)} seconds before requesting another OTP.`,
        );
      }
      badRequest('Your request was temporarily limited. Please try again later.');
    }

    await audit(req, {
      action: 'otp_requested',
      userId: user._id,
      identifier: mobile,
      provider: 'otp',
      reason: 'mobile verification',
    });

    res.json({
      ok: true,
      message: 'OTP sent successfully.',
      mobileMasked: maskMobile(mobile),
      mobileFormatted: formatMobile(mobile),
      resendAfterSeconds: Math.ceil(result.resendAfterMs / 1000),
      expiresInSeconds: Math.ceil(result.expiresInMs / 1000),
      delivered: result.delivered,
    });
  }),
);

accountRoutes.post(
  '/mobile/verify',
  requireUser,
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const user = req.authUser!.user;

    const mobile = normaliseMobile(text(body.mobile, 24));
    const code = text(body.otp ?? body.code, 12).replace(/\D/g, '');
    if (!mobile) badRequest('Enter a valid mobile number.');

    const result = await verifyOtpCode({ mobile, code, purpose: 'verify_mobile' });

    if (!result.ok) {
      await audit(req, {
        action: 'otp_failed',
        status: 'failure',
        userId: user._id,
        identifier: mobile,
        provider: 'otp',
        reason: result.reason,
      });
      if (result.reason === 'expired' || result.reason === 'not_found') {
        badRequest('OTP expired. Please request a new OTP.');
      }
      if (result.reason === 'too_many_attempts') {
        badRequest('Too many attempts. Please try again later.');
      }
      badRequest('Invalid OTP. Please try again.');
    }

    /*
     * The OTP was issued against `user._id`, so a code sent to one account
     * cannot be redeemed by another that happens to be signed in — worth
     * checking explicitly rather than trusting that nobody will try.
     */
    if (result.record.userId && result.record.userId !== user._id) {
      badRequest('That OTP does not belong to this account.');
    }

    try {
      await UserModel.updateOne(
        { _id: user._id },
        {
          // A new number has not been proved over WhatsApp, whatever the old
          // one had. Leaving the flag set would list WhatsApp as connected for
          // a number that has never received a message.
          $set: { mobile, mobileVerifiedAt: new Date() },
          ...(user.mobile && user.mobile !== mobile
            ? { $unset: { whatsappVerifiedAt: '' } }
            : {}),
        },
      );
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        badRequest('That mobile number is already in use on another account.');
      }
      throw error;
    }

    if (user.mobile && user.mobile !== mobile) await unlinkIdentity(user._id, 'whatsapp');

    await linkIdentity({ userId: user._id, provider: 'otp', providerUserId: mobile });
    await syncCommerceProfile({ ...user, mobile });

    await audit(req, {
      action: 'mobile_verified',
      userId: user._id,
      identifier: mobile,
      provider: 'otp',
    });

    res.json({
      ok: true,
      message: 'Mobile number verified successfully.',
      user: await toPublicUserById(user._id),
    });
  }),
);

/**
 * Removing a number, subject to the last-method rule.
 *
 * Both channels go with it. SMS OTP and WhatsApp are two methods but one
 * credential — the number — so removing it must take both, and the
 * last-method check has to count what is left *after* both are gone. Counting
 * the total instead would let an account whose only methods are OTP and
 * WhatsApp delete its way out of existence: two methods, one delete, no way
 * back in.
 */
accountRoutes.delete(
  '/mobile',
  requireUser,
  ah(async (req, res) => {
    const user = await findUserWithSecret({ _id: req.authUser!.user._id });
    if (!user) badRequest('We could not find your account.');

    if (!user!.mobile) badRequest('No mobile number is on this account.');

    /*
     * `countAuthMethods` counts the phone once however many channels reach it,
     * so this reads correctly for an account that has both SMS OTP and
     * WhatsApp: removing the number takes both, and the count already knew
     * that.
     */
    if ((await countAuthMethods(user!)) <= 1) {
      badRequest(
        'Your mobile number is currently your only way to sign in. Set a password or connect Google first.',
      );
    }

    await UserModel.updateOne(
      { _id: user!._id },
      { $unset: { mobile: '', mobileVerifiedAt: '', whatsappVerifiedAt: '' } },
    );
    await Promise.all([
      unlinkIdentity(user!._id, 'otp'),
      unlinkIdentity(user!._id, 'whatsapp'),
    ]);

    res.json({
      ok: true,
      message: 'Mobile number removed.',
      user: await toPublicUserById(user!._id),
    });
  }),
);

/* ------------------------------ login methods ------------------------------ */

/**
 * §26's "Login Methods" panel, as data.
 *
 * `canRemove` is computed here rather than in the browser, because the same
 * rule has to hold on the API: a client that decides for itself which method
 * is removable is a client that can be edited.
 */
accountRoutes.get(
  '/methods',
  requireUser,
  ah(async (req, res) => {
    const user = await findUserWithSecret({ _id: req.authUser!.user._id });
    if (!user) badRequest('We could not find your account.');

    const total = await countAuthMethods(user!);
    const canRemove = total > 1;
    const whatsappReady = (await resolveWhatsAppConfig()).enabled;

    const identities = await listIdentities(user!._id);
    const googleIdentity = identities.find((entry) => entry.provider === 'google');

    res.json({
      total,
      methods: [
        {
          provider: 'password',
          label: 'Email & Password',
          connected: Boolean(user!.passwordHash),
          detail: user!.email ?? null,
          canRemove: false,
          since: user!.passwordUpdatedAt?.toISOString() ?? null,
        },
        {
          provider: 'google',
          label: 'Google',
          connected: Boolean(googleIdentity),
          detail: googleIdentity?.providerEmail ?? null,
          canRemove: Boolean(googleIdentity) && canRemove,
          since: googleIdentity?.createdAt?.toISOString() ?? null,
        },
        {
          provider: 'otp',
          label: 'Mobile OTP',
          connected: Boolean(user!.mobile && user!.mobileVerifiedAt),
          detail: user!.mobile ? maskMobile(user!.mobile) : null,
          canRemove: Boolean(user!.mobile) && canRemove,
          since: user!.mobileVerifiedAt?.toISOString() ?? null,
        },
        {
          provider: 'whatsapp',
          label: 'WhatsApp',
          connected: Boolean(user!.mobile && user!.whatsappVerifiedAt),
          detail: user!.mobile ? maskMobile(user!.mobile) : null,
          canRemove: Boolean(user!.whatsappVerifiedAt) && canRemove,
          since: user!.whatsappVerifiedAt?.toISOString() ?? null,
          /*
           * The store can switch WhatsApp off entirely (§29). A row for a
           * method nobody can currently use would offer a "Connect" button
           * that only ever fails, so the panel is told to render it as
           * unavailable instead.
           */
          available: whatsappReady,
        },
      ],
    });
  }),
);
