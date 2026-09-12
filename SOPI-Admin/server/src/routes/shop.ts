/*
 * Shop-front write API.
 * ---------------------------------------------------------------------------
 * `storefront.ts` is the read side — the catalogue the SOPII shop renders.
 * This is everything a shopper *does*: create an account, keep addresses and a
 * wishlist, price a bag, place an order, look one up again.
 *
 * It is mounted under the same `/api/storefront` prefix and is therefore also
 * open to any origin, so three rules apply throughout:
 *
 * 1. **Money is computed here, never accepted from the client.** `quoteCart`
 *    prices a bag from the database and the store's own settings; the browser's
 *    idea of the total is only ever a preview of the same call.
 * 2. **Identity is proven, not claimed.** A customer id is read from a signed
 *    token (`lib/shopAuth.ts`), never from the body, and a guest looking up an
 *    order must know both its code and the email it was placed with.
 * 3. **Only published, in-stock goods sell.** A draft product, or one that has
 *    run out and does not allow backorders, is refused at checkout rather than
 *    filtered out quietly.
 */

import { Router } from 'express';
import type { Query } from 'mongoose';
import bcrypt from 'bcryptjs';
import type {
  Address,
  Coupon,
  OrderItem,
  PaymentMethod,
  Product,
  ProductVariant,
} from '@/types';
import {
  CouponModel,
  CustomerModel,
  OrderModel,
  ProductModel,
  StockMovementModel,
  type CustomerDoc,
} from '../db/models.js';
import {
  ah,
  badRequest,
  escapeRegex,
  nextId,
  notFound,
  nowIso,
  num,
  serialize,
  serializeMany,
} from '../lib/http.js';
import { requireCustomer, signCustomerToken, withCustomer } from '../lib/shopAuth.js';
import { loadSettings, quoteShipping, quoteTax } from '../lib/settings.js';
import { codProblem, isOnlineGateway, resolveCodRules } from '../payments/config.js';
import { CI_COLLATION } from '../db/indexes.js';
import { claimStock, releaseStock, type StockClaim } from '../lib/inventory.js';
import { tierFor } from '../lib/customers.js';
import { idempotencyKey, withIdempotency } from '../lib/idempotency.js';
import { nextSequence } from '../lib/ids.js';
import { enqueue, JOB } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { onWrite } from '../lib/cache.js';
import { limits, rateLimit } from '../lib/rateLimit.js';
import { privateNoStore } from '../lib/observability.js';

export const shopRoutes = Router();

/* --------------------------------- helpers ---------------------------------- */

const MAX_PER_LINE = 10;
const MIN_PASSWORD = 6;

export const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normaliseEmail = (value: unknown) => trimmed(value).toLowerCase();

export function assertEmail(value: unknown): string {
  const email = normaliseEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) badRequest('Enter a valid email address.');
  return email;
}

/**
 * Case-insensitive exact match on email.
 *
 * This *used* to be `{ email: /^value$/i }`. An anchored case-insensitive
 * regular expression cannot use a plain index — MongoDB evaluates it against
 * every document — so at a million customers, login, guest checkout and the
 * newsletter were each a full collection scan.
 *
 * A plain equality query plus the collation index built in `db/indexes.ts`
 * does the same job as a single index seek. The collation has to be named on
 * the *query* as well as the index or the index is not used, which is what
 * `byEmailQuery` below exists to make hard to forget.
 */
const byEmail = (email: string) => ({ email });

/**
 * Runs an email lookup with the collation its index was built with.
 *
 * Every customer-by-email read goes through here. Passing the collation is not
 * optional: without it MongoDB falls back to a byte-exact comparison, and
 * `Asha@Example.com` would silently register a second account for someone who
 * already has one.
 */
const withEmailCollation = <ResultType, DocType>(query: Query<ResultType, DocType>) =>
  query.collation(CI_COLLATION);

/** The `{ id, ...}` shape the shop renders, with nothing private in it. */
function publicCustomer(customer: CustomerDoc) {
  return {
    id: customer._id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone ?? '',
    avatar: customer.avatar,
    tier: customer.tier,
    acceptsMarketing: Boolean(customer.acceptsMarketing),
    addresses: customer.addresses ?? [],
    wishlist: customer.wishlist ?? [],
    ordersCount: customer.ordersCount ?? 0,
    joinedAt: customer.createdAt,
  };
}

const sessionFor = (customer: CustomerDoc) => ({
  token: signCustomerToken(customer._id),
  customer: publicCustomer(customer),
});

/** Adds an entry to the activity feed the panel's customer page renders. */
const activity = (type: string, message: string) => ({
  id: nextId('act'),
  type,
  message,
  at: nowIso(),
});

/* ------------------------------ authentication ------------------------------ */

shopRoutes.post(
  '/auth/register',
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const name = trimmed(body.name);
    const email = assertEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!name) badRequest('Please tell us your name.');
    if (password.length < MIN_PASSWORD) {
      badRequest(`Password must be at least ${MIN_PASSWORD} characters.`);
    }

    const existing = await withEmailCollation(
      CustomerModel.findOne(byEmail(email)).select('+passwordHash'),
    ).lean<CustomerDoc>();

    /*
     * The panel's seeded customers exist without a password. Rather than
     * refusing the email outright — which would lock a real shopper out of
     * their own order history — registering claims that record.
     */
    if (existing?.passwordHash) {
      badRequest('An account already exists for that email. Please log in instead.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (existing) {
      const claimed = await CustomerModel.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            name,
            passwordHash,
            phone: trimmed(body.phone) || existing.phone,
            acceptsMarketing: Boolean(body.acceptsMarketing) || existing.acceptsMarketing,
          },
          $push: { activity: activity('account', 'Created a shop account') },
        },
        { new: true },
      ).lean<CustomerDoc>();

      res.status(201).json(sessionFor(claimed!));
      return;
    }

    const created = await CustomerModel.create({
      _id: nextId('cus'),
      name,
      email,
      phone: trimmed(body.phone),
      passwordHash,
      status: 'active',
      tier: 'new',
      addresses: [],
      wishlist: [],
      ordersCount: 0,
      totalSpent: 0,
      acceptsMarketing: Boolean(body.acceptsMarketing),
      activity: [activity('account', 'Created a shop account')],
      createdAt: nowIso(),
    });

    res.status(201).json(sessionFor(created.toObject() as CustomerDoc));
  }),
);

shopRoutes.post(
  '/auth/login',
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const email = assertEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    const customer = await withEmailCollation(
      CustomerModel.findOne(byEmail(email)).select('+passwordHash'),
    ).lean<CustomerDoc>();

    // One message for both halves, so this cannot be used to enumerate emails.
    const ok = customer?.passwordHash
      ? await bcrypt.compare(password, customer.passwordHash)
      : false;
    if (!ok) badRequest('That email and password do not match an account.');
    if (customer!.status === 'blocked') badRequest('This account has been suspended.');

    await CustomerModel.updateOne(
      { _id: customer!._id },
      { $push: { activity: { $each: [activity('login', 'Signed in to the shop')], $slice: -50 } } },
    );

    res.json(sessionFor(customer!));
  }),
);

shopRoutes.get(
  '/auth/me',
  requireCustomer,
  ah(async (req, res) => {
    res.json({ customer: publicCustomer(req.customer!) });
  }),
);

/**
 * Kept as a compatibility shim, and deliberately not a second implementation.
 *
 * Password reset lives in the auth module (`POST /api/auth/forgot-password`),
 * which owns the reset tokens, the per-address and per-IP throttles, the audit
 * trail and the session revocation — and which now sends through Mailtrap.
 * The shop front calls that endpoint directly. This one predates it, and
 * having two routes that both mint reset links would be exactly the duplicate
 * the rest of this store's mail handling was consolidated to avoid.
 *
 * It answers identically whether or not the address is known, as §4 requires,
 * so an old client pointed at it still cannot enumerate accounts.
 */
shopRoutes.post(
  '/auth/forgot-password',
  ah(async (req, res) => {
    const email = assertEmail((req.body as Record<string, unknown>).email);
    res.json({
      sent: false,
      endpoint: '/api/auth/forgot-password',
      message: `If an account exists for ${email}, a reset link is on its way.`,
    });
  }),
);

/* --------------------------------- account ---------------------------------- */

shopRoutes.patch(
  '/account/profile',
  requireCustomer,
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = trimmed(body.name);
      if (!name) badRequest('Please tell us your name.');
      patch.name = name;
    }
    if (body.phone !== undefined) patch.phone = trimmed(body.phone);
    if (body.acceptsMarketing !== undefined) patch.acceptsMarketing = Boolean(body.acceptsMarketing);

    /* Email is the account handle and is what a guest order is matched on, so
       it is deliberately not editable here. */
    const updated = await CustomerModel.findByIdAndUpdate(
      req.customer!._id,
      { $set: patch },
      { new: true },
    ).lean<CustomerDoc>();

    res.json({ customer: publicCustomer(updated!) });
  }),
);

shopRoutes.post(
  '/account/password',
  requireCustomer,
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const next = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (next.length < MIN_PASSWORD) {
      badRequest(`Password must be at least ${MIN_PASSWORD} characters.`);
    }

    const current = await CustomerModel.findById(req.customer!._id)
      .select('+passwordHash')
      .lean<CustomerDoc>();

    const ok = current?.passwordHash
      ? await bcrypt.compare(trimmed(body.currentPassword), current.passwordHash)
      : false;
    if (!ok) badRequest('Your current password is not correct.');

    await CustomerModel.updateOne(
      { _id: current!._id },
      {
        $set: { passwordHash: await bcrypt.hash(next, 10) },
        $push: { activity: activity('account', 'Changed their password') },
      },
    );

    res.json({ ok: true });
  }),
);

/* -------------------------------- addresses ---------------------------------- */

/** Checkout and the account page both send this shape. */
export function readAddress(raw: unknown): Address {
  const body = (raw ?? {}) as Record<string, unknown>;
  const address: Address = {
    id: trimmed(body.id) || nextId('adr'),
    label: trimmed(body.label) || undefined,
    isDefault: Boolean(body.isDefault),
    // The shop calls it `fullName`; the panel's Address calls it `name`.
    name: trimmed(body.name) || trimmed(body.fullName),
    phone: trimmed(body.phone),
    line1: trimmed(body.line1),
    line2: trimmed(body.line2) || undefined,
    city: trimmed(body.city),
    state: trimmed(body.state),
    pincode: trimmed(body.pincode),
    country: trimmed(body.country) || 'India',
  };

  if (!address.name) badRequest('Please give a name for the delivery address.');
  if (!/^[6-9]\d{9}$/.test(address.phone.replace(/\s/g, ''))) {
    badRequest('Enter a valid 10-digit mobile number.');
  }
  if (!address.line1) badRequest('Enter the first line of the address.');
  if (!address.city) badRequest('Enter a city.');
  if (!address.state) badRequest('Enter a state.');
  if (!/^\d{6}$/.test(address.pincode)) badRequest('Enter a 6-digit PIN code.');

  return address;
}

/** Exactly one address is the default, and an only address always is. */
function withOneDefault(addresses: Address[], preferredId?: string) {
  if (!addresses.length) return addresses;
  const chosen =
    addresses.find((address) => address.id === preferredId && address.isDefault) ??
    addresses.find((address) => address.isDefault) ??
    addresses[0];

  return addresses.map((address) => ({ ...address, isDefault: address.id === chosen.id }));
}

async function saveAddresses(customerId: string, addresses: Address[], preferredId?: string) {
  const next = withOneDefault(addresses, preferredId);
  await CustomerModel.updateOne({ _id: customerId }, { $set: { addresses: next } });
  return next;
}

shopRoutes.get(
  '/account/addresses',
  requireCustomer,
  ah(async (req, res) => {
    res.json({ items: req.customer!.addresses ?? [] });
  }),
);

shopRoutes.post(
  '/account/addresses',
  requireCustomer,
  ah(async (req, res) => {
    const address = readAddress(req.body);
    const current = req.customer!.addresses ?? [];
    // The first address a shopper saves is their default, whatever they ticked.
    if (!current.length) address.isDefault = true;

    res.status(201).json({
      items: await saveAddresses(req.customer!._id, [...current, address], address.id),
    });
  }),
);

shopRoutes.put(
  '/account/addresses/:id',
  requireCustomer,
  ah(async (req, res) => {
    const current = req.customer!.addresses ?? [];
    if (!current.some((address) => address.id === req.params.id)) notFound('Address');

    const address = { ...readAddress(req.body), id: req.params.id };
    const items = current.map((entry) => (entry.id === req.params.id ? address : entry));

    res.json({ items: await saveAddresses(req.customer!._id, items, address.id) });
  }),
);

shopRoutes.delete(
  '/account/addresses/:id',
  requireCustomer,
  ah(async (req, res) => {
    const remaining = (req.customer!.addresses ?? []).filter(
      (address) => address.id !== req.params.id,
    );
    res.json({ items: await saveAddresses(req.customer!._id, remaining) });
  }),
);

/* --------------------------------- wishlist ---------------------------------- */

shopRoutes.get(
  '/account/wishlist',
  requireCustomer,
  ah(async (req, res) => {
    res.json({ productIds: req.customer!.wishlist ?? [] });
  }),
);

/**
 * Whole-list replace rather than add/remove: the shop keeps a wishlist in
 * localStorage for signed-out browsing and pushes the merged result up on sign
 * in, so the last write is meant to win.
 */
shopRoutes.put(
  '/account/wishlist',
  requireCustomer,
  ah(async (req, res) => {
    const raw = (req.body as { productIds?: unknown }).productIds;
    if (!Array.isArray(raw)) badRequest('productIds must be an array of product ids.');

    const ids = [...new Set(raw.filter((id): id is string => typeof id === 'string'))].slice(0, 200);
    // Drop anything that no longer exists, so a deleted product cannot haunt
    // the list forever.
    const live = await ProductModel.find({ _id: { $in: ids } }, { _id: 1 }).lean<{ _id: string }[]>();
    const known = new Set(live.map((product) => product._id));
    const productIds = ids.filter((id) => known.has(id));

    await CustomerModel.updateOne({ _id: req.customer!._id }, { $set: { wishlist: productIds } });
    res.json({ productIds });
  }),
);

/* ---------------------------------- pricing ---------------------------------- */

export interface CartLine {
  productId: string;
  quantity: number;
  size?: string;
  color?: string;
}

type ProductDoc = Omit<Product, 'id'> & { _id: string };

export function readLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw) || raw.length === 0) badRequest('Your bag is empty.');

  return (raw as Record<string, unknown>[]).map((line) => {
    const productId = trimmed(line.productId);
    if (!productId) badRequest('Every bag line needs a productId.');

    const quantity = Math.floor(Number(line.quantity) || 0);
    if (quantity < 1 || quantity > MAX_PER_LINE) {
      badRequest(`Quantity must be between 1 and ${MAX_PER_LINE}.`);
    }

    return { productId, quantity, size: trimmed(line.size), color: trimmed(line.color) };
  });
}

/**
 * The variant a size/colour choice refers to. Falls back through "both match"
 * → "one matches" → none, because a product may vary on only one axis.
 */
function matchVariant(product: ProductDoc, line: CartLine): ProductVariant | undefined {
  const variants = product.variants ?? [];
  if (!variants.length) return undefined;

  const same = (a?: string, b?: string) =>
    (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

  return (
    variants.find((v) => same(v.size, line.size) && same(v.color, line.color)) ??
    variants.find((v) => line.size && same(v.size, line.size)) ??
    variants.find((v) => line.color && same(v.color, line.color))
  );
}

/** Units a line can draw on: the variant's own stock, else the product's. */
const stockFor = (product: ProductDoc, variant?: ProductVariant) =>
  Number(variant ? variant.stock : product.stock) || 0;

async function findCoupon(code: string) {
  if (!code) return null;
  return CouponModel.findOne({
    code: new RegExp(`^${escapeRegex(code)}$`, 'i'),
  }).lean<Coupon & { _id: string }>();
}

interface CouponVerdict {
  coupon: (Coupon & { _id: string }) | null;
  discount: number;
  freeShipping: boolean;
  message?: string;
}

/**
 * Whether a code applies to this bag, and for how much. Returns a message
 * instead of throwing when the code is simply not usable yet — the checkout
 * wants to show "add ₹300 more", not fail the whole request.
 */
async function verifyCoupon(
  code: string,
  subtotal: number,
  customerId?: string,
): Promise<CouponVerdict> {
  const none = { coupon: null, discount: 0, freeShipping: false };
  if (!code) return none;

  const coupon = await findCoupon(code);
  if (!coupon) return { ...none, message: 'That code is not valid. Please check and try again.' };
  if (coupon.status === 'disabled') return { ...none, message: 'That code is no longer active.' };

  const now = nowIso();
  if (coupon.startDate && coupon.startDate > now) {
    return { ...none, message: 'That code is not active yet.' };
  }
  if (coupon.endDate && coupon.endDate < now) {
    return { ...none, message: 'That code has expired.' };
  }

  const minimum = Number(coupon.minOrderValue) || 0;
  if (subtotal < minimum) {
    const short = minimum - subtotal;
    return {
      ...none,
      message: `Add ₹${short.toLocaleString('en-IN')} more to use ${coupon.code}.`,
    };
  }

  const usageLimit = Number(coupon.usageLimit) || 0;
  if (usageLimit > 0 && (Number(coupon.usedCount) || 0) >= usageLimit) {
    return { ...none, message: 'That code has been fully redeemed.' };
  }

  const perCustomer = Number(coupon.perCustomerLimit) || 0;
  if (perCustomer > 0 && customerId) {
    const used = await OrderModel.countDocuments({
      customerId,
      couponCode: coupon.code,
      status: { $nin: ['cancelled', 'returned'] },
    });
    if (used >= perCustomer) {
      return { ...none, message: 'You have already used that code.' };
    }
  }

  if (coupon.discountType === 'free_shipping') {
    return { coupon, discount: 0, freeShipping: true };
  }

  const value = Number(coupon.discountValue) || 0;
  let discount =
    coupon.discountType === 'percentage' ? Math.round((subtotal * value) / 100) : Math.round(value);

  if (coupon.discountType === 'percentage' && coupon.maxDiscount) {
    discount = Math.min(discount, Number(coupon.maxDiscount));
  }

  return { coupon, discount: Math.min(discount, subtotal), freeShipping: false };
}

interface QuoteOptions {
  couponCode?: string;
  state?: string;
  paymentMethod?: string;
  customerId?: string;
  /** Checkout previews tolerate a short line; placing an order does not. */
  enforceStock?: boolean;
  /**
   * Whether a line whose product has gone can be skipped instead of refusing
   * the whole bag.
   *
   * Only the checkout *preview* sets this. A bag can outlive a catalogue — it
   * lives in the shopper's browser, so a product that is unpublished, deleted
   * or restored from a different database leaves a line pointing at nothing.
   * Refusing to price the bag at that point tells the shopper nothing and
   * leaves them no way forward: the totals silently fall back to the browser's
   * own guess and every attempt to pay dies on the same 400.
   *
   * So the preview prices what it can and reports the rest under
   * `unavailable`, which is what lets the checkout name the dead line and
   * offer to remove it. Placing an order and opening a payment never set this
   * — there, a bag that cannot be priced in full is still a hard refusal.
   */
  tolerateMissing?: boolean;
}

/**
 * Prices a bag from the database. This is the only place order money is
 * calculated — `POST /orders` writes exactly what this returns.
 */
export async function quoteCart(lines: CartLine[], options: QuoteOptions = {}) {
  const settings = await loadSettings();

  const products = await ProductModel.find({
    _id: { $in: lines.map((line) => line.productId) },
    status: 'published',
  }).lean<ProductDoc[]>();
  const index = new Map(products.map((product) => [product._id, product]));

  const issues: string[] = [];
  /** Lines whose product is gone, echoed back so the checkout can identify them. */
  const unavailable: CartLine[] = [];

  const priced = lines.flatMap((line) => {
    const product = index.get(line.productId);
    if (!product) {
      if (!options.tolerateMissing) {
        badRequest('One of the pieces in your bag is no longer available.');
      }
      unavailable.push(line);
      return [];
    }

    const variant = matchVariant(product, line);

    /*
     * The product's own price, not the variant's. The panel can price variants
     * separately, but the storefront shows one price per product on the card,
     * the product page and in the bag — charging a different one at the till
     * would be a nasty surprise. The variant still decides the SKU and the
     * stock this line draws on. Surface per-variant pricing in the shop first
     * if that ever needs to change.
     */
    const price = Math.round(Number(product.price) || 0);
    const available = stockFor(product, variant);
    const short =
      product.trackInventory && !product.allowBackorders && available < line.quantity;

    if (short) {
      issues.push(
        available > 0
          ? `Only ${available} left of ${product.name}.`
          : `${product.name} has just sold out.`,
      );
    }

    const item: OrderItem = {
      id: nextId('itm'),
      productId: product._id,
      name: product.name,
      sku: variant?.sku ?? product.sku,
      image: product.images?.[0]?.url,
      variant: [line.color, line.size].filter(Boolean).join(' / ') || undefined,
      size: line.size || undefined,
      color: line.color || undefined,
      price,
      quantity: line.quantity,
      total: price * line.quantity,
    };

    return [{ item, product, variant, available }];
  });

  if (options.enforceStock && issues.length) badRequest(issues.join(' '));

  const subtotal = priced.reduce((sum, line) => sum + line.item.total, 0);
  const verdict = await verifyCoupon(options.couponCode ?? '', subtotal, options.customerId);
  const payable = Math.max(0, subtotal - verdict.discount);

  const shipping = quoteShipping(settings.shipping, {
    state: options.state,
    payable,
    freeShipping: verdict.freeShipping,
  });

  const codCharge =
    options.paymentMethod === 'cod' ? Math.max(0, Number(settings.shipping.codCharge) || 0) : 0;
  const tax = quoteTax(settings.tax, payable);

  return {
    lines: priced,
    issues,
    unavailable,
    settings,
    coupon: verdict,
    totals: {
      subtotal,
      discount: verdict.discount,
      couponCode: verdict.coupon?.code,
      couponMessage: verdict.message,
      shipping: shipping.charge,
      shippingLabel: shipping.label,
      shippingEta: shipping.eta,
      freeShipping: shipping.free,
      codCharge,
      tax,
      total: payable + shipping.charge + codCharge + tax,
    },
  };
}

/** A live preview of the summary the order will be written with. */
shopRoutes.post(
  '/checkout/quote',
  rateLimit(limits.checkout),
  withCustomer,
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const quote = await quoteCart(readLines(body.items), {
      couponCode: trimmed(body.couponCode),
      state: trimmed(body.state),
      paymentMethod: trimmed(body.paymentMethod),
      customerId: req.customer?._id,
      tolerateMissing: true,
    });

    res.json({
      items: quote.lines.map((line) => ({ ...line.item, available: line.available })),
      issues: quote.issues,
      /*
       * The lines this quote could not price, exactly as they were sent, so the
       * checkout can match them against the bag it holds. The totals below
       * cover everything *except* these.
       */
      unavailable: quote.unavailable,
      ...quote.totals,
    });
  }),
);

/** Used by the cart's coupon box, which has no address or payment method yet. */
shopRoutes.post(
  '/coupons/validate',
  rateLimit(limits.checkout),
  withCustomer,
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const code = trimmed(body.code);
    if (!code) badRequest('Enter a coupon code.');

    const subtotal = Math.max(0, Math.round(Number(body.subtotal) || 0));
    const verdict = await verifyCoupon(code, subtotal, req.customer?._id);

    if (!verdict.coupon) {
      res.status(422).json({ ok: false, message: verdict.message ?? 'That code is not valid.' });
      return;
    }

    res.json({
      ok: true,
      coupon: {
        code: verdict.coupon.code,
        description: verdict.coupon.description,
        discountType: verdict.coupon.discountType,
        discountValue: verdict.coupon.discountValue,
        minOrderValue: verdict.coupon.minOrderValue,
        maxDiscount: verdict.coupon.maxDiscount,
      },
      discount: verdict.discount,
      freeShipping: verdict.freeShipping,
    });
  }),
);

/* ---------------------------------- orders ----------------------------------- */

/** Where the SOP series starts, matching the seeded data. */
const ORDER_CODE_BASE = 10100;
const ORDER_CODE_SEQUENCE = 'order_code';

/**
 * The next `SOP…` code, from an atomic counter.
 *
 * What was here before read the highest existing code, added one, and looped
 * while that code was taken. Every step of that is a read-then-write race:
 * two checkouts landing together both read `SOP10711`, both compute
 * `SOP10712`, and both find it free because neither has written yet. The
 * `while` loop does not help — it is the same race one iteration later.
 *
 * `nextSequence` is a single `findOneAndUpdate` with `$inc`, which MongoDB
 * performs atomically on one document. Every caller gets a distinct number,
 * across any number of concurrent checkouts and any number of API instances,
 * with no lock and one round trip instead of two-plus.
 *
 * The unique index on `code` (see `db/indexes.ts`) stands behind it as a
 * hard stop, so a bug here fails loudly rather than shipping two orders under
 * one code.
 */
async function nextOrderCode() {
  const seq = await nextSequence(ORDER_CODE_SEQUENCE, ORDER_CODE_BASE);
  return `SOP${seq}`;
}

/**
 * Aligns the counter with codes that already exist, once, at boot.
 *
 * Without it, a store upgrading from the old generator restarts at SOP10101
 * and collides with everything it has already shipped.
 */
export async function alignOrderCodeSequence() {
  const latest = await OrderModel.findOne({ code: /^SOP\d+$/ }, { code: 1 })
    .sort({ code: -1 })
    .lean<{ code: string }>();

  if (!latest) return;
  const highest = Number(latest.code.slice(3));
  if (!Number.isFinite(highest)) return;

  const { seedSequence } = await import('../lib/ids.js');
  await seedSequence(ORDER_CODE_SEQUENCE, highest - ORDER_CODE_BASE);
}

/** The customer this order belongs to, creating one for a first-time guest. */
export async function resolveCustomer(
  signedIn: CustomerDoc | undefined,
  { email, address }: { email: string; address: Address },
) {
  if (signedIn) return signedIn;

  const existing = await withEmailCollation(
    CustomerModel.findOne(byEmail(email)),
  ).lean<CustomerDoc>();
  if (existing) return existing;

  const created = await CustomerModel.create({
    _id: nextId('cus'),
    name: address.name,
    email,
    phone: address.phone,
    status: 'active',
    tier: 'new',
    addresses: [{ ...address, isDefault: true }],
    wishlist: [],
    ordersCount: 0,
    totalSpent: 0,
    acceptsMarketing: false,
    activity: [activity('account', 'Created by a guest checkout')],
    createdAt: nowIso(),
  });

  return created.toObject() as CustomerDoc;
}

/**
 * Gateway key → the `paymentMethod` an order records. The panel has a label for
 * every value of its own `PaymentMethod` union but none for Stripe, and as far
 * as an order is concerned a Stripe payment is a card payment.
 */
export const ORDER_PAYMENT_METHOD: Record<string, PaymentMethod> = {
  razorpay: 'razorpay',
  upi: 'upi',
  card: 'card',
  netbanking: 'netbanking',
  cod: 'cod',
  stripe: 'card',
};

/**
 * What a payment proved, when one happened.
 *
 * Every field is server-observed: the ids come from the gateway's own record of
 * the payment, not from the browser that reported it. `signatureVerified` is
 * recorded rather than assumed so an operator reading an order can tell a
 * verified capture from a manually marked one.
 */
export interface SettledPayment {
  provider: string;
  providerOrderId: string;
  providerPaymentId: string;
  signatureVerified: boolean;
  /** The gateway's own instrument label — `upi`, `card`, `netbanking`. */
  instrument?: string;
  /** Whole rupees, as captured. Compared against the order total before this is built. */
  amount: number;
}

export interface WriteOrderInput {
  quote: Awaited<ReturnType<typeof quoteCart>>;
  email: string;
  address: Address;
  customer: CustomerDoc;
  /** The gateway key the shopper chose — `cod`, `razorpay`, `upi`. */
  gatewayKey: string;
  gatewayName?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: 'paid' | 'pending';
  payment?: SettledPayment;
  notes?: string;
}

/**
 * Writes an order and everything it touches on its way out.
 *
 * **The only place an order is created.** COD calls it directly; an online
 * payment calls it from the verification route, after the gateway has confirmed
 * the money. Keeping one implementation is what stops the two paths drifting on
 * stock, coupon usage, customer tiers or the notification the panel reads —
 * and it is why "never create a paid order before verification" is a property
 * of one call site rather than a rule somebody has to remember.
 */
export async function writeOrder({
  quote,
  email,
  address,
  customer,
  gatewayKey,
  gatewayName,
  paymentMethod,
  paymentStatus,
  payment,
  notes,
}: WriteOrderInput) {
  const at = nowIso();

  /*
   * ---- 1. take the stock, before anything else exists ----
   *
   * §11. The claim is atomic per line (`lib/inventory.ts`), so two shoppers
   * racing for the last saree produce one order and one "just sold out" —
   * rather than two orders and an apology.
   *
   * It happens *first* on purpose. An order that exists is an order whose
   * stock is committed; taking the stock afterwards is how a store ends up
   * with confirmed orders it cannot fulfil. A product that is not
   * stock-controlled, or that allows backorders, is marked `unlimited` and
   * always succeeds — that is a deliberate policy the shop already offers, not
   * a hole in the guard.
   */
  const claims: StockClaim[] = quote.lines.map((line) => ({
    productId: line.product._id,
    quantity: line.item.quantity,
    variantId: line.variant?.id,
    productName: line.product.name,
    unlimited: !line.product.trackInventory || Boolean(line.product.allowBackorders),
  }));

  const claimed = await claimStock(claims);
  if (!claimed.ok) badRequest(claimed.message ?? 'One of the pieces in your bag has just sold out.');

  const code = await nextOrderCode();

  /*
   * A paid order is confirmed: the money is in, and it is ready to be picked
   * and packed. COD is confirmed too — there is nothing to collect until
   * delivery, so waiting on a payment that will not happen for a week would
   * leave every cash order sitting in `pending` for no reason. Anything else
   * is written as awaiting payment rather than claiming money nobody took.
   */
  const status = paymentStatus === 'paid' || gatewayKey === 'cod' ? 'confirmed' : 'pending';

  const label =
    paymentStatus === 'paid'
      ? 'Payment received'
      : gatewayKey === 'cod'
        ? 'Order confirmed'
        : 'Order placed';

  let order;
  try {
    order = await OrderModel.create({
      _id: nextId('ord'),
      code,
      customerId: customer._id,
      customerName: address.name || customer.name,
      customerEmail: email,
      customerPhone: address.phone || customer.phone,
      items: quote.lines.map((line) => line.item),

      subtotal: quote.totals.subtotal,
      discount: quote.totals.discount,
      couponCode: quote.totals.couponCode,
      tax: quote.totals.tax,
      shipping: quote.totals.shipping,
      codCharge: quote.totals.codCharge,
      shippingLabel: quote.totals.shippingLabel,
      shippingEta: quote.totals.shippingEta,
      total: quote.totals.total,

      status,
      paymentStatus,
      paymentMethod,
      /*
       * The gateway's own references, so a refund or a dispute can be traced
       * from the panel back to Razorpay without a spreadsheet in between.
       */
      paymentReference: payment?.providerPaymentId,
      paymentProvider: payment?.provider,
      paymentOrderId: payment?.providerOrderId,
      paidAt: paymentStatus === 'paid' ? at : undefined,
      fulfillment: 'unfulfilled',
      shippingAddress: address,
      billingAddress: address,
      notes: notes || undefined,
      timeline: [
        {
          id: nextId('evt'),
          status,
          label,
          note: payment
            ? `Paid on the SOPII storefront · ${gatewayName ?? gatewayKey} · ${payment.providerPaymentId}`
            : `Placed on the SOPII storefront · ${gatewayName ?? gatewayKey}`,
          at,
          by: 'Storefront',
        },
      ],
      placedAt: at,
      updatedAt: at,
    });
  } catch (error) {
    /*
     * ---- 2b. the compensation ----
     *
     * The stock is already taken. If writing the order fails — a duplicate
     * code, a validation error, the database going away — those units would be
     * gone from the shelf with nothing to show for them, and the product would
     * read as sold out to everyone afterwards. Putting them back is the only
     * correct thing to do here, and it is why the claim returns enough
     * information to undo itself.
     */
    await releaseStock(claims);
    logger.error('order.write_failed', { detail: code, error });
    throw error;
  }

  /* ---- 3. everything the order touches on its way out ---- */

  /*
   * The stock ledger the panel's inventory history reads.
   *
   * `previousStock` is the value the quote saw, which under concurrency may
   * not be the value at the instant of the claim. That is honest for an audit
   * trail — it records what this order was priced against — and the
   * authoritative number is the product document, which the atomic claim keeps
   * exact. Reading each one back to make the ledger perfect would cost a round
   * trip per line on the checkout path, for a field nobody reconciles against.
   */
  const movements = quote.lines.map((line) => {
    const previousStock = Number(line.product.stock) || 0;
    return {
      _id: nextId('stk'),
      productId: line.product._id,
      productName: line.product.name,
      sku: line.item.sku,
      type: 'sale' as const,
      quantity: line.item.quantity,
      previousStock,
      newStock: previousStock - line.item.quantity,
      reason: `Storefront order — ${code}`,
      reference: code,
      admin: 'Storefront',
      at,
    };
  });

  /*
   * Note what is *not* in this list any more: the stock decrements, which
   * `claimStock` performed atomically above, and the panel's notification,
   * which is now a queued job. What remains is bookkeeping that has to be
   * durable but that correctness does not depend on being instant — awaited
   * rather than fired and forgotten, because a customer's order count and a
   * coupon's usage must not be allowed to drift.
   */
  await Promise.all([
    // Revenue and the updated stamp. Units sold moved into the atomic claim.
    ...quote.lines.map((line) =>
      ProductModel.updateOne(
        { _id: line.product._id },
        { $inc: { revenue: line.item.total }, $set: { updatedAt: at } },
      ),
    ),

    StockMovementModel.insertMany(movements),

    CustomerModel.updateOne(
      { _id: customer._id },
      {
        $inc: { ordersCount: 1, totalSpent: quote.totals.total },
        $set: {
          lastOrderAt: at,
          tier: tierFor((Number(customer.totalSpent) || 0) + quote.totals.total),
          ...(customer.addresses?.length ? {} : { addresses: [{ ...address, isDefault: true }] }),
        },
        $push: {
          activity: {
            $each: [activity('order', `Placed order ${code}`)],
            $slice: -50,
          },
        },
      },
    ),

    /*
     * Coupon usage, guarded rather than blindly incremented.
     *
     * The filter refuses the increment once the limit is reached, so a code
     * with 100 uses cannot be redeemed 140 times by 140 simultaneous
     * checkouts — the same read-then-write race the stock claim fixes, in its
     * other common form. `usageLimit: 0` means unlimited, which is why it is
     * matched explicitly rather than left to the comparison.
     */
    quote.coupon.coupon
      ? CouponModel.updateOne(
          {
            _id: quote.coupon.coupon._id,
            $or: [
              { usageLimit: { $lte: 0 } },
              { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
            ],
          },
          { $inc: { usedCount: 1 } },
        )
      : Promise.resolve(),
  ]);

  /*
   * ---- 4. everything that can happen afterwards ----
   *
   * §13, §14. The panel's notification, the confirmation email and the
   * WhatsApp message are all work the *store* wants and the *shopper* should
   * not wait for. Enqueuing them costs one insert; doing them inline used to
   * put an SMTP connection and a Meta API call on the critical path of a
   * payment that had already succeeded.
   *
   * `enqueue` never throws, so a queue problem cannot fail an order that has
   * already taken money.
   */
  void enqueue(
    JOB.orderPlaced,
    {
      orderId: order._id,
      code,
      customerName: address.name || customer.name,
      customerEmail: email,
      customerPhone: address.phone || customer.phone,
      total: quote.totals.total,
    },
    { dedupeKey: `order:${code}` },
  );

  // Stock and revenue moved, so the cached catalogue and dashboard are stale.
  void onWrite.order();

  logger.info('order.placed', {
    detail: code,
    userId: customer._id,
    paymentMethod,
    total: quote.totals.total,
  });

  return order;
}

/* ------------------------------ placing an order ---------------------------- */

/**
 * `POST /orders` — the offline path only.
 *
 * Cash on delivery, and any other gateway that settles after the goods arrive.
 * An online method is **refused here**: it has to go through
 * `/payments/razorpay/order` → popup → `/payments/razorpay/verify`, which is
 * the only route that can write a paid order. Without this refusal the whole
 * payment flow would be one `fetch` away from being skipped — a client could
 * simply call this endpoint with `paymentMethod: 'razorpay'` and get an order
 * nobody paid for.
 */
shopRoutes.post(
  '/orders',
  rateLimit(limits.order),
  withCustomer,
  ah(async (req, res) => {
    const body = req.body as Record<string, unknown>;

    /*
     * §10, and the reason this whole route is wrapped.
     *
     * A double-tapped Place Order on a phone with a slow connection used to
     * produce two orders for one bag, and a customer charged twice on
     * delivery. `withIdempotency` runs the body at most once per key and
     * replays the first response to everything that follows — so the second
     * tap, the browser's automatic retry and the shopper reloading the page
     * all receive the same receipt for the same single order.
     *
     * The key is the `Idempotency-Key` header when a client sends one and is
     * otherwise derived from the caller plus the exact bag, which is what
     * covers the client that sends no header at all.
     */
    const key = idempotencyKey(req, 'order');

    const outcome = await withIdempotency(key, body, async () => {
      const email = assertEmail(body.email ?? req.customer?.email);
      const address = readAddress(body.address ?? body.shippingAddress);
      const lines = readLines(body.items);
      const requested = trimmed(body.paymentMethod);

      /*
       * Checked before anything is priced, so the refusal is cheap and cannot be
       * confused with a stock or coupon problem.
       */
      if (isOnlineGateway(requested)) {
        badRequest(
          'Online payments must be completed through the payment gateway. Please use Pay Now.',
        );
      }

      const quote = await quoteCart(lines, {
        couponCode: trimmed(body.couponCode),
        state: address.state,
        paymentMethod: requested,
        customerId: req.customer?._id,
        enforceStock: true,
      });

      /*
       * Only a gateway the store has switched on may be chosen — a disabled
       * payment method is not merely hidden in the UI, it is refused here. It is
       * never defaulted either: the fee and the resulting order status both
       * depend on it, so an unspecified method is a question, not a guess.
       */
      const gateways = quote.settings.payments.filter((gateway) => gateway.enabled);
      const gateway = gateways.find((entry) => entry.key === requested);

      if (gateways.length && !gateway) {
        badRequest(requested ? 'That payment method is not available.' : 'Choose a payment method.');
      }

      // A store with no gateways configured at all can still take cash.
      const paymentMethod = ORDER_PAYMENT_METHOD[requested] ?? 'cod';

      /*
       * COD eligibility, on the total the server just computed — not the one the
       * browser showed. The checkout greys the option out with the same message,
       * but a request that arrives anyway is refused here.
       */
      if (paymentMethod === 'cod') {
        const problem = codProblem(await resolveCodRules(), quote.totals.total);
        if (problem) badRequest(problem);
      }

      if (quote.coupon.message && trimmed(body.couponCode)) badRequest(quote.coupon.message);

      const customer = await resolveCustomer(req.customer, { email, address });

      const order = await writeOrder({
        quote,
        email,
        address,
        customer,
        gatewayKey: requested,
        gatewayName: gateway?.name,
        paymentMethod,
        // Nothing has been collected — that is the whole point of COD.
        paymentStatus: 'pending',
        notes: trimmed(body.notes),
      });

      return { status: 201, body: { order: order.toJSON() } };
    });

    privateNoStore(res);
    /*
     * A replay is reported so the shop can tell "we placed your order" from
     * "you already placed this one", and so the metric for how often it
     * happens exists at all. Both answers carry the same order.
     */
    res.status(outcome.status).json({ ...outcome.body, duplicate: !outcome.fresh });
  }),
);

/**
 * The fields an order *list* needs.
 *
 * The full document carries every line item, both addresses and the whole
 * timeline — a few kilobytes each, and none of it is drawn on a list row. At
 * fifty orders that is the difference between a 4 KB response and a 200 KB
 * one, on a connection that is usually a phone's.
 *
 * The detail route still returns everything; a list is a list.
 */
const ORDER_LIST_FIELDS = {
  code: 1,
  status: 1,
  paymentStatus: 1,
  paymentMethod: 1,
  total: 1,
  placedAt: 1,
  trackingNumber: 1,
  courier: 1,
  shippingEta: 1,
  customerEmail: 1,
  /* Enough of the bag to draw a thumbnail and a "+3 more" on the row. */
  items: { $slice: 3 },
} as const;

/**
 * A shopper's own order history, paginated.
 *
 * This used to be `.limit(100)` with no page parameter, which is two problems
 * wearing one coat: a customer with more than a hundred orders could not reach
 * the older ones at all, and every visit to the account page shipped a hundred
 * complete order documents to a phone.
 */
shopRoutes.get(
  '/account/orders',
  requireCustomer,
  ah(async (req, res) => {
    const pageSize = Math.min(50, Math.max(1, num(req.query, 'pageSize', 20)));
    const page = Math.max(1, num(req.query, 'page', 1));

    /* Matched on id *or* email so orders placed as a guest, before the account
       existed, still show up in the history once they sign in. */
    const filter = {
      $or: [
        { customerId: req.customer!._id },
        { customerEmail: req.customer!.email },
      ],
    };

    const [orders, total] = await Promise.all([
      OrderModel.find(filter, ORDER_LIST_FIELDS)
        .collation(CI_COLLATION)
        .sort({ placedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      OrderModel.countDocuments(filter).collation(CI_COLLATION),
    ]);

    privateNoStore(res);
    res.json({
      items: serializeMany(orders),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }),
);

/**
 * One order, by code or id. A signed-in shopper gets their own; anyone else has
 * to supply the email it was placed with, so an order code alone leaks nothing.
 */
shopRoutes.get(
  '/orders/:idOrCode',
  withCustomer,
  ah(async (req, res) => {
    const { idOrCode } = req.params;
    const order = await OrderModel.findOne({ $or: [{ _id: idOrCode }, { code: idOrCode }] }).lean();
    if (!order) notFound('Order');

    const owned = req.customer && order.customerId === req.customer._id;
    const email = normaliseEmail(req.query.email);
    const matchesEmail = Boolean(email) && order.customerEmail?.toLowerCase() === email;

    if (!owned && !matchesEmail) {
      badRequest('Add the email address this order was placed with to view it.');
    }

    // An order is one person's business. Never let a shared cache hold one.
    privateNoStore(res);
    res.json({ order: serialize(order) });
  }),
);

/* -------------------------------- newsletter ---------------------------------- */

/**
 * Subscribing creates (or flags) a customer record with `acceptsMarketing`,
 * which is where the panel's marketing segment already reads from — so there
 * is no second list to keep in sync.
 */
shopRoutes.post(
  '/newsletter',
  rateLimit(limits.publicWrite),
  ah(async (req, res) => {
    const email = assertEmail((req.body as Record<string, unknown>).email);
    const existing = await withEmailCollation(
      CustomerModel.findOne(byEmail(email)),
    ).lean<CustomerDoc>();

    if (existing) {
      if (!existing.acceptsMarketing) {
        await CustomerModel.updateOne(
          { _id: existing._id },
          {
            $set: { acceptsMarketing: true },
            $push: {
              activity: { $each: [activity('account', 'Subscribed to the newsletter')], $slice: -50 },
            },
          },
        );
      }
      res.json({ subscribed: true, message: 'You are on the list. Look out for our next drop.' });
      return;
    }

    await CustomerModel.create({
      _id: nextId('cus'),
      // No name to go on yet — the local part reads better than a blank field.
      name: email.split('@')[0],
      email,
      status: 'active',
      tier: 'new',
      addresses: [],
      wishlist: [],
      ordersCount: 0,
      totalSpent: 0,
      acceptsMarketing: true,
      activity: [activity('account', 'Subscribed to the newsletter')],
      createdAt: nowIso(),
    });

    res.status(201).json({
      subscribed: true,
      message: 'You are on the list. Look out for our next drop.',
    });
  }),
);
