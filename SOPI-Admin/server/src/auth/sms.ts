/*
 * The SMS seam.
 * ===========================================================================
 * One function, so that wiring up a real provider is a change to this file and
 * nothing else. Two transports ship:
 *
 *   console  no provider configured. The code is printed to the server log so
 *            a developer can finish the flow. Refuses to run in production.
 *   webhook  POSTs `{ to, message }` to OTP_PROVIDER_URL with a bearer key.
 *            Every Indian SMS gateway worth using accepts something close to
 *            this, and the ones that do not are a `case` away.
 *
 * The OTP is passed *in* here and never comes back out: the return value is a
 * boolean about delivery, so no caller can accidentally put a code on the wire.
 */

import { authConfig, isProd } from './config.js';

type Transport = 'console' | 'webhook';

const transport: Transport = process.env.OTP_PROVIDER_URL?.trim() ? 'webhook' : 'console';

const SENDER = process.env.OTP_SENDER_ID?.trim() || 'SOPII';

/** Kept short — Indian transactional templates are approved per-text. */
function message(code: string, ttlMs: number) {
  const minutes = Math.max(1, Math.round(ttlMs / 60_000));
  return `${code} is your ${SENDER} verification code. It expires in ${minutes} minutes. Do not share it with anyone.`;
}

/**
 * Sends one OTP.
 *
 * Returns whether it actually went somewhere. A false answer is not an error:
 * the calling route still succeeds, because telling a browser "we could not
 * send that" and telling it nothing are the same thing from a security point
 * of view, and the alternative — surfacing provider failures per number —
 * leaks which numbers are real.
 */
export async function sendOtpSms(mobile: string, code: string, ttlMs: number): Promise<boolean> {
  if (transport === 'webhook') return sendViaWebhook(mobile, message(code, ttlMs));

  if (authConfig.otp.logToConsole && !isProd) {
    console.log(
      `\n[auth] ─── DEV OTP ────────────────────────────────\n` +
        `[auth]   ${mobile}  →  ${code}\n` +
        `[auth]   expires in ${Math.round(ttlMs / 1000)}s\n` +
        `[auth]   set OTP_PROVIDER_URL to send real messages\n` +
        `[auth] ─────────────────────────────────────────────\n`,
    );
    return false;
  }

  /*
   * Production with no provider configured. Loud, because an OTP login that
   * silently never delivers looks to a customer exactly like a broken store.
   */
  console.error(
    '[auth] an OTP was requested but no SMS provider is configured — set OTP_PROVIDER_URL.',
  );
  return false;
}

async function sendViaWebhook(to: string, text: string): Promise<boolean> {
  const url = process.env.OTP_PROVIDER_URL!.trim();
  const key = process.env.OTP_PROVIDER_API_KEY?.trim();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ to, sender: SENDER, message: text }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      // Status only. A provider's error body routinely echoes the message,
      // which would put the OTP in the log.
      console.error(`[auth] SMS provider rejected the send: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[auth] SMS provider unreachable:', (error as Error).message);
    return false;
  }
}
