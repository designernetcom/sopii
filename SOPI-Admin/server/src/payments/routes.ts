/*
 * Online payments, storefront side.
 * ===========================================================================
 *   POST /api/storefront/payments/razorpay/order    price the bag, open a gateway order
 *   POST /api/storefront/payments/razorpay/verify   check the signature, then write the order
 *   POST /api/storefront/payments/razorpay/failed   record a failure or a dismissal
 *   GET  /api/storefront/payments/intents/:id       what happened to an attempt
 *   GET  /api/storefront/payments/methods           what the checkout may offer
 *
 * The rule the whole file exists to keep:
 *
 *   **An online order is written in exactly one place — inside `/verify`,
 *   after Razorpay has confirmed the money.**
 *
 * Everything before that produces a *payment intent*, which is not an order: it
 * holds no stock, spends no coupon, and rings no bell in the admin panel. A
 * shopper who closes the popup leaves an abandoned intent behind and nothing
 * else.
 *
 * Three things are checked before an intent becomes an order, and the first two
 * are the ones that matter:
 *
 *   1. the HMAC signature, which proves the callback came from Razorpay;
 *   2. Razorpay's own record of the payment, fetched server-side, which proves
 *      it was actually captured for this order and this amount — a valid
 *      signature only proves the callback was not forged, and the browser still
 *      chose which callback to send;
 *   3. the bag, re-priced from the catalogue, so a price or stock change during
 *      the payment is caught rather than honoured from a stale snapshot.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import type { OrderItem } from '@/types';
import { env } from '../env.js';
import { ah, badRequest, nextId, notFound } from '../lib/http.js';
import { withCustomer } from '../lib/shopAuth.js';
import { loadSettings } from '../lib/settings.js';
import {
  ORDER_PAYMENT_METHOD,
  assertEmail,
  quoteCart,
  readAddress,
  readLines,
  resolveCustomer,
  trimmed,
  writeOrder,
  type CartLine,
} from '../routes/shop.js';
import {
  codProblem,
  resolveCodRules,
  resolveRazorpayConfig,
  settlesThrough,
} from './config.js';
import { PaymentIntentModel, type PaymentIntentDoc } from './models.js';
import { claimOnce } from '../lib/idempotency.js';
import { limits, rateLimit } from '../lib/rateLimit.js';
import { privateNoStore } from '../lib/observability.js';
import { logger } from '../lib/logger.js';
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  GatewayError,
  isPaid,
  toPaise,
  toRupees,
  verifyPaymentSignature,
} from './razorpay.js';

export const paymentRoutes = Router();

/** How long a payment attempt stays resumable. Razorpay orders live far longer. */
const INTENT_TTL_MS = Number(process.env.PAYMENT_INTENT_TTL_MS ?? 30 * 60 * 1000);

/** §6's wording, in one place, so every failure path says the same thing. */
const MESSAGES = {
  failed: 'Payment failed. Your order has not been placed.',
  cancelled: 'Payment was cancelled. Your order has not been placed.',
  unavailable: 'Online payment is not available on this store right now.',
  expired: 'That payment session has expired. Please try again.',
  mismatch: 'We could not confirm that payment. Your order has not been placed.',
  changed:
    'Your bag changed while the payment was in progress, so we did not place the order. ' +
    'Please review it and try again.',
} as const;

const clientIp = (req: { ip?: string }) => req.ip;

/**
 * Where this API is being reached from, for turning a stored relative path
 * into a URL another origin's iframe can load. Taken from the request rather
 * than configured, so it is right in development and behind a proxy alike —
 * `trust proxy` is already set, so `protocol` and `host` follow the forwarded
 * headers.
 */
const requestOrigin = (req: { protocol?: string; get(name: string): string | undefined }) => {
  const host = req.get('host');
  return host ? `${req.protocol ?? 'http'}://${host}` : '';
};

/* ------------------------------- fingerprint -------------------------------- */

/**
 * A stable digest of everything that decides the amount.
 *
 * §5's duplicate guard lives here rather than in the browser. Two Pay Now
 * clicks for the same bag produce the same fingerprint, find the same open
 * intent, and reopen the *same* Razorpay order — so a double-click, a
 * double-submit or a refresh-and-retry cannot open two payments, and cannot
 * produce two orders. A disabled button helps the first case only.
 */
function fingerprintOf(input: {
  email: string;
  gatewayKey: string;
  couponCode?: string;
  state: string;
  lines: CartLine[];
}) {
  const canonical = JSON.stringify({
    email: input.email.toLowerCase(),
    gatewayKey: input.gatewayKey,
    couponCode: (input.couponCode ?? '').toUpperCase(),
    state: input.state.trim().toLowerCase(),
    // Sorted, so the same bag in a different order is the same bag.
    lines: input.lines
      .map((line) => `${line.productId}|${line.size ?? ''}|${line.color ?? ''}|${line.quantity}`)
      .sort(),
  });

  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/* --------------------------------- shapes ----------------------------------- */

/** What the browser is told about an intent. Never the key secret, ever. */
function publicIntent(intent: PaymentIntentDoc, keyId?: string) {
  return {
    intentId: intent._id,
    status: intent.status,
    gatewayKey: intent.gatewayKey,
    provider: intent.provider,
    /** Razorpay's checkout script needs this in the browser by design. */
    keyId,
    razorpayOrderId: intent.providerOrderId,
    amount: intent.amount,
    amountPaise: intent.amountPaise,
    currency: intent.currency,
    /** Present once the intent became an order — the resume path after a refresh. */
    orderId: intent.orderId ?? null,
    orderCode: intent.orderCode ?? null,
    expiresAt: intent.expiresAt.toISOString(),
  };
}

/* ------------------------------ what is on offer ---------------------------- */

/**
 * Which payment methods the checkout may draw, and on what terms.
 *
 * Public and credential-free: it answers a question about the *store*, not
 * about any shopper. `total` is optional and only sharpens the COD answer — the
 * server checks eligibility again when the order is placed either way.
 */
paymentRoutes.get(
  '/payments/methods',
  ah(async (req, res) => {
    const [settings, razorpay, cod] = await Promise.all([
      loadSettings(),
      resolveRazorpayConfig(),
      resolveCodRules(),
    ]);

    const total = Math.max(0, Math.round(Number(req.query.total) || 0));

    const methods = settings.payments
      .filter((gateway) => gateway.enabled)
      .map((gateway) => {
        const online = settlesThrough(gateway.key);

        /*
         * An online method whose gateway has no working key pair is offered as
         * `available: false` rather than hidden: the store meant to offer it,
         * and "temporarily unavailable" is a truer thing to show a shopper than
         * a silently missing option.
         */
        if (online === 'razorpay') {
          return {
            key: gateway.key,
            name: gateway.name,
            description: gateway.description,
            kind: 'online' as const,
            settledBy: 'razorpay',
            available: razorpay.enabled,
            unavailableReason: razorpay.enabled ? null : MESSAGES.unavailable,
            testMode: razorpay.enabled ? razorpay.testMode : false,
          };
        }

        if (gateway.key === 'cod') {
          // Only meaningful once there is a total; 0 means "not asked".
          const problem = total > 0 ? codProblem(cod, total) : null;
          return {
            key: gateway.key,
            name: gateway.name,
            description: gateway.description,
            kind: 'offline' as const,
            settledBy: null,
            available: !problem,
            unavailableReason: problem,
            charge: cod.charge,
            maxOrderValue: cod.maxOrderValue,
            minOrderValue: cod.minOrderValue,
            testMode: false,
          };
        }

        /* A gateway with no integration behind it cannot take money. */
        return {
          key: gateway.key,
          name: gateway.name,
          description: gateway.description,
          kind: 'online' as const,
          settledBy: null,
          available: false,
          unavailableReason: MESSAGES.unavailable,
          testMode: false,
        };
      });

    res.json({ methods });
  }),
);

/* ------------------------------ create an order ----------------------------- */

/**
 * Step one: price the bag on the server, and open a Razorpay order for it.
 *
 * **No SOPII order exists after this call.** What comes back is the handful of
 * values Razorpay's checkout script needs, plus an intent id the browser keeps
 * so it can resume after a refresh.
 */
paymentRoutes.post(
  '/payments/razorpay/order',
  rateLimit(limits.payment),
  withCustomer,
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;

    const gatewayKey = trimmed(body.paymentMethod) || 'razorpay';
    if (settlesThrough(gatewayKey) !== 'razorpay') {
      badRequest('That payment method is not settled online.');
    }

    const email = assertEmail(body.email ?? req.customer?.email);
    const address = readAddress(body.address ?? body.shippingAddress);
    const lines = readLines(body.items);
    const couponCode = trimmed(body.couponCode);

    const settings = await loadSettings();
    const gateway = settings.payments.find(
      (entry) => entry.key === gatewayKey && entry.enabled,
    );
    if (!gateway) badRequest('That payment method is not available.');

    const config = await resolveRazorpayConfig();
    if (!config.enabled) badRequest(MESSAGES.unavailable);

    /*
     * Priced with `enforceStock`, so a sold-out line stops the payment before
     * any money is asked for rather than after. Charging somebody for a saree
     * that has just gone and refunding them later is not a flow, it is an
     * apology.
     */
    const quote = await quoteCart(lines, {
      couponCode,
      state: address.state,
      paymentMethod: gatewayKey,
      customerId: req.customer?._id,
      enforceStock: true,
    });

    if (quote.coupon.message && couponCode) badRequest(quote.coupon.message);
    if (quote.totals.total <= 0) badRequest('This order has nothing to pay.');

    const fingerprint = fingerprintOf({
      email,
      gatewayKey,
      couponCode,
      state: address.state,
      lines,
    });

    /*
     * §5. An open intent for this exact bag is reused rather than replaced, so
     * a second click — or a retry after a failure — reopens the same gateway
     * order. Razorpay lets a customer retry against an order until it is paid,
     * which is precisely the behaviour "Try Again" should have.
     */
    const existing = await PaymentIntentModel.findOne({
      fingerprint,
      /*
       * Cancelled counts as reusable. A dismissed popup leaves a gateway order
       * that Razorpay will still accept a payment against, so opening a second
       * one would leave two live orders for one bag — and a customer with the
       * old popup still open in another tab could pay both. One bag, one
       * gateway order, until it is paid or expires.
       */
      status: { $in: ['created', 'failed', 'cancelled'] },
      expiresAt: { $gt: new Date() },
      providerOrderId: { $exists: true },
    })
      .sort({ createdAt: -1 })
      .lean<PaymentIntentDoc>();

    if (existing && existing.amountPaise === toPaise(quote.totals.total)) {
      // Back to `created`: a previous attempt may have marked it failed, and
      // the shopper is entitled to try that same order again.
      await PaymentIntentModel.updateOne(
        { _id: existing._id },
        { $set: { status: 'created' }, $unset: { lastError: '' } },
      );

      res.json({
        ...publicIntent({ ...existing, status: 'created' }, config.keyId),
        reused: true,
        ...checkoutOptions({
          settings,
          email,
          address,
          lines: quote.lines,
          gatewayKey,
          origin: requestOrigin(req),
        }),
      });
      return;
    }

    const intentId = nextId('pin');

    let gatewayOrder;
    try {
      gatewayOrder = await createRazorpayOrder({
        amountPaise: toPaise(quote.totals.total),
        currency: 'INR',
        // Razorpay caps the receipt at 40 characters.
        receipt: intentId,
        notes: {
          intentId,
          email,
          method: gatewayKey,
        },
        config,
      });
    } catch (error) {
      if (error instanceof GatewayError) {
        // The shopper gets §6's wording; the operator gets the detail in the log.
        badRequest(
          error.status === 504
            ? 'We could not reach the payment gateway. Please check your connection and try again.'
            : MESSAGES.failed,
        );
      }
      throw error;
    }

    const intent = await PaymentIntentModel.create({
      _id: intentId,
      status: 'created',
      provider: 'razorpay',
      gatewayKey,
      email,
      address,
      items: lines,
      couponCode: couponCode || undefined,
      notes: trimmed(body.notes) || undefined,
      customerId: req.customer?._id,
      fingerprint,
      amount: quote.totals.total,
      amountPaise: toPaise(quote.totals.total),
      currency: gatewayOrder.currency ?? 'INR',
      providerOrderId: gatewayOrder.id,
      attempts: 0,
      ip: clientIp(req),
      expiresAt: new Date(Date.now() + INTENT_TTL_MS),
    });

    res.status(201).json({
      ...publicIntent(intent.toObject() as PaymentIntentDoc, config.keyId),
      reused: false,
      ...checkoutOptions({
        settings,
        email,
        address,
        lines: quote.lines,
        gatewayKey,
        origin: requestOrigin(req),
      }),
    });
  }),
);

/**
 * The accent Razorpay paints its checkout with.
 *
 * SOPII's plum — the colour of the button the shopper just pressed — so the
 * payment window does not arrive in a stranger's palette halfway through the
 * checkout. In the environment rather than the code so a rebrand does not need
 * a deploy, and here rather than in the shop so it travels with the payment.
 */
const THEME_COLOR = process.env.RAZORPAY_THEME_COLOR?.trim() || '#7D2B69';

/**
 * An absolute logo URL, or nothing at all.
 *
 * Razorpay draws this inside its own iframe, so a store-relative path — which
 * is what the panel stores, `/media/other/logo.svg` — resolves against
 * razorpay.com and silently shows nothing. Anything already absolute (a
 * Cloudinary delivery URL, a CDN) is passed through untouched.
 */
function logoUrl(logo: unknown, origin: string): string | undefined {
  const value = typeof logo === 'string' ? logo.trim() : '';
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (!origin) return undefined;

  /*
   * A path into the media library is only worth sending if the file is
   * actually there. The seeded settings point at a logo nobody uploaded, and
   * an `image` that 404s inside the popup is worse than none at all — with
   * none, the shop falls back to its own mark and the window still looks like
   * SOPII.
   */
  const media = value.match(/^\/?media\/(.+)$/);
  if (media) {
    const file = path.resolve(env.mediaDir, media[1].split('/').join(path.sep));
    if (!file.startsWith(path.resolve(env.mediaDir)) || !fs.existsSync(file)) return undefined;
  }

  return `${origin.replace(/\/+$/, '')}/${value.replace(/^\/+/, '')}`;
}

/** Ten digits as Razorpay prefers them: +91XXXXXXXXXX. */
function e164(phone?: string) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return phone?.trim() ?? '';
}

/**
 * What the popup says under the store name.
 *
 * "Order total ₹9,099" was there before, directly above Razorpay's own,
 * larger rendering of the same number. Naming the piece being bought is the
 * one thing that line can say which the window does not already show.
 */
function describeBag(lines: { item: OrderItem }[]) {
  if (!lines.length) return 'Your order';

  const pieces = lines.reduce((sum, line) => sum + line.item.quantity, 0);
  const first = lines[0].item.name;

  return (pieces === 1 ? first : `${first} and ${pieces - 1} more`).slice(0, 80);
}

/** The cosmetic half of Razorpay's checkout options — nothing secret in here. */
function checkoutOptions({
  settings,
  email,
  address,
  lines,
  gatewayKey,
  origin,
}: {
  settings: Awaited<ReturnType<typeof loadSettings>>;
  email: string;
  address: { name?: string; phone?: string };
  lines: { item: OrderItem }[];
  gatewayKey: string;
  origin: string;
}) {
  const store = settings.store as Record<string, unknown> | null;

  return {
    name: (store?.storeName as string)?.trim() || 'SOPII',
    description: describeBag(lines),
    image: logoUrl(store?.logo, origin),
    theme: { color: THEME_COLOR },
    prefill: {
      name: address.name ?? '',
      email,
      contact: e164(address.phone),
      /*
       * Lands the popup on the method the shopper already chose on this
       * checkout instead of a picker they answer twice. It *preselects* —
       * every other method stays available behind it, so a UPI app that will
       * not open is not a dead end.
       */
      method: gatewayKey === 'upi' ? 'upi' : undefined,
    },
  };
}

/* --------------------------------- verify ----------------------------------- */

/**
 * Step two, and the only route that writes an online order.
 *
 * Everything the browser sends is treated as a *claim*. The signature check
 * settles whether Razorpay sent it; the payment fetch settles whether the money
 * is real; the re-price settles whether the order is still the one that was
 * paid for. Only then does `writeOrder` run — the same function the COD path
 * calls, so stock, coupons and the panel's notification behave identically.
 */
paymentRoutes.post(
  '/payments/razorpay/verify',
  rateLimit(limits.payment),
  withCustomer,
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;

    const intentId = trimmed(body.intentId);
    const orderId = trimmed(body.razorpay_order_id ?? body.razorpayOrderId);
    const paymentId = trimmed(body.razorpay_payment_id ?? body.razorpayPaymentId);
    const signature = trimmed(body.razorpay_signature ?? body.razorpaySignature);

    if (!intentId || !orderId || !paymentId || !signature) {
      badRequest(MESSAGES.mismatch);
    }

    const intent = await PaymentIntentModel.findById(intentId).lean<PaymentIntentDoc>();
    if (!intent) notFound('Payment');

    /*
     * §5's idempotency, and the answer to a double-submitted verify: an intent
     * that already became an order returns that order rather than writing a
     * second one. The browser cannot tell the difference, which is the point.
     *
     * This read is the fast path only. It is *not* the guard — see the atomic
     * claim below, which is what makes two callbacks arriving in the same
     * millisecond produce one order rather than two.
     */
    if (intent.orderId) {
      const existing = await findOrder(intent.orderId);
      if (existing) {
        privateNoStore(res);
        res.json({ order: existing, alreadyPlaced: true });
        return;
      }
    }

    if (intent.providerOrderId !== orderId) badRequest(MESSAGES.mismatch);
    if (intent.expiresAt.getTime() <= Date.now() && intent.status !== 'paid') {
      badRequest(MESSAGES.expired);
    }

    const config = await resolveRazorpayConfig();
    if (!config.enabled) badRequest(MESSAGES.unavailable);

    await PaymentIntentModel.updateOne({ _id: intent._id }, { $inc: { attempts: 1 } });

    /* -------- 1. the signature: did this callback come from Razorpay? -------- */

    const signed = verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
      keySecret: config.keySecret,
    });

    if (!signed) {
      await failIntent(intent._id, 'signature mismatch');
      console.error(`[payments] signature mismatch on ${orderId} — no order written.`);
      badRequest(MESSAGES.mismatch);
    }

    /* ---- 2. the gateway: does Razorpay agree the money was actually taken? --- */

    let payment;
    try {
      payment = await fetchRazorpayPayment(paymentId, config);
    } catch (error) {
      if (error instanceof GatewayError) {
        /*
         * Deliberately *not* marked failed. The signature was good, so the
         * payment probably succeeded and only the confirmation call did not —
         * leaving the intent open lets the shopper (or a refresh) retry the
         * verification rather than paying twice.
         */
        badRequest(
          'We could not confirm your payment with the gateway. Please wait a moment and try again — ' +
            'do not pay again.',
        );
      }
      throw error;
    }

    if (payment.order_id !== orderId) {
      await failIntent(intent._id, 'payment belongs to another order');
      badRequest(MESSAGES.mismatch);
    }

    if (!isPaid(payment)) {
      await failIntent(intent._id, `payment ${payment.status}`);
      badRequest(MESSAGES.failed);
    }

    /*
     * The amount Razorpay captured, against the amount the intent was opened
     * for. A mismatch means somebody paid for a different bag than the one they
     * are about to receive — which is exactly what a tampered client would look
     * like.
     */
    if (payment.amount !== intent.amountPaise) {
      await failIntent(intent._id, 'amount mismatch');
      console.error(
        `[payments] amount mismatch on ${orderId}: captured ${payment.amount}p, expected ${intent.amountPaise}p.`,
      );
      badRequest(MESSAGES.mismatch);
    }

    /* --- 3. the bag: is the order still the one that was paid for? --- */

    const quote = await quoteCart(intent.items, {
      couponCode: intent.couponCode,
      state: intent.address.state,
      paymentMethod: intent.gatewayKey,
      customerId: intent.customerId,
      // Not enforced: the payment has already been taken, and refusing the
      // order now would leave the shopper paid-up with nothing to show for it.
      // A short line is a fulfilment problem for the panel, not a checkout one.
      enforceStock: false,
    });

    if (quote.totals.total !== intent.amount) {
      /*
       * The bag repriced to something else between opening the payment and
       * confirming it — a coupon expiring mid-flow is the usual cause. The
       * money is real and the intent stays payable, so this is escalated to the
       * operator rather than silently absorbed in either direction.
       */
      console.error(
        `[payments] ${orderId} priced ₹${quote.totals.total} at verification but ₹${intent.amount} at payment.`,
      );
      await PaymentIntentModel.updateOne(
        { _id: intent._id },
        { $set: { lastError: 'repriced during payment' } },
      );
    }

    /* ------------------------------ write it ------------------------------- */

    /*
     * THE CLAIM. §10's "never create duplicate orders because of ... payment
     * callbacks", and the one thing the check at the top of this handler could
     * not do on its own.
     *
     * Razorpay's popup handler and its webhook can both report the same
     * payment, milliseconds apart. Both used to read `intent.orderId`, both saw
     * `null`, and both wrote an order — two orders, two stock decrements, one
     * payment. A read followed by a write is not a guard, however carefully it
     * is written; the check and the write have to be one operation.
     *
     * `claimOnce` is that operation. The filter says "only if nobody has
     * claimed this intent", and MongoDB evaluates it under the document lock,
     * so exactly one caller comes back with a document. The loser falls into
     * the branch below, re-reads the intent, and returns the order the winner
     * wrote — which is the same receipt, which is the true answer.
     */
    const claimedIntent = await claimOnce<PaymentIntentDoc>(
      PaymentIntentModel,
      { _id: intent._id, orderId: { $exists: false } },
      { status: 'settling', providerPaymentId: paymentId, verifiedAt: new Date() },
    );

    if (!claimedIntent) {
      /*
       * Another caller is writing, or has written, the order for this intent.
       * Wait briefly for it to land rather than answering "not found" to a
       * shopper whose money has definitely been taken.
       */
      const settled = await awaitSettledOrder(intent._id);
      if (settled) {
        privateNoStore(res);
        res.json({ order: settled, alreadyPlaced: true });
        return;
      }

      logger.error('payments.claim_lost_no_order', { detail: intent._id });
      badRequest(
        'Your payment is being confirmed. Please refresh in a moment — do not pay again.',
      );
    }

    const customer = await resolveCustomer(req.customer, {
      email: intent.email,
      address: intent.address,
    });

    const gatewayName = quote.settings.payments.find(
      (entry) => entry.key === intent.gatewayKey,
    )?.name;

    let order;
    try {
      order = await writeOrder({
        quote,
        email: intent.email,
        address: intent.address,
        customer,
        gatewayKey: intent.gatewayKey,
        gatewayName,
        /*
         * What the customer actually paid with. Razorpay reports the instrument
         * it settled through, so a UPI payment made inside the Razorpay popup is
         * recorded as UPI even when the shopper picked "Razorpay" on the
         * checkout — which is what the panel and the receipt should say.
         */
        paymentMethod:
          ORDER_PAYMENT_METHOD[payment.method ?? ''] ??
          ORDER_PAYMENT_METHOD[intent.gatewayKey] ??
          'razorpay',
        paymentStatus: 'paid',
        payment: {
          provider: 'razorpay',
          providerOrderId: orderId,
          providerPaymentId: paymentId,
          signatureVerified: true,
          instrument: payment.method,
          amount: toRupees(payment.amount),
        },
        notes: intent.notes,
      });
    } catch (error) {
      /*
       * The claim is released so a retry can succeed. Without this, an order
       * that failed to write once — a database blip, a sold-out line — would
       * leave the intent claimed forever, and the shopper who has already paid
       * could never obtain their order at all.
       *
       * The money is real either way, which is why this is logged at error:
       * somebody has paid and has no order, and an operator needs to know now.
       */
      await PaymentIntentModel.updateOne(
        { _id: intent._id },
        { $set: { status: 'created', lastError: 'order write failed' }, $unset: { verifiedAt: '' } },
      );
      logger.error('payments.order_write_failed', { detail: `${orderId} / ${paymentId}`, error });
      throw error;
    }

    await PaymentIntentModel.updateOne(
      { _id: intent._id },
      {
        $set: {
          status: 'paid',
          providerPaymentId: paymentId,
          verifiedAt: new Date(),
          orderId: order._id,
          orderCode: order.code,
        },
      },
    );

    privateNoStore(res);
    res.status(201).json({ order: order.toJSON(), alreadyPlaced: false });
  }),
);

/* --------------------------- failure and dismissal --------------------------- */

/**
 * The shopper closed the popup, or Razorpay reported a failure.
 *
 * Recorded so an operator can see attempts that never became orders, and so a
 * resumed session knows what happened. **Never writes an order**, and returns
 * 200 either way — this is the browser telling the server about something that
 * already happened, not asking for permission.
 */
paymentRoutes.post(
  '/payments/razorpay/failed',
  rateLimit(limits.payment),
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const intentId = trimmed(body.intentId);
    const cancelled = Boolean(body.cancelled);

    if (intentId) {
      /*
       * A paid intent is never downgraded. The popup can fire `dismiss` after a
       * successful handler on some browsers, and losing a real order to that
       * race would be a genuinely bad bug.
       */
      await PaymentIntentModel.updateOne(
        { _id: intentId, status: { $ne: 'paid' } },
        {
          $set: {
            status: cancelled ? 'cancelled' : 'failed',
            // A short category only — never the gateway's response body.
            lastError: trimmed(body.reason).slice(0, 140) || (cancelled ? 'dismissed' : 'failed'),
          },
        },
      );
    }

    res.json({
      ok: true,
      message: cancelled ? MESSAGES.cancelled : MESSAGES.failed,
      /** The bag is deliberately untouched — §2's "keep cart, allow retry". */
      cartCleared: false,
      canRetry: true,
    });
  }),
);

/* --------------------------------- resuming ---------------------------------- */

/**
 * What happened to an attempt.
 *
 * The answer to a refresh mid-payment: the browser kept the intent id, and this
 * says whether it became an order (go to the receipt), is still open (offer a
 * retry), or has expired (start again). Returns nothing that identifies the
 * shopper beyond what they already had.
 */
paymentRoutes.get(
  '/payments/intents/:id',
  ah(async (req, res) => {
    const intent = await PaymentIntentModel.findById(req.params.id).lean<PaymentIntentDoc>();
    if (!intent) notFound('Payment');

    const expired = intent.status === 'created' && intent.expiresAt.getTime() <= Date.now();
    const config = await resolveRazorpayConfig();

    res.json({
      ...publicIntent(intent, config.enabled ? config.keyId : undefined),
      status: expired ? 'expired' : intent.status,
      message:
        intent.status === 'paid'
          ? null
          : expired
            ? MESSAGES.expired
            : intent.status === 'cancelled'
              ? MESSAGES.cancelled
              : intent.status === 'failed'
                ? MESSAGES.failed
                : null,
    });
  }),
);

/* --------------------------------- helpers ----------------------------------- */

async function failIntent(intentId: string, reason: string) {
  await PaymentIntentModel.updateOne(
    { _id: intentId, status: { $ne: 'paid' } },
    { $set: { status: 'failed', lastError: reason.slice(0, 140) } },
  );
}

/** Re-reads an order for the idempotent replay, in the shape the shop expects. */
async function findOrder(orderId: string) {
  const { OrderModel } = await import('../db/models.js');
  const doc = await OrderModel.findById(orderId);
  return doc ? doc.toJSON() : null;
}

/**
 * Waits for the caller that won the claim to finish writing its order.
 *
 * Bounded, short, and it gives up rather than hanging: the loser of a race for
 * one intent should get the winner's receipt, but not at the cost of an HTTP
 * connection held open indefinitely if the winner died mid-write. A few
 * hundred milliseconds covers the ordinary case — the winner is already most
 * of the way through — and the give-up branch tells the shopper to refresh
 * rather than to pay again, which is the important half.
 */
async function awaitSettledOrder(intentId: string, attempts = 6, gapMs = 120) {
  for (let i = 0; i < attempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const current = await PaymentIntentModel.findById(intentId)
      .select('orderId')
      .lean<{ orderId?: string }>();

    if (current?.orderId) {
      // eslint-disable-next-line no-await-in-loop
      const order = await findOrder(current.orderId);
      if (order) return order;
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, gapMs));
  }
  return null;
}
