/*
 * Empties the orders and customers collections.
 * ---------------------------------------------------------------------------
 * This is the blunt one. `prune:demo-orders` and `prune:demo-customers` are
 * careful — they delete only what the seed wrote and step around anything a
 * real person touched. This deletes everything in both collections, real
 * records included, because the point is a store that opens its books at zero.
 *
 * It writes a JSON backup of both collections before it deletes anything.
 * Restoring is a `mongoimport` away, and the backup costs nothing next to the
 * alternative of finding out afterwards that a test order was not a test.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DELETES
 * ---------------------------------------------------------------------------
 *   orders      every document
 *   customers   every document
 *
 * ---------------------------------------------------------------------------
 * WHAT IT LEAVES, AND WHY
 * ---------------------------------------------------------------------------
 * - **Storefront logins.** A shopper's account lives in the auth `users`
 *   collection, not here; the customer row is the commerce side of it. Deleting
 *   the row does not lock anybody out: `ensureCustomerRecord` finds its
 *   `customerId` dangling, falls through, and writes a fresh empty record at
 *   the next registration or checkout. Accounts survive, their order history
 *   does not — which is the intent.
 *
 * - **Reviews.** A review is its own content, carries the reviewer's name in
 *   its own fields, and moderating it does not need the customer row. They are
 *   counted below so the number is never a surprise.
 *
 * - **Stock movements and stock levels.** Deleting an order is not cancelling
 *   it, so nothing goes back on the shelf and the inventory audit trail keeps
 *   saying what actually happened. Use the Stock History page's Clear button
 *   if that should go too.
 *
 * - **The order code counter.** Never rewound, so the next real order cannot
 *   collide with a code this script just erased.
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *   npm run clear:commerce              # dry run — reports and backs up nothing
 *   npm run clear:commerce -- --confirm # back up, then delete
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { connectDb, disconnectDb } from './connect.js';
import { CustomerModel, OrderModel, ReviewModel } from './models.js';
import { UserModel } from '../auth/models.js';

const inr = (amount: number) => `₹${Math.round(amount).toLocaleString('en-IN')}`;

async function main() {
  const confirm = process.argv.includes('--confirm');

  await connectDb();

  const [orders, customers, reviews, logins] = await Promise.all([
    OrderModel.find({}).lean(),
    CustomerModel.find({}).lean(),
    ReviewModel.countDocuments({}),
    UserModel.countDocuments({ customerId: { $exists: true, $ne: null } }),
  ]);

  const revenue = (orders as { total?: number; status?: string }[])
    .filter((order) => order.status !== 'cancelled' && order.status !== 'returned')
    .reduce((sum, order) => sum + (Number(order.total) || 0), 0);

  for (const order of (orders as { _id: string; code?: string; customerName?: string }[]).slice(0, 10)) {
    console.log(
      `[clear] ${confirm ? 'deleting' : 'would delete'} order ${order._id} → #${order.code ?? '?'} · ${order.customerName ?? '(no customer)'}`,
    );
  }
  if (orders.length > 10) console.log(`[clear] …and ${orders.length - 10} more order(s)`);

  let backupDir = '';
  let deletedOrders = 0;
  let deletedCustomers = 0;

  if (confirm) {
    /* Backup first, and fail the whole run if it cannot be written — a delete
       that proceeds after its own safety net failed is not a safety net. */
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupDir = path.resolve(process.cwd(), '.backup', stamp);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'orders.json'), JSON.stringify(orders, null, 2));
    fs.writeFileSync(path.join(backupDir, 'customers.json'), JSON.stringify(customers, null, 2));
    console.log(`[clear] backup written → ${backupDir}`);

    const [o, c] = await Promise.all([
      OrderModel.deleteMany({}),
      CustomerModel.deleteMany({}),
    ]);
    deletedOrders = o.deletedCount ?? 0;
    deletedCustomers = c.deletedCount ?? 0;
    console.log(`[clear] deleted ${deletedOrders} order(s), ${deletedCustomers} customer(s)`);
  }

  console.log('\n──────────────── orders + customers ────────────────');
  console.log(`  Orders    ${confirm ? 'deleted' : 'to delete'}   ${confirm ? deletedOrders : orders.length}`);
  console.log(`  Customers ${confirm ? 'deleted' : 'to delete'}   ${confirm ? deletedCustomers : customers.length}`);
  console.log(`  Revenue leaving reports  ${inr(revenue)}`);
  console.log(`  Storefront logins kept   ${logins}  (customer record recreated at next checkout)`);
  console.log(`  Reviews kept             ${reviews}`);
  console.log('  Stock levels + history   untouched');
  console.log('  Order code counter       untouched');
  if (backupDir) console.log(`  Backup                   ${backupDir}`);
  console.log('────────────────────────────────────────────────────');

  if (!confirm) {
    console.log('\n  DRY RUN — nothing was deleted and no backup was written.');
    console.log('  Re-run with --confirm to back up and delete.\n');
  }

  await disconnectDb();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[clear] failed:', error?.message ?? error);
    process.exit(1);
  });
}
