import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPaymentOrder,
  fetchPaymentIntent,
  forgetIntent,
  loadRazorpayScript,
  paymentFailure,
  readRememberedIntent,
  rememberIntent,
  reportPaymentFailure,
  verifyPayment,
} from '../services/payments';

/**
 * The online payment flow, as one hook.
 *
 *   Pay Now → create gateway order → load script → open popup
 *           → complete → verify on the server → order
 *
 * Every branch off that line ends in the same place: **no order, cart intact,
 * retry available.** Cancellation, failure, a blocked script, a dead network, a
 * timeout — the shopper is told what happened and the bag is exactly as they
 * left it.
 *
 * The hook owns the *machine*, not the page. It never touches the cart, never
 * navigates, and never decides what to show — it reports a status and calls
 * `onPaid` with the order the server wrote. That keeps the checkout's existing
 * layout and copy where they were.
 */

/** idle → creating → loading → open → verifying → paid | failed | cancelled */
export const PAYMENT_STATUS = {
  idle: 'idle',
  creating: 'creating',
  loading: 'loading',
  open: 'open',
  verifying: 'verifying',
  paid: 'paid',
  failed: 'failed',
  cancelled: 'cancelled',
};

/** The statuses during which a second Pay Now must do nothing (§5). */
const BUSY = new Set(['creating', 'loading', 'open', 'verifying']);

const GENERIC_FAILURE = 'Payment failed. Your order has not been placed.';

/**
 * The popup's own branding, for the two things the server may not be able to
 * supply: a store with no logo uploaded in the panel, and an older API that
 * sends no theme. Both are fallbacks — whatever the server sends always wins,
 * because that is where a rebrand happens.
 */
const SHOP_LOGO = '/final_logo-240.png';
const FALLBACK_THEME_COLOR = '#7D2B69';

/** The shop's mark as an absolute URL — Razorpay resolves it from its own iframe. */
function shopLogo() {
  try {
    return new URL(SHOP_LOGO, window.location.origin).href;
  } catch {
    return undefined;
  }
}

export function useRazorpayCheckout({ onPaid } = {}) {
  const [status, setStatus] = useState(PAYMENT_STATUS.idle);
  const [error, setError] = useState('');

  /*
   * The last payload, so "Try Again" can re-run the same attempt without the
   * page having to hold it. The server reuses the open intent for an identical
   * bag, so a retry reopens the *same* gateway order rather than a second one.
   */
  const lastPayload = useRef(null);
  const intentRef = useRef(null);

  /*
   * Guards two races that both produce phantom state:
   *   - a second click landing between `setStatus('creating')` and the render
   *     that disables the button, which state alone cannot prevent;
   *   - Razorpay firing `ondismiss` *after* a successful handler, which some
   *     browsers do, and which would otherwise report a paid order as cancelled.
   */
  const busy = useRef(false);
  const settled = useRef(false);

  /*
   * Nothing may set state after the checkout page has gone.
   *
   * Raised on the way *in* as well as cleared on the way out, which is not
   * belt-and-braces: React mounts, tears down and remounts every component
   * under StrictMode in development, so a flag that is only ever cleared is
   * false for the rest of the page's life. That turned `set` into a no-op —
   * the button never left "Pay Now" and no failure was ever shown — and, worse,
   * made `pay` return at the `alive` check below *just before* opening the
   * popup: a gateway order created on every click, and a checkout window that
   * never appeared.
   */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const set = useCallback((next, message = '') => {
    if (!alive.current) return;
    setStatus(next);
    setError(message);
  }, []);

  const finish = useCallback(
    (next, message) => {
      busy.current = false;
      set(next, message);
    },
    [set],
  );

  /* ------------------------------ verification ----------------------------- */

  const confirm = useCallback(
    async (response) => {
      settled.current = true;
      set(PAYMENT_STATUS.verifying);

      try {
        const { order } = await verifyPayment({
          intentId: intentRef.current,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });

        forgetIntent();
        busy.current = false;
        if (alive.current) setStatus(PAYMENT_STATUS.paid);

        // The page navigates and clears the cart — only now, and only here.
        onPaid?.(order);
        return { ok: true, order };
      } catch (verifyError) {
        /*
         * The money may well have been taken: the popup said it succeeded and
         * only our confirmation failed. So the message says "do not pay again",
         * the intent is deliberately *not* forgotten, and a retry re-runs the
         * verification rather than a second payment.
         */
        const failure = paymentFailure(
          verifyError,
          'We could not confirm your payment. Please do not pay again — refresh this page in a moment.',
        );
        finish(PAYMENT_STATUS.failed, failure.message);
        return failure;
      }
    },
    [finish, onPaid, set],
  );

  /* --------------------------------- paying -------------------------------- */

  const pay = useCallback(
    async (payload) => {
      if (busy.current) return { ok: false, message: 'A payment is already in progress.' };

      busy.current = true;
      settled.current = false;
      lastPayload.current = payload;
      set(PAYMENT_STATUS.creating);

      /* 1. The server prices the bag and opens a gateway order. */
      let intent;
      try {
        intent = await createPaymentOrder(payload);
      } catch (createError) {
        const failure = paymentFailure(
          createError,
          'We could not start the payment. Please check your connection and try again.',
        );
        finish(PAYMENT_STATUS.failed, failure.message);
        return failure;
      }

      intentRef.current = intent.intentId;
      rememberIntent(intent.intentId);

      /* 2. Razorpay's script. A blocked or slow load fails here, not silently. */
      set(PAYMENT_STATUS.loading);
      let Razorpay;
      try {
        Razorpay = await loadRazorpayScript();
      } catch (scriptError) {
        await reportPaymentFailure({
          intentId: intent.intentId,
          reason: 'checkout script failed to load',
        });
        finish(
          PAYMENT_STATUS.failed,
          `${scriptError.message} Please check your connection, or disable any ad blocker for this page, and try again.`,
        );
        return { ok: false, message: scriptError.message };
      }

      if (!alive.current) return { ok: false, message: 'Cancelled.' };

      /* 3. The popup. */
      set(PAYMENT_STATUS.open);

      return new Promise((resolve) => {
        /*
         * Razorpay closes the popup itself when this many seconds pass, which
         * is what turns "the shopper walked away" into a dismissal we hear
         * about rather than a tab stuck on Processing. Derived from the
         * server's own expiry so the two cannot disagree.
         */
        const secondsLeft = Math.max(
          60,
          Math.floor((new Date(intent.expiresAt).getTime() - Date.now()) / 1000),
        );

        const checkout = new Razorpay({
          /* Public by design, and supplied by the server rather than the build. */
          key: intent.keyId,
          order_id: intent.razorpayOrderId,
          amount: intent.amountPaise,
          currency: intent.currency,
          /*
           * The store's own name, mark, colour and wording, all decided by the
           * server with the payment. A shopper who presses Pay Now on SOPII
           * should not have an unbranded window open on top of it — and none
           * of it can be a build-time constant, or a store that rebrands (or
           * changes its Razorpay account) would need the shop redeployed.
           * `shopLogo` covers the one case the panel cannot: no logo uploaded.
           */
          name: intent.name,
          description: intent.description,
          image: intent.image || shopLogo(),
          theme: intent.theme ?? { color: FALLBACK_THEME_COLOR },
          /*
           * Name, email and phone as they were typed into this checkout, with
           * the two the order is written from locked. The popup collects a
           * contact of its own otherwise, and a payment filed under an address
           * the order does not carry is the kind of mismatch nobody finds
           * until a refund. `prefill.method` lands a UPI choice on UPI —
           * preselected, not restricted, so a failing UPI app is not a dead
           * end. §2's "if UPI is implemented through Razorpay, follow the
           * Razorpay flow".
           */
          prefill: intent.prefill,
          readonly: { email: true, contact: true },
          timeout: secondsLeft,
          notes: { intentId: intent.intentId },

          handler: (response) => {
            confirm(response).then(resolve);
          },

          modal: {
            /* Nothing about a payment should be dismissable by a stray click. */
            escape: false,
            backdropclose: false,
            /* The X is the one deliberate way out, and it still asks. */
            confirm_close: true,
            ondismiss: () => {
              if (settled.current) return; // the handler already won the race
              settled.current = true;

              reportPaymentFailure({ intentId: intent.intentId, cancelled: true }).finally(() => {
                finish(
                  PAYMENT_STATUS.cancelled,
                  'Payment was cancelled. Your order has not been placed.',
                );
                resolve({ ok: false, cancelled: true });
              });
            },
          },
        });

        checkout.on('payment.failed', (event) => {
          if (settled.current) return;
          settled.current = true;

          /* Razorpay's own description is specific and shopper-safe. */
          const detail = event?.error?.description;
          reportPaymentFailure({
            intentId: intent.intentId,
            reason: event?.error?.code || 'payment failed',
          }).finally(() => {
            finish(PAYMENT_STATUS.failed, detail ? `${GENERIC_FAILURE} ${detail}` : GENERIC_FAILURE);
            resolve({ ok: false, message: GENERIC_FAILURE });
          });
        });

        try {
          checkout.open();
        } catch (openError) {
          settled.current = true;
          finish(PAYMENT_STATUS.failed, 'We could not open the payment window. Please try again.');
          resolve({ ok: false, message: openError.message });
        }
      });
    },
    [confirm, finish, set],
  );

  /** §6's "Try Again": the same bag, the same gateway order. */
  const retry = useCallback(() => {
    if (!lastPayload.current) return Promise.resolve({ ok: false });
    return pay(lastPayload.current);
  }, [pay]);

  /** §6's "Change Payment Method": drop the attempt and return to the form. */
  const reset = useCallback(() => {
    busy.current = false;
    settled.current = false;
    intentRef.current = null;
    forgetIntent();
    set(PAYMENT_STATUS.idle);
  }, [set]);

  /* -------------------------------- resuming ------------------------------- */

  /**
   * Picks up an attempt that a refresh interrupted.
   *
   * Called once when the checkout mounts. If the intent became an order while
   * the page was reloading — which happens when the tab is refreshed between
   * the popup succeeding and the verification landing — the shopper goes
   * straight to their receipt instead of paying twice.
   */
  const resume = useCallback(async () => {
    const intentId = readRememberedIntent();
    if (!intentId) return null;

    try {
      const intent = await fetchPaymentIntent(intentId);

      if (intent.status === 'paid' && intent.orderId) {
        forgetIntent();
        return { resumed: 'paid', orderId: intent.orderId, orderCode: intent.orderCode };
      }

      if (intent.status === 'expired' || intent.status === 'cancelled') {
        forgetIntent();
        return null;
      }

      /* Still open or failed: say so, and let them try again. */
      if (intent.message) set(PAYMENT_STATUS.failed, intent.message);
      return { resumed: intent.status };
    } catch {
      // An intent that no longer exists is not worth mentioning.
      forgetIntent();
      return null;
    }
  }, [set]);

  return {
    status,
    error,
    /** True while a payment is in flight — what the Pay Now button disables on. */
    busy: BUSY.has(status),
    pay,
    retry,
    reset,
    resume,
  };
}
