/*
 * Store settings, loaded once per request that needs them.
 * ---------------------------------------------------------------------------
 * Both the public feed (`routes/storefront.ts`) and the shop's checkout
 * (`routes/shop.ts`) price against the same configuration, so the rates a
 * shopper is quoted are the rates the order is written with. Everything here
 * tolerates a half-filled settings document: a store that has never opened the
 * settings page still checks out, just at zero shipping and zero tax.
 */

import type { PaymentGateway, ShippingSettings, ShippingZone, TaxSettings } from '@/types';
import { SETTINGS_ID, SettingsModel } from '../db/models.js';
import { cached, cacheKey, invalidate, NAMESPACE, TTL } from './cache.js';

const SHIPPING_DEFAULTS: ShippingSettings = {
  flatRate: 0,
  freeShippingThreshold: 0,
  codCharge: 0,
  processingTime: '',
  zones: [],
};

const TAX_DEFAULTS: TaxSettings = {
  gstin: '',
  pricesIncludeTax: true,
  defaultRate: 0,
  rules: [],
};

export interface StoreConfig {
  store: Record<string, unknown> | null;
  shipping: ShippingSettings;
  tax: TaxSettings;
  payments: PaymentGateway[];
}

const SETTINGS_KEY = cacheKey(NAMESPACE.settings, 'store');

/**
 * The store's configuration, cached.
 *
 * This is called on *every* checkout quote, every order, every payment-methods
 * request and every storefront bootstrap — and it reads one document that
 * changes a few times a year. Uncached, it was one of the highest-frequency
 * queries in the system for no return at all.
 *
 * A minute of staleness is the trade, and it is not really a trade: the write
 * path calls `invalidateSettings()`, so an operator saving the settings page
 * sees the change immediately rather than a minute later. The TTL is the
 * backstop for a write that happened somewhere this process could not observe
 * — another instance, or a direct database edit.
 *
 * The `authentication` block is deliberately not part of this shape and never
 * has been: it holds an encrypted credential, it is read through
 * `auth/whatsappConfig.ts`, and it must not be sitting in a cache that the
 * public feed also reads from.
 */
export async function loadSettings(): Promise<StoreConfig> {
  return cached<StoreConfig>(SETTINGS_KEY, TTL.settings, async () => {
    const doc = await SettingsModel.findById(SETTINGS_ID)
      // Projected rather than whole: the settings document also carries the
      // authentication block, and there is no reason for it to travel with a
      // shipping rate.
      .select('store shipping tax payments')
      .lean();

    return {
      store: (doc?.store as Record<string, unknown>) ?? null,
      shipping: { ...SHIPPING_DEFAULTS, ...((doc?.shipping as Partial<ShippingSettings>) ?? {}) },
      tax: { ...TAX_DEFAULTS, ...((doc?.tax as Partial<TaxSettings>) ?? {}) },
      payments: (doc?.payments as PaymentGateway[]) ?? [],
    };
  });
}

/** Called by every route that writes settings, so a save takes effect at once. */
export const invalidateSettings = () => invalidate(NAMESPACE.settings, NAMESPACE.catalog);

/** Only the gateways switched on — the storefront renders one option each. */
export const enabledGateways = (payments: PaymentGateway[]) =>
  payments.filter((gateway) => gateway.enabled);

export const liveZones = (shipping: ShippingSettings) =>
  (shipping.zones ?? []).filter((zone) => zone.enabled);

/**
 * The zone covering a delivery state, matched case-insensitively so "tamil
 * nadu" typed into the checkout finds "Tamil Nadu". `null` means no zone
 * claims the state and the flat rate applies.
 */
export function zoneFor(shipping: ShippingSettings, state: string | undefined): ShippingZone | null {
  const key = state?.trim().toLowerCase();
  if (!key) return null;
  return (
    liveZones(shipping).find((zone) =>
      (zone.states ?? []).some((name) => name.trim().toLowerCase() === key),
    ) ?? null
  );
}

export interface ShippingQuote {
  charge: number;
  label: string;
  eta: string;
  /** The rate before the free-shipping threshold or a coupon waived it. */
  baseCharge: number;
  free: boolean;
}

/**
 * What delivery costs for one order.
 *
 * @param payable       Subtotal after any discount — what the threshold is read against.
 * @param freeShipping  Set by a `free_shipping` coupon, which beats the threshold.
 */
export function quoteShipping(
  shipping: ShippingSettings,
  { state, payable, freeShipping = false }: { state?: string; payable: number; freeShipping?: boolean },
): ShippingQuote {
  const zone = zoneFor(shipping, state);
  const baseCharge = Math.max(0, Number(zone?.charge ?? shipping.flatRate) || 0);

  const threshold = Number(shipping.freeShippingThreshold) || 0;
  const free = freeShipping || (threshold > 0 && payable >= threshold);

  return {
    charge: free ? 0 : baseCharge,
    baseCharge,
    free,
    label: zone?.name ? `Standard Delivery — ${zone.name}` : 'Standard Delivery',
    eta: zone?.etaDays || shipping.processingTime || '',
  };
}

/**
 * GST on an order. Indian retail almost always quotes tax-inclusive prices, in
 * which case nothing is added on top and the order records zero — the tax is
 * already inside the line prices.
 */
export function quoteTax(tax: TaxSettings, payable: number) {
  if (tax.pricesIncludeTax) return 0;
  const rate = Number(tax.defaultRate) || 0;
  return Math.round((payable * rate) / 100);
}
