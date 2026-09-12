/*
 * Customer rollups — the order totals cached on a customer record.
 * ===========================================================================
 * `ordersCount`, `totalSpent`, `lastOrderAt` and `tier` are a denormalised
 * copy of what the order collection already knows. The checkout maintains them
 * with a single `$inc` at the moment an order is placed, which is the right
 * trade on that path: one small write instead of an aggregate over a shopper's
 * whole history, on every checkout.
 *
 * `$inc` has no inverse when a record is *removed* rather than reversed — the
 * order is gone, so there is nothing left to subtract from. Anything that
 * deletes orders therefore recomputes from scratch: count them, sum them, take
 * the newest. Cancelled and returned orders are left out of `totalSpent`
 * exactly as the customer detail endpoint leaves them out, so the figure in
 * the customer list and the figure the detail page computes cannot drift apart.
 */

import { CustomerModel, OrderModel } from '../db/models.js';

/** Tier ladder, matched to what the panel's customer segments expect. */
export function tierFor(totalSpent: number) {
  if (totalSpent >= 150000) return 'platinum';
  if (totalSpent >= 75000) return 'gold';
  if (totalSpent >= 30000) return 'silver';
  if (totalSpent > 0) return 'regular';
  return 'new';
}

export interface CustomerRollups {
  ordersCount: number;
  totalSpent: number;
  lastOrderAt?: string;
  tier: string;
}

/**
 * Rebuilds one customer's rollups from the orders that still exist.
 *
 * Returns what was written, or `null` for a customer that is no longer there —
 * which is the normal case when the orders of a deleted customer are cleaned
 * up afterwards, and not worth an error.
 */
export async function recomputeCustomerRollups(
  customerId: string,
): Promise<CustomerRollups | null> {
  if (!customerId) return null;

  const orders = await OrderModel.find({ customerId })
    .select('total status placedAt')
    .lean<{ total?: number; status?: string; placedAt?: string }[]>();

  const totalSpent = orders
    .filter((order) => order.status !== 'cancelled' && order.status !== 'returned')
    .reduce((sum, order) => sum + (Number(order.total) || 0), 0);

  /* `placedAt` is an ISO string, so the plain string sort is chronological. */
  const lastOrderAt = orders
    .map((order) => order.placedAt)
    .filter((at): at is string => Boolean(at))
    .sort()
    .pop();

  const rollups: CustomerRollups = {
    ordersCount: orders.length,
    totalSpent,
    lastOrderAt,
    tier: tierFor(totalSpent),
  };

  const result = await CustomerModel.updateOne(
    { _id: customerId },
    lastOrderAt
      ? { $set: { ordersCount: rollups.ordersCount, totalSpent, lastOrderAt, tier: rollups.tier } }
      : {
          $set: { ordersCount: rollups.ordersCount, totalSpent, tier: rollups.tier },
          $unset: { lastOrderAt: '' },
        },
  );

  return result.matchedCount ? rollups : null;
}
