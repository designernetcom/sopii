/*
 * Indexes (§4).
 * ===========================================================================
 * The schemas already carry single-field indexes. Those are enough at ten
 * thousand rows and not at ten million, because almost no real query filters on
 * one field: the admin order list filters by status *and* sorts by date, the
 * shop filters by category *and* status *and* sorts by price. MongoDB will use
 * one single-field index and then sort the remainder in memory — and past 32 MB
 * of intermediate results it does not sort them at all, it errors.
 *
 * So the rule behind every index below is the ESR rule: **Equality, Sort,
 * Range**, in that order. `{ status: 1, price: 1 }` serves
 * `find({status}).sort({price})` from the index alone with no in-memory sort;
 * `{ price: 1, status: 1 }` does not, despite containing the same two fields.
 *
 * Building them here rather than in the schemas is deliberate:
 *
 *   - one file to read when a query is slow, instead of eight;
 *   - `background: true` and an explicit name, so a deploy against a live
 *     database does not lock a collection while it builds;
 *   - a failure is logged and the boot continues. An index that already exists
 *     with different options throws, and that must not be able to keep the
 *     store offline.
 *
 * On a large existing collection, prefer building these with a rolling index
 * build on the replica set rather than at boot. The call is idempotent either
 * way.
 */

import mongoose from 'mongoose';

/*
 * Types taken from `mongoose.mongo` rather than from the `mongodb` package
 * directly. Both are installed — mongoose bundles its own copy — and importing
 * the top-level one makes TypeScript compare two structurally identical but
 * nominally distinct `ClientSession` declarations, which it refuses. Going
 * through mongoose guarantees the same copy the driver call actually uses.
 */
type IndexKeys = mongoose.mongo.IndexSpecification;
type IndexBuildOptions = mongoose.mongo.CreateIndexesOptions;
import {
  AdminUserModel,
  CategoryModel,
  CollectionModel,
  CouponModel,
  CustomerModel,
  MediaModel,
  NotificationModel,
  OrderModel,
  ProductModel,
  ReviewModel,
  StockMovementModel,
} from './models.js';
import { logger } from '../lib/logger.js';

type Spec = Record<string, 1 | -1 | 'text'>;

interface Definition {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: mongoose.Model<any>;
  keys: Spec;
  name: string;
  options?: IndexBuildOptions;
  /** Why it exists. Read this before deleting one. */
  why: string;
}

/**
 * Case-insensitive equality, done properly.
 *
 * `find({ email: /^value$/i })` cannot use a plain index — the regex is
 * evaluated against every document, so looking a customer up by email at a
 * million rows is a full collection scan on the hottest path in the shop
 * (login, guest checkout, newsletter). A collation index makes the *index*
 * case-insensitive, so the same lookup becomes a single seek.
 *
 * Strength 2 compares base letters and accents but ignores case, which is what
 * "the same email address" means.
 */
const CI = { locale: 'en', strength: 2 } as const;

const definitions: Definition[] = [
  /* --------------------------------- catalogue ------------------------------- */
  {
    model: ProductModel,
    keys: { status: 1, createdAt: -1 },
    name: 'ix_product_status_created',
    why: 'The storefront feed and the admin list: published products, newest first.',
  },
  {
    model: ProductModel,
    keys: { status: 1, categoryId: 1, price: 1 },
    name: 'ix_product_status_category_price',
    why: 'Category pages sorted by price — the commonest shopper query there is.',
  },
  {
    model: ProductModel,
    keys: { status: 1, collectionIds: 1, createdAt: -1 },
    name: 'ix_product_status_collection_created',
    why: 'Collection pages. A multikey index on the array of collection ids.',
  },
  {
    model: ProductModel,
    keys: { status: 1, featured: 1, createdAt: -1 },
    name: 'ix_product_status_featured',
    why: 'The home page rails.',
  },
  {
    model: ProductModel,
    keys: { status: 1, updatedAt: -1 },
    name: 'ix_product_status_updated',
    why: 'The change token the shop polls, and the sitemap lastmod ordering.',
  },
  {
    model: ProductModel,
    keys: { slug: 1 },
    name: 'ix_product_slug',
    options: { unique: true, sparse: true },
    why: 'Product pages resolve by slug. Unique because two products on one URL is a bug.',
  },
  {
    model: ProductModel,
    keys: { stock: 1, status: 1 },
    name: 'ix_product_stock_status',
    why: 'The low-stock and out-of-stock reports.',
  },
  {
    /*
     * A text index, so search stops being a regex scan.
     *
     * Weighted: a match on the product name means far more than a match buried
     * in a description, and without weights MongoDB scores them the same. This
     * is the interim answer — §15's dedicated search engine is the real one,
     * and `search/index.ts` is the seam for it — but it turns an O(n) scan into
     * an index lookup today, which is the difference between a search box that
     * works at a million products and one that does not.
     */
    model: ProductModel,
    keys: { name: 'text', sku: 'text', brand: 'text', tags: 'text', shortDescription: 'text' },
    name: 'ix_product_text',
    options: {
      weights: { name: 10, sku: 8, brand: 4, tags: 3, shortDescription: 1 },
      default_language: 'english',
    },
    why: 'Product search without a full collection scan (§15).',
  },
  {
    model: CategoryModel,
    keys: { status: 1, sortOrder: 1 },
    name: 'ix_category_status_sort',
    why: 'The navigation menu, in the order the panel set.',
  },
  {
    model: CategoryModel,
    keys: { slug: 1 },
    name: 'ix_category_slug',
    options: { sparse: true },
    why: 'Category pages resolve by slug.',
  },
  {
    model: CollectionModel,
    keys: { status: 1, sortOrder: 1 },
    name: 'ix_collection_status_sort',
    why: 'The collections index page.',
  },
  {
    model: CollectionModel,
    keys: { slug: 1 },
    name: 'ix_collection_slug',
    options: { sparse: true },
    why: 'Collection pages resolve by slug.',
  },

  /* ---------------------------------- orders --------------------------------- */
  {
    model: OrderModel,
    keys: { customerId: 1, placedAt: -1 },
    name: 'ix_order_customer_placed',
    why: "A shopper's own order history — the query behind /account/orders.",
  },
  {
    model: OrderModel,
    keys: { status: 1, placedAt: -1 },
    name: 'ix_order_status_placed',
    why: "The admin order list's default view: one status, newest first.",
  },
  {
    model: OrderModel,
    keys: { paymentStatus: 1, placedAt: -1 },
    name: 'ix_order_paystatus_placed',
    why: 'Reconciliation: everything still awaiting payment.',
  },
  {
    model: OrderModel,
    keys: { placedAt: -1 },
    name: 'ix_order_placed',
    why: 'Every dashboard and report window is a range on this field.',
  },
  {
    model: OrderModel,
    keys: { code: 1 },
    name: 'ix_order_code',
    options: { unique: true },
    /*
     * Unique, and this is the safety net under the atomic counter in `ids.ts`.
     * If a code is ever generated twice the insert fails loudly instead of
     * quietly producing two orders a customer cannot tell apart.
     */
    why: 'Order lookup by code, and the last line of defence against duplicates.',
  },
  {
    model: OrderModel,
    keys: { customerEmail: 1, placedAt: -1 },
    name: 'ix_order_email_placed',
    options: { collation: CI },
    why: 'Guest order lookup, case-insensitively, without scanning the collection.',
  },
  {
    model: OrderModel,
    keys: { couponCode: 1, customerId: 1 },
    name: 'ix_order_coupon_customer',
    options: { sparse: true },
    why: "The per-customer coupon limit check, which runs inside every checkout quote.",
  },

  /* -------------------------------- customers -------------------------------- */
  {
    model: CustomerModel,
    keys: { email: 1 },
    name: 'ix_customer_email_ci',
    options: { collation: CI, unique: true },
    why: 'Login, guest checkout and the newsletter all look a customer up by email.',
  },
  {
    model: CustomerModel,
    keys: { status: 1, createdAt: -1 },
    name: 'ix_customer_status_created',
    why: 'The admin customer list.',
  },
  {
    model: CustomerModel,
    keys: { tier: 1, totalSpent: -1 },
    name: 'ix_customer_tier_spent',
    why: 'Segments, and the top-customers report.',
  },
  {
    model: CustomerModel,
    keys: { phone: 1 },
    name: 'ix_customer_phone',
    options: { sparse: true },
    why: 'Admin search by mobile number.',
  },

  /* -------------------------------- everything else -------------------------- */
  {
    model: ReviewModel,
    keys: { productId: 1, status: 1, createdAt: -1 },
    name: 'ix_review_product_status_created',
    why: 'Approved reviews for one product — on every product page.',
  },
  {
    model: ReviewModel,
    keys: { status: 1, createdAt: -1 },
    name: 'ix_review_status_created',
    why: 'The moderation queue.',
  },
  {
    model: StockMovementModel,
    keys: { productId: 1, at: -1 },
    name: 'ix_stock_product_at',
    why: "One product's stock history.",
  },
  {
    model: StockMovementModel,
    keys: { at: -1 },
    name: 'ix_stock_at',
    why: 'The inventory history list, newest first.',
  },
  {
    model: CouponModel,
    keys: { status: 1, endDate: 1 },
    name: 'ix_coupon_status_end',
    why: 'The live-coupon filter on the storefront feed.',
  },
  {
    model: NotificationModel,
    keys: { read: 1, createdAt: -1 },
    name: 'ix_notification_read_created',
    why: "The panel's notification bell: unread first, newest first.",
  },
  {
    model: MediaModel,
    keys: { folder: 1, createdAt: -1 },
    name: 'ix_media_folder_created',
    why: 'The media library, browsed by folder.',
  },
  {
    model: AdminUserModel,
    keys: { roleId: 1, status: 1 },
    name: 'ix_adminuser_role_status',
    why: 'Role assignment counts, and the admin user list.',
  },
];

/**
 * Creates every index, tolerating the ones that already exist.
 *
 * Sequential rather than `Promise.all` on purpose: twenty concurrent index
 * builds on one collection is a way to make a boot take longer, not less.
 *
 * A `unique` index that cannot be built because the data already violates it
 * is **retried without the constraint**, loudly. That branch matters: the
 * uniqueness is worth having, but refusing to boot the store over duplicate
 * rows that predate the constraint is the wrong trade — an operator gets a
 * named warning telling them exactly what to deduplicate, the non-unique index
 * still makes the query fast, and the constraint can be added the moment the
 * data is clean.
 */
export async function ensureIndexes() {
  let created = 0;
  let degraded = 0;
  let skipped = 0;

  for (const { model, keys, name, options, why } of definitions) {
    const base: IndexBuildOptions = { name, background: true, ...options };

    try {
      await model.collection.createIndex(keys as IndexKeys, base);
      created += 1;
      continue;
    } catch (error) {
      const code = (error as { code?: number })?.code;
      const message = error instanceof Error ? error.message : String(error);

      // 11000 duplicate key: the data violates a uniqueness we wanted.
      if (base.unique && code === 11000) {
        try {
          await model.collection.createIndex(keys as IndexKeys, { ...base, unique: false });
          degraded += 1;
          logger.error('db.index_not_unique', {
            detail:
              `${name} built WITHOUT its unique constraint — ${model.collection.collectionName} ` +
              `already contains duplicates on ${Object.keys(keys).join(', ')}. ` +
              'Deduplicate, then rebuild this index with unique:true.',
            why,
          });
          continue;
        } catch {
          /* fall through to the skip below */
        }
      }

      skipped += 1;
      // IndexOptionsConflict (85) and IndexKeySpecsConflict (86) mean an index
      // of this name already exists with different options — a real thing to
      // fix, but by hand, not by dropping an index under a live workload.
      logger.warn('db.index_skipped', { detail: `${name}: ${message}`, why });
    }
  }

  logger.info('db.indexes', {
    detail: `${created} ensured, ${degraded} degraded to non-unique, ${skipped} skipped`,
  });
}

/**
 * The collation every case-insensitive email query must carry.
 *
 * A collation index is only used by a query that asks for the same collation,
 * so this is exported and passed explicitly at each call site rather than left
 * to be remembered.
 */
export const CI_COLLATION = CI;
