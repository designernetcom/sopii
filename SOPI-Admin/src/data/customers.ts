import type { Address, Customer, CustomerTier } from '@/types';
import { products } from './products';
import {
  CITIES,
  STREETS,
  chance,
  daysAgo,
  emailFor,
  fullName,
  phone,
  pick,
  randInt,
  uid,
} from './seed';

export function makeAddress(name: string, phoneNumber: string): Address {
  const place = pick(CITIES);
  return {
    name,
    phone: phoneNumber,
    line1: `${randInt(1, 60)}${pick(['A', 'B', 'C', ''])}, ${pick(STREETS)}`,
    line2: `${pick(['Near', 'Opposite', 'Behind'])} ${pick(['City Mall', 'Metro Station', 'Central Park', 'St. Marys Church'])}`,
    city: place.city,
    state: place.state,
    pincode: place.pin,
    country: 'India',
  };
}

function tierFor(spent: number, orders: number): CustomerTier {
  if (orders === 0) return 'new';
  if (spent > 120000) return 'platinum';
  if (spent > 60000) return 'gold';
  if (spent > 25000) return 'silver';
  if (orders > 1) return 'regular';
  return 'new';
}

const TOTAL = 8540;

export const customers: Customer[] = Array.from({ length: TOTAL }, (_, index) => {
  const name = fullName();
  const contact = phone();
  const createdAt = daysAgo(randInt(5, 500), 20);

  const addresses = Array.from({ length: randInt(1, 2) }, () => makeAddress(name, contact));

  return {
    id: uid('cus', index + 1),
    name,
    email: emailFor(name, index + 1),
    phone: contact,
    avatar: undefined,
    status: index % 19 === 0 ? 'blocked' : 'active',
    tier: 'new',
    addresses,
    wishlist: Array.from({ length: randInt(0, 5) }, () => products[randInt(0, products.length - 1)].id),
    ordersCount: 0,
    totalSpent: 0,
    lastOrderAt: undefined,
    activity: [],
    acceptsMarketing: chance(0.7),
    notes: chance(0.2) ? pick([
      'Prefers courier delivery before 6 PM.',
      'Requested gift wrapping on previous order.',
      'VIP customer — flag any delayed shipment.',
      'Asked to be notified when silk sarees restock.',
    ]) : undefined,
    createdAt,
  } satisfies Customer;
});

export const customerById = new Map(customers.map((c) => [c.id, c]));

/** Called by the order seed once totals are known. */
export function applyCustomerRollups(
  rollups: Map<string, { orders: number; spent: number; lastOrderAt?: string }>,
) {
  customers.forEach((customer) => {
    const stats = rollups.get(customer.id);
    customer.ordersCount = stats?.orders ?? 0;
    customer.totalSpent = stats?.spent ?? 0;
    customer.lastOrderAt = stats?.lastOrderAt;
    customer.tier = tierFor(customer.totalSpent, customer.ordersCount);

    customer.activity = [
      {
        id: `${customer.id}-act-1`,
        type: 'account' as const,
        message: 'Account created',
        at: customer.createdAt,
      },
      ...(customer.lastOrderAt
        ? [
            {
              id: `${customer.id}-act-2`,
              type: 'order' as const,
              message: 'Placed an order',
              at: customer.lastOrderAt,
            },
          ]
        : []),
      {
        id: `${customer.id}-act-3`,
        type: 'login' as const,
        message: `Signed in from ${pick(CITIES).city}`,
        at: daysAgo(randInt(0, 20), 23),
      },
      ...(customer.wishlist.length
        ? [
            {
              id: `${customer.id}-act-4`,
              type: 'wishlist' as const,
              message: `Added ${customer.wishlist.length} item(s) to wishlist`,
              at: daysAgo(randInt(1, 60), 23),
            },
          ]
        : []),
    ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  });
}
