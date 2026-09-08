/**
 * The payment client.
 * ===========================================================================
 * Two halves: the four calls the storefront makes to its own API, and the
 * loader for Razorpay's checkout script.
 *
 * What is deliberately *not* here: any gateway credential. The key secret never
 * leaves the server, and the key *id* is not a build-time constant either — it
 * arrives with the payment the server has already priced and created, so a
 * store that changes its Razorpay account does not need the shop rebuilt. There
 * is no `VITE_RAZORPAY_*` anything, and there should never be.
 *
 * The amount is not here either. `createPaymentOrder` sends the bag; the server
 * prices it, and the total the popup collects is the server's number. Nothing
 * in this file can influence what is charged.
 */

import { ApiError, apiGet, apiPost } from './api';

/* ------------------------------- our own API -------------------------------- */

/** Which methods the checkout may offer, and whether COD covers this total. */
export const fetchPaymentMethods = (total, options) =>
  apiGet('/storefront/payments/methods', { ...options, params: total ? { total } : undefined });

/**
 * Step one: price the bag and open a gateway order.
 *
 * No SOPII order exists after this resolves — what comes back is an intent id
 * and the values Razorpay's popup needs.
 */
export const createPaymentOrder = (payload) =>
  apiPost('/storefront/payments/razorpay/order', payload);

/** Step two: the only call that can produce a paid order. */
export const verifyPayment = (payload) =>
  apiPost('/storefront/payments/razorpay/verify', payload);

/**
 * Tells the server an attempt ended without payment.
 *
 * Best-effort by design: it records a failure for the operator and unblocks a
 * retry, and a shopper whose network dropped should not be shown an error about
 * the error. Never throws.
 */
export async function reportPaymentFailure({ intentId, reason, cancelled = false }) {
  if (!intentId) return null;
  try {
    return await apiPost('/storefront/payments/razorpay/failed', {
      intentId,
      reason,
      cancelled,
    });
  } catch (error) {
    console.warn('[payments] could not report the failure:', error?.message ?? error);
    return null;
  }
}

/** What happened to an attempt — the resume path after a refresh. */
export const fetchPaymentIntent = (intentId, options) =>
  apiGet(`/storefront/payments/intents/${encodeURIComponent(intentId)}`, options);

/* ---------------------------- the checkout script --------------------------- */

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
const SCRIPT_TIMEOUT_MS = 15000;

/** One in-flight load shared by every caller; a second Pay Now reuses it. */
let scriptPromise = null;

/**
 * Loads Razorpay's checkout script, once.
 *
 * Resolves with `window.Razorpay`. Rejects on a network failure, a blocked
 * request or a timeout — all three are the same thing from the shopper's point
 * of view, and all three must leave the cart untouched.
 *
 * The timeout matters more than it looks: a script tag whose host is blocked by
 * an extension or a corporate proxy fires neither `load` nor `error` on some
 * browsers, and without a deadline the Pay Now button would sit on
 * "Processing…" forever.
 */
export function loadRazorpayScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Payments need a browser.'));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT}"]`);
    const script = existing ?? document.createElement('script');

    const timer = setTimeout(() => {
      cleanup();
      // Let a later attempt try again rather than caching the failure forever.
      scriptPromise = null;
      reject(new Error('The payment window took too long to load.'));
    }, SCRIPT_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    }

    function onLoad() {
      cleanup();
      if (window.Razorpay) resolve(window.Razorpay);
      else {
        scriptPromise = null;
        reject(new Error('The payment window could not start.'));
      }
    }

    function onError() {
      cleanup();
      scriptPromise = null;
      script.remove();
      reject(new Error('We could not load the payment window.'));
    }

    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);

    if (!existing) {
      script.src = RAZORPAY_SCRIPT;
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return scriptPromise;
}

/* -------------------------------- resuming ---------------------------------- */

/*
 * The intent id survives a reload in sessionStorage — not localStorage: a
 * payment attempt belongs to this tab and this sitting, and a stale one found
 * by a different tab a week later would offer to resume something that has long
 * since expired.
 */
const RESUME_KEY = 'sopii.payment.intent';

export function rememberIntent(intentId) {
  try {
    sessionStorage.setItem(RESUME_KEY, intentId);
  } catch {
    /* Private mode, or storage disabled. Resuming is a convenience. */
  }
}

export function readRememberedIntent() {
  try {
    return sessionStorage.getItem(RESUME_KEY);
  } catch {
    return null;
  }
}

export function forgetIntent() {
  try {
    sessionStorage.removeItem(RESUME_KEY);
  } catch {
    /* as above */
  }
}

/** Turns any thrown API error into the `{ ok, message }` the checkout renders. */
export function paymentFailure(error, fallback) {
  if (error instanceof ApiError) return { ok: false, message: error.message, status: error.status };
  return { ok: false, message: error?.message || fallback };
}
