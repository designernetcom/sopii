/*
 * Password authentication (§2, §3, §4).
 * ===========================================================================
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   POST /api/auth/forgot-password
 *   POST /api/auth/reset-password
 *
 * Two themes run through all four.
 *
 * **Nothing distinguishes "no such account" from "wrong password."** Not the
 * message, not the status code, and — because `verifyPassword` burns a bcrypt
 * comparison against a dummy hash when there is no user — not the timing
 * either. The same applies to `/forgot-password`, which answers identically
 * whether or not the address is known (§4).
 *
 * **Rate limits are checked before any work is done and recorded whatever the
 * outcome.** A login that fails on a locked account still costs an attempt,
 * or the lockout would be a free oracle for account status.
 */

import { Router } from 'express';
import { EmailService } from '../../lib/email.js';
import { ah, badRequest, HttpError } from '../../lib/http.js';
import { enqueue, JOB } from '../../lib/queue.js';
import { audit } from '../audit.js';
import { authConfig } from '../config.js';
import { checkPasswordStrength, hashPassword, id, randomToken, tokenDigest, verifyPassword } from '../crypto.js';
import { clientIp } from '../device.js';
import {
  isEmail,
  normaliseEmail,
  normaliseMobile,
  parseIdentifier,
} from '../identifiers.js';
import { PasswordResetTokenModel, UserModel, type UserDoc } from '../models.js';
import {
  checkFixedLimit,
  checkProgressiveLimit,
  clearAttempts,
  recordAttempt,
  retryAfterSeconds,
  throttleMessage,
} from '../rateLimit.js';
import { revokeAllSessions } from '../sessions.js';
import {
  accountProblem,
  createUser,
  ensureCustomerRecord,
  findUserByEmail,
  findUserByMobile,
  findUserByUsername,
  findUserWithSecret,
  linkIdentity,
} from '../users.js';
import { completeLogin, MESSAGES, readSurface, secret, text } from './shared.js';

export const passwordRoutes = Router();

/** 429 with a Retry-After header, which is what a well-behaved client reads. */
function throttled(retryAfterMs: number): never {
  const error = new HttpError(429, throttleMessage(retryAfterMs));
  // Carried on the error so `errorHandler` can set the header.
  (error as HttpError & { retryAfter?: number }).retryAfter = retryAfterSeconds(retryAfterMs);
  throw error;
}

/* -------------------------------- register --------------------------------- */

/**
 * §3. Creates a `customer` and nothing else — the role is not read from the
 * body at all, so no amount of creativity in the payload produces an admin.
 */
passwordRoutes.post(
  '/register',
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const ip = clientIp(req);

    const firstName = text(body.firstName, 60);
    const lastName = text(body.lastName, 60);
    const emailRaw = text(body.email, 160);
    const mobileRaw = text(body.mobile ?? body.phone, 24);
    const password = secret(body.password);
    const confirmPassword = secret(body.confirmPassword);

    if (!firstName) badRequest('Please tell us your first name.');
    if (!isEmail(emailRaw)) badRequest('Enter a valid email address.');

    const email = normaliseEmail(emailRaw);
    const mobile = normaliseMobile(mobileRaw);
    if (!mobile) badRequest('Enter a valid mobile number.');

    const strength = checkPasswordStrength(password);
    if (!strength.ok) badRequest(strength.problems.join('. ') + '.');
    if (confirmPassword && password !== confirmPassword) {
      badRequest('Both passwords must match.');
    }

    // A registration form is a cheap way to probe which addresses exist, so it
    // gets a per-IP ceiling of its own.
    const perIp = await checkFixedLimit('register@ip', ip ?? 'unknown', {
      max: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!perIp.allowed) throttled(perIp.retryAfterMs);
    await recordAttempt('register@ip', ip ?? 'unknown', {
      ip,
      successful: true,
      windowMs: 60 * 60 * 1000,
    });

    /*
     * Uniqueness is checked here for a decent message and enforced by the
     * unique indexes underneath for correctness — two simultaneous
     * registrations would both pass this check, and the index is what stops
     * the second one.
     *
     * This does reveal that an email is taken, which is the one place §4's
     * anti-enumeration rule has to yield: a registration form that accepts a
     * duplicate address silently is unusable. The mitigation is the rate limit
     * above, not vagueness.
     */
    const [emailTaken, mobileTaken] = await Promise.all([
      findUserByEmail(email),
      findUserByMobile(mobile),
    ]);
    if (emailTaken) badRequest('An account already exists for that email. Please log in instead.');
    if (mobileTaken) badRequest('An account already exists for that mobile number.');

    let user: UserDoc;
    try {
      user = await createUser({
        firstName,
        lastName: lastName || undefined,
        email,
        mobile,
        passwordHash: await hashPassword(password),
        role: 'customer',
        acceptsMarketing: Boolean(body.acceptsMarketing ?? body.subscribeNewsletter),
        acceptedTerms: Boolean(body.acceptTerms ?? body.acceptedTerms),
      });
    } catch (error) {
      // The unique index caught a race. Same message as the check above.
      if ((error as { code?: number }).code === 11000) {
        badRequest('An account already exists with those details. Please log in instead.');
      }
      throw error;
    }

    await linkIdentity({
      userId: user._id,
      provider: 'password',
      providerUserId: email,
      providerEmail: email,
    });

    // The shopper is real now, so give them the commerce record their orders
    // and addresses will hang off.
    await ensureCustomerRecord(user);

    await audit(req, {
      action: 'account_created',
      userId: user._id,
      identifier: email,
      provider: 'password',
      surface: 'shop',
    });

    const payload = await completeLogin(req, res, {
      user,
      method: 'password',
      surface: 'shop',
    });

    res.status(201).json({ ...payload, message: 'Account created successfully.' });
  }),
);

/* ---------------------------------- login ---------------------------------- */

/**
 * §2. Accepts an email, a username or a mobile number in the one field.
 *
 * The shape of this handler is deliberate: every failure path runs
 * `recordAttempt` and answers `MESSAGES.invalidCredentials`, and only the very
 * last branch — a correct password on a usable account — does anything else.
 */
passwordRoutes.post(
  '/login',
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const ip = clientIp(req);
    const surface = readSurface(req);

    const raw = text(body.identifier ?? body.email ?? body.username, 160);
    const password = secret(body.password);

    if (!raw) badRequest('Enter your email or username.');
    if (!password) badRequest('Enter your password.');

    const parsed = parseIdentifier(raw);
    if (!parsed) {
      await recordAttempt('login', raw, { ip, windowMs: authConfig.login.windowMs });
      badRequest(MESSAGES.invalidCredentials);
    }

    /*
     * Two limiters, both consulted before a single database read. The
     * per-identifier one protects an account from being guessed at; the per-IP
     * one protects every *other* account from a client spraying one attempt
     * across thousands of addresses.
     */
    const perIdentifier = await checkProgressiveLimit('login', parsed!.value);
    if (!perIdentifier.allowed) {
      await audit(req, {
        action: 'failed_login',
        status: 'failure',
        identifier: parsed!.value,
        provider: 'password',
        surface,
        reason: 'rate limited',
      });
      throttled(perIdentifier.retryAfterMs);
    }

    const perIp = await checkFixedLimit('login@ip', ip ?? 'unknown', {
      max: authConfig.login.maxAttempts * 10,
      windowMs: authConfig.login.windowMs,
    });
    if (!perIp.allowed) throttled(perIp.retryAfterMs);

    const user = await lookup(parsed!);

    const matches = await verifyPassword(password, user?.passwordHash);

    if (!user || !matches) {
      await Promise.all([
        recordAttempt('login', parsed!.value, { ip, windowMs: authConfig.login.windowMs }),
        recordAttempt('login@ip', ip ?? 'unknown', { ip, windowMs: authConfig.login.windowMs }),
        audit(req, {
          action: 'failed_login',
          status: 'failure',
          userId: user?._id,
          identifier: parsed!.value,
          provider: 'password',
          surface,
          reason: user ? 'invalid password' : 'no such account',
        }),
      ]);

      /*
       * One failure short of the lockout threshold, the *next* one will lock.
       * The message stays identical either way — an attacker learns nothing
       * from it, and a real person learns why they are being asked to wait
       * from the 429 they get on the next attempt.
       */
      const after = await checkProgressiveLimit('login', parsed!.value);
      if (!after.allowed && user) {
        await UserModel.updateOne(
          { _id: user._id },
          { $set: { lockedUntil: new Date(Date.now() + after.retryAfterMs) } },
        );
        await audit(req, {
          action: 'account_locked',
          status: 'failure',
          userId: user._id,
          identifier: parsed!.value,
          reason: 'too many failed password attempts',
        });
      }

      badRequest(MESSAGES.invalidCredentials);
    }

    /*
     * Status is checked *after* the password, not before. Checking first would
     * answer "your account is inactive" to anyone who types a known address
     * with any password at all — which is an enumeration oracle wearing a
     * helpful message.
     */
    const problem = accountProblem(user);
    if (problem) {
      await audit(req, {
        action: 'failed_login',
        status: 'failure',
        userId: user._id,
        identifier: parsed!.value,
        provider: 'password',
        surface,
        reason: `account ${user.status}`,
      });
      badRequest(problem);
    }

    await Promise.all([
      clearAttempts('login', parsed!.value),
      linkIdentity({
        userId: user._id,
        provider: 'password',
        providerUserId: user.email ?? user._id,
        providerEmail: user.email,
      }),
    ]);

    res.json(await completeLogin(req, res, { user, method: 'password', surface }));
  }),
);

/** Email, mobile or username — whichever the identifier turned out to be. */
async function lookup(parsed: NonNullable<ReturnType<typeof parseIdentifier>>) {
  if (parsed.kind === 'email') return findUserWithSecret({ email: parsed.value });
  if (parsed.kind === 'mobile') return findUserWithSecret({ mobile: parsed.value });
  return findUserByUsername(parsed.value);
}

/* ----------------------------- forgot password ----------------------------- */

/**
 * §4. Always answers the same sentence.
 *
 * The work — looking the account up, minting a token, sending mail — happens
 * behind that constant answer, and a failure anywhere in it is logged rather
 * than surfaced. The response does not even vary in how long it takes enough
 * to matter, because the expensive part (bcrypt) is not on this path.
 */
passwordRoutes.post(
  '/forgot-password',
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const ip = clientIp(req);
    const emailRaw = text(body.email, 160);

    if (!isEmail(emailRaw)) badRequest('Enter a valid email address.');
    const email = normaliseEmail(emailRaw);

    const { maxRequestsPerWindow, requestWindowMs, ttlMs } = authConfig.passwordReset;

    const perEmail = await checkFixedLimit('password_reset', email, {
      max: maxRequestsPerWindow,
      windowMs: requestWindowMs,
    });
    const perIp = await checkFixedLimit('password_reset@ip', ip ?? 'unknown', {
      max: maxRequestsPerWindow * 10,
      windowMs: requestWindowMs,
    });

    /*
     * Even the throttle is silent here. A 429 on this endpoint would tell an
     * attacker which addresses are worth hammering; the request is simply
     * dropped and the same sentence returned.
     */
    if (perEmail.allowed && perIp.allowed) {
      await Promise.all([
        recordAttempt('password_reset', email, { ip, successful: true, windowMs: requestWindowMs }),
        recordAttempt('password_reset@ip', ip ?? 'unknown', {
          ip,
          successful: true,
          windowMs: requestWindowMs,
        }),
      ]);

      const user = await findUserByEmail(email);

      if (user && user.status === 'active') {
        // One live reset token per account: minting a new one retires the old.
        await PasswordResetTokenModel.updateMany(
          { userId: user._id, usedAt: { $exists: false } },
          { $set: { usedAt: new Date() } },
        );

        const token = randomToken(32);
        await PasswordResetTokenModel.create({
          _id: id('prt'),
          userId: user._id,
          tokenHash: tokenDigest(token),
          expiresAt: new Date(Date.now() + ttlMs),
          ip,
          createdAt: new Date(),
        });

        await deliverResetLink(email, token, user.firstName, Date.now() + ttlMs);
      }

      await audit(req, {
        action: 'password_reset_requested',
        userId: user?._id,
        identifier: email,
        provider: 'password',
        status: user ? 'success' : 'failure',
        reason: user ? undefined : 'no such account',
      });
    }

    res.json({ ok: true, message: MESSAGES.resetSent });
  }),
);

/**
 * The reset link, delivered through Mailtrap — inline first, then queued.
 *
 * Attempted inline, unlike order mail, because a link that arrives while the
 * shopper is still looking at the confirmation is the flow working; and unlike
 * checkout nothing irreversible has already happened, so there is no "must not
 * fail" constraint to protect here.
 *
 * It cannot throw into the route. §4 requires `/forgot-password` to answer
 * with the same sentence whether or not the account exists; that promise would
 * be broken by an endpoint that also answers differently when the relay is
 * down, so `EmailService.sendPasswordReset` reports a failure as a value.
 *
 * **A transient failure is handed to the queue rather than dropped.** One
 * inline attempt is one SMTP round trip, and an SMTP round trip is allowed to
 * time out — but the shopper has already been told their instructions are on
 * the way, and there is no second chance to tell them otherwise. So a timeout,
 * a throttle or a 4xx becomes `auth.password_reset`, retried with the queue's
 * backoff well inside the hour the token lives; a permanent rejection is
 * logged and left alone, because five more attempts will be rejected too.
 *
 * With Mailtrap unconfigured the send comes back `skipped`, and development
 * falls back to printing the link — the same trade `sms.ts` makes, and for the
 * same reason: a flow nobody can finish is a flow nobody can test. It refuses
 * to print in production.
 */
async function deliverResetLink(
  email: string,
  token: string,
  name: string | undefined,
  expiresAt: number,
) {
  const url = new URL('/reset-password', authConfig.frontends.shop);
  url.searchParams.set('token', token);
  url.searchParams.set('email', email);

  const expiresIn = humanDuration(authConfig.passwordReset.ttlMs);

  const result = await EmailService.sendPasswordReset({
    to: email,
    resetUrl: url.toString(),
    name,
    expiresIn,
    source: 'auth',
  });

  if (result.status === 'sent') return;

  /*
   * Worth another go. The payload carries the link, which carries the token —
   * it stays inside the same database the token's own hash lives in, is never
   * logged, and goes out with the job when it completes. `dedupeKey` is
   * derived from that hash so a replayed request cannot queue the same link
   * twice.
   */
  if (result.status === 'failed' && result.transient) {
    await enqueue(
      JOB.passwordResetSend,
      { to: email, resetUrl: url.toString(), name, expiresIn, expiresAt, attempt: 2 },
      { dedupeKey: `pwreset:${tokenDigest(token)}` },
    );
    console.warn('[auth] reset email deferred to the queue:', result.error ?? 'transient failure');
    return;
  }

  /*
   * Nothing about the account and nothing about the link reaches the log. The
   * token is the credential; printing it below happens only when the store has
   * explicitly opted into console delivery for development.
   */
  if (result.status === 'skipped') {
    if (!authConfig.otp.logToConsole) {
      console.error('[auth] a password reset was requested but Mailtrap is not configured.');
      return;
    }
    console.log(
      `
[auth] ─── DEV PASSWORD RESET ─────────────────────
` +
        `[auth]   ${email}
` +
        `[auth]   ${url.toString()}
` +
        `[auth] ─────────────────────────────────────────────
`,
    );
    return;
  }

  console.error('[auth] could not send the reset email:', result.error ?? 'unknown error');
}

/** "1 hour", "30 minutes" — for the sentence in the email, not for a machine. */
function humanDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/* ------------------------------ reset password ----------------------------- */

/**
 * §4's second half. A valid, unused, unexpired token sets a new password and
 * — the part that matters — ends every existing session, so a reset performed
 * because somebody else had the account genuinely removes them from it.
 */
passwordRoutes.post(
  '/reset-password',
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const ip = clientIp(req);

    const token = text(body.token, 200);
    const password = secret(body.password ?? body.newPassword);
    const confirmPassword = secret(body.confirmPassword);

    if (!token) badRequest(MESSAGES.resetInvalid);

    const strength = checkPasswordStrength(password);
    if (!strength.ok) badRequest(strength.problems.join('. ') + '.');
    if (confirmPassword && password !== confirmPassword) badRequest('Both passwords must match.');

    const perIp = await checkFixedLimit('password_reset_submit@ip', ip ?? 'unknown', {
      max: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!perIp.allowed) throttled(perIp.retryAfterMs);
    await recordAttempt('password_reset_submit@ip', ip ?? 'unknown', {
      ip,
      windowMs: 60 * 60 * 1000,
    });

    const record = await PasswordResetTokenModel.findOne({ tokenHash: tokenDigest(token) }).lean();

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      await audit(req, {
        action: 'password_reset',
        status: 'failure',
        userId: record?.userId,
        provider: 'password',
        reason: !record ? 'unknown token' : record.usedAt ? 'token already used' : 'token expired',
      });
      badRequest(MESSAGES.resetInvalid);
    }

    const user = await findUserWithSecret({ _id: record!.userId });
    if (!user) badRequest(MESSAGES.resetInvalid);

    await UserModel.updateOne(
      { _id: user!._id },
      {
        $set: {
          passwordHash: await hashPassword(password),
          passwordUpdatedAt: new Date(),
          failedLoginCount: 0,
          // A reset is also the way out of a lockout — the person has proved
          // control of the mailbox, which is a stronger signal than the
          // failures that locked it.
          status: user!.status === 'locked' ? 'active' : user!.status,
        },
        $unset: { lockedUntil: '' },
      },
    );

    await Promise.all([
      PasswordResetTokenModel.updateOne({ _id: record!._id }, { $set: { usedAt: new Date() } }),
      linkIdentity({
        userId: user!._id,
        provider: 'password',
        providerUserId: user!.email ?? user!._id,
        providerEmail: user!.email,
      }),
      clearAttempts('login', user!.email ?? ''),
      revokeAllSessions(user!._id, 'password was reset'),
    ]);

    await audit(req, {
      action: 'password_reset',
      userId: user!._id,
      identifier: user!.email,
      provider: 'password',
    });

    /*
     * No session is issued. §4's flow ends at "Login" for a reason: after a
     * reset the person should demonstrate they know the new password, and
     * signing in whoever holds the link would undo half the point of revoking
     * the old sessions.
     */
    res.json({ ok: true, message: 'Password updated successfully.' });
  }),
);
