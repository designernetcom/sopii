/*
 * Removes the seeded demo orders.
 * ---------------------------------------------------------------------------
 * `npm run seed` writes 1,248 invented orders across the trailing year so that
 * a fresh install has a dashboard with revenue on it, an order pipeline with
 * every status represented, and reports that are not a flat line. On a store
 * about to take real money that history is actively misleading: every figure
 * on the dashboard is fiction, and the real orders are a handful of rows lost
 * among twelve hundred imaginary ones.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WILL NOT TOUCH
 * ---------------------------------------------------------------------------
 * - **Real orders.** The seed numbers its records `ord_0001` … `ord_1248`
 *   (`src/data/orders.ts`) with codes SOP10101–SOP11348. An order placed
 *   through the storefront gets `ord_<base36 ms><9 random chars>` from
 *   `nextId()` and a code from the database counter, so `^ord_\d{4}$` cannot
 *   match one. Real orders are invisible to this script by construction.
 *
 * - **The order code counter.** It lives in its own collection and is never
 *   rewound, so the next real order carries on from where the last one left
 *   off — deleting history can never cause a duplicate order code.
 *
 * - **Stock.** Deleting an order is not cancelling it, so nothing goes back on
 *   the shelf. The quantities on the products are left exactly as they are.
 *
 * What it *does* fix up is customer rollups: `ordersCount` and `totalSpent`
 * are a cache of the order collection, so every surviving customer who had one
 * of these orders is recomputed from what is left (see `lib/customers.ts`).
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *   npm run prune:demo-orders              # dry run — deletes nothing
 *   npm run prune:demo-orders -- --confirm # delete
 */

import { pathToFileURL } from 'node:url';

import { connectDb, disconnectDb } from './connect.js';
import { CustomerModel, OrderModel } from './models.js';
import { recomputeCustomerRollups } from '../lib/customers.js';

/** The id shape `npm run seed` writes, and nothing else. */
const SEED_ID = /^ord_\d{4}$/;

const CHUNK = 1000;

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const inr = (paise: number) => `₹${Math.round(paise).toLocaleString('en-IN')}`;

async function main() {
  const confirm = process.argv.includes('--confirm');

  await connectDb();

  const doomed = await OrderModel.find({ _id: { $regex: SEED_ID } })
    .select('_id code customerId customerName total status placedAt')
    .lean<
      {
        _id: string;
        code?: string;
        customerId?: string;
        customerName?: string;
        total?: number;
        status?: string;
      }[]
    >();

  const byStatus: Record<string, number> = {};
  let revenue = 0;
  for (const order of doomed) {
    const key = order.status ?? '?';
    byStatus[key] = (byStatus[key] ?? 0) + 1;
    if (key !== 'cancelled' && key !== 'returned') revenue += Number(order.total) || 0;
  }

  /* Only customers that still exist need recomputing — the demo buyers were
     themselves removed by `prune:demo-customers`, and a rollup on a deleted
     record is nobody's problem. */
  const buyers = [...new Set(doomed.map((order) => order.customerId).filter(Boolean))] as string[];
  const survivors: string[] = [];
  for (const batch of chunked(buyers)) {
    const found = await CustomerModel.find({ _id: { $in: batch } })
      .select('_id')
      .lean<{ _id: string }[]>();
    survivors.push(...found.map((customer) => customer._id));
  }

  for (const order of doomed.slice(0, 10)) {
    console.log(
      `[orders] ${confirm ? 'deleting' : 'would delete'} ${order._id} → #${order.code ?? '?'} · ${order.status ?? '?'} · ${order.customerName ?? '(no customer)'}`,
    );
  }
  if (doomed.length > 10) console.log(`[orders] …and ${doomed.length - 10} more`);

  let deleted = 0;
  if (confirm && doomed.length) {
    for (const batch of chunked(doomed.map((order) => order._id))) {
      const result = await OrderModel.deleteMany({ _id: { $in: batch } });
      deleted += result.deletedCount ?? 0;
    }
    console.log(`[orders] deleted ${deleted} order(s)`);

    for (const customerId of survivors) {
      const rollups = await recomputeCustomerRollups(customerId);
      if (rollups) {
        console.log(
          `[orders] recomputed ${customerId} → ${rollups.ordersCount} order(s), ${inr(rollups.totalSpent)}, ${rollups.tier}`,
        );
      }
    }
  }

  const remaining = await OrderModel.countDocuments({});

  console.log('\n───────────────────── demo orders ─────────────────────');
  console.log(`  Seed-id orders found       ${doomed.length}`);
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`      ${status.padEnd(14)} ${count}`);
  }
  console.log(`  Fictional revenue removed  ${inr(revenue)}`);
  console.log(`  ${confirm ? 'Deleted                  ' : 'To delete                '}  ${confirm ? deleted : doomed.length}`);
  console.log(`  Real orders kept           ${confirm ? remaining : remaining - doomed.length}`);
  console.log(`  Customers recomputed       ${confirm ? survivors.length : `${survivors.length} (would)`}`);
  console.log('  Product stock levels       untouched');
  console.log('  Order code counter         untouched');
  console.log('───────────────────────────────────────────────────────');

  if (!confirm) {
    console.log('\n  DRY RUN — nothing was deleted.');
    console.log('  Re-run with --confirm to apply.\n');
  }

  await disconnectDb();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[orders] failed:', error?.message ?? error);
    process.exit(1);
  });
}
