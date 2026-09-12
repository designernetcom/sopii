/*
 * Removes the seeded demo stock movements.
 * ---------------------------------------------------------------------------
 * `npm run seed` writes 420 invented stock movements so that a fresh install
 * has a Stock History page with something on it — restocks from a weaver
 * cluster, marketplace order syncs, count corrections. None of it happened.
 *
 * On a store going live that is worse than an empty page, because stock
 * history is the one screen in the panel that is supposed to be evidence: it
 * answers "who changed this number, when, and why". Fiction mixed into an
 * audit trail is not a cosmetic problem.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WILL NOT TOUCH
 * ---------------------------------------------------------------------------
 * - **Real movements.** The seed numbers its records `stk_0001` … `stk_0420`
 *   (`uid()` in `src/data/seed.ts`). Every movement written since — by a stock
 *   adjustment in the panel, by an order, by a cancellation putting stock back
 *   — gets `stk_<base36 ms><9 random chars>` from `nextId()`, which the
 *   `^stk_\d{4}$` pattern cannot match. Real history is invisible to this
 *   script by construction.
 *
 * - **Stock levels.** Nothing downstream derives a quantity from these rows;
 *   `product.stock` is the number of record and it is written directly. So
 *   this deletes the story, never the state — no product moves.
 *
 * For clearing *real* history there is now a Clear button on the Stock History
 * page (and `DELETE /inventory/history`), which is the right tool for that job
 * because it asks for a date range. This script is only for the demo rows.
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *   npm run prune:demo-stock-history              # dry run — deletes nothing
 *   npm run prune:demo-stock-history -- --confirm # delete
 */

import { pathToFileURL } from 'node:url';

import { connectDb, disconnectDb } from './connect.js';
import { StockMovementModel } from './models.js';

/** The id shape `npm run seed` writes, and nothing else. */
const SEED_ID = /^stk_\d{4}$/;

async function main() {
  const confirm = process.argv.includes('--confirm');

  await connectDb();

  const doomed = await StockMovementModel.find({ _id: { $regex: SEED_ID } })
    .select('_id productName sku type at')
    .sort({ at: -1 })
    .lean<{ _id: string; productName?: string; sku?: string; type?: string; at?: string }[]>();

  const byType: Record<string, number> = {};
  for (const movement of doomed) {
    const key = movement.type ?? '?';
    byType[key] = (byType[key] ?? 0) + 1;
  }

  for (const movement of doomed.slice(0, 10)) {
    console.log(
      `[stock] ${confirm ? 'deleting' : 'would delete'} ${movement._id} → ${movement.type ?? '?'} · ${movement.productName ?? '(no product)'} (${movement.sku ?? '—'})`,
    );
  }
  if (doomed.length > 10) console.log(`[stock] …and ${doomed.length - 10} more`);

  let deleted = 0;
  if (confirm && doomed.length) {
    const result = await StockMovementModel.deleteMany({ _id: { $regex: SEED_ID } });
    deleted = result.deletedCount ?? 0;
    console.log(`[stock] deleted ${deleted} movement(s)`);
  }

  const remaining = await StockMovementModel.countDocuments({});

  console.log('\n──────────────── demo stock history ────────────────');
  console.log(`  Seed-id movements found    ${doomed.length}`);
  for (const [type, count] of Object.entries(byType)) {
    console.log(`      ${type.padEnd(14)} ${count}`);
  }
  console.log(`  ${confirm ? 'Deleted                  ' : 'To delete                '}  ${confirm ? deleted : doomed.length}`);
  console.log(`  Real movements kept        ${confirm ? remaining : remaining - doomed.length}`);
  console.log('  Product stock levels       untouched');
  console.log('────────────────────────────────────────────────────');

  if (!confirm) {
    console.log('\n  DRY RUN — nothing was deleted.');
    console.log('  Re-run with --confirm to apply.\n');
  }

  await disconnectDb();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[stock] failed:', error?.message ?? error);
    process.exit(1);
  });
}
