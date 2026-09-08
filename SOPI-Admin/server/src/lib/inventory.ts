/*
 * Stock, taken atomically (§11).
 * ===========================================================================
 * THE BUG THIS FILE EXISTS TO FIX
 * ---------------------------------------------------------------------------
 * Checkout used to read stock (`quoteCart`) and then decrement it
 * (`$inc: { stock: -qty }`) as two separate operations. Between the read and
 * the write, anything can happen — and at any real concurrency, it does:
 *
 *     stock = 1
 *     A: reads 1  ─┐
 *     B: reads 1  ─┘  both see "one left"
 *     A: $inc -1      stock = 0
 *     B: $inc -1      stock = -1     ← two customers, one saree
 *
 * `$inc` is atomic, which is what makes this so easy to get wrong: the
 * *arithmetic* never loses an update, so the counter is always right. What is
 * not atomic is the *decision*, and the decision is the thing that oversells.
 *
 * THE FIX
 * ---------------------------------------------------------------------------
 * Put the decision inside the write. `updateOne({ _id, stock: { $gte: qty } },
 * { $inc: { stock: -qty } })` is a single atomic document operation: MongoDB
 * re-evaluates the filter under the document lock, so exactly one of two
 * concurrent claims for the last unit matches and the other reports
 * `modifiedCount: 0`. B is then told the item just sold out — which is true,
 * and is the correct thing to tell them.
 *
 * MULTI-LINE ORDERS, AND WHY THERE IS A COMPENSATION PATH
 * ---------------------------------------------------------------------------
 * A bag with three products is three document updates, and MongoDB gives no
 * atomicity across documents without a transaction. Transactions need a replica
 * set; a store running a standalone mongod would simply fail. So this claims
 * line by line and **releases what it already took** if a later line cannot be
 * satisfied — a compensating action rather than a rollback.
 *
 * That is weaker than a transaction in exactly one way: between the failed
 * claim and the release, the units are briefly held. Nobody is oversold, and
 * the window is a few milliseconds. `USE_TRANSACTIONS=true` opts into the
 * stronger guarantee on a deployment that has a replica set, which is what the
 * recommended production topology has.
 */

import mongoose from 'mongoose';
import { ProductModel } from '../db/models.js';
import { logger } from './logger.js';

export interface StockClaim {
  productId: string;
  quantity: number;
  /** When the shopper picked a variant, its stock is what the line draws on. */
  variantId?: string;
  /** For the message a shopper sees when it fails. */
  productName: string;
  /** Products with this set are not stock-controlled and always succeed. */
  unlimited?: boolean;
}

export interface ClaimResult {
  ok: boolean;
  /** The line that could not be filled, when `ok` is false. */
  failedOn?: string;
  message?: string;
}

const useTransactions = process.env.USE_TRANSACTIONS === 'true';

/* ------------------------------- single line -------------------------------- */

/**
 * Takes `quantity` units of one line, or reports that it could not.
 *
 * The filter carries the guard, which is the whole point — see the file header.
 * A variant line guards the variant's own stock through the positional
 * operator, so a bag holding the last "red / M" cannot be filled from the
 * "blue / L" pile.
 */
async function claimOne(claim: StockClaim, session?: mongoose.ClientSession): Promise<boolean> {
  if (claim.unlimited) return true;

  const options = session ? { session } : {};

  if (claim.variantId) {
    const result = await ProductModel.updateOne(
      {
        _id: claim.productId,
        variants: { $elemMatch: { id: claim.variantId, stock: { $gte: claim.quantity } } },
      },
      {
        $inc: {
          'variants.$.stock': -claim.quantity,
          stock: -claim.quantity,
          unitsSold: claim.quantity,
        },
      },
      options,
    );
    return result.modifiedCount === 1;
  }

  const result = await ProductModel.updateOne(
    { _id: claim.productId, stock: { $gte: claim.quantity } },
    { $inc: { stock: -claim.quantity, unitsSold: claim.quantity } },
    options,
  );
  return result.modifiedCount === 1;
}

/** The compensating write: puts units back exactly as they were taken. */
async function releaseOne(claim: StockClaim, session?: mongoose.ClientSession) {
  if (claim.unlimited) return;
  const options = session ? { session } : {};

  if (claim.variantId) {
    await ProductModel.updateOne(
      { _id: claim.productId, 'variants.id': claim.variantId },
      {
        $inc: {
          'variants.$.stock': claim.quantity,
          stock: claim.quantity,
          unitsSold: -claim.quantity,
        },
      },
      options,
    );
    return;
  }

  await ProductModel.updateOne(
    { _id: claim.productId },
    { $inc: { stock: claim.quantity, unitsSold: -claim.quantity } },
    options,
  );
}

/* -------------------------------- whole bag --------------------------------- */

/**
 * Claims every line of a bag, or none of them.
 *
 * Called from `writeOrder` **before** the order document is written, so an
 * order that exists is an order whose stock is already committed. Doing it the
 * other way round — write the order, then take the stock — is how a store ends
 * up with confirmed orders it cannot fulfil.
 */
export async function claimStock(claims: StockClaim[]): Promise<ClaimResult> {
  const real = claims.filter((claim) => !claim.unlimited && claim.quantity > 0);
  if (!real.length) return { ok: true };

  if (useTransactions) return claimInTransaction(real);

  const taken: StockClaim[] = [];

  for (const claim of real) {
    // Sequential on purpose: `Promise.all` would fire every claim before the
    // first failure is known, so the compensation would have more to undo and
    // the held window would be wider, not narrower.
    // eslint-disable-next-line no-await-in-loop
    const ok = await claimOne(claim);
    if (ok) {
      taken.push(claim);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await Promise.all(taken.map((entry) => releaseOne(entry)));

    logger.warn('inventory.claim_failed', {
      detail: `${claim.productName} (${claim.productId}) — wanted ${claim.quantity}`,
    });

    return {
      ok: false,
      failedOn: claim.productId,
      message: `${claim.productName} has just sold out. Please review your bag and try again.`,
    };
  }

  return { ok: true };
}

/**
 * The same thing, inside a transaction.
 *
 * Requires a replica set (a single-node one is fine, and is what the
 * recommended topology has anyway). The guarantee is stronger — no window in
 * which units are held by a claim that is about to be undone — and the cost is
 * a deployment constraint, which is why it is opt-in rather than the default.
 */
async function claimInTransaction(claims: StockClaim[]): Promise<ClaimResult> {
  const session = await mongoose.startSession();

  try {
    let failure: ClaimResult | null = null;

    await session.withTransaction(async () => {
      for (const claim of claims) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await claimOne(claim, session);
        if (!ok) {
          failure = {
            ok: false,
            failedOn: claim.productId,
            message: `${claim.productName} has just sold out. Please review your bag and try again.`,
          };
          // Aborting is what makes this all-or-nothing; nothing to compensate.
          await session.abortTransaction();
          return;
        }
      }
    });

    return failure ?? { ok: true };
  } catch (error) {
    logger.error('inventory.transaction_failed', { error });
    return {
      ok: false,
      message: 'We could not reserve your items just now. Please try again in a moment.',
    };
  } finally {
    await session.endSession();
  }
}

/**
 * Returns stock to the shelf — a cancelled order, or an order that failed
 * after its stock was claimed.
 *
 * Exported because §11's consistency requirement runs in both directions: the
 * same care that stops overselling has to stop stock being lost when an order
 * does not complete.
 */
export async function releaseStock(claims: StockClaim[]) {
  await Promise.all(claims.map((claim) => releaseOne(claim)));
}
