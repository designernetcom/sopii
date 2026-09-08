/*
 * In-memory mock database.
 *
 * The seed modules build a deterministic dataset at import time; this module
 * simply owns the mutable references the request handlers read and write. When
 * a real backend arrives this file disappears — nothing outside `src/mocks`
 * imports it.
 */

import { categories } from '@/data/categories';
import { products } from '@/data/products';
import { customers } from '@/data/customers';
import { orders } from '@/data/orders';
import { collections, coupons, reviews, stockMovements } from '@/data/catalog';
import { banners, homeSections, media, notifications } from '@/data/cms';
import { adminUsers, roles } from '@/data/admin';
import { settings } from '@/data/settings';

import type {
  AdminUser,
  AppNotification,
  Banner,
  Category,
  Collection,
  Coupon,
  Customer,
  HomeSection,
  MediaAsset,
  Order,
  Product,
  Review,
  Role,
  Settings,
  StockMovement,
} from '@/types';

export interface MockDb {
  products: Product[];
  categories: Category[];
  collections: Collection[];
  customers: Customer[];
  orders: Order[];
  coupons: Coupon[];
  reviews: Review[];
  stockMovements: StockMovement[];
  banners: Banner[];
  homeSections: HomeSection[];
  media: MediaAsset[];
  notifications: AppNotification[];
  adminUsers: AdminUser[];
  roles: Role[];
  settings: Settings;
}

export const db: MockDb = {
  products,
  categories,
  collections,
  customers,
  orders,
  coupons,
  reviews,
  stockMovements,
  banners,
  homeSections,
  media,
  notifications,
  adminUsers,
  roles,
  settings,
};

/** Monotonic id factory for records created during a session. */
let counter = 0;
export function nextId(prefix: string) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

/**
 * The dataset is regenerated deterministically on every page load, so a reload
 * is the reset. Exposed as a function so the Settings screen can call it
 * without knowing that.
 */
export function resetDb() {
  window.location.reload();
}
