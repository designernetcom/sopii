/*
 * The Razorpay seam.
 * ===========================================================================
 * Three operations, over Razorpay's REST API with HTTP Basic auth — no SDK, so
 * there is no dependency to keep current and nothing between this file and the
 * documented wire format.
 *
 *   createOrder     the server-side order a checkout popup is opened against
 *   verifySignature the HMAC that proves a callback really came from Razorpay
 *   fetchPayment    what Razorpay itself says the payment did
 *
 * The third one is the one that is easy to leave out, and the reason it is here
 * is §7: *never trust payment success sent only from the frontend*. A valid
 * signature proves the callback was not forged, but the browser still chose
 * which callback to send. Asking Razorpay directly — is this payment captured,
 * for this order, for this many paise — is what turns "the client says it
 * worked" into "the gateway says it worked".
 *
 * Amounts here are **paise**. Razorpay's API is integer-minor-unit throughout;
 * the store's totals are whole rupees. The conversion happens at this boundary
 * and nowhere else.
 */

import crypto from 'node:crypto';
import { resolveRazorpayConfig, type RazorpayConfig } from './config.js';

/** Whole rupees → paise. The one place this conversion is allowed to happen. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);

/** Paise → whole rupees, for comparing a gateway amount against an order total. */
export const toRupees = (paise: number) => Math.round(paise / 100);

const TIMEOUT_MS = Number(process.env.RAZORPAY_TIMEOUT_MS ?? 15000);

/* --------------------------------- errors ---------------------------------- */

/**
 * A gateway failure, carrying enough for an operator to act on and nothing a
 * shopper should read. Routes translate it into §6's wording.
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

function authHeader(config: RazorpayConfig) {
  return `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;
}

/**
 * One call to Razorpay.
 *
 * The error body is reduced to Razorpay's own `code`/`description` before it
 * goes anywhere: their responses echo the request, and the request carries
 * customer contact details we have no reason to copy into a log.
 */
async function call<T>(
  config: RazorpayConfig,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' },
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: authHeader(config),
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const reason = (error as Error).name === 'TimeoutError' ? 'timed out' : 'unreachable';
    console.error(`[payments] Razorpay ${reason}: ${(error as Error).message}`);
    throw new GatewayError(`The payment gateway is ${reason}.`, 504, 'gateway_unreachable');
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const detail = (payload as { error?: { code?: string; description?: string } })?.error;
    console.error(
      `[payments] Razorpay rejected ${init.method} ${path}: HTTP ${response.status}` +
        (detail?.code ? ` · ${detail.code}` : ''),
    );
    throw new GatewayError(
      detail?.description || `The payment gateway returned HTTP ${response.status}.`,
      response.status,
      detail?.code,
    );
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* -------------------------------- creating --------------------------------- */

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

/**
 * Creates the Razorpay order a checkout popup is opened against.
 *
 * `amountPaise` is computed by the caller from the server's own pricing of the
 * bag — the browser's total never reaches this function, and the amount
 * Razorpay records is the amount that will later be checked against the
 * captured payment.
 */
export async function createRazorpayOrder({
  amountPaise,
  currency = 'INR',
  receipt,
  notes,
  config,
}: {
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
  config?: RazorpayConfig;
}): Promise<RazorpayOrder> {
  const resolved = config ?? (await resolveRazorpayConfig());

  return call<RazorpayOrder>(resolved, '/orders', {
    method: 'POST',
    body: {
      amount: amountPaise,
      currency,
      // Razorpay caps this at 40 characters and rejects anything longer.
      receipt: receipt.slice(0, 40),
      /*
       * Razorpay would otherwise let a customer part-pay an order. An OTP for
       * half a saree is not a thing this store sells.
       */
      partial_payment: false,
      notes,
    },
  });
}

/* -------------------------------- verifying -------------------------------- */

/**
 * The signature Razorpay's checkout hands back, checked.
 *
 * `HMAC_SHA256(order_id + "|" + payment_id, key_secret)`, compared in constant
 * time. A mismatch means the callback did not come from Razorpay — a forged
 * success, a replayed one from a different order, or a bug. All three are the
 * same answer: no order.
 */
export function verifyPaymentSignature({
  orderId,
  paymentId,
  signature,
  keySecret,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  if (!orderId || !paymentId || !signature || !keySecret) return false;

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(signature, 'utf8');

  if (left.length !== right.length) {
    // Still spend a comparison, so length is not leaked by timing either.
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

/* --------------------------------- reading --------------------------------- */

export interface RazorpayPayment {
  id: string;
  order_id: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  amount: number;
  currency: string;
  method?: string;
  email?: string;
  contact?: string;
  error_code?: string | null;
  error_description?: string | null;
  captured?: boolean;
}

/** What Razorpay says about a payment — the authority, over anything the client sent. */
export async function fetchRazorpayPayment(
  paymentId: string,
  config?: RazorpayConfig,
): Promise<RazorpayPayment> {
  const resolved = config ?? (await resolveRazorpayConfig());
  return call<RazorpayPayment>(resolved, `/payments/${encodeURIComponent(paymentId)}`);
}

/**
 * Whether a payment may be treated as money received.
 *
 * `captured` is unambiguous. `authorized` means the funds are held but not yet
 * taken — that happens when the Razorpay account is on manual capture, and the
 * order is real either way, so it is accepted and the panel shows it as paid
 * once capture settles. Everything else is not a payment.
 */
export const isPaid = (payment: RazorpayPayment) =>
  payment.status === 'captured' || payment.status === 'authorized';
