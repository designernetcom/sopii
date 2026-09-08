/*
 * One-time codes, over SMS or WhatsApp (§5, §6).
 * ===========================================================================
 * The rules this file exists to keep, all in one place:
 *
 *   - the code is never stored, logged or returned in the clear;
 *   - requesting a new code invalidates the outstanding one, so two live codes
 *     never coexist for a number — *across channels*, so asking for a WhatsApp
 *     code kills the SMS one rather than running both;
 *   - a code dies on success, on expiry, or after the configured number of
 *     wrong guesses — whichever comes first;
 *   - one verification attempt may be re-sent only so many times before the
 *     person has to start again;
 *   - requests per number are capped inside a rolling window, and per IP too.
 *
 * The last point is the one that is easy to get wrong: without a per-IP cap,
 * one client can walk the whole 10-digit range one message at a time and never
 * trip a per-number limit, which is somebody else's phone bill and the store's
 * messaging credit.
 *
 * The channel changes *how* a code travels and which limits apply, and nothing
 * else. Keeping one implementation for both is what stops WhatsApp login from
 * quietly acquiring weaker throttling than SMS login.
 */

import { authConfig } from './config.js';
import { generateOtp, hashOtp, id, verifyOtp } from './crypto.js';
import { OtpVerificationModel, type OtpChannel, type OtpVerificationDoc } from './models.js';
import { checkFixedLimit, recordAttempt, type LimitVerdict } from './rateLimit.js';
import { sendOtpSms } from './sms.js';
import { sendWhatsAppOtp } from './whatsapp.js';
import { resolveWhatsAppConfig } from './whatsappConfig.js';

export type OtpPurpose = 'login' | 'verify_mobile';

/* --------------------------------- limits ---------------------------------- */

export interface OtpLimits {
  ttlMs: number;
  maxAttempts: number;
  maxResends: number;
}

/**
 * The limits in force for a channel.
 *
 * SMS reads them from the environment; WhatsApp reads them from whatever the
 * admin panel has stored, falling back to the same environment values. That is
 * §29's "OTP Expiry / Maximum Attempts / Resend Limit" being configuration
 * rather than three more constants.
 */
export async function limitsFor(channel: OtpChannel): Promise<OtpLimits> {
  if (channel === 'whatsapp') {
    const config = await resolveWhatsAppConfig();
    return {
      ttlMs: config.otpTtlMs,
      maxAttempts: config.maxAttempts,
      maxResends: config.resendLimit,
    };
  }

  return {
    ttlMs: authConfig.otp.ttlMs,
    maxAttempts: authConfig.otp.maxAttempts,
    maxResends: authConfig.otp.maxResends,
  };
}

/* -------------------------------- requesting ------------------------------- */

export type OtpRequestResult =
  | {
      ok: true;
      /** For the resend countdown. The code itself is never in a response. */
      resendAfterMs: number;
      expiresInMs: number;
      /** True when a provider accepted the message. */
      delivered: boolean;
      /** Which transport carried it — `console` when none is configured. */
      transport: string;
      channel: OtpChannel;
      maxAttempts: number;
      /** Resends still available on this verification attempt. */
      resendsLeft: number;
    }
  | {
      ok: false;
      reason: 'rate_limited' | 'cooldown' | 'resend_limit';
      retryAfterMs: number;
    };

/**
 * Issues an OTP for a number, over the requested channel.
 *
 * The three refusals are ordered by what a person is most likely to have done:
 * hammering "Resend" deserves "wait 30 seconds", exhausting the resends on one
 * code deserves "start again", and only then does the hourly ceiling apply.
 * An error that answers the hourly ceiling to somebody who double-clicked is
 * technically true and practically useless.
 */
export async function requestOtp({
  mobile,
  userId,
  purpose = 'login',
  ip,
  channel = 'sms',
}: {
  mobile: string;
  userId?: string;
  purpose?: OtpPurpose;
  ip?: string;
  channel?: OtpChannel;
}): Promise<OtpRequestResult> {
  const { otp } = authConfig;
  const limits = await limitsFor(channel);

  /*
   * The outstanding record is looked up by number and purpose only — never by
   * channel. That is what makes "one live code per number" true rather than
   * "one live code per number per channel", which would let a client hold two
   * valid codes and double their guesses.
   */
  const latest = await OtpVerificationModel.findOne({ mobileNumber: mobile, purpose })
    .sort({ createdAt: -1 })
    .lean<OtpVerificationDoc>();

  if (latest) {
    const since = Date.now() - latest.createdAt.getTime();
    if (since < otp.resendCooldownMs) {
      return { ok: false, reason: 'cooldown', retryAfterMs: otp.resendCooldownMs - since };
    }
  }

  /*
   * A still-live code means this is a resend of the same verification attempt,
   * whichever endpoint asked for it. Counting the chain rather than trusting
   * the caller to say "this is a resend" is what stops the resend ceiling
   * being bypassed by calling `request-otp` in a loop.
   */
  const active = Boolean(
    latest && !latest.consumedAt && !latest.verifiedAt && latest.expiresAt.getTime() > Date.now(),
  );
  const resendCount = active ? (latest!.resendCount ?? 0) + 1 : 0;

  if (resendCount > limits.maxResends) {
    return {
      ok: false,
      reason: 'resend_limit',
      retryAfterMs: Math.max(1000, latest!.expiresAt.getTime() - Date.now()),
    };
  }

  const perNumber = await checkFixedLimit('otp_request', mobile, {
    max: otp.maxRequestsPerWindow,
    windowMs: otp.requestWindowMs,
  });
  if (!perNumber.allowed) {
    return { ok: false, reason: 'rate_limited', retryAfterMs: perNumber.retryAfterMs };
  }

  const perIp = await ipLimit(ip);
  if (!perIp.allowed) {
    return { ok: false, reason: 'rate_limited', retryAfterMs: perIp.retryAfterMs };
  }

  /*
   * Every outstanding code for this number is consumed before a new one is
   * written. Without this, the previous code stays valid until its own expiry
   * and "request a new OTP" would widen the window rather than resetting it.
   */
  await OtpVerificationModel.updateMany(
    { mobileNumber: mobile, purpose, consumedAt: { $exists: false } },
    { $set: { consumedAt: new Date() } },
  );

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + limits.ttlMs);

  await OtpVerificationModel.create({
    _id: id('otp'),
    userId,
    mobileNumber: mobile,
    otpHash: await hashOtp(code),
    purpose,
    channel,
    expiresAt,
    attemptCount: 0,
    resendCount,
    ip,
    createdAt: new Date(),
  });

  await Promise.all([
    recordAttempt('otp_request', mobile, { ip, successful: true, windowMs: otp.requestWindowMs }),
    ip
      ? recordAttempt('otp_request@ip', ip, { ip, successful: true, windowMs: otp.requestWindowMs })
      : Promise.resolve(),
  ]);

  /*
   * Delivery happens last, and its outcome does not gate the record. A code
   * that was written but not delivered is a code the person can ask to have
   * re-sent; a delivery that succeeded against a record that failed to write
   * would be a code nothing can verify.
   */
  const sent =
    channel === 'whatsapp'
      ? await sendWhatsAppOtp(mobile, code, limits.ttlMs)
      : { delivered: await sendOtpSms(mobile, code, limits.ttlMs), transport: 'sms' };

  return {
    ok: true,
    resendAfterMs: otp.resendCooldownMs,
    expiresInMs: limits.ttlMs,
    delivered: sent.delivered,
    transport: sent.transport,
    channel,
    maxAttempts: limits.maxAttempts,
    resendsLeft: Math.max(0, limits.maxResends - resendCount),
  };
}

/** Ten times the per-number allowance: generous for a shared office, useless for a sprayer. */
function ipLimit(ip: string | undefined): Promise<LimitVerdict> {
  if (!ip) return Promise.resolve({ allowed: true, remaining: 0, retryAfterMs: 0 });
  return checkFixedLimit('otp_request@ip', ip, {
    max: authConfig.otp.maxRequestsPerWindow * 10,
    windowMs: authConfig.otp.requestWindowMs,
  });
}

/* -------------------------------- verifying -------------------------------- */

export type OtpVerifyResult =
  | { ok: true; record: OtpVerificationDoc }
  | {
      ok: false;
      reason: 'not_found' | 'expired' | 'too_many_attempts' | 'invalid';
      attemptsLeft?: number;
    };

/**
 * Checks a code against the outstanding record for a number.
 *
 * The attempt counter is incremented *before* the comparison, not after: a
 * client that disconnects mid-request must still have spent its guess, or the
 * limit is bypassable by aborting every failed attempt.
 *
 * `maxAttempts` is passed in rather than read from config, because the WhatsApp
 * ceiling is whatever the admin panel says and the SMS one is whatever the
 * environment says. The record that comes back names the channel the code was
 * actually sent over, which is what the caller audits.
 */
export async function verifyOtpCode({
  mobile,
  code,
  purpose = 'login',
  maxAttempts = authConfig.otp.maxAttempts,
}: {
  mobile: string;
  code: string;
  purpose?: OtpPurpose;
  maxAttempts?: number;
}): Promise<OtpVerifyResult> {
  const record = await OtpVerificationModel.findOne({
    mobileNumber: mobile,
    purpose,
    consumedAt: { $exists: false },
  })
    .sort({ createdAt: -1 })
    .select('+otpHash')
    .lean<OtpVerificationDoc>();

  if (!record) return { ok: false, reason: 'not_found' };

  if (record.expiresAt.getTime() <= Date.now()) {
    await OtpVerificationModel.updateOne({ _id: record._id }, { $set: { consumedAt: new Date() } });
    return { ok: false, reason: 'expired' };
  }

  if (record.attemptCount >= maxAttempts) {
    await OtpVerificationModel.updateOne({ _id: record._id }, { $set: { consumedAt: new Date() } });
    return { ok: false, reason: 'too_many_attempts' };
  }

  const attempted = await OtpVerificationModel.findOneAndUpdate(
    { _id: record._id, attemptCount: { $lt: maxAttempts } },
    { $inc: { attemptCount: 1 } },
    { new: true },
  ).lean<OtpVerificationDoc>();

  // Lost a race with a concurrent attempt that used the last allowance.
  if (!attempted) return { ok: false, reason: 'too_many_attempts' };

  const matches = await verifyOtp(code, record.otpHash);

  if (!matches) {
    const attemptsLeft = Math.max(0, maxAttempts - attempted.attemptCount);
    if (attemptsLeft === 0) {
      await OtpVerificationModel.updateOne(
        { _id: record._id },
        { $set: { consumedAt: new Date() } },
      );
      return { ok: false, reason: 'too_many_attempts' };
    }
    return { ok: false, reason: 'invalid', attemptsLeft };
  }

  // §6: invalid after a successful verification, immediately and permanently.
  const now = new Date();
  await OtpVerificationModel.updateOne(
    { _id: record._id },
    { $set: { verifiedAt: now, consumedAt: now } },
  );

  return { ok: true, record: { ...attempted, verifiedAt: now, consumedAt: now } };
}

/* --------------------------------- countdown ------------------------------- */

/**
 * How long before "Resend OTP" should become clickable, given what has already
 * been sent to this number. Lets the OTP screen restore its countdown after a
 * reload instead of starting a fresh 30 seconds.
 */
export async function resendCooldownFor(mobile: string, purpose: OtpPurpose = 'login') {
  const latest = await OtpVerificationModel.findOne({ mobileNumber: mobile, purpose })
    .sort({ createdAt: -1 })
    .lean<OtpVerificationDoc>();

  if (!latest) return 0;
  const remaining = authConfig.otp.resendCooldownMs - (Date.now() - latest.createdAt.getTime());
  return Math.max(0, remaining);
}

/**
 * The state of the live verification attempt for a number, if there is one.
 *
 * Everything the OTP screen needs to rebuild itself after a reload, and
 * nothing that identifies the account: how long the code has left, how many
 * guesses remain, how many resends remain. `null` when nothing is outstanding.
 */
export async function otpSessionFor(mobile: string, purpose: OtpPurpose = 'login') {
  const latest = await OtpVerificationModel.findOne({ mobileNumber: mobile, purpose })
    .sort({ createdAt: -1 })
    .lean<OtpVerificationDoc>();

  if (!latest || latest.consumedAt || latest.expiresAt.getTime() <= Date.now()) return null;

  const limits = await limitsFor(latest.channel ?? 'sms');

  return {
    channel: latest.channel ?? ('sms' as OtpChannel),
    expiresInMs: Math.max(0, latest.expiresAt.getTime() - Date.now()),
    attemptsLeft: Math.max(0, limits.maxAttempts - latest.attemptCount),
    resendsLeft: Math.max(0, limits.maxResends - (latest.resendCount ?? 0)),
  };
}
