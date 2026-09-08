import { describe, it, expect } from 'vitest';

import { localQuote, shippingFor, toOrderLines, zoneForState } from './pricing';

/*
 * Order maths (§10).
 * ===========================================================================
 * These helpers price the bag *before* `POST /checkout/quote` answers, so the
 * summary has something correct to show on first paint. That makes their
 * contract narrow and unforgiving: the preview and the server's authoritative
 * quote have to agree, or the shopper watches the total change under them
 * between the summary and the payment sheet.
 *
 * Money is also the one place a rounding slip is not cosmetic, so the
 * arithmetic is asserted exactly rather than approximately.
 */

const SETTINGS = {
  shippingFee: 99,
  freeShippingThreshold: 2000,
  codCharge: 50,
  taxRate: 5,
  pricesIncludeTax: true,
  processingTime: '3-5 days',
  shippingZones: [
    { name: 'Metro', charge: 49, etaDays: '2-3 days', states: ['Maharashtra', 'Delhi'] },
    { name: 'Remote', charge: 149, etaDays: '6-9 days', states: ['Ladakh'] },
  ],
};

const line = (price, quantity = 1, extra = {}) => ({
  productId: 'prd_1',
  price,
  quantity,
  size: 'Free Size',
  color: 'Indigo',
  ...extra,
});

/* --------------------------------- zones ----------------------------------- */

describe('zoneForState', () => {
  it('finds the zone covering a state', () => {
    expect(zoneForState(SETTINGS.shippingZones, 'Maharashtra')?.name).toBe('Metro');
    expect(zoneForState(SETTINGS.shippingZones, 'Ladakh')?.name).toBe('Remote');
  });

  it('matches regardless of case and surrounding space', () => {
    // The state arrives from a free-text address field, not a select.
    expect(zoneForState(SETTINGS.shippingZones, '  maharashtra ')?.name).toBe('Metro');
    expect(zoneForState(SETTINGS.shippingZones, 'DELHI')?.name).toBe('Metro');
  });

  it('answers null for a state in no zone, so the flat rate applies', () => {
    expect(zoneForState(SETTINGS.shippingZones, 'Goa')).toBeNull();
  });

  it('answers null for an address with no state yet', () => {
    expect(zoneForState(SETTINGS.shippingZones, '')).toBeNull();
    expect(zoneForState(SETTINGS.shippingZones, undefined)).toBeNull();
    expect(zoneForState(undefined, 'Maharashtra')).toBeNull();
  });
});

/* ------------------------------- shipping ---------------------------------- */

describe('shippingFor', () => {
  it('charges the zone rate over the flat rate', () => {
    const out = shippingFor(SETTINGS, { state: 'Maharashtra', payable: 500 });

    expect(out.charge).toBe(49);
    expect(out.label).toBe('Standard Delivery — Metro');
    expect(out.eta).toBe('2-3 days');
  });

  it('falls back to the flat rate and the store-wide processing time', () => {
    const out = shippingFor(SETTINGS, { state: 'Goa', payable: 500 });

    expect(out.charge).toBe(99);
    expect(out.label).toBe('Standard Delivery');
    expect(out.eta).toBe('3-5 days');
  });

  it('is free once the order reaches the threshold', () => {
    const out = shippingFor(SETTINGS, { state: 'Ladakh', payable: 2000 });

    expect(out.free).toBe(true);
    expect(out.charge).toBe(0);
    // The rate is still reported, so the summary can show what was saved.
    expect(out.baseCharge).toBe(149);
  });

  it('charges one rupee below the threshold', () => {
    // Off-by-one at the boundary is the classic way a "free over ₹2000" promise
    // quietly becomes "free over ₹2001".
    expect(shippingFor(SETTINGS, { state: 'Goa', payable: 1999 }).charge).toBe(99);
    expect(shippingFor(SETTINGS, { state: 'Goa', payable: 2000 }).charge).toBe(0);
  });

  it('is free when a coupon says so, whatever the subtotal', () => {
    const out = shippingFor(SETTINGS, { state: 'Ladakh', payable: 100, freeShipping: true });

    expect(out.free).toBe(true);
    expect(out.charge).toBe(0);
  });

  it('never charges a negative rate from a misconfigured zone', () => {
    const broken = { ...SETTINGS, shippingZones: [{ name: 'Bad', charge: -50, states: ['Goa'] }] };
    expect(shippingFor(broken, { state: 'Goa', payable: 100 }).charge).toBe(0);
  });

  it('treats a missing threshold as "never free" rather than "always free"', () => {
    const noThreshold = { ...SETTINGS, freeShippingThreshold: 0 };
    expect(shippingFor(noThreshold, { state: 'Goa', payable: 999_999 }).charge).toBe(99);
  });
});

/* -------------------------------- the quote -------------------------------- */

describe('localQuote', () => {
  it('totals a simple prepaid bag', () => {
    const quote = localQuote({
      items: [line(1500, 2)],
      coupon: null,
      discount: 0,
      settings: SETTINGS,
      state: 'Maharashtra',
      paymentMethod: 'razorpay',
    });

    expect(quote.subtotal).toBe(3000);
    // 3000 clears the 2000 threshold, so delivery is free.
    expect(quote.shipping).toBe(0);
    expect(quote.codCharge).toBe(0);
    expect(quote.tax).toBe(0);
    expect(quote.total).toBe(3000);
  });

  it('sums lines at their own prices and quantities', () => {
    const quote = localQuote({
      items: [line(1200, 1), line(450, 3, { productId: 'prd_2' })],
      discount: 0,
      settings: SETTINGS,
      state: 'Goa',
      paymentMethod: 'razorpay',
    });

    expect(quote.subtotal).toBe(1200 + 450 * 3);
  });

  it('adds the COD fee only for cash on delivery', () => {
    const bag = { items: [line(1500)], discount: 0, settings: SETTINGS, state: 'Goa' };

    expect(localQuote({ ...bag, paymentMethod: 'cod' }).codCharge).toBe(50);
    expect(localQuote({ ...bag, paymentMethod: 'razorpay' }).codCharge).toBe(0);
  });

  it('applies the discount before deciding whether delivery is free', () => {
    // A ₹2100 bag with ₹300 off is a ₹1800 order, and ₹1800 does not clear the
    // ₹2000 threshold. Testing the threshold against the subtotal instead is
    // the mistake that gives away free delivery on discounted orders.
    const quote = localQuote({
      items: [line(2100)],
      discount: 300,
      settings: SETTINGS,
      state: 'Goa',
      paymentMethod: 'razorpay',
    });

    expect(quote.subtotal).toBe(2100);
    expect(quote.discount).toBe(300);
    expect(quote.shipping).toBe(99);
    expect(quote.total).toBe(2100 - 300 + 99);
  });

  it('honours a free-shipping coupon and records its code', () => {
    const quote = localQuote({
      items: [line(500)],
      coupon: { code: 'FREESHIP', type: 'shipping' },
      discount: 0,
      settings: SETTINGS,
      state: 'Ladakh',
      paymentMethod: 'razorpay',
    });

    expect(quote.freeShipping).toBe(true);
    expect(quote.shipping).toBe(0);
    expect(quote.couponCode).toBe('FREESHIP');
  });

  it('never lets a discount larger than the bag produce a negative total', () => {
    const quote = localQuote({
      items: [line(500)],
      discount: 900,
      settings: SETTINGS,
      state: 'Goa',
      paymentMethod: 'razorpay',
    });

    // Payable floors at zero; delivery is still owed on a fully discounted bag.
    expect(quote.total).toBe(99);
    expect(quote.total).toBeGreaterThanOrEqual(0);
  });

  it('adds no tax when prices already include it, which is the Indian default', () => {
    const quote = localQuote({
      items: [line(1000)],
      discount: 0,
      settings: SETTINGS,
      state: 'Goa',
      paymentMethod: 'razorpay',
    });

    expect(quote.tax).toBe(0);
  });

  it('adds tax on the discounted amount when prices exclude it', () => {
    const quote = localQuote({
      items: [line(1000)],
      discount: 200,
      settings: { ...SETTINGS, pricesIncludeTax: false },
      state: 'Goa',
      paymentMethod: 'razorpay',
    });

    // 5% of 800, not of 1000.
    expect(quote.tax).toBe(40);
    expect(quote.total).toBe(800 + 99 + 40);
  });

  it('rounds tax to whole rupees rather than carrying paise into the total', () => {
    const quote = localQuote({
      items: [line(333)],
      discount: 0,
      settings: { ...SETTINGS, pricesIncludeTax: false, taxRate: 5 },
      state: 'Goa',
      paymentMethod: 'razorpay',
    });

    expect(quote.tax).toBe(Math.round((333 * 5) / 100));
    expect(Number.isInteger(quote.total)).toBe(true);
  });

  it('totals an empty bag to nothing but the delivery it would owe', () => {
    const quote = localQuote({
      items: [],
      discount: 0,
      settings: SETTINGS,
      state: 'Goa',
      paymentMethod: 'razorpay',
    });

    expect(quote.subtotal).toBe(0);
    expect(quote.total).toBe(99);
  });

  it('marks itself estimated, so the UI never presents it as the store’s answer', () => {
    const quote = localQuote({
      items: [line(100)],
      discount: 0,
      settings: SETTINGS,
      state: 'Goa',
      paymentMethod: 'cod',
    });

    expect(quote.estimated).toBe(true);
  });

  it('adds up to exactly its own parts', () => {
    // The summary renders these five lines and the total; they have to agree.
    const quote = localQuote({
      items: [line(700, 2)],
      discount: 100,
      settings: { ...SETTINGS, pricesIncludeTax: false },
      state: 'Ladakh',
      paymentMethod: 'cod',
    });

    expect(quote.total).toBe(
      quote.subtotal - quote.discount + quote.shipping + quote.codCharge + quote.tax,
    );
  });
});

/* ------------------------------- order lines ------------------------------- */

describe('toOrderLines', () => {
  it('sends only the fields the API prices, never the price itself', () => {
    // The server re-prices from its own catalogue. A price sent from the
    // browser is a number an attacker chose.
    const lines = toOrderLines([line(1500, 2)]);

    expect(lines).toEqual([
      { productId: 'prd_1', quantity: 2, size: 'Free Size', color: 'Indigo' },
    ]);
    expect(lines[0]).not.toHaveProperty('price');
  });

  it('maps an empty bag to an empty list', () => {
    expect(toOrderLines([])).toEqual([]);
  });
});
