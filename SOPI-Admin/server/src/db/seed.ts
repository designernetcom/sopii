/*
 * Seeds MongoDB from the dataset the admin panel already ships.
 *
 * `src/data/*` generates a deterministic, richly cross-referenced catalogue
 * (products → categories → orders → customers → reviews). Rather than inventing
 * a second dataset for the backend, we import those exact generators and load
 * them into Mongo, so the database starts life consistent with every id and
 * relation the panel was built against.
 */

import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';

import { categories } from '@/data/categories';
import { products } from '@/data/products';
import { customers } from '@/data/customers';
import { orders } from '@/data/orders';
import { collections, coupons, reviews, stockMovements } from '@/data/catalog';
import { announcements, banners, homeSections, media, notifications } from '@/data/cms';
import { adminUsers, roles } from '@/data/admin';
import { settings } from '@/data/settings';

import { env } from '../env.js';
import { connectDb, disconnectDb } from './connect.js';
import {
  AdminUserModel,
  AnnouncementModel,
  BannerModel,
  CategoryModel,
  CollectionModel,
  CouponModel,
  CustomerModel,
  HomeSectionModel,
  MediaModel,
  NotificationModel,
  OrderModel,
  ProductModel,
  ReviewModel,
  RoleModel,
  SETTINGS_ID,
  SettingsModel,
  StockMovementModel,
  allModels,
} from './models.js';

/** `{ id, ...rest }` → `{ _id: id, ...rest }`, the shape the schemas expect. */
function toDocs<T extends { id: string }>(records: T[]) {
  return records.map(({ id, ...rest }) => ({ _id: id, ...rest }));
}

/**
 * Whether this database has never been seeded.
 *
 * `countDocuments`, not `estimatedDocumentCount`: the estimate is read from
 * collection metadata rather than the documents, and it goes stale — during a
 * bulk write, just after a delete, on a fresh replica. `seedIfEmpty` hands its
 * answer to a routine that used to wipe every collection, so an estimate that
 * says "0" for a database that is merely busy is the difference between a
 * no-op and a catastrophe. The accurate count costs milliseconds, once, at boot.
 */
export async function isEmpty() {
  return (await ProductModel.countDocuments()) === 0;
}

export async function seedDatabase({ fresh = false }: { fresh?: boolean } = {}) {
  if (fresh) {
    await Promise.all(allModels.map((m) => m.deleteMany({})));
    console.log('[seed] cleared every collection');
  }

  // Every seeded admin shares one password so the demo logins keep working.
  // Hashed at rest even though the value is public — the shape has to be right
  // for the day real credentials replace it.
  const passwordHash = await bcrypt.hash(env.seedPassword, 10);

  const written = await Promise.all([
    CategoryModel.insertMany(toDocs(categories), { ordered: false }),
    ProductModel.insertMany(toDocs(products), { ordered: false }),
    CollectionModel.insertMany(toDocs(collections), { ordered: false }),
    CustomerModel.insertMany(toDocs(customers), { ordered: false }),
    OrderModel.insertMany(toDocs(orders), { ordered: false }),
    CouponModel.insertMany(toDocs(coupons), { ordered: false }),
    ReviewModel.insertMany(toDocs(reviews), { ordered: false }),
    StockMovementModel.insertMany(toDocs(stockMovements), { ordered: false }),
    BannerModel.insertMany(toDocs(banners), { ordered: false }),
    HomeSectionModel.insertMany(toDocs(homeSections), { ordered: false }),
    MediaModel.insertMany(toDocs(media), { ordered: false }),
    NotificationModel.insertMany(toDocs(notifications), { ordered: false }),
    RoleModel.insertMany(toDocs(roles), { ordered: false }),
    AdminUserModel.insertMany(
      toDocs(adminUsers).map((user) => ({ ...user, passwordHash })),
      { ordered: false },
    ),
    SettingsModel.create({ _id: SETTINGS_ID, ...settings }),
    AnnouncementModel.insertMany(toDocs(announcements), { ordered: false }),
  ]);

  const counts = {
    categories: written[0].length,
    products: written[1].length,
    collections: written[2].length,
    customers: written[3].length,
    orders: written[4].length,
    coupons: written[5].length,
    reviews: written[6].length,
    stockMovements: written[7].length,
    banners: written[8].length,
    homeSections: written[9].length,
    media: written[10].length,
    notifications: written[11].length,
    roles: written[12].length,
    adminUsers: written[13].length,
    announcements: written[15].length,
  };

  console.log('[seed] inserted:', counts);
  console.log(`[seed] admin sign-in — any seeded email, password "${env.seedPassword}"`);
  return counts;
}

/**
 * Loads the dataset the first time the server meets an empty database.
 *
 * `fresh: false` — deliberately. This runs on **every server boot**, including
 * every restart `tsx watch` makes while someone edits a file, so it must be
 * incapable of destroying data even if `isEmpty` is somehow wrong. A database
 * that really is empty has nothing to clear, which makes the wipe pure
 * downside: it once turned a stale document-count estimate during a restart
 * storm into `deleteMany({})` across every collection.
 *
 * Reseeding from scratch is `npm run seed:fresh`, which is explicit, run by a
 * person, and the only place that clearing belongs.
 */
export async function seedIfEmpty() {
  if (!(await isEmpty())) return false;
  console.log('[seed] empty database detected — loading the starter dataset');
  await seedDatabase({ fresh: false });
  return true;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const fresh = process.argv.includes('--fresh');
  connectDb()
    .then(() => seedDatabase({ fresh }))
    .then(() => disconnectDb())
    .then(() => {
      console.log('[seed] done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[seed] failed:', error);
      process.exit(1);
    });
}
