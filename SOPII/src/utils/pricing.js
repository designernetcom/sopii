/**
 * Order maths, mirrored from the API.
 * ===========================================================================
 * `POST /api/storefront/checkout/quote` is what actually prices a bag, and the
 * checkout renders its answer. These helpers exist so the summary has
 * something correct to show *before* that round trip lands — on the first
 * paint, while a keystroke is still settling, or if the API is unreachable.
 *
 * They read the same store settings the server does (rates by zone, the
 * free-shipping threshold, the COD fee, whether prices include tax), so the
 * preview and the authoritative quote agree unless a price changed underfoot.
 */

/** The delivery zone covering a state, or null for the flat rate. */
export function zoneForState(zones = [], state) {
  const key = String(state ?? '').trim().toLowerCase();
  if (!key) return null;
  return (
    zones.find((zone) =>
      (zone.states ?? []).some((name) => String(name).trim().toLowerCase() === key),
    ) ?? null
  );
}

/**
 * What delivery costs for one order.
 *
 * @param {object} settings  From `useSiteSettings()`.
 * @param {object} options
 * @param {string} [options.state]        Delivery state, which picks the zone.
 * @param {number} options.payable        Subtotal after discount.
 * @param {boolean} [options.freeShipping] Set by a free-shipping coupon.
 */
export function shippingFor(settings, { state, payable, freeShipping = false }) {
  const zone = zoneForState(settings.shippingZones, state);
  const baseCharge = Math.max(0, Number(zone?.charge ?? settings.shippingFee) || 0);
  const threshold = Number(settings.freeShippingThreshold) || 0;
  const free = freeShipping || (threshold > 0 && payable >= threshold);

  return {
    charge: free ? 0 : baseCharge,
    baseCharge,
    free,
    label: zone?.name ? `Standard Delivery — ${zone.name}` : 'Standard Delivery',
    eta: zone?.etaDays || settings.processingTime || '',
  };
}

/**
 * A local preview of the checkout summary, in the same shape the quote
 * endpoint answers with, so the two are interchangeable in the UI.
 */
export function localQuote({ items, coupon, discount, settings, state, paymentMethod }) {
  const subtotal = items.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const payable = Math.max(0, subtotal - discount);

  const shipping = shippingFor(settings, {
    state,
    payable,
    freeShipping: coupon?.type === 'shipping',
  });

  const codCharge = paymentMethod === 'cod' ? Math.max(0, Number(settings.codCharge) || 0) : 0;
  // Indian retail quotes tax-inclusive prices, in which case nothing is added.
  const tax = settings.pricesIncludeTax
    ? 0
    : Math.round((payable * (Number(settings.taxRate) || 0)) / 100);

  return {
    subtotal,
    discount,
    couponCode: coupon?.code ?? null,
    shipping: shipping.charge,
    shippingLabel: shipping.label,
    shippingEta: shipping.eta,
    freeShipping: shipping.free,
    codCharge,
    tax,
    total: payable + shipping.charge + codCharge + tax,
    /** Tells the UI this is the browser's guess, not the store's answer. */
    estimated: true,
  };
}

/** Cart lines → the `{ productId, quantity, size, color }` the API prices. */
export const toOrderLines = (items) =>
  items.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    size: line.size,
    color: line.color,
  }));
