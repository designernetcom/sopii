/*
 * Tests for the rules that must not break (§21).
 * ===========================================================================
 * These are not unit tests of pure functions. Every one of them exercises a
 * *concurrency* property against a real MongoDB, because every bug they guard
 * against is invisible to a single-threaded test:
 *
 *   - overselling needs two writers racing for the same unit;
 *   - duplicate orders need two requests carrying the same intent;
 *   - a coupon over its limit needs more redemptions than the limit, at once.
 *
 * A test that calls the function once always passes, which is exactly why the
 * original code shipped with all three races in it.
 *
 * Run with:  npm test        (in server/)
 *
 * An embedded mongod is started if `MONGODB_URI` is unreachable, so this runs
 * on a clean machine with no setup — the same fallback the server itself uses.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { CouponModel, ProductModel } from '../db/models.js';
import { claimStock, releaseStock, type StockClaim } from '../lib/inventory.js';
import { nextSequence, seedSequence } from '../lib/ids.js';
import { withIdempotency } from '../lib/idempotency.js';
import { nextId } from '../lib/http.js';

/* --------------------------------- harness ---------------------------------- */

let embedded: { stop: () => Promise<boolean> } | null = null;

before(async () => {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/sopii_test';

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
  } catch {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    embedded = server;
    await mongoose.connect(server.getUri('sopii_test'));
  }
});

after(async () => {
  await mongoose.disconnect();
  if (embedded) await embedded.stop();
});

/** A stock-controlled product with a known number of units. */
async function makeProduct(stock: number, variants: { id: string; stock: number }[] = []) {
  const id = nextId('tst');
  await ProductModel.create({
    _id: id,
    name: `Test product ${id}`,
    sku: `SKU-${id}`,
    slug: `slug-${id}`,
    price: 1000,
    stock,
    trackInventory: true,
    allowBackorders: false,
    status: 'published',
    variants: variants.map((variant) => ({ ...variant, sku: `${id}-${variant.id}` })),
  });
  return id;
}

const stockOf = async (id: string) =>
  (await ProductModel.findById(id, { stock: 1 }).lean<{ stock: number }>())?.stock ?? 0;

/* ------------------------------- inventory ---------------------------------- */

describe('inventory: atomic stock claims (§11)', () => {
  it('never oversells when more buyers arrive than there are units', async () => {
    const UNITS = 5;
    const BUYERS = 40;
    const productId = await makeProduct(UNITS);

    const claim: StockClaim = {
      productId,
      quantity: 1,
      productName: 'Test product',
    };

    /*
     * The whole point: fired together, not in sequence. The previous
     * implementation read the stock, decided there was enough, and then
     * decremented — so all forty of these would have seen "5 available" and all
     * forty would have succeeded, leaving stock at -35.
     */
    const results = await Promise.all(
      Array.from({ length: BUYERS }, () => claimStock([{ ...claim }])),
    );

    const granted = results.filter((result) => result.ok).length;
    const remaining = await stockOf(productId);

    assert.equal(granted, UNITS, `expected exactly ${UNITS} successful claims, got ${granted}`);
    assert.equal(remaining, 0, `expected stock to land on 0, got ${remaining}`);
    assert.ok(remaining >= 0, 'stock must never go negative');
  });

  it('refuses a claim larger than the units available', async () => {
    const productId = await makeProduct(3);

    const result = await claimStock([
      { productId, quantity: 4, productName: 'Test product' },
    ]);

    assert.equal(result.ok, false);
    assert.equal(await stockOf(productId), 3, 'a refused claim must not move stock');
  });

  it('releases everything it took when a later line cannot be filled', async () => {
    // Two products; the second has nothing left. The bag must fail as a whole
    // and the first product's units must go back on the shelf.
    const plenty = await makeProduct(10);
    const empty = await makeProduct(0);

    const result = await claimStock([
      { productId: plenty, quantity: 2, productName: 'Plenty' },
      { productId: empty, quantity: 1, productName: 'Empty' },
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.failedOn, empty);
    assert.equal(
      await stockOf(plenty),
      10,
      'the first line must be compensated when a later one fails',
    );
  });

  it('draws a variant line from the variant, and rejects it when that variant is out', async () => {
    const productId = await makeProduct(10, [
      { id: 'v-red-m', stock: 1 },
      { id: 'v-blue-l', stock: 9 },
    ]);

    const first = await claimStock([
      { productId, quantity: 1, variantId: 'v-red-m', productName: 'Test' },
    ]);
    const second = await claimStock([
      { productId, quantity: 1, variantId: 'v-red-m', productName: 'Test' },
    ]);

    assert.equal(first.ok, true, 'the one available red/M must sell');
    assert.equal(second.ok, false, 'a second red/M must be refused even though the product has stock');
  });

  it('leaves a backorder-enabled product alone', async () => {
    const productId = await makeProduct(0);

    const result = await claimStock([
      { productId, quantity: 3, productName: 'Test', unlimited: true },
    ]);

    assert.equal(result.ok, true, 'backorders are a policy, not a hole in the guard');
    assert.equal(await stockOf(productId), 0, 'an unlimited line must not move the counter');
  });

  it('puts stock back exactly as it was taken', async () => {
    const productId = await makeProduct(6);
    const claims = [{ productId, quantity: 2, productName: 'Test' }];

    await claimStock(claims);
    assert.equal(await stockOf(productId), 4);

    await releaseStock(claims);
    assert.equal(await stockOf(productId), 6, 'a release must restore the original count');
  });
});

/* --------------------------------- ordering --------------------------------- */

describe('order codes: atomic sequence (§10)', () => {
  it('hands every concurrent caller a distinct number', async () => {
    const name = `test_seq_${Date.now()}`;
    const CALLERS = 100;

    const numbers = await Promise.all(
      Array.from({ length: CALLERS }, () => nextSequence(name, 10_000)),
    );

    assert.equal(
      new Set(numbers).size,
      CALLERS,
      'a duplicate here is two orders sharing one code',
    );
  });

  it('never moves a seeded sequence backwards', async () => {
    const name = `test_seed_${Date.now()}`;

    await seedSequence(name, 500);
    await seedSequence(name, 100); // an older instance, arriving late

    const next = await nextSequence(name, 0);
    assert.ok(next > 500, `expected a value past the high-water mark, got ${next}`);
  });
});

/* ------------------------------- idempotency -------------------------------- */

describe('idempotency: one action per key (§10)', () => {
  it('performs the work once for ten simultaneous identical requests', async () => {
    const key = `test:${nextId('idem')}`;
    const body = { items: [{ productId: 'p1', quantity: 1 }] };

    let performed = 0;
    const perform = async () => {
      performed += 1;
      // A real handler does I/O; the delay is what makes the race real.
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { status: 201, body: { code: 'SOP99999' } };
    };

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => withIdempotency(key, body, perform)),
    );

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');

    assert.equal(performed, 1, 'the body must run exactly once');
    assert.ok(fulfilled.length >= 1, 'at least one caller must receive the result');
    // Everyone who got an answer got the *same* answer.
    for (const attempt of fulfilled) {
      const value = (attempt as PromiseFulfilledResult<{ body: { code: string } }>).value;
      assert.equal(value.body.code, 'SOP99999');
    }
  });

  it('replays the stored response to a later retry', async () => {
    const key = `test:${nextId('idem')}`;
    const body = { total: 4200 };
    let performed = 0;

    const perform = async () => {
      performed += 1;
      return { status: 201, body: { code: 'SOP12345' } };
    };

    const first = await withIdempotency(key, body, perform);
    const second = await withIdempotency(key, body, perform);

    assert.equal(performed, 1);
    assert.equal(first.fresh, true, 'the first caller did the work');
    assert.equal(second.fresh, false, 'the second replayed it');
    assert.deepEqual(second.body, first.body, 'a replay must return the original receipt');
  });

  it('refuses a key reused for a different request', async () => {
    const key = `test:${nextId('idem')}`;
    const perform = async () => ({ status: 201, body: { ok: true } });

    await withIdempotency(key, { total: 100 }, perform);

    await assert.rejects(
      () => withIdempotency(key, { total: 999 }, perform),
      /already been used for a different order/i,
      'the same key with a different body must not return the first order',
    );
  });

  it('releases the key when the work throws, so a retry can succeed', async () => {
    const key = `test:${nextId('idem')}`;
    const body = { items: [] };
    let attempts = 0;

    const perform = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('sold out');
      return { status: 201, body: { code: 'SOP55555' } };
    };

    await assert.rejects(() => withIdempotency(key, body, perform), /sold out/);

    const retry = await withIdempotency(key, body, perform);
    assert.equal(retry.body.code, 'SOP55555', 'a failed attempt must not lock the bag out');
  });
});

/* ---------------------------------- coupons --------------------------------- */

describe('coupons: usage limits under concurrency', () => {
  it('cannot be redeemed past its limit by simultaneous checkouts', async () => {
    const id = nextId('cpn');
    const LIMIT = 5;

    await CouponModel.create({
      _id: id,
      code: `TEST${Date.now()}`,
      discountType: 'fixed',
      discountValue: 100,
      usageLimit: LIMIT,
      usedCount: 0,
      status: 'active',
    });

    /*
     * The same guarded increment `writeOrder` performs. A bare `$inc` would
     * take all thirty of these and leave `usedCount` at 30 on a coupon with a
     * limit of 5 — the discount honoured six times more often than the store
     * agreed to.
     */
    const redeem = () =>
      CouponModel.updateOne(
        {
          _id: id,
          $or: [{ usageLimit: { $lte: 0 } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }],
        },
        { $inc: { usedCount: 1 } },
      );

    const results = await Promise.all(Array.from({ length: 30 }, redeem));
    const applied = results.filter((result) => result.modifiedCount === 1).length;

    const finalCoupon = await CouponModel.findById(id, { usedCount: 1 }).lean<{
      usedCount: number;
    }>();

    assert.equal(applied, LIMIT, `expected exactly ${LIMIT} redemptions, got ${applied}`);
    assert.equal(finalCoupon?.usedCount, LIMIT);
  });
});
