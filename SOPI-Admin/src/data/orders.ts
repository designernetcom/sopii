import type {
  FulfillmentStatus,
  Order,
  OrderEvent,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@/types';
import { products } from './products';
import { applyCustomerRollups, customers, makeAddress } from './customers';
import { ORDER_STATUS, ORDER_STATUS_FLOW } from '@/utils/constants';
import { chance, daysAgo, pick, pickMany, randInt } from './seed';

const COURIERS = ['Delhivery', 'Blue Dart', 'DTDC', 'Ekart', 'Shiprocket'];
const ADMINS = ['Rajesh Gawas', 'Meera Nair', 'Aditya Rao'];

/** Weighted so the pipeline looks like a live store rather than a uniform sample. */
const STATUS_WEIGHTS: [OrderStatus, number][] = [
  ['delivered', 46],
  ['shipped', 14],
  ['processing', 10],
  ['confirmed', 8],
  ['pending', 10],
  ['cancelled', 7],
  ['returned', 5],
];

function weightedStatus(): OrderStatus {
  const total = STATUS_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = (randInt(0, 9999) / 10000) * total;
  for (const [status, weight] of STATUS_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return status;
  }
  return 'delivered';
}

function paymentFor(status: OrderStatus, method: PaymentMethod): PaymentStatus {
  if (status === 'cancelled') return chance(0.5) ? 'refunded' : 'failed';
  if (status === 'returned') return 'refunded';
  if (method === 'cod') return status === 'delivered' ? 'paid' : 'pending';
  return chance(0.94) ? 'paid' : 'pending';
}

function fulfillmentFor(status: OrderStatus): FulfillmentStatus {
  if (status === 'delivered' || status === 'shipped') return 'fulfilled';
  if (status === 'returned') return 'returned';
  if (status === 'processing') return 'partial';
  return 'unfulfilled';
}

function timelineFor(status: OrderStatus, placedAt: string): OrderEvent[] {
  const placed = new Date(placedAt);
  const events: OrderEvent[] = [];
  const stops =
    status === 'cancelled'
      ? ['pending', 'confirmed']
      : status === 'returned'
        ? ['pending', 'confirmed', 'processing', 'shipped', 'delivered']
        : ORDER_STATUS_FLOW.slice(0, ORDER_STATUS_FLOW.indexOf(status) + 1);

  (stops as OrderStatus[]).forEach((stop, i) => {
    const at = new Date(placed.getTime() + i * randInt(6, 30) * 3600 * 1000);
    events.push({
      id: `evt-${i}`,
      status: stop,
      label: i === 0 ? 'Order placed' : ORDER_STATUS[stop].label,
      at: at.toISOString(),
      by: i === 0 ? 'Customer' : pick(ADMINS),
      note:
        stop === 'shipped'
          ? `Handed to ${pick(COURIERS)} for delivery.`
          : stop === 'delivered'
            ? 'Delivered and signed for by the customer.'
            : undefined,
    });
  });

  if (status === 'cancelled' || status === 'returned') {
    const last = events[events.length - 1];
    events.push({
      id: `evt-final`,
      status,
      label: ORDER_STATUS[status].label,
      at: new Date(new Date(last.at).getTime() + randInt(8, 48) * 3600 * 1000).toISOString(),
      by: status === 'cancelled' ? pick(['Customer', ...ADMINS]) : 'Customer',
      note:
        status === 'cancelled'
          ? pick([
              'Customer requested cancellation before dispatch.',
              'Payment could not be verified.',
              'Item unavailable in the selected variant.',
            ])
          : pick([
              'Size did not fit — return approved.',
              'Colour differed from expectation.',
              'Damaged in transit — refund issued.',
            ]),
    });
  }
  return events;
}

const sellableProducts = products.filter((p) => p.status === 'published');

/* Only a slice of the registered base actually buys — this is what produces a
 * believable mix of one-time and returning customers in the reports. */
const buyerPool = customers.filter((_, i) => i % 9 === 0);

const TOTAL = 1248;

export const orders: Order[] = Array.from({ length: TOTAL }, (_, index) => {
  const customer = pick(buyerPool);
  // Skewed towards recent activity, with a long tail across the trailing year.
  const placedDaysAgo = chance(0.55) ? randInt(0, 60) : randInt(61, 364);
  const placedAt = daysAgo(placedDaysAgo, 23);
  const status = placedDaysAgo < 3 ? pick(['pending', 'confirmed', 'processing'] as OrderStatus[]) : weightedStatus();

  const chosen = pickMany(sellableProducts, randInt(1, 4));

  const items: OrderItem[] = chosen.map((product, i) => {
    const quantity = randInt(1, 3);
    const variant = product.variants.length ? pick(product.variants) : undefined;
    const price = variant?.price ?? product.price;
    return {
      id: `itm-${index}-${i}`,
      productId: product.id,
      name: product.name,
      sku: variant?.sku ?? product.sku,
      image: product.images[0]?.url,
      variant: variant ? [variant.color, variant.size].filter(Boolean).join(' / ') : undefined,
      price,
      quantity,
      total: price * quantity,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const hasCoupon = chance(0.28);
  const discount = hasCoupon ? Math.round(subtotal * (randInt(5, 20) / 100)) : 0;
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * 0.12);
  const shipping = taxable >= 1999 ? 0 : 99;
  const total = taxable + tax + shipping;

  const method = pick<PaymentMethod>(['razorpay', 'upi', 'card', 'netbanking', 'cod']);
  const address = customer.addresses[0] ?? makeAddress(customer.name, customer.phone);
  const shipped = status === 'shipped' || status === 'delivered' || status === 'returned';

  return {
    id: `ord_${String(index + 1).padStart(4, '0')}`,
    code: `SOP${10101 + index}`,
    customerId: customer.id,
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    items,
    subtotal,
    discount,
    couponCode: hasCoupon ? pick(['SOPII10', 'FESTIVE15', 'WELCOME200', 'SILK20']) : undefined,
    tax,
    shipping,
    total,
    status,
    paymentStatus: paymentFor(status, method),
    paymentMethod: method,
    fulfillment: fulfillmentFor(status),
    shippingAddress: address,
    billingAddress: address,
    trackingNumber: shipped ? `${pick(['DL', 'BD', 'DT'])}${randInt(100000000, 999999999)}` : undefined,
    courier: shipped ? pick(COURIERS) : undefined,
    notes: chance(0.15) ? pick([
      'Customer requested delivery after 5 PM.',
      'Gift order — do not include the invoice.',
      'Call before delivery, apartment gate is locked.',
    ]) : undefined,
    timeline: timelineFor(status, placedAt),
    placedAt,
    updatedAt: daysAgo(Math.max(0, placedDaysAgo - randInt(0, 3)), 23),
  } satisfies Order;
}).sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt));

/* Roll order totals back onto customers. */
const rollups = new Map<string, { orders: number; spent: number; lastOrderAt?: string }>();
orders.forEach((order) => {
  if (order.status === 'cancelled') return;
  const current = rollups.get(order.customerId) ?? { orders: 0, spent: 0 };
  current.orders += 1;
  current.spent += order.status === 'returned' ? 0 : order.total;
  if (!current.lastOrderAt || new Date(order.placedAt) > new Date(current.lastOrderAt)) {
    current.lastOrderAt = order.placedAt;
  }
  rollups.set(order.customerId, current);
});
applyCustomerRollups(rollups);

export const orderById = new Map(orders.map((o) => [o.id, o]));
