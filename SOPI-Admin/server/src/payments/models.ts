/*
 * Payment intents.
 * ===========================================================================
 * The record that exists *between* "the shopper pressed Pay Now" and "there is
 * an order". It holds the server's own pricing of the bag, frozen, plus the
 * gateway order it was opened against — and it is the reason an unpaid attempt
 * never becomes an order.
 *
 * Why a separate collection rather than writing a `pending` order and
 * confirming it:
 *
 *   - an order that exists has decremented stock, incremented a coupon's usage
 *     count and rung the bell in the admin panel. Doing that for every
 *     abandoned popup would quietly sell out a product to people who never
 *     paid;
 *   - "never create a successful/paid order before payment is verified" is
 *     easiest to guarantee when the order-writing code has exactly one caller
 *     for online payments, and that caller runs after verification;
 *   - a refresh mid-payment has something to resume from. The browser keeps the
 *     intent id, and `GET /payments/intents/:id` answers whether it became an
 *     order.
 *
 * The frozen quote is deliberately the *input* to pricing (item ids and
 * quantities, the coupon code, the delivery state) rather than the computed
 * total. The total is recomputed at verification time and compared against what
 * the gateway captured, so a price that changed mid-payment is caught rather
 * than honoured from a stale snapshot.
 */

import { Schema, model, type Model } from 'mongoose';
import type { Address } from '@/types';

/**
 * `settling` is the state between "one caller has claimed this intent" and
 * "the order exists". It is what makes the claim in `routes.ts` visible: a
 * second callback that finds the intent already settling knows to wait for the
 * winner's order rather than write a second one.
 */
export const INTENT_STATUSES = [
  'created',
  'settling',
  'paid',
  'failed',
  'cancelled',
  'expired',
] as const;
export type PaymentIntentStatus = (typeof INTENT_STATUSES)[number];

/** One line of the bag, as the shopper chose it. */
export interface IntentLine {
  productId: string;
  quantity: number;
  size?: string;
  color?: string;
}

export interface PaymentIntentDoc {
  _id: string;
  status: PaymentIntentStatus;

  /** Always `razorpay` today; the column exists so a second gateway is additive. */
  provider: 'razorpay';
  /** What the customer picked — `razorpay` or `upi`. Recorded on the order. */
  gatewayKey: string;

  /** The bag, the address and the coupon this attempt is for. */
  email: string;
  address: Address;
  items: IntentLine[];
  couponCode?: string;
  notes?: string;
  customerId?: string;

  /**
   * A digest of everything above. Two Pay Now clicks for the same bag find the
   * same open intent instead of opening a second gateway order — §5's
   * duplicate-order guard, enforced on the server rather than by a disabled
   * button.
   */
  fingerprint: string;

  /** The amount the gateway order was created for, in whole rupees and paise. */
  amount: number;
  amountPaise: number;
  currency: string;

  providerOrderId?: string;
  providerPaymentId?: string;
  /** Set only once the HMAC checked out *and* Razorpay confirmed the payment. */
  verifiedAt?: Date;

  /** The order this became. Its presence is what makes verification idempotent. */
  orderId?: string;
  orderCode?: string;

  /** How many times a payment has been attempted against this intent. */
  attempts: number;
  /** A short, non-sensitive category — never a gateway response body. */
  lastError?: string;

  ip?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentIntentSchema = new Schema<PaymentIntentDoc>(
  {
    _id: String,
    status: { type: String, enum: INTENT_STATUSES, default: 'created', index: true },

    provider: { type: String, default: 'razorpay' },
    gatewayKey: { type: String, required: true },

    email: { type: String, required: true, index: true },
    address: { type: Schema.Types.Mixed, required: true },
    items: {
      type: [
        new Schema<IntentLine>(
          {
            productId: { type: String, required: true },
            quantity: { type: Number, required: true },
            size: String,
            color: String,
          },
          { _id: false, versionKey: false },
        ),
      ],
      required: true,
    },
    couponCode: String,
    notes: String,
    customerId: { type: String, index: true, sparse: true },

    fingerprint: { type: String, required: true, index: true },

    amount: { type: Number, required: true },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR' },

    /*
     * Sparse-unique: one intent per gateway order, so a signature replayed
     * against a second intent cannot mint a second SOPII order.
     */
    providerOrderId: { type: String, index: true, unique: true, sparse: true },
    providerPaymentId: { type: String, index: true, sparse: true },
    verifiedAt: Date,

    orderId: { type: String, index: true, sparse: true },
    orderCode: String,

    attempts: { type: Number, default: 0 },
    lastError: String,

    ip: String,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

/*
 * Abandoned intents sweep themselves. The grace period keeps a just-expired one
 * readable long enough for the storefront to say "that payment session has
 * ended" rather than 404ing at somebody who refreshed at the wrong moment.
 */
paymentIntentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

/*
 * The reuse lookup: "is there an open intent for this exact bag?", which runs
 * on every Pay Now. Without this compound index the query filters on
 * `fingerprint` and then scans the matches for status and expiry — fine at a
 * thousand intents, a growing scan at ten million. Ordered equality-first, then
 * the sort field, so it is served from the index alone.
 */
paymentIntentSchema.index({ fingerprint: 1, status: 1, expiresAt: 1, createdAt: -1 });

export const PaymentIntentModel: Model<PaymentIntentDoc> = model<PaymentIntentDoc>(
  'PaymentIntent',
  paymentIntentSchema,
  'payment_intents',
);
