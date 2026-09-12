/*
 * Removes the seeded demo customers.
 * ---------------------------------------------------------------------------
 * `npm run seed` writes 8,540 invented shoppers — Ritu Shetty, Lakshmi
 * Chatterjee and the rest — so that a fresh install has an order history, a
 * tier breakdown and a customer list to render. On a store that is going live
 * they are the opposite of useful: the Customers page reads as busy when it
 * should read as empty, and every count in the dashboard is fiction.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WILL NOT TOUCH
 * ---------------------------------------------------------------------------
 * A customer is only ever deleted when both of these hold.
 *
 * - **Its id is a seed id.** The seed numbers its records `cus_0001` …
 *   `cus_8540` (`uid()` in `src/data/seed.ts`). A customer the running shop
 *   created gets `cus_<base36 ms><9 random chars>` from `lib/ids.ts`, which
 *   `^cus_\d{4}$` cannot match. Real shoppers are therefore invisible to this
 *   script by construction, not by a flag someone has to remember to set.
 *
 * - **Nobody has claimed it.** Signing up with an email that matches a seeded
 *   record attaches the account to that row rather than duplicating it
 *   (`ensureCustomerRecord` in `auth/users.ts`), which makes a seed id a real
 *   person's account. Those rows carry a `passwordHash`, a linked auth
 *   identity, or both; they are skipped and counted separately.
 *
 * Orders and reviews are left alone by default. Both embed `customerName`,
 * `customerEmail` and `customerPhone` at the time they were placed, so the
 * Orders page, the invoices and the review queue all keep rendering exactly as
 * before — the only thing that breaks is the link through to a customer record
 * that no longer exists. Pass `--cascade` to delete those too.
 *
 * Nothing here is recoverable. `npm run seed` writes a fresh demo catalogue if
 * you want one back, but it invents new people rather than restoring these.
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *   npm run prune:demo-customers                        # dry run — deletes nothing
 *   npm run prune:demo-customers -- --confirm           # delete the customers
 *   npm run prune:demo-customers -- --confirm --cascade # …and their orders + reviews
 */

import { pathToFileURL } from 'node:url';

import { connectDb, disconnectDb } from './connect.js';
import { CustomerModel, OrderModel, ReviewModel } from './models.js';
import { UserModel } from '../auth/models.js';

/** The id shape `npm run seed` writes, and nothing else. */
const SEED_ID = /^cus_\d{4}$/;

/** `$in` is cheap; a 8,540-element `$in` is less so. */
const CHUNK = 1000;

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const cascade = process.argv.includes('--cascade');

  await connectDb();

  const candidates = await CustomerModel.find({ _id: { $regex: SEED_ID } })
    .select('_id name email +passwordHash')
    .lean<{ _id: string; name?: string; email?: string; passwordHash?: string }[]>();

  /* A seeded row someone has since signed up against is a real account wearing
     a seed id. Two independent signals, because either one on its own can be
     absent depending on how the account was created (password vs Google). */
  const linked = new Set<string>();
  for (const batch of chunked(candidates.map((c) => c._id))) {
    const users = await UserModel.find({ customerId: { $in: batch } })
      .select('customerId')
      .lean<{ customerId?: string }[]>();
    users.forEach((user) => user.customerId && linked.add(user.customerId));
  }

  const claimed = candidates.filter((c) => c.passwordHash || linked.has(c._id));
  const doomed = candidates.filter((c) => !c.passwordHash && !linked.has(c._id));
  const ids = doomed.map((c) => c._id);

  let orders = 0;
  let reviews = 0;
  for (const batch of chunked(ids)) {
    const [o, r] = await Promise.all([
      OrderModel.countDocuments({ customerId: { $in: batch } }),
      ReviewModel.countDocuments({ customerId: { $in: batch } }),
    ]);
    orders += o;
    reviews += r;
  }

  for (const customer of doomed.slice(0, 10)) {
    console.log(
      `[customers] ${confirm ? 'deleting' : 'would delete'} ${customer._id} → ${customer.name ?? '(no name)'} <${customer.email ?? '—'}>`,
    );
  }
  if (doomed.length > 10) console.log(`[customers] …and ${doomed.length - 10} more`);

  for (const customer of claimed) {
    console.log(`[customers] keeping ${customer._id} — a real account has claimed this record`);
  }

  let deleted = 0;
  let ordersDeleted = 0;
  let reviewsDeleted = 0;

  if (confirm && ids.length) {
    for (const batch of chunked(ids)) {
      if (cascade) {
        const [o, r] = await Promise.all([
          OrderModel.deleteMany({ customerId: { $in: batch } }),
          ReviewModel.deleteMany({ customerId: { $in: batch } }),
        ]);
        ordersDeleted += o.deletedCount ?? 0;
        reviewsDeleted += r.deletedCount ?? 0;
      }
      const result = await CustomerModel.deleteMany({ _id: { $in: batch } });
      deleted += result.deletedCount ?? 0;
    }
    console.log(`[customers] deleted ${deleted} customer(s)`);
    if (cascade) {
      console.log(`[customers] deleted ${ordersDeleted} order(s), ${reviewsDeleted} review(s)`);
    }
  }

  const total = await CustomerModel.countDocuments({});

  console.log('\n─────────────────── demo customers ───────────────────');
  console.log(`  Seed-id records found      ${candidates.length}`);
  console.log(`  Claimed by a real account  ${claimed.length}  (kept)`);
  console.log(`  ${confirm ? 'Deleted                  ' : 'To delete                '}  ${confirm ? deleted : doomed.length}`);
  console.log(`  Their orders               ${orders}  ${cascade ? (confirm ? `(${ordersDeleted} deleted)` : '(would delete)') : '(kept — they carry their own customer details)'}`);
  console.log(`  Their reviews              ${reviews}  ${cascade ? (confirm ? `(${reviewsDeleted} deleted)` : '(would delete)') : '(kept)'}`);
  console.log(`  Customers remaining        ${confirm ? total : total - doomed.length}`);
  console.log('──────────────────────────────────────────────────────');

  if (!confirm) {
    console.log('\n  DRY RUN — nothing was deleted.');
    console.log('  Re-run with --confirm to apply, --confirm --cascade to take orders and reviews too.\n');
  }

  await disconnectDb();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[customers] failed:', error?.message ?? error);
    process.exit(1);
  });
}
