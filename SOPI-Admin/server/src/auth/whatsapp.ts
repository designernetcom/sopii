/*
 * The WhatsApp seam.
 * ===========================================================================
 * The counterpart to `sms.ts`, and deliberately the same shape: the code is
 * passed *in* and never comes back out, the return value is a delivery report,
 * and swapping providers is a change to this file alone.
 *
 * Only official WhatsApp Business API transports are implemented:
 *
 *   meta     Meta WhatsApp Business Platform (Cloud API). A template message
 *            against an approved AUTHENTICATION template — Meta will not carry
 *            business-initiated free text, and an OTP is always
 *            business-initiated.
 *   twilio   Twilio's WhatsApp channel. A Content template when the configured
 *            template name is a Content SID (`HX…`), otherwise a body message
 *            for senders operating inside an open session window.
 *   webhook  Any other approved Business Solution Provider that accepts a JSON
 *            POST. The payload names the template and the code separately, so
 *            a BSP that renders its own template has what it needs.
 *   console  No provider configured. Development only, refuses to run in
 *            production, and prints to the server log so a developer can
 *            finish the flow.
 *
 * What is deliberately absent: anything that drives WhatsApp Web, a personal
 * account, or an unofficial library. Those breach WhatsApp's terms, get the
 * number banned, and would require handling a customer's own WhatsApp session
 * — which this system must never ask for.
 *
 * Nothing here logs the code outside the development transport, and no error
 * path echoes a provider response body: providers routinely reflect the
 * message back in their errors, and that message contains the OTP.
 */

import { isProd } from './config.js';
import { isConfigured, resolveWhatsAppConfig, type WhatsAppConfig } from './whatsappConfig.js';

/* --------------------------------- message --------------------------------- */

const BRAND = process.env.WHATSAPP_SENDER_NAME?.trim() || 'SOPII';

/**
 * §3's message, for the transports that carry text.
 *
 * Meta renders its own copy from the approved template and takes only the code
 * as a variable, so this is used by the Twilio body transport, by a webhook
 * BSP that wants ready-made text, and by the development log.
 */
export function otpMessage(code: string, ttlMs: number): string {
  const minutes = Math.max(1, Math.round(ttlMs / 60_000));
  return [
    `*${BRAND} Verification Code*`,
    '',
    `Your ${BRAND} login verification code is: ${code}`,
    '',
    `This code is valid for ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    '',
    'Please do not share this code with anyone.',
  ].join('\n');
}

/* --------------------------------- results --------------------------------- */

export interface WhatsAppResult {
  /** Whether the provider accepted the message. */
  delivered: boolean;
  /** `meta`, `twilio`, `webhook` or `console`. */
  transport: string;
  /**
   * Safe to show an admin on the settings screen, never to a shopper: a status
   * code and the provider's error *code*, never its body and never the message.
   */
  detail?: string;
}

/** E.164 without the `+`, which is what both Meta and a BSP webhook expect. */
const digits = (mobile: string) => mobile.replace(/\D/g, '');

/* --------------------------------- sending --------------------------------- */

/**
 * Sends one OTP over WhatsApp.
 *
 * A false answer is not an error the caller should surface per number: telling
 * a browser "we could not send to that number" is a working test for whether a
 * number is on WhatsApp, which is exactly the enumeration oracle §27 is about.
 * The route answers the same way either way; only the audit log and the admin
 * settings screen see the detail.
 */
export async function sendWhatsAppOtp(
  mobile: string,
  code: string,
  ttlMs: number,
  override?: WhatsAppConfig,
): Promise<WhatsAppResult> {
  const config = override ?? (await resolveWhatsAppConfig());

  if (!isConfigured(config)) return logToConsole(mobile, code, ttlMs);

  switch (config.provider) {
    case 'meta':
      return sendViaMeta(config, mobile, code);
    case 'twilio':
      return sendViaTwilio(config, mobile, code, ttlMs);
    case 'webhook':
      return sendViaWebhook(config, mobile, code, ttlMs);
    default:
      return logToConsole(mobile, code, ttlMs);
  }
}

/* ---------------------------------- meta ----------------------------------- */

/**
 * Meta WhatsApp Business Platform, Cloud API.
 *
 * An authentication template takes the code twice: once in the body, and once
 * in the copy-code button if the template has one. Templates with and without
 * that button are both common, and the admin form asks for a template *name*
 * rather than its anatomy — so the button component is sent, and a parameter
 * mismatch is retried without it. One retry, and only for that specific
 * complaint.
 */
async function sendViaMeta(
  config: WhatsAppConfig,
  mobile: string,
  code: string,
): Promise<WhatsAppResult> {
  const url = `${config.apiUrl}/${config.phoneNumberId}/messages`;

  const body = (withButton: boolean) => ({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: digits(mobile),
    type: 'template',
    template: {
      name: config.templateName,
      language: { code: config.templateLanguage },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        ...(withButton
          ? [
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: code }],
              },
            ]
          : []),
      ],
    },
  });

  const first = await postJson(url, config.accessToken, body(true));
  if (first.ok) return { delivered: true, transport: 'meta' };

  /*
   * 132000 is "number of parameters does not match the expected number of
   * params" — the template has no copy-code button. Anything else is a real
   * failure and is not worth a second message.
   */
  if (first.errorCode === 132000 || first.errorSubcode === 132000) {
    const second = await postJson(url, config.accessToken, body(false));
    if (second.ok) return { delivered: true, transport: 'meta' };
    return { delivered: false, transport: 'meta', detail: describe(second) };
  }

  return { delivered: false, transport: 'meta', detail: describe(first) };
}

/* --------------------------------- twilio ---------------------------------- */

/**
 * Twilio's WhatsApp channel.
 *
 * `HX…` in the template field means a Content template, which is what a
 * business-initiated OTP needs. Anything else falls back to a body message,
 * which Twilio delivers only inside an open 24-hour session — correct for a
 * sandbox and for a re-reply, and it fails loudly rather than silently
 * otherwise.
 */
async function sendViaTwilio(
  config: WhatsAppConfig,
  mobile: string,
  code: string,
  ttlMs: number,
): Promise<WhatsAppResult> {
  const base = config.apiUrl.includes('twilio.com')
    ? config.apiUrl
    : 'https://api.twilio.com/2010-04-01';
  const url = `${base}/Accounts/${config.accountSid}/Messages.json`;

  const to = config.fromNumber.startsWith('whatsapp:')
    ? `whatsapp:+${digits(mobile)}`
    : `whatsapp:+${digits(mobile)}`;

  const form = new URLSearchParams({
    From: config.fromNumber.startsWith('whatsapp:')
      ? config.fromNumber
      : `whatsapp:${config.fromNumber}`,
    To: to,
  });

  if (/^HX[0-9a-f]{32}$/i.test(config.templateName)) {
    form.set('ContentSid', config.templateName);
    // Twilio's content variables are positional and always strings.
    form.set('ContentVariables', JSON.stringify({ '1': code }));
  } else {
    form.set('Body', otpMessage(code, ttlMs));
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        // Basic auth: the SID is the username, the auth token is the password.
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.accessToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return { delivered: true, transport: 'twilio' };

    /*
     * Twilio's error body is JSON with a numeric `code`. Only that code is
     * kept: the body also carries `Body`, which is the message, which is the
     * OTP.
     */
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { code?: number };
      if (payload?.code) detail += ` (Twilio ${payload.code})`;
    } catch {
      /* not JSON — the status alone is the detail */
    }
    console.error(`[auth] Twilio rejected a WhatsApp send: ${detail}`);
    return { delivered: false, transport: 'twilio', detail };
  } catch (error) {
    const detail = (error as Error).message;
    console.error('[auth] Twilio unreachable:', detail);
    return { delivered: false, transport: 'twilio', detail };
  }
}

/* --------------------------------- webhook --------------------------------- */

/**
 * A generic approved BSP.
 *
 * The code is sent both on its own and inside rendered text, so a provider
 * that owns the template rendering and one that wants finished copy are both
 * served without a second transport.
 */
async function sendViaWebhook(
  config: WhatsAppConfig,
  mobile: string,
  code: string,
  ttlMs: number,
): Promise<WhatsAppResult> {
  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify({
        channel: 'whatsapp',
        to: digits(mobile),
        from: config.phoneNumberId || config.fromNumber || undefined,
        businessAccountId: config.businessAccountId || undefined,
        template: config.templateName,
        language: config.templateLanguage,
        // Named `code` rather than `otp` because that is the variable name the
        // majority of BSP template APIs expect.
        variables: { code },
        message: otpMessage(code, ttlMs),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return { delivered: true, transport: 'webhook' };

    // Status only — a BSP error body routinely echoes the message.
    const detail = `HTTP ${response.status}`;
    console.error(`[auth] WhatsApp provider rejected the send: ${detail}`);
    return { delivered: false, transport: 'webhook', detail };
  } catch (error) {
    const detail = (error as Error).message;
    console.error('[auth] WhatsApp provider unreachable:', detail);
    return { delivered: false, transport: 'webhook', detail };
  }
}

/* --------------------------------- console --------------------------------- */

/**
 * No provider configured.
 *
 * In development the code goes to the server log, which is the only way to
 * finish the flow on a laptop. In production it is an error, loudly — a
 * WhatsApp login that silently never delivers looks to a customer exactly like
 * a broken store.
 */
function logToConsole(mobile: string, code: string, ttlMs: number): WhatsAppResult {
  if (isProd) {
    console.error(
      '[auth] a WhatsApp OTP was requested but no provider is configured — ' +
        'set it up under Settings → Authentication → WhatsApp.',
    );
    return { delivered: false, transport: 'console', detail: 'not configured' };
  }

  console.log(
    `\n[auth] ─── DEV WHATSAPP OTP ───────────────────────\n` +
      `[auth]   ${mobile}  →  ${code}\n` +
      `[auth]   expires in ${Math.round(ttlMs / 1000)}s\n` +
      `[auth]   configure a provider to send real messages\n` +
      `[auth] ─────────────────────────────────────────────\n`,
  );
  return { delivered: false, transport: 'console', detail: 'no provider configured' };
}

/* ----------------------------------- test ---------------------------------- */

/**
 * §29's "Send Test WhatsApp Message".
 *
 * Sends through exactly the path a real OTP takes, because a test that uses a
 * different code path proves nothing about the one that matters. The code is
 * freshly random and is never returned, logged in production, or stored — it
 * is a throwaway that verifies credentials, template approval and delivery in
 * one go.
 *
 * Restricted to a signed-in admin by the route that calls it; the number is
 * whatever that admin typed, so no unsolicited message can be provoked from
 * outside the panel.
 */
export async function sendWhatsAppTest(mobile: string): Promise<WhatsAppResult & { ok: boolean }> {
  const config = await resolveWhatsAppConfig();

  if (!isConfigured(config)) {
    return {
      ok: false,
      delivered: false,
      transport: config.provider,
      detail: 'WhatsApp is not fully configured yet.',
    };
  }

  const { generateOtp } = await import('./crypto.js');
  const result = await sendWhatsAppOtp(mobile, generateOtp(), config.otpTtlMs, config);

  return { ...result, ok: result.delivered };
}

/* --------------------------------- plumbing -------------------------------- */

interface PostResult {
  ok: boolean;
  status: number;
  errorCode?: number;
  errorSubcode?: number;
  errorType?: string;
  networkError?: string;
}

/** One JSON POST with a bearer token, reduced to a result that holds no message. */
async function postJson(url: string, token: string, body: unknown): Promise<PostResult> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return { ok: true, status: response.status };

    /*
     * Meta's error object carries `code`, `error_subcode` and `type`. Those
     * three are kept because they are what an admin needs to fix a
     * misconfiguration; `message` and `error_data` are dropped because they
     * quote the request, and the request contains the code.
     */
    let errorCode: number | undefined;
    let errorSubcode: number | undefined;
    let errorType: string | undefined;

    try {
      const payload = (await response.json()) as {
        error?: { code?: number; error_subcode?: number; type?: string };
      };
      errorCode = payload?.error?.code;
      errorSubcode = payload?.error?.error_subcode;
      errorType = payload?.error?.type;
    } catch {
      /* not JSON — the status alone is the detail */
    }

    return { ok: false, status: response.status, errorCode, errorSubcode, errorType };
  } catch (error) {
    return { ok: false, status: 0, networkError: (error as Error).message };
  }
}

/** A one-line, secret-free summary of a failure, for the admin screen. */
function describe(result: PostResult): string {
  if (result.networkError) return `provider unreachable: ${result.networkError}`;

  const parts = [`HTTP ${result.status}`];
  if (result.errorCode) parts.push(`code ${result.errorCode}`);
  if (result.errorSubcode) parts.push(`subcode ${result.errorSubcode}`);
  if (result.errorType) parts.push(result.errorType);

  const detail = parts.join(' · ');
  console.error(`[auth] Meta rejected a WhatsApp send: ${detail}`);
  return detail;
}
