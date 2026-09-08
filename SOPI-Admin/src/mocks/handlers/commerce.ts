import type {
  Customer,
  InventoryRow,
  Order,
  OrderStatus,
  Product,
  StockMovement,
  StockMovementType,
} from '@/types';
import { db, nextId, nowIso } from '../db';
import {
  applyPatch,
  badRequest,
  list,
  matchesSearch,
  notFound,
  num,
  paginate,
  route,
  sortBy,
} from '../utils';
import { ORDER_STATUS } from '@/utils/constants';

/* ---------------------------------- orders --------------------------------- */

const orderAccessor = (order: Order, key: string) => {
  switch (key) {
    case 'code':
      return order.code;
    case 'customer':
      return order.customerName;
    case 'total':
      return order.total;
    case 'items':
      return order.items.length;
    case 'status':
      return order.status;
    case 'placedAt':
      return new Date(order.placedAt).getTime();
    default:
      return (order as unknown as Record<string, string>)[key];
  }
};

export const orderRoutes = [
  route('GET', '/orders', ({ query }) => {
    const statuses = list(query.status);
    const payments = list(query.paymentStatus);
    const methods = list(query.paymentMethod);

    const filtered = db.orders.filter((order) => {
      if (
        !matchesSearch(query.search, [
          order.code,
          order.customerName,
          order.customerEmail,
          order.customerPhone,
          order.trackingNumber,
        ])
      )
        return false;
      if (statuses.length && !statuses.includes(order.status)) return false;
      if (payments.length && !payments.includes(order.paymentStatus)) return false;
      if (methods.length && !methods.includes(order.paymentMethod)) return false;
      if (query.customerId && order.customerId !== query.customerId) return false;
      if (query.from && new Date(order.placedAt) < new Date(query.from)) return false;
      if (query.to && new Date(order.placedAt) > new Date(`${query.to}T23:59:59`)) return false;
      const min = num(query.minTotal, -Infinity);
      const max = num(query.maxTotal, Infinity);
      if (order.total < min || order.total > max) return false;
      return true;
    });

    const sorted = sortBy(filtered, query.sortBy ?? 'placedAt', query.sortDir ?? 'desc', orderAccessor);
    return paginate(sorted, num(query.page, 1), num(query.pageSize, 10));
  }),

  route('GET', '/orders/counts', () => {
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
      all: db.orders.length,
      ...Object.fromEntries(
        statuses.map((status) => [status, db.orders.filter((o) => o.status === status).length]),
      ),
    } as Record<string, number>;
  }),

  route('GET', '/orders/:id', ({ params }) => {
    const order = db.orders.find((o) => o.id === params.id || o.code === params.id);
    if (!order) notFound('Order');
    return order;
  }),

  route('PUT', '/orders/:id/status', ({ params, body }) => {
    const order = db.orders.find((o) => o.id === params.id);
    if (!order) notFound('Order');

    const { status, note, by } = body as { status: OrderStatus; note?: string; by?: string };
    if (!ORDER_STATUS[status]) badRequest('Unknown order status');

    order.status = status;
    order.updatedAt = nowIso();
    order.fulfillment =
      status === 'delivered' || status === 'shipped'
        ? 'fulfilled'
        : status === 'returned'
          ? 'returned'
          : status === 'processing'
            ? 'partial'
            : order.fulfillment;

    if (status === 'delivered' && order.paymentMethod === 'cod') order.paymentStatus = 'paid';
    if (status === 'returned') order.paymentStatus = 'refunded';

    order.timeline.push({
      id: nextId('evt'),
      status,
      label: ORDER_STATUS[status].label,
      note,
      at: nowIso(),
      by: by ?? 'Admin',
    });

    // Returning stock to inventory is what a real fulfilment service would do.
    if (status === 'cancelled' || status === 'returned') {
      order.items.forEach((item) => {
        const product = db.products.find((p) => p.id === item.productId);
        if (!product) return;
        const previousStock = product.stock;
        product.stock += item.quantity;
        db.stockMovements.unshift({
          id: nextId('stk'),
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          type: status === 'cancelled' ? 'cancelled' : 'return',
          quantity: item.quantity,
          previousStock,
          newStock: product.stock,
          reason: `${ORDER_STATUS[status].label} — ${order.code}`,
          reference: order.code,
          admin: by ?? 'Admin',
          at: nowIso(),
        });
      });
    }

    return order;
  }),

  route('PUT', '/orders/:id', ({ params, body }) => {
    const order = db.orders.find((o) => o.id === params.id);
    if (!order) notFound('Order');
    applyPatch(order, body as Partial<Order>);
    order.updatedAt = nowIso();
    return order;
  }),

  route('POST', '/orders/:id/note', ({ params, body }) => {
    const order = db.orders.find((o) => o.id === params.id);
    if (!order) notFound('Order');
    const { note, by } = body as { note: string; by?: string };
    if (!note?.trim()) badRequest('Note cannot be empty');
    order.timeline.push({
      id: nextId('evt'),
      status: 'note',
      label: 'Note added',
      note,
      at: nowIso(),
      by: by ?? 'Admin',
    });
    return order;
  }),
];

/* -------------------------------- customers -------------------------------- */

const customerAccessor = (customer: Customer, key: string) => {
  switch (key) {
    case 'name':
      return customer.name;
    case 'ordersCount':
      return customer.ordersCount;
    case 'totalSpent':
      return customer.totalSpent;
    case 'lastOrderAt':
      return customer.lastOrderAt ? new Date(customer.lastOrderAt).getTime() : 0;
    case 'createdAt':
      return new Date(customer.createdAt).getTime();
    default:
      return (customer as unknown as Record<string, string>)[key];
  }
};

export const customerRoutes = [
  route('GET', '/customers', ({ query }) => {
    const tiers = list(query.tier);
    const statuses = list(query.status);

    const filtered = db.customers.filter((customer) => {
      if (!matchesSearch(query.search, [customer.name, customer.email, customer.phone])) return false;
      if (tiers.length && !tiers.includes(customer.tier)) return false;
      if (statuses.length && !statuses.includes(customer.status)) return false;
      if (query.hasOrders === 'true' && customer.ordersCount === 0) return false;
      if (query.hasOrders === 'false' && customer.ordersCount > 0) return false;
      return true;
    });

    const sorted = sortBy(
      filtered,
      query.sortBy ?? 'totalSpent',
      query.sortDir ?? 'desc',
      customerAccessor,
    );
    return paginate(sorted, num(query.page, 1), num(query.pageSize, 10));
  }),

  route('GET', '/customers/:id', ({ params }) => {
    const customer = db.customers.find((c) => c.id === params.id);
    if (!customer) notFound('Customer');

    const orders = db.orders
      .filter((o) => o.customerId === customer.id)
      .sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt));
    const reviews = db.reviews.filter((r) => r.customerId === customer.id);
    const wishlist = customer.wishlist
      .map((id) => db.products.find((p) => p.id === id))
      .filter(Boolean) as Product[];

    const spent = orders
      .filter((o) => o.status !== 'cancelled' && o.status !== 'returned')
      .reduce((sum, o) => sum + o.total, 0);

    return {
      customer,
      orders,
      reviews,
      wishlist,
      stats: {
        totalOrders: orders.length,
        totalSpent: spent,
        aov: orders.length ? Math.round(spent / orders.length) : 0,
        lastPurchase: orders[0]?.placedAt,
      },
    };
  }),

  route('PUT', '/customers/:id', ({ params, body }) => {
    const customer = db.customers.find((c) => c.id === params.id);
    if (!customer) notFound('Customer');
    applyPatch(customer, body as Partial<Customer>);
    return customer;
  }),

  route('DELETE', '/customers/:id', ({ params }) => {
    const index = db.customers.findIndex((c) => c.id === params.id);
    if (index === -1) notFound('Customer');
    const [removed] = db.customers.splice(index, 1);
    return { id: removed.id };
  }),
];

/* -------------------------------- inventory -------------------------------- */

function toRow(product: Product): InventoryRow {
  const available = Math.max(0, product.stock - product.reserved);
  return {
    productId: product.id,
    name: product.name,
    sku: product.sku,
    image: product.images[0]?.url,
    category: db.categories.find((c) => c.id === product.categoryId)?.name ?? '—',
    stock: product.stock,
    reserved: product.reserved,
    available,
    lowStockThreshold: product.lowStockThreshold,
    costPrice: product.costPrice ?? 0,
    stockStatus:
      product.stock <= 0
        ? 'out_of_stock'
        : product.stock <= product.lowStockThreshold
          ? 'low_stock'
          : 'in_stock',
  };
}

export const inventoryRoutes = [
  route('GET', '/inventory/summary', () => {
    const rows = db.products.map(toRow);
    return {
      totalStock: rows.reduce((sum, r) => sum + r.stock, 0),
      lowStock: rows.filter((r) => r.stockStatus === 'low_stock').length,
      outOfStock: rows.filter((r) => r.stockStatus === 'out_of_stock').length,
      stockValue: rows.reduce((sum, r) => sum + r.stock * r.costPrice, 0),
      skuCount: rows.length,
      reserved: rows.reduce((sum, r) => sum + r.reserved, 0),
    };
  }),

  route('GET', '/inventory', ({ query }) => {
    const statuses = list(query.stockStatus);
    const rows = db.products
      .map(toRow)
      .filter((row) => matchesSearch(query.search, [row.name, row.sku, row.category]))
      .filter((row) => (statuses.length ? statuses.includes(row.stockStatus) : true))
      .filter((row) => (query.categoryId ? row.category === query.categoryId : true));

    const sorted = sortBy(rows, query.sortBy ?? 'stock', query.sortDir ?? 'asc', (row, key) =>
      (row as unknown as Record<string, string | number>)[key],
    );
    return paginate(sorted, num(query.page, 1), num(query.pageSize, 10));
  }),

  route('POST', '/inventory/:id/adjust', ({ params, body }) => {
    const product = db.products.find((p) => p.id === params.id);
    if (!product) notFound('Product');

    const { type, quantity, reason, admin, mode } = body as {
      type: StockMovementType;
      quantity: number;
      reason?: string;
      admin?: string;
      mode?: 'add' | 'set';
    };

    if (!Number.isFinite(quantity)) badRequest('Quantity must be a number');

    const previousStock = product.stock;
    const newStock = mode === 'set' ? Math.max(0, quantity) : Math.max(0, previousStock + quantity);
    product.stock = newStock;
    product.updatedAt = nowIso();

    const movement: StockMovement = {
      id: nextId('stk'),
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      type: type ?? 'adjustment',
      quantity: newStock - previousStock,
      previousStock,
      newStock,
      reason,
      admin: admin ?? 'Admin',
      at: nowIso(),
    };
    db.stockMovements.unshift(movement);
    return { row: toRow(product), movement };
  }),

  route('GET', '/inventory/history', ({ query }) => {
    const types = list(query.type);
    const filtered = db.stockMovements.filter((movement) => {
      if (!matchesSearch(query.search, [movement.productName, movement.sku, movement.reason, movement.admin]))
        return false;
      if (types.length && !types.includes(movement.type)) return false;
      if (query.productId && movement.productId !== query.productId) return false;
      if (query.from && new Date(movement.at) < new Date(query.from)) return false;
      if (query.to && new Date(movement.at) > new Date(`${query.to}T23:59:59`)) return false;
      return true;
    });

    const sorted = sortBy(filtered, query.sortBy ?? 'at', query.sortDir ?? 'desc', (m, key) =>
      key === 'at' ? new Date(m.at).getTime() : (m as unknown as Record<string, string | number>)[key],
    );
    return paginate(sorted, num(query.page, 1), num(query.pageSize, 12));
  }),
];
