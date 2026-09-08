import type {
  CategorySlice,
  Customer,
  CustomerReportRow,
  DashboardSummary,
  KpiStat,
  Order,
  OrderReportRow,
  OrderStatus,
  Product,
  RangeKey,
  SalesPoint,
  SalesReportRow,
  TopProductRow,
} from '@/types';
import { categoryById } from './categories';

const DAY = 86_400_000;

export interface RangeWindow {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  days: number;
}

export function rangeWindow(range: RangeKey, now = new Date()): RangeWindow {
  const days = { today: 1, '7d': 7, '30d': 30, '3m': 90, '6m': 180, '1y': 365 }[range];
  const to = now;
  const from = new Date(now.getTime() - days * DAY);
  return {
    from,
    to,
    previousFrom: new Date(from.getTime() - days * DAY),
    previousTo: from,
    days,
  };
}

function inWindow(iso: string, from: Date, to: Date) {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/** Cancelled orders never count towards revenue; returned orders are netted out. */
export function isRevenueOrder(order: Order) {
  return order.status !== 'cancelled' && order.status !== 'returned';
}

function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function bucketsFor(range: RangeKey, now: Date) {
  const buckets: { label: string; from: Date; to: Date }[] = [];

  if (range === 'today') {
    for (let hour = 0; hour < 24; hour += 3) {
      const from = new Date(now);
      from.setHours(hour, 0, 0, 0);
      const to = new Date(from);
      to.setHours(hour + 3);
      const suffix = hour < 12 ? 'AM' : 'PM';
      const display = hour % 12 === 0 ? 12 : hour % 12;
      buckets.push({ label: `${display} ${suffix}`, from, to });
    }
    return buckets;
  }

  if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30;
    for (let i = days - 1; i >= 0; i -= 1) {
      const from = new Date(now.getTime() - i * DAY);
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + DAY);
      buckets.push({
        label: from.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        from,
        to,
      });
    }
    return buckets;
  }

  if (range === '3m') {
    for (let i = 12; i >= 0; i -= 1) {
      const to = new Date(now.getTime() - i * 7 * DAY);
      const from = new Date(to.getTime() - 7 * DAY);
      buckets.push({
        label: from.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        from,
        to,
      });
    }
    return buckets;
  }

  const months = range === '6m' ? 6 : 12;
  for (let i = months - 1; i >= 0; i -= 1) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = new Date(ref);
    const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
    buckets.push({
      label: ref.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      from,
      to,
    });
  }
  return buckets;
}

export function buildSalesSeries(orders: Order[], range: RangeKey, now = new Date()): SalesPoint[] {
  const buckets = bucketsFor(range, now);
  const revenueOrders = orders.filter(isRevenueOrder);

  return buckets.map((bucket) => {
    const matched = revenueOrders.filter((order) => inWindow(order.placedAt, bucket.from, bucket.to));
    const revenue = matched.reduce((sum, order) => sum + order.total, 0);
    return {
      label: bucket.label,
      revenue,
      orders: matched.length,
      aov: matched.length ? Math.round(revenue / matched.length) : 0,
    };
  });
}

function sparkline(orders: Order[], now: Date, days = 14) {
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const from = new Date(now.getTime() - i * DAY);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + DAY);
    out.push(
      orders
        .filter((o) => isRevenueOrder(o) && inWindow(o.placedAt, from, to))
        .reduce((sum, o) => sum + o.total, 0),
    );
  }
  return out;
}

export function buildKpis(
  orders: Order[],
  products: Product[],
  customers: Customer[],
  range: RangeKey,
  now = new Date(),
): KpiStat[] {
  const win = rangeWindow(range, now);

  const current = orders.filter((o) => inWindow(o.placedAt, win.from, win.to));
  const previous = orders.filter((o) => inWindow(o.placedAt, win.previousFrom, win.previousTo));

  const revenueNow = current.filter(isRevenueOrder).reduce((s, o) => s + o.total, 0);
  const revenuePrev = previous.filter(isRevenueOrder).reduce((s, o) => s + o.total, 0);

  const customersNow = customers.filter((c) => inWindow(c.createdAt, win.from, win.to)).length;
  const customersPrev = customers.filter((c) =>
    inWindow(c.createdAt, win.previousFrom, win.previousTo),
  ).length;

  const productsNow = products.filter((p) => inWindow(p.createdAt, win.from, win.to)).length;

  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const pendingPrev = previous.filter((o) => o.status === 'pending').length;

  const lowStock = products.filter(
    (p) => p.trackInventory && p.stock <= p.lowStockThreshold,
  ).length;

  const trend = sparkline(orders, now);

  return [
    {
      key: 'revenue',
      label: 'Total Revenue',
      value: revenueNow,
      format: 'currency',
      change: change(revenueNow, revenuePrev),
      previousValue: revenuePrev,
      trend,
      tone: 'brand',
    },
    {
      key: 'orders',
      label: 'Total Orders',
      value: current.length,
      format: 'number',
      change: change(current.length, previous.length),
      previousValue: previous.length,
      trend: trend.map((v) => v / 4000),
      tone: 'sky',
    },
    {
      key: 'customers',
      label: 'Total Customers',
      value: customers.length,
      format: 'number',
      change: change(customersNow, customersPrev),
      previousValue: customers.length - customersNow,
      trend: trend.map((v) => v / 5000),
      tone: 'emerald',
    },
    {
      key: 'products',
      label: 'Total Products',
      value: products.length,
      format: 'number',
      change: change(productsNow, Math.max(1, products.length - productsNow) * 0.02),
      previousValue: products.length - productsNow,
      trend: trend.map((v) => v / 6000),
      tone: 'violet',
    },
    {
      key: 'pending',
      label: 'Pending Orders',
      value: pendingOrders,
      format: 'number',
      change: change(pendingOrders, Math.max(pendingPrev, 1)),
      previousValue: pendingPrev,
      trend: trend.map((v) => v / 7000),
      tone: 'amber',
    },
    {
      key: 'low_stock',
      label: 'Low Stock Products',
      value: lowStock,
      format: 'number',
      change: change(lowStock, Math.max(1, Math.round(lowStock * 0.92))),
      previousValue: Math.round(lowStock * 0.92),
      trend: trend.map((v) => v / 8000),
      tone: 'rose',
    },
  ];
}

export function buildCategorySlices(
  orders: Order[],
  products: Product[],
  range: RangeKey,
  now = new Date(),
): CategorySlice[] {
  const win = rangeWindow(range, now);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const totals = new Map<string, { revenue: number; orders: number }>();

  orders
    .filter((o) => isRevenueOrder(o) && inWindow(o.placedAt, win.from, win.to))
    .forEach((order) => {
      const seen = new Set<string>();
      order.items.forEach((item) => {
        const product = productMap.get(item.productId);
        if (!product) return;
        const category = categoryById.get(product.categoryId);
        const rootId = category?.parentId ?? category?.id ?? 'other';
        const rootName = categoryById.get(rootId)?.name ?? 'Other';
        const entry = totals.get(rootName) ?? { revenue: 0, orders: 0 };
        entry.revenue += item.total;
        if (!seen.has(rootName)) {
          entry.orders += 1;
          seen.add(rootName);
        }
        totals.set(rootName, entry);
      });
    });

  const grand = [...totals.values()].reduce((sum, t) => sum + t.revenue, 0) || 1;

  return [...totals.entries()]
    .map(([name, t]) => ({
      name,
      revenue: t.revenue,
      orders: t.orders,
      percentage: Number(((t.revenue / grand) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function buildTopProducts(
  orders: Order[],
  products: Product[],
  range: RangeKey,
  limit = 8,
  now = new Date(),
): TopProductRow[] {
  const win = rangeWindow(range, now);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const totals = new Map<string, { sold: number; revenue: number }>();

  orders
    .filter((o) => isRevenueOrder(o) && inWindow(o.placedAt, win.from, win.to))
    .forEach((order) =>
      order.items.forEach((item) => {
        const entry = totals.get(item.productId) ?? { sold: 0, revenue: 0 };
        entry.sold += item.quantity;
        entry.revenue += item.total;
        totals.set(item.productId, entry);
      }),
    );

  return [...totals.entries()]
    .map(([id, t]) => {
      const product = productMap.get(id);
      return {
        id,
        name: product?.name ?? 'Unknown product',
        image: product?.images[0]?.url,
        category: product ? (categoryById.get(product.categoryId)?.name ?? '—') : '—',
        sold: t.sold,
        revenue: t.revenue,
        stock: product?.stock ?? 0,
      } satisfies TopProductRow;
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function buildDashboard(
  orders: Order[],
  products: Product[],
  customers: Customer[],
  range: RangeKey,
  now = new Date(),
): DashboardSummary {
  const win = rangeWindow(range, now);
  const windowOrders = orders.filter((o) => inWindow(o.placedAt, win.from, win.to));
  const revenueOrders = windowOrders.filter(isRevenueOrder);
  const revenue = revenueOrders.reduce((sum, o) => sum + o.total, 0);

  const statuses: OrderStatus[] = [
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'returned',
  ];

  return {
    kpis: buildKpis(orders, products, customers, range, now),
    sales: buildSalesSeries(orders, range, now),
    totals: {
      revenue,
      orders: windowOrders.length,
      aov: revenueOrders.length ? Math.round(revenue / revenueOrders.length) : 0,
    },
    categories: buildCategorySlices(orders, products, range, now),
    topProducts: buildTopProducts(orders, products, range, 8, now),
    recentOrders: [...orders]
      .sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt))
      .slice(0, 8),
    statusBreakdown: statuses.map((status) => ({
      status,
      count: windowOrders.filter((o) => o.status === status).length,
    })),
  };
}

/* --------------------------------- reports --------------------------------- */

export type SalesGrouping = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

function periodKey(date: Date, grouping: SalesGrouping) {
  switch (grouping) {
    case 'daily':
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    case 'weekly': {
      const start = new Date(date);
      start.setDate(date.getDate() - date.getDay());
      return `Week of ${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
    }
    case 'monthly':
      return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    case 'quarterly':
      return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
    case 'yearly':
      return String(date.getFullYear());
  }
}

export function buildSalesReport(
  orders: Order[],
  grouping: SalesGrouping,
  range: RangeKey,
  now = new Date(),
): SalesReportRow[] {
  const win = rangeWindow(range, now);
  const rows = new Map<string, SalesReportRow & { sortKey: number }>();

  orders
    .filter((o) => isRevenueOrder(o) && inWindow(o.placedAt, win.from, win.to))
    .forEach((order) => {
      const date = new Date(order.placedAt);
      const key = periodKey(date, grouping);
      const row =
        rows.get(key) ??
        ({
          period: key,
          orders: 0,
          units: 0,
          revenue: 0,
          discount: 0,
          tax: 0,
          net: 0,
          sortKey: date.getTime(),
        } as SalesReportRow & { sortKey: number });

      row.orders += 1;
      row.units += order.items.reduce((s, i) => s + i.quantity, 0);
      row.revenue += order.subtotal;
      row.discount += order.discount;
      row.tax += order.tax;
      row.net += order.total;
      row.sortKey = Math.min(row.sortKey, date.getTime());
      rows.set(key, row);
    });

  return [...rows.values()]
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ sortKey: _sortKey, ...rest }) => rest);
}

export function buildCustomerReport(
  customers: Customer[],
  orders: Order[],
  range: RangeKey,
  now = new Date(),
): CustomerReportRow[] {
  const win = rangeWindow(range, now);
  const byCustomer = new Map<string, { orders: number; spent: number; last?: string }>();

  orders
    .filter((o) => isRevenueOrder(o) && inWindow(o.placedAt, win.from, win.to))
    .forEach((order) => {
      const entry = byCustomer.get(order.customerId) ?? { orders: 0, spent: 0 };
      entry.orders += 1;
      entry.spent += order.total;
      if (!entry.last || new Date(order.placedAt) > new Date(entry.last)) entry.last = order.placedAt;
      byCustomer.set(order.customerId, entry);
    });

  return customers
    .filter((c) => byCustomer.has(c.id) || inWindow(c.createdAt, win.from, win.to))
    .map((customer) => {
      const stats = byCustomer.get(customer.id) ?? { orders: 0, spent: 0 };
      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        orders: stats.orders,
        totalSpent: stats.spent,
        aov: stats.orders ? Math.round(stats.spent / stats.orders) : 0,
        lastOrderAt: stats.last,
        type: inWindow(customer.createdAt, win.from, win.to) ? 'new' : 'returning',
      } satisfies CustomerReportRow;
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);
}

export function buildOrderReport(
  orders: Order[],
  range: RangeKey,
  now = new Date(),
): OrderReportRow[] {
  const win = rangeWindow(range, now);
  const windowOrders = orders.filter((o) => inWindow(o.placedAt, win.from, win.to));
  const total = windowOrders.length || 1;

  const statuses: OrderStatus[] = [
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'returned',
  ];

  return statuses.map((status) => {
    const matched = windowOrders.filter((o) => o.status === status);
    return {
      status,
      count: matched.length,
      revenue: matched.reduce((sum, o) => sum + o.total, 0),
      share: Number(((matched.length / total) * 100).toFixed(1)),
    };
  });
}
