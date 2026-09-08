/*
 * Identifiers that survive horizontal scaling (§19).
 * ===========================================================================
 * The previous generator was `Date.now().toString(36) + (++counter)`. On one
 * process that is unique. On three API instances behind a load balancer it is
 * not: two processes that start together share a counter value and can share a
 * millisecond, and the two orders written in that millisecond collide on `_id`
 * — one insert throws, and a shopper who paid gets an error instead of a
 * receipt.
 *
 * The fix is the standard one: keep the sortable time prefix, and make the
 * suffix random rather than sequential. 72 bits of randomness per millisecond
 * puts a collision beyond any traffic this store will ever see, and the ids
 * still sort chronologically as strings, which is what the seeded data and the
 * admin panel's "newest first" ordering already rely on.
 *
 * Order *codes* are a different problem and get a different answer below: they
 * are shown to customers, so they must be short, sequential and gapless-ish —
 * which means a real atomic counter in the database, not randomness.
 */

import crypto from 'node:crypto';
import { Schema, model, type Model } from 'mongoose';

/* ------------------------------- random ids -------------------------------- */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomSuffix(length: number) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * `prefix_<base36 ms><9 random chars>`.
 *
 * Same shape the seed data uses, so nothing downstream had to change; the
 * difference is that two processes can generate these at the same instant
 * without colliding.
 */
export function nextId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${randomSuffix(9)}`;
}

/* ----------------------------- atomic counters ------------------------------ */

interface CounterDoc {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterDoc>(
  { _id: String, seq: { type: Number, default: 0 } },
  { versionKey: false },
);

export const CounterModel: Model<CounterDoc> = model<CounterDoc>(
  'Counter',
  counterSchema,
  'counters',
);

/**
 * The next value of a named sequence.
 *
 * `findOneAndUpdate` with `$inc` is atomic on a single document in MongoDB, so
 * this is safe across any number of API instances and any number of concurrent
 * checkouts: every caller gets a distinct number, and nobody has to hold a
 * lock. That is the whole reason it exists — the previous "read the highest
 * code, add one, check it is free" loop is a read-then-write race that hands
 * two simultaneous shoppers the same order code.
 */
export async function nextSequence(name: string, startAt = 0): Promise<number> {
  const doc = await CounterModel.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 }, $setOnInsert: { _id: name } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean<CounterDoc>();

  const seq = doc?.seq ?? 1;
  return startAt + seq;
}

/**
 * Seeds a counter from the data already in a collection, once, at boot.
 *
 * Without this a store upgrading from the old generator would restart its
 * order codes at SOP10101 and collide with everything it has already shipped.
 * `$max` is used rather than `$set` so a second instance running the same
 * bootstrap cannot drag the counter backwards.
 */
export async function seedSequence(name: string, currentHighest: number) {
  if (!Number.isFinite(currentHighest) || currentHighest <= 0) return;
  await CounterModel.updateOne(
    { _id: name },
    { $max: { seq: Math.floor(currentHighest) }, $setOnInsert: { _id: name } },
    { upsert: true },
  );
}
