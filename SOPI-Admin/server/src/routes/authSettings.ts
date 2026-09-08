/*
 * Admin → Settings → Authentication → WhatsApp (§29, §31).
 * ===========================================================================
 *   GET  /api/settings/authentication/whatsapp        the configuration, redacted
 *   PUT  /api/settings/authentication/whatsapp        save it
 *   POST /api/settings/authentication/whatsapp/test   send a test message
 *
 * Deliberately *not* part of the generic `PUT /api/settings/:section` handler.
 * That one writes `req.body` straight onto the settings document, which is
 * exactly right for shipping zones and quite wrong for a credential: the access
 * token has to be encrypted on the way in, preserved when the form submits a
 * mask instead of a new value, and stripped on the way back out. Three rules
 * that a generic passthrough cannot keep, so this router keeps them instead.
 *
 * §31, restated: the access token never leaves the server. What the panel
 * receives is `accessTokenMasked` — four characters either side of some dots —
 * which is enough for an admin to confirm *which* token is installed and
 * useless to anyone who intercepts it.
 */

import { Router } from 'express';
import { ah, badRequest } from '../lib/http.js';
import { requirePermission } from '../lib/auth.js';
import { audit } from '../auth/audit.js';
import { normaliseMobile, formatMobile } from '../auth/identifiers.js';
import { UserModel } from '../auth/models.js';
import { checkFixedLimit, recordAttempt, retryAfterSeconds } from '../auth/rateLimit.js';
import { redactWhatsApp, saveWhatsAppSettings } from '../auth/whatsappConfig.js';
import { sendWhatsAppTest } from '../auth/whatsapp.js';

export const authSettingsRoutes = Router();

/**
 * The identity behind the signed-in admin, for the audit trail.
 *
 * `req.auth.user` is the panel's `admin_users` record; the audit log is keyed
 * on the unified identity, so the two are joined here rather than writing an
 * id into that column that means something different from every other row.
 */
async function identityOf(adminUserId: string): Promise<string | undefined> {
  const identity = await UserModel.findOne({ adminUserId }).select('_id').lean<{ _id: string }>();
  return identity?._id;
}

/* ---------------------------------- read ----------------------------------- */

authSettingsRoutes.get(
  '/whatsapp',
  requirePermission('settings'),
  ah(async (_req, res) => {
    res.json(await redactWhatsApp());
  }),
);

/* ---------------------------------- write ---------------------------------- */

authSettingsRoutes.put(
  '/whatsapp',
  requirePermission('settings', 'edit'),
  ah(async (req, res) => {
    const admin = req.auth!.user;

    await saveWhatsAppSettings(req.body as Record<string, unknown>, {
      updatedBy: admin.email ?? admin.name,
    });

    /*
     * Audited because turning WhatsApp login on, off, or pointing it at a
     * different WhatsApp Business account changes who can sign in to the
     * store. The entry records that it happened and by whom — never the token,
     * not even masked.
     */
    await audit(req, {
      action: 'whatsapp_settings_updated',
      userId: await identityOf(admin._id),
      identifier: admin.email,
      provider: 'whatsapp',
      surface: 'admin',
    });

    res.json(await redactWhatsApp());
  }),
);

/* ---------------------------------- test ----------------------------------- */

/**
 * §29's "Send Test WhatsApp Message".
 *
 * Sends through the same path a real OTP takes — a test that exercises a
 * different code path proves nothing about the one that matters — with a
 * throwaway code that is never returned, stored or logged.
 *
 * Rate limited despite requiring an admin session: the endpoint takes an
 * arbitrary destination number, and an endpoint that sends WhatsApp messages
 * to arbitrary numbers is one compromised admin account away from being a
 * spam relay. Five an hour is plenty for configuring a provider.
 */
authSettingsRoutes.post(
  '/whatsapp/test',
  requirePermission('settings', 'edit'),
  ah(async (req, res) => {
    const admin = req.auth!.user;
    const body = req.body as Record<string, unknown>;

    const mobile = normaliseMobile(typeof body.mobile === 'string' ? body.mobile : '');
    if (!mobile) badRequest('Enter a valid mobile number to send the test message to.');

    const limit = await checkFixedLimit('whatsapp_test', admin._id, {
      max: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      badRequest(
        `Too many test messages. Please try again in ${retryAfterSeconds(limit.retryAfterMs)} seconds.`,
      );
    }

    await recordAttempt('whatsapp_test', admin._id, {
      successful: true,
      windowMs: 60 * 60 * 1000,
    });

    const result = await sendWhatsAppTest(mobile!);

    await audit(req, {
      action: 'whatsapp_test_message',
      status: result.ok ? 'success' : 'failure',
      userId: await identityOf(admin._id),
      identifier: mobile!,
      provider: 'whatsapp',
      surface: 'admin',
      reason: result.ok ? undefined : result.detail,
    });

    /*
     * The provider's failure detail *is* shown here — a status code and an
     * error code, never a response body. This is the one audience entitled to
     * it: a signed-in admin with `settings` edit permission, trying to work out
     * why their template was rejected.
     */
    res.json({
      ok: result.ok,
      transport: result.transport,
      to: formatMobile(mobile!),
      message: result.ok
        ? `A test message was sent to ${formatMobile(mobile!)}. It carries a throwaway code that will not sign anyone in.`
        : `The message could not be sent: ${result.detail ?? 'the provider rejected it.'}`,
      detail: result.detail ?? null,
    });
  }),
);
