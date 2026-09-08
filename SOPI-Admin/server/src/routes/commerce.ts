import { Router } from 'express';
import type { PipelineStage } from 'mongoose';
import type {
  Customer,
  InventoryRow,
  Order,
  OrderStatus,
  Product,
  StockMovementType,
} from '@/types';
import { ORDER_STATUS } from '@/utils/constants';
import {
  CategoryModel,
  CustomerModel,
  OrderModel,
  ProductModel,
  ReviewModel,
  StockMovementModel,
} from '../db/models.js';
import { requirePermission } from '../lib/auth.js';
import { sendAndRecordOrderEmail, type OrderEmailKind } from '../lib/email.js';
import { deliveryHistory } from '../lib/emailLog.js';
import {
  ah,
  badRequest,
  clean,
  list,
  nextId,
  notFound,
  nowIso,
  num,
  pageParams,
  paginateArray,
  paginated,
  searchFilter,
  serialize,
  serializeMany,
  sortSpec,
  str,
} from '../lib/http.js';

/* ---------------------------------- orders ---------------------------------- */

export const orderRoutes = Router();

const ORDER_DERIVED = ['itemCount', 'placedAtDate'];

orderRoutes.get(
  '/',
  requirePermission('orders'),
  ah(async (req, res) => {
    const { page, pageSize, skip } = pageParams(req.query, 10);
    const match: Record<string, unknown> = {};

    const search = searchFilter(str(req.query, 'search'), [
      'code',
      'customerName',
      'customerEmail',
      'customerPhone',
      'trackingNumber',
    ]);
    if (search) Object.assign(match, search);

    const statuses = list(req.query, 'status');
    if (statuses.length) match.status = { $in: statuses };

    const payments = list(req.query, 'paymentStatus');
    if (payments.length) match.paymentStatus = { $in: payments };

    const methods = list(req.query, 'paymentMethod');
    if (methods.length) match.paymentMethod = { $in: methods };

    const customerId = str(req.query, 'customerId');
    if (customerId) match.customerId = customerId;

    const from = str(req.query, 'from');
    const to = str(req.query, 'to');
    if (from || to) {
      match.placedAtDate = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(to ? { $lte: new Date(`${to}T23:59:59`) } : {}),
      };
    }

    const minTotal = str(req.query, 'minTotal');
    const maxTotal = str(req.query, 'maxTotal');
    if (minTotal !== undefined || maxTotal !== undefined) {
      match.total = {
        ...(minTotal !== undefined ? { $gte: num(req.query, 'minTotal', 0) } : {}),
        ...(maxTotal !== undefined ? { $lte: num(req.query, 'maxTotal', 0) } : {}),
      };
    }

    const pipeline: PipelineStage[] = [
      {
        $addFields: {
          itemCount: { $size: { $ifNull: ['$items', []] } },
          placedAtDate: { $toDate: '$placedAt' },
        },
      },
      { $match: match },
      {
        $sort: sortSpec(req.query, 'placedAt', 'desc', {
          placedAt: 'placedAtDate',
          customer: 'customerName',
          items: 'itemCount',
        }),
      },
      { $facet: { items: [{ $skip: skip }, { $limit: pageSize }], total: [{ $count: 'count' }] } },
    ];

    const [result] = await OrderModel.aggregate(pipeline);
    const items = (result?.items ?? []) as ({ _id: string } & Order)[];
    const total = (result?.total?.[0]?.count ?? 0) as number;

    res.json(paginated(serializeMany(items, ORDER_DERIVED), total, page, pageSize));
  }),
);

orderRoutes.get(
  '/counts',
  requirePermission('orders'),
  ah(async (_req, res) => {
    const grouped = await OrderModel.aggregate<{ _id: OrderStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const byStatus = Object.fromEntries(grouped.map((row) => [row._id, row.count]));
    const statuses = Object.keys(ORDER_STATUS) as OrderStatus[];

    res.json({
      all: await OrderModel.estimatedDocumentCount(),
      ...Object.fromEntries(statuses.map((status) => [status, byStatus[status] ?? 0])),
    });
  }),
);

orderRoutes.get(
  '/:id',
  requirePermission('orders'),
  ah(async (req, res) => {
    // Detail pages link by id, but support staff paste order codes.
    const order = await OrderModel.findOne({
      $or: [{ _id: req.params.id }, { code: req.params.id }],
    }).lean();
    if (!order) notFound('Order');
    res.json(serialize(order));
  }),
);

orderRoutes.put(
  '/:id/status',
  requirePermission('orders', 'edit'),
  ah(async (req, res) => {
    const order = await OrderModel.findById(req.params.id);
    if (!order) notFound('Order');

    const { status, note, by } = req.body as { status: OrderStatus; note?: string; by?: string };
    if (!ORDER_STATUS[status]) badRequest('Unknown order status');

    const admin = by ?? req.auth?.user.name ?? 'Admin';

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
      by: admin,
    });

    // Cancelling or returning puts the goods back on the shelf, and every
    // movement is recorded so the stock history stays auditable.
    if (status === 'cancelled' || status === 'returned') {
      const products = await ProductModel.find({
        _id: { $in: order.items.map((item) => item.productId) },
      });

      const movements = products.flatMap((product) => {
        const item = order.items.find((entry) => entry.productId === product._id);
        if (!item) return [];
        const previousStock = product.stock;
        product.stock = previousStock + item.quantity;
        return [
          {
            _id: nextId('stk'),
            productId: product._id,
            productName: product.name,
            sku: product.sku,
            type: status === 'cancelled' ? 'cancelled' : 'return',
            quantity: item.quantity,
            previousStock,
            newStock: product.stock,
            reason: `${ORDER_STATUS[status].label} — ${order.code}`,
            reference: order.code,
            admin,
            at: nowIso(),
          },
        ];
      });

      await Promise.all(products.map((product) => product.save()));
      if (movements.length) await StockMovementModel.insertMany(movements);
    }

    await order.save();
    res.json(order.toJSON());
  }),
);

orderRoutes.put(
  '/:id',
  requirePermission('orders', 'edit'),
  ah(async (req, res) => {
    const updated = await OrderModel.findByIdAndUpdate(
      req.params.id,
      { $set: { ...clean(req.body as Partial<Order>), updatedAt: nowIso() } },
      { new: true },
    );
    if (!updated) notFound('Order');
    res.json(updated.toJSON());
  }),
);

orderRoutes.post(
  '/:id/note',
  requirePermission('orders', 'edit'),
  ah(async (req, res) => {
    const { note, by } = req.body as { note: string; by?: string };
    if (!note?.trim()) badRequest('Note cannot be empty');

    const updated = await OrderModel.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          timeline: {
            id: nextId('evt'),
            status: 'note',
            label: 'Note added',
            note,
            at: nowIso(),
            by: by ?? req.auth?.user.name ?? 'Admin',
          },
        },
      },
      { new: true },
    );
    if (!updated) notFound('Order');
    res.json(updated.toJSON());
  }),
);

/**
 * `POST /orders/:id/resend-email` — send an order email again, on request.
 *
 * For the customer who deleted it, the one whose mailbox was full on the day,
 * and the address that was corrected after the order was placed.
 *
 * Behind `orders:edit` rather than a read permission: this sends mail to a
 * customer in the store's name, which is not something a read-only account
 * should be able to set off. It is deliberately NOT rate-limited beyond the
 * admin limiter, because the operator is a trusted, authenticated actor and the
 * button is one click behind an order nobody reaches by accident.
 *
 * Awaited rather than queued, unlike the automatic path. An operator who has
 * just pressed Resend is entitled to know whether it worked — a queued job
 * would answer "accepted" and leave them refreshing. The trade is that a
 * Mailtrap timeout holds this request for up to MAILTRAP_TIMEOUT_MS, which is
 * acceptable for one admin action and is exactly why checkout does not do it.
 *
 * `force` is passed deliberately. The service suppresses a second send of the
 * same kind to the same address, which is what stops a replayed job mailing a
 * customer twice — but an operator pressing Resend has *asked* for that
 * duplicate, so this is the one call site that opts out of the guard.
 */
orderRoutes.post(
  '/:id/resend-email',
  requirePermission('orders', 'edit'),
  ah(async (req, res) => {
    const kind = (String((req.body as { kind?: unknown })?.kind ?? '').trim() ||
      'order_confirmation') as OrderEmailKind;

    if (!ORDER_EMAIL_KINDS.includes(kind)) {
      badRequest(`Unknown email type. Expected one of: ${ORDER_EMAIL_KINDS.join(', ')}`);
    }

    const order = await OrderModel.findById(req.params.id).lean<{ _id: string; customerEmail?: string }>();
    if (!order) notFound('Order');
    if (!order.customerEmail) badRequest('This order has no customer email address.');

    /*
     * A transient failure would throw, and the operator would see a 500 with no
     * explanation. Caught here and reported as a failed send instead: the
     * distinction between "retry later" and "never going to work" matters to
     * the queue, not to somebody looking at a button.
     */
    let result: Awaited<ReturnType<typeof sendAndRecordOrderEmail>>;
    try {
      result = await sendAndRecordOrderEmail({ id: order._id }, kind, {
        force: true,
        source: `admin:${req.auth?.user._id ?? 'unknown'}`,
      });
    } catch (error) {
      result = {
        status: 'failed',
        recipient: order.customerEmail,
        error: error instanceof Error ? error.message : 'Sending failed',
      };
    }

    await OrderModel.updateOne(
      { _id: order._id },
      {
        $push: {
          timeline: {
            $each: [
              {
                id: nextId('evt'),
                status: 'note',
                label:
                  result.status === 'sent'
                    ? `Resent ${kind.replace(/_/g, ' ')}`
                    : `Resend of ${kind.replace(/_/g, ' ')} ${result.status}`,
                note: result.status === 'sent' ? result.recipient : (result.error ?? ''),
                at: nowIso(),
                by: req.auth?.user.name ?? 'Admin',
              },
            ],
            $slice: -100,
          },
        },
      },
    );

    const fresh = await OrderModel.findById(order._id);
    res.status(result.status === 'sent' ? 200 : 502).json({
      ...result,
      order: fresh?.toJSON(),
    });
  }),
);

/**
 * `GET /orders/:id/email-log` — every send attempted about this order.
 *
 * `order.emailNotifications` holds the *latest* state per kind, which is what
 * the order detail page renders. This is the append-only history behind it:
 * every attempt, its outcome, the relay's own words, how long it took and who
 * asked for it. It is what answers "we never received it" weeks later, and it
 * is the only place a retry ladder is visible as a sequence rather than as a
 * single `attempts: 4`.
 *
 * A read permission is enough — unlike Resend, this sends nothing.
 */
orderRoutes.get(
  '/:id/email-log',
  requirePermission('orders'),
  ah(async (req, res) => {
    const order = await OrderModel.findById(req.params.id).lean<{ code?: string }>();
    if (!order) notFound('Order');

    res.json({ entries: await deliveryHistory(String(order.code ?? ''), 50) });
  }),
);

/** The email kinds the resend endpoint will accept. */
const ORDER_EMAIL_KINDS: readonly OrderEmailKind[] = [
  'order_confirmation',
  'order_shipped',
  'order_delivered',
  'order_cancelled',
];

/* -------------------------------- customers --------------------------------- */

export const customerRoutes = Router();

customerRoutes.get(
  '/',
  requirePermission('customers'),
  ah(async (req, res) => {
    const { page, pageSize, skip } = pageParams(req.query, 10);
    const filter: Record<string, unknown> = {};

    const search = searchFilter(str(req.query, 'search'), ['name', 'email', 'phone']);
    if (search) Object.assign(filter, search);

    const tiers = list(req.query, 'tier');
    if (tiers.length) filter.tier = { $in: tiers };

    const statuses = list(req.query, 'status');
    if (statuses.length) filter.status = { $in: statuses };

    const hasOrders = str(req.query, 'hasOrders');
    if (hasOrders === 'true') filter.ordersCount = { $gt: 0 };
    if (hasOrders === 'false') filter.ordersCount = 0;

    const [items, total] = await Promise.all([
      CustomerModel.find(filter)
        .sort(sortSpec(req.query, 'totalSpent', 'desc'))
        .skip(skip)
        .limit(pageSize)
        .lean(),
      CustomerModel.countDocuments(filter),
    ]);

    res.json(paginated(serializeMany(items), total, page, pageSize));
  }),
);

customerRoutes.get(
  '/:id',
  requirePermission('customers'),
  ah(async (req, res) => {
    const customer = await CustomerModel.findById(req.params.id).lean();
    if (!customer) notFound('Customer');

    const [orders, reviews, wishlist] = await Promise.all([
      OrderModel.find({ customerId: customer._id }).sort({ placedAt: -1 }).lean(),
      ReviewModel.find({ customerId: customer._id }).lean(),
      ProductModel.find({ _id: { $in: customer.wishlist ?? [] } }).lean(),
    ]);

    // Cancelled and returned orders are not revenue.
    const spent = orders
      .filter((order) => order.status !== 'cancelled' && order.status !== 'returned')
      .reduce((sum, order) => sum + order.total, 0);

    res.json({
      customer: serialize(customer),
      orders: serializeMany(orders),
      reviews: serializeMany(reviews),
      wishlist: serializeMany(wishlist),
      stats: {
        totalOrders: orders.length,
        totalSpent: spent,
        aov: orders.length ? Math.round(spent / orders.length) : 0,
        lastPurchase: orders[0]?.placedAt,
      },
    });
  }),
);

customerRoutes.put(
  '/:id',
  requirePermission('customers', 'edit'),
  ah(async (req, res) => {
    const updated = await CustomerModel.findByIdAndUpdate(
      req.params.id,
      { $set: clean(req.body as Partial<Customer>) },
      { new: true },
    );
    if (!updated) notFound('Customer');
    res.json(updated.toJSON());
  }),
);

customerRoutes.delete(
  '/:id',
  requirePermission('customers', 'delete'),
  ah(async (req, res) => {
    const removed = await CustomerModel.findByIdAndDelete(req.params.id).lean();
    if (!removed) notFound('Customer');
    res.json({ id: removed._id });
  }),
);

/* -------------------------------- inventory --------------------------------- */

export const inventoryRoutes = Router();

type ProductDoc = Product & { _id: string };

function toRow(product: ProductDoc, categoryNames: Map<string, string>): InventoryRow {
  return {
    productId: product._id,
    name: product.name,
    sku: product.sku,
    image: product.images?.[0]?.url,
    category: categoryNames.get(product.categoryId) ?? '—',
    stock: product.stock,
    reserved: product.reserved,
    available: Math.max(0, product.stock - product.reserved),
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

async function categoryNameMap() {
  const categories = await CategoryModel.find().select('_id name').lean<{ _id: string; name: string }[]>();
  return new Map(categories.map((category) => [category._id, category.name]));
}

inventoryRoutes.get(
  '/summary',
  requirePermission('inventory'),
  ah(async (_req, res) => {
    const [summary] = await ProductModel.aggregate([
      {
        $group: {
          _id: null,
          totalStock: { $sum: '$stock' },
          reserved: { $sum: '$reserved' },
          skuCount: { $sum: 1 },
          stockValue: { $sum: { $multiply: ['$stock', { $ifNull: ['$costPrice', 0] }] } },
          outOfStock: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } },
          lowStock: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $project: { _id: 0 } },
    ]);

    res.json(
      summary ?? {
        totalStock: 0,
        lowStock: 0,
        outOfStock: 0,
        stockValue: 0,
        skuCount: 0,
        reserved: 0,
      },
    );
  }),
);

inventoryRoutes.get(
  '/history',
  requirePermission('inventory'),
  ah(async (req, res) => {
    const { page, pageSize, skip } = pageParams(req.query, 12);
    const filter: Record<string, unknown> = {};

    const search = searchFilter(str(req.query, 'search'), ['productName', 'sku', 'reason', 'admin']);
    if (search) Object.assign(filter, search);

    const types = list(req.query, 'type');
    if (types.length) filter.type = { $in: types };

    const productId = str(req.query, 'productId');
    if (productId) filter.productId = productId;

    const from = str(req.query, 'from');
    const to = str(req.query, 'to');
    if (from || to) {
      // `at` is an ISO string, so a lexicographic range is also chronological.
      filter.at = {
        ...(from ? { $gte: new Date(from).toISOString() } : {}),
        ...(to ? { $lte: new Date(`${to}T23:59:59`).toISOString() } : {}),
      };
    }

    const [items, total] = await Promise.all([
      StockMovementModel.find(filter)
        .sort(sortSpec(req.query, 'at', 'desc'))
        .skip(skip)
        .limit(pageSize)
        .lean(),
      StockMovementModel.countDocuments(filter),
    ]);

    res.json(paginated(serializeMany(items), total, page, pageSize));
  }),
);

inventoryRoutes.get(
  '/',
  requirePermission('inventory'),
  ah(async (req, res) => {
    const [products, names] = await Promise.all([
      ProductModel.find().lean<ProductDoc[]>(),
      categoryNameMap(),
    ]);

    const search = str(req.query, 'search')?.trim().toLowerCase();
    const statuses = list(req.query, 'stockStatus');
    const categoryId = str(req.query, 'categoryId');

    let rows = products.map((product) => toRow(product, names));
    if (search) {
      rows = rows.filter((row) =>
        [row.name, row.sku, row.category].some((field) => field.toLowerCase().includes(search)),
      );
    }
    if (statuses.length) rows = rows.filter((row) => statuses.includes(row.stockStatus));
    if (categoryId) {
      // Accept either the category id or its display name.
      const name = names.get(categoryId);
      rows = rows.filter((row) => row.category === (name ?? categoryId));
    }

    const sortBy = str(req.query, 'sortBy') ?? 'stock';
    const dir = (str(req.query, 'sortDir') ?? 'asc') === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const left = (a as unknown as Record<string, string | number>)[sortBy];
      const right = (b as unknown as Record<string, string | number>)[sortBy];
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
      return String(left ?? '').localeCompare(String(right ?? ''), 'en', { numeric: true }) * dir;
    });

    res.json(paginateArray(rows, num(req.query, 'page', 1), num(req.query, 'pageSize', 10)));
  }),
);

inventoryRoutes.post(
  '/:id/adjust',
  requirePermission('inventory', 'edit'),
  ah(async (req, res) => {
    const product = await ProductModel.findById(req.params.id);
    if (!product) notFound('Product');

    const { type, quantity, reason, admin, mode } = req.body as {
      type?: StockMovementType;
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
    await product.save();

    const movement = await StockMovementModel.create({
      _id: nextId('stk'),
      productId: product._id,
      productName: product.name,
      sku: product.sku,
      type: type ?? 'adjustment',
      quantity: newStock - previousStock,
      previousStock,
      newStock,
      reason,
      admin: admin ?? req.auth?.user.name ?? 'Admin',
      at: nowIso(),
    });

    const names = await categoryNameMap();
    res.json({
      row: toRow(product.toObject() as unknown as ProductDoc, names),
      movement: movement.toJSON(),
    });
  }),
);
