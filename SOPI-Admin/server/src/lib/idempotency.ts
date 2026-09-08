/*
 * Idempotency for order and payment writes (§10).
 * ===========================================================================
 *   **Never create duplicate orders because of retries, double clicks,
 *   network retries, or payment callbacks.**
 *
 * The online path already had a good answer: a payment intent, fingerprinted
 * on the bag, so two Pay Now clicks reopen one gateway order. What it did not
 * have was a guard on the *last* step — `/verify` read `intent.orderId`, saw
 * null, and wrote an order. Two callbacks arriving together both read null and
 * both wrote one. `claim()` below closes that: the read and the write are one
 * atomic document update, so exactly one caller wins.
 *
 * The COD path had nothing at all. A double-tapped "Place Order" on a phone
 * with a slow connection produced two orders for one bag, and the customer was
 * charged twice on delivery. `withIdempotency` gives it the same protection
 * that every payment API offers: a key names the *intent to act*, the first
 * request performs it, and every replay of that key returns the first
 * request's response instead of acting again.
 *
 * WHY A REPLAY RETURNS THE STORED RESPONSE RATHER THAN AN ERROR
 * ---------------------------------------------------------------------------
 * Because the second request is usually the honest client that never saw the
 * first answer. Returning 409 to it means a shopper who lost their connection
 * mid-checkout is told their order failed when it did not, and orders again.
 * Returning the original receipt is the only answer that is true.
 */

import crypto from 'node:crypto';
import { Schema, model, type Model } from 'mongoose';
import type { Request } from 'express';
import { HttpError } from './http.js';
import { logger } from './logger.js';

/* ---------------------------------- model ----------------------------------- */

interface IdempotencyDoc {
  /** The caller's key, namespaced by scope and by who is calling. */
  _id: string;
  status: 'in_progress' | 'completed';
  /**
   * A digest of the request body. A key replayed with *different* content is a
   * client bug, and answering it with the first request's receipt would hide
   * one order behind another — so it is refused instead.
   */
  requestHash: string;
  responseStatus?: number;
  responseBody?: unknown;
  createdAt: Date;
  expiresAt: Date;
}

const idempotencySchema = new Schema<IdempotencyDoc>(
  {
    _id: String,
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
    requestHash: { type: String, required: true },
    responseStatus: Number,
    responseBody: Schema.Types.Mixed,
    createdAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

/* Keys sweep themselves; 24 hours is far longer than any retry ladder. */
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const IdempotencyModel: Model<IdempotencyDoc> = model<IdempotencyDoc>(
  'IdempotencyKey',
  idempotencySchema,
  'idempotency_keys',
);

const TTL_MS = Number(process.env.IDEMPOTENCY_TTL_MS ?? 24 * 60 * 60 * 1000);

const hash = (value: unknown) =>
  crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');

/**
 * The key for this request.
 *
 * An explicit `Idempotency-Key` header wins — that is the standard, and it is
 * what a well-behaved client sends. Failing that, one is *derived* from the
 * caller and the body, which is what protects the double-tapping shopper whose
 * browser sends no header at all: the same bag from the same person inside the
 * TTL is the same intent.
 *
 * Scoped by caller so two shoppers cannot collide on a derived key, and by
 * route so a key reused across endpoints does not return the wrong shape.
 */
export function idempotencyKey(req: Request, scope: string): string {
  const explicit = req.get('idempotency-key') ?? req.get('x-idempotency-key');
  const caller =
    req.customer?._id ?? req.authUser?.user._id ?? `ip:${req.ip ?? 'unknown'}`;

  if (explicit && /^[A-Za-z0-9._:-]{8,128}$/.test(explicit)) {
    return `${scope}:${caller}:${explicit}`;
  }

  return `${scope}:${caller}:auto:${hash(req.body)}`;
}

export interface IdempotentOutcome<T> {
  /** True when this call did the work; false when it replayed an earlier one. */
  fresh: boolean;
  status: number;
  body: T;
}

/**
 * Runs `perform` at most once per key.
 *
 * The insert is the lock. `_id` is unique by definition, so two concurrent
 * requests with one key produce one insert and one duplicate-key error — no
 * separate locking primitive, and it works across every API instance because
 * the uniqueness is the database's.
 */
export async function withIdempotency<T>(
  key: string,
  body: unknown,
  perform: () => Promise<{ status: number; body: T }>,
): Promise<IdempotentOutcome<T>> {
  const requestHash = hash(body);
  const now = new Date();

  try {
    await IdempotencyModel.create({
      _id: key,
      status: 'in_progress',
      requestHash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + TTL_MS),
    });
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) {
      // The store is unavailable. Failing *open* here is deliberate: refusing
      // to take an order because the deduplication table is down is a worse
      // outcome than the small chance of a duplicate it is guarding against.
      logger.error('idempotency.unavailable', { error });
      const result = await perform();
      return { fresh: true, ...result };
    }

    return replay<T>(key, requestHash);
  }

  try {
    const result = await perform();

    await IdempotencyModel.updateOne(
      { _id: key },
      { $set: { status: 'completed', responseStatus: result.status, responseBody: result.body } },
    );

    return { fresh: true, ...result };
  } catch (error) {
    /*
     * A failed attempt releases its key. Without this a shopper whose order
     * failed on a sold-out line could never retry that bag — the key would sit
     * `in_progress` for 24 hours and every retry would be told to wait.
     */
    await IdempotencyModel.deleteOne({ _id: key }).catch(() => undefined);
    throw error;
  }
}

/**
 * The replay branch: somebody else holds this key.
 *
 * Either they finished — hand back what they got — or they are still working,
 * in which case 409 with a Retry-After is the honest answer. Waiting on a lock
 * would hold an HTTP connection open behind another request that may itself be
 * waiting on a gateway.
 */
async function replay<T>(key: string, requestHash: string): Promise<IdempotentOutcome<T>> {
  const existing = await IdempotencyModel.findById(key).lean<IdempotencyDoc>();

  if (!existing) {
    // It expired between the failed insert and this read. Vanishingly rare,
    // and the safe answer is to make the caller retry rather than guess.
    const error = new HttpError(409, 'That request is already being processed. Please try again.');
    error.retryAfter = 2;
    throw error;
  }

  if (existing.requestHash !== requestHash) {
    throw new HttpError(
      422,
      'This request key has already been used for a different order. Please start a new checkout.',
    );
  }

  if (existing.status === 'completed') {
    logger.info('idempotency.replayed', { detail: key.slice(0, 64) });
    return {
      fresh: false,
      status: existing.responseStatus ?? 200,
      body: existing.responseBody as T,
    };
  }

  const error = new HttpError(
    409,
    'Your order is being placed. Please wait a moment before trying again.',
  );
  error.retryAfter = 2;
  throw error;
}

/* ------------------------- atomic claim, for intents ------------------------ */

/**
 * Compare-and-set on one field of one document.
 *
 * Used by the payment verifier to claim a payment intent: the filter says
 * "only if nobody has claimed this yet", and MongoDB evaluates it under the
 * document lock, so two simultaneous Razorpay callbacks produce one winner.
 * The loser reads the intent again and finds the order the winner wrote —
 * which is the same receipt, which is the correct answer.
 */
export async function claimOnce<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>,
  filter: Record<string, unknown>,
  set: Record<string, unknown>,
): Promise<T | null> {
  const doc = await model
    .findOneAndUpdate(filter, { $set: set }, { new: true })
    .lean<T>();
  return doc ?? null;
}
