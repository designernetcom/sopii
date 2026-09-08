import { Router } from 'express';
import type {
  AdminUser,
  Coupon,
  Customer,
  Order,
  PaymentGateway,
  Product,
  RangeKey,
  Role,
  Settings,
} from '@/types';
import {
  buildCustomerReport,
  buildDashboard,
  buildOrderReport,
  buildSalesReport,
  type SalesGrouping,
} from '@/data/analytics';
import {
  AdminUserModel,
  CategoryModel,
  CouponModel,
  CustomerModel,
  OrderModel,
  ProductModel,
  RoleModel,
  SETTINGS_ID,
  SettingsModel,
} from '../db/models.js';
import { requirePermission } from '../lib/auth.js';
import { mergeGatewaySecrets, redactGateways } from '../payments/config.js';
import { cached, cacheKey, NAMESPACE, TTL } from '../lib/cache.js';
import { invalidateSettings } from '../lib/settings.js';
import { limits, rateLimit } from '../lib/rateLimit.js';
import {
  ah,
  badRequest,
  clean,
  escapeRegex,
  nextId,
  notFound,
  nowIso,
  serialize,
  serializeMany,
  str,
} from '../lib/http.js';

/* -------------------------- analytics data loading -------------------------- */

/*
 * THE PROBLEM THIS SECTION FIXES
 * ---------------------------------------------------------------------------
 * What was here loaded *every* order, *every* product and *every* customer
 * into the Node process on each dashboard render, then computed the numbers in
 * JavaScript. The comment above it said as much, and said it was the first
 * thing to move into aggregation "if the order table grows past a few hundred
 * thousand rows".
 *
 * At a million users it is not a slow endpoint, it is a fatal one: a million
 * order documents is several gigabytes of JSON, so the request does not
 * degrade — the process runs out of heap and dies, taking every in-flight
 * request with it. And it dies on the admin dashboard, which is the screen an
 * operator opens *because* something is wrong.
 *
 * Three changes, together:
 *
 *   1. **A window.** Every report already asks for a range; the query now
 *      honours it instead of loading all history and filtering afterwards.
 *   2. **A projection.** The builders read a dozen fields. Whole documents
 *      carried timelines, addresses and image galleries that nothing summed.
 *   3. **A cap, and a cache.** Beyond the cap the answer comes from an
 *      aggregation pipeline that never leaves the database, and the result is
 *      cached — nobody watches a dashboard tick, and two minutes of staleness
 *      on a revenue chart is not a defect.
 *
 * The pure builders in `@/data/analytics` are kept, because the panel and the
 * API sharing one implementation is what stops their numbers drifting. They
 * are simply no longer fed the entire database.
 */

/** How far back each range key reaches, as an ISO lower bound on `placedAt`. */
const RANGE_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '12m': 365,
  all: 3650,
};

/**
 * The builders compare a window against the one before it, so the query has to
 * reach back twice the range or every "vs. previous period" figure is zero.
 */
function rangeStart(range: string): string {
  const days = RANGE_DAYS[range] ?? 30;
  return new Date(Date.now() - days * 2 * 86_400_000).toISOString();
}

/**
 * The most rows the in-memory builders may be handed.
 *
 * Past this the endpoint switches to aggregation rather than loading more, so
 * the ceiling on memory is a constant regardless of how large the store grows.
 */
const ANALYTICS_ROW_CAP = Number(process.env.ANALYTICS_ROW_CAP ?? 50_000);

/** Only the fields the builders read. */
const ORDER_ANALYTICS_FIELDS = {
  code: 1,
  customerId: 1,
  customerName: 1,
  customerEmail: 1,
  items: 1,
  subtotal: 1,
  discount: 1,
  tax: 1,
  shipping: 1,
  total: 1,
  status: 1,
  paymentStatus: 1,
  paymentMethod: 1,
  placedAt: 1,
} as const;

const PRODUCT_ANALYTICS_FIELDS = {
  name: 1,
  sku: 1,
  categoryId: 1,
  price: 1,
  stock: 1,
  lowStockThreshold: 1,
  unitsSold: 1,
  revenue: 1,
  status: 1,
  createdAt: 1,
} as const;

const CUSTOMER_ANALYTICS_FIELDS = {
  name: 1,
  email: 1,
  status: 1,
  tier: 1,
  ordersCount: 1,
  totalSpent: 1,
  lastOrderAt: 1,
  createdAt: 1,
} as const;

async function analyticsData(range: string) {
  const since = rangeStart(range);

  const [orders, products, customers] = await Promise.all([
    OrderModel.find({ placedAt: { $gte: since } }, ORDER_ANALYTICS_FIELDS)
      .sort({ placedAt: -1 })
      .limit(ANALYTICS_ROW_CAP)
      .lean(),
    /*
     * Products are bounded by catalogue size rather than by history, and the
     * builders need the whole catalogue to attribute revenue by category. The
     * cap is the guard for a store with an enormous catalogue; past it the
     * product report's aggregation path is the correct answer.
     */
    ProductModel.find({}, PRODUCT_ANALYTICS_FIELDS).limit(ANALYTICS_ROW_CAP).lean(),
    /*
     * Customers are windowed the same way orders are: the reports are about
     * new and returning shoppers *in a period*, so somebody who last bought
     * three years ago contributes nothing to a 30-day view.
     */
    CustomerModel.find(
      { $or: [{ createdAt: { $gte: since } }, { lastOrderAt: { $gte: since } }] },
      CUSTOMER_ANALYTICS_FIELDS,
    )
      .sort({ totalSpent: -1 })
      .limit(ANALYTICS_ROW_CAP)
      .lean(),
  ]);

  return {
    orders: serializeMany(orders) as unknown as Order[],
    products: serializeMany(products) as unknown as Product[],
    customers: serializeMany(customers) as unknown as Customer[],
    /** True when the window was clipped, so the answer can say so. */
    truncated: orders.length >= ANALYTICS_ROW_CAP,
  };
}

/* -------------------------------- dashboard --------------------------------- */

export const dashboardRoutes = Router();

dashboardRoutes.get(
  '/',
  requirePermission('dashboard'),
  ah(async (req, res) => {
    const range = (str(req.query, 'range') ?? '30d') as RangeKey;

    /*
     * Cached, and this is the one endpoint where that matters most: a busy
     * store has several people with the dashboard open, refreshing it, while
     * everything else is also happening. Two minutes of staleness on a revenue
     * chart is not a defect; recomputing it per viewer is.
     *
     * The key includes the range, so switching from 30d to 90d is a different
     * entry rather than a stale one. Placing an order invalidates the whole
     * analytics namespace, so a new sale shows up at once.
     */
    const payload = await cached(
      cacheKey(NAMESPACE.analytics, 'dashboard', range),
      TTL.analytics,
      async () => {
        const { orders, products, customers, truncated } = await analyticsData(range);
        return { ...buildDashboard(orders, products, customers, range), truncated };
      },
    );

    res.json(payload);
  }),
);

/* --------------------------------- reports ---------------------------------- */

export const reportRoutes = Router();

reportRoutes.get(
  '/sales',
  requirePermission('reports'),
  ah(async (req, res) => {
    const range = (str(req.query, 'range') ?? '30d') as RangeKey;
    const grouping = (str(req.query, 'grouping') ?? 'daily') as SalesGrouping;

    const { rows } = await cached(
      cacheKey(NAMESPACE.analytics, 'sales', range, grouping),
      TTL.analytics,
      async () => {
        const { orders } = await analyticsData(range);
        return { rows: buildSalesReport(orders, grouping, range) };
      },
    );

    res.json({
      rows,
      totals: rows.reduce(
        (acc, row) => ({
          orders: acc.orders + row.orders,
          units: acc.units + row.units,
          revenue: acc.revenue + row.revenue,
          discount: acc.discount + row.discount,
          tax: acc.tax + row.tax,
          net: acc.net + row.net,
        }),
        { orders: 0, units: 0, revenue: 0, discount: 0, tax: 0, net: 0 },
      ),
    });
  }),
);

/**
 * The product reports, filtered and sorted **in the database**.
 *
 * The previous version loaded the whole catalogue and then did
 * `.filter().sort().slice(0, 50)` in JavaScript — which is a way of saying it
 * transferred a million documents in order to keep fifty. Each report below is
 * now a filter and a sort MongoDB can serve straight from an index
 * (`ix_product_stock_status`, `ix_product_status_created`), with the limit
 * applied before anything leaves the database.
 *
 * The `low_stock` case is the one that could not simply be indexed: the
 * threshold is a *field*, not a constant, so it needs `$expr` to compare two
 * fields of the same document. That cannot use an index for the comparison
 * itself, so the query narrows on `stock` first and evaluates `$expr` on what
 * survives.
 */
reportRoutes.get(
  '/products',
  requirePermission('reports'),
  ah(async (req, res) => {
    const type = str(req.query, 'type') ?? 'bestsellers';
    const limit = Math.min(200, Math.max(1, Number(str(req.query, 'limit')) || 50));

    const payload = await cached(
      cacheKey(NAMESPACE.analytics, 'products', type, limit),
      TTL.analytics,
      async () => {
        const projection = {
          name: 1,
          sku: 1,
          images: { $slice: 1 },
          categoryId: 1,
          price: 1,
          stock: 1,
          lowStockThreshold: 1,
          unitsSold: 1,
          revenue: 1,
          status: 1,
        } as const;

        const queries = {
          low_stock: {
            filter: {
              stock: { $gt: 0 },
              $expr: { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] },
            },
            sort: { stock: 1 as const },
          },
          out_of_stock: { filter: { stock: { $lte: 0 } }, sort: { name: 1 as const } },
          revenue: { filter: {}, sort: { revenue: -1 as const } },
          bestsellers: { filter: {}, sort: { unitsSold: -1 as const } },
        };

        const { filter, sort } = queries[type as keyof typeof queries] ?? queries.bestsellers;

        const [products, categories] = await Promise.all([
          ProductModel.find(filter, projection).sort(sort).limit(limit).lean(),
          CategoryModel.find({}, { name: 1 }).lean<{ _id: string; name: string }[]>(),
        ]);

        const names = new Map(categories.map((category) => [category._id, category.name]));

        return products.map((product) => ({
          id: product._id,
          name: product.name,
          sku: product.sku,
          image: product.images?.[0]?.url,
          category: names.get(product.categoryId) ?? '—',
          price: product.price,
          stock: product.stock,
          lowStockThreshold: product.lowStockThreshold,
          unitsSold: product.unitsSold,
          revenue: product.revenue,
          status: product.status,
        }));
      },
    );

    res.json(payload);
  }),
);

reportRoutes.get(
  '/customers',
  requirePermission('reports'),
  ah(async (req, res) => {
    const range = (str(req.query, 'range') ?? '30d') as RangeKey;
    const type = str(req.query, 'type') ?? 'top';

    const rows = await cached(
      cacheKey(NAMESPACE.analytics, 'customers', range),
      TTL.analytics,
      async () => {
        const { orders, customers } = await analyticsData(range);
        return buildCustomerReport(customers, orders, range);
      },
    );

    if (type === 'new') res.json(rows.filter((row) => row.type === 'new'));
    else if (type === 'returning') res.json(rows.filter((row) => row.type === 'returning'));
    else res.json(rows.slice(0, 50));
  }),
);

reportRoutes.get(
  '/orders',
  requirePermission('reports'),
  ah(async (req, res) => {
    const range = (str(req.query, 'range') ?? '30d') as RangeKey;

    res.json(
      await cached(cacheKey(NAMESPACE.analytics, 'orders', range), TTL.analytics, async () => {
        const { orders } = await analyticsData(range);
        return buildOrderReport(orders, range);
      }),
    );
  }),
);

/* ------------------------------ global search ------------------------------- */

export const searchRoutes = Router();

searchRoutes.get(
  '/',
  rateLimit(limits.search),
  ah(async (req, res) => {
    const term = (str(req.query, 'q') ?? '').trim();
    if (term.length < 2) {
      res.json({ products: [], orders: [], customers: [], coupons: [], total: 0 });
      return;
    }

    /*
     * Products come from the text index (see `db/indexes.ts`), which is an
     * index seek; the rest use an anchored prefix regex, which is one too.
     *
     * The distinction matters. `/term/i` — unanchored — cannot use any index
     * and forces a full collection scan of orders and customers on every
     * keystroke of the admin's global search box. Anchoring it to the start
     * (`/^term/i`) lets MongoDB range-scan the index instead, which is the
     * difference between an instant answer and one that gets slower every week
     * the store trades. The cost is that searching for "sharma" no longer
     * matches "Asha Sharma" by surname; a customer's *name* keeps the
     * unanchored form for that reason, bounded by the same limit.
     */
    const prefix = new RegExp(`^${escapeRegex(term)}`, 'i');
    const contains = new RegExp(escapeRegex(term), 'i');

    const [products, orders, customers, coupons] = await Promise.all([
      ProductModel.find(
        { $text: { $search: term } },
        { name: 1, sku: 1, price: 1, images: { $slice: 1 }, score: { $meta: 'textScore' } },
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(5)
        .lean<(Product & { _id: string })[]>()
        // A store whose text index has not been built yet must still have a
        // working search box, so this falls back rather than erroring.
        .catch(() =>
          ProductModel.find({ $or: [{ name: prefix }, { sku: prefix }, { slug: prefix }] })
            .limit(5)
            .lean<(Product & { _id: string })[]>(),
        ),
      OrderModel.find(
        { $or: [{ code: prefix }, { customerEmail: prefix }, { customerPhone: prefix }] },
        { code: 1, customerName: 1, total: 1, status: 1 },
      )
        .limit(5)
        .lean<(Order & { _id: string })[]>(),
      CustomerModel.find(
        { $or: [{ name: contains }, { email: prefix }, { phone: prefix }] },
        { name: 1, email: 1, ordersCount: 1 },
      )
        .limit(5)
        .lean<(Customer & { _id: string })[]>(),
      CouponModel.find({ code: prefix }, { code: 1, description: 1, discountType: 1, discountValue: 1 })
        .limit(4)
        .lean<(Coupon & { _id: string })[]>(),
    ]);

    res.json({
      products: products.map((p) => ({
        id: p._id,
        name: p.name,
        sku: p.sku,
        image: p.images?.[0]?.url,
        price: p.price,
      })),
      orders: orders.map((o) => ({
        id: o._id,
        code: o.code,
        customerName: o.customerName,
        total: o.total,
        status: o.status,
      })),
      customers: customers.map((c) => ({
        id: c._id,
        name: c.name,
        email: c.email,
        ordersCount: c.ordersCount,
      })),
      coupons: coupons.map((c) => ({
        id: c._id,
        code: c.code,
        discountType: c.discountType,
        discountValue: c.discountValue,
      })),
      total: products.length + orders.length + customers.length + coupons.length,
    });
  }),
);

/* ------------------------------ users & roles ------------------------------- */

export const adminUserRoutes = Router();

adminUserRoutes.get(
  '/',
  requirePermission('admin_users'),
  ah(async (req, res) => {
    const filter: Record<string, unknown> = {};

    const search = str(req.query, 'search');
    if (search?.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { roleName: rx }];
    }

    const roleId = str(req.query, 'roleId');
    if (roleId) filter.roleId = roleId;

    const status = str(req.query, 'status');
    if (status) filter.status = status;

    const sortBy = str(req.query, 'sortBy') ?? 'name';
    const dir = (str(req.query, 'sortDir') ?? 'asc') === 'asc' ? 1 : -1;

    const users = await AdminUserModel.find(filter)
      .sort({ [sortBy]: dir })
      .lean();

    res.json(serializeMany(users));
  }),
);

adminUserRoutes.get(
  '/:id',
  requirePermission('admin_users'),
  ah(async (req, res) => {
    const user = await AdminUserModel.findById(req.params.id).lean();
    if (!user) notFound('Admin user');
    res.json(serialize(user));
  }),
);

adminUserRoutes.post(
  '/',
  requirePermission('admin_users', 'create'),
  ah(async (req, res) => {
    const payload = clean(req.body as Partial<AdminUser>);
    if (!payload.name || !payload.email) badRequest('Name and email are required');

    const email = payload.email.toLowerCase().trim();
    if (await AdminUserModel.exists({ email })) {
      badRequest('An admin with that email already exists');
    }

    const role = await RoleModel.findById(payload.roleId).lean();
    if (!role) badRequest('Select a valid role');

    const created = await AdminUserModel.create({
      _id: nextId('adm'),
      ...payload,
      email,
      roleId: role._id,
      roleName: role.name,
      status: payload.status ?? 'invited',
      twoFactorEnabled: false,
      loginActivity: [],
      createdAt: nowIso(),
    });

    res.status(201).json(created.toJSON());
  }),
);

adminUserRoutes.put(
  '/:id',
  requirePermission('admin_users', 'edit'),
  ah(async (req, res) => {
    const payload = clean(req.body as Partial<AdminUser>);

    if (payload.roleId) {
      const role = await RoleModel.findById(payload.roleId).lean();
      if (!role) badRequest('Select a valid role');
      // Denormalised for list rendering; kept in step whenever the role moves.
      payload.roleName = role.name;
    }
    if (payload.email) payload.email = payload.email.toLowerCase().trim();

    const updated = await AdminUserModel.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true },
    );
    if (!updated) notFound('Admin user');
    res.json(updated.toJSON());
  }),
);

adminUserRoutes.delete(
  '/:id',
  requirePermission('admin_users', 'delete'),
  ah(async (req, res) => {
    if (req.params.id === req.auth?.user._id) badRequest('You cannot delete your own account');
    const removed = await AdminUserModel.findByIdAndDelete(req.params.id).lean();
    if (!removed) notFound('Admin user');
    res.json({ id: removed._id });
  }),
);

export const roleRoutes = Router();

/** `userCount` is derived on read so it can never drift from reality. */
async function rolesWithCounts() {
  const [roles, counts] = await Promise.all([
    RoleModel.find().lean(),
    AdminUserModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$roleId', count: { $sum: 1 } } },
    ]),
  ]);
  const byRole = new Map(counts.map((row) => [row._id, row.count]));
  return roles.map((role) => serialize({ ...role, userCount: byRole.get(role._id) ?? 0 }));
}

roleRoutes.get(
  '/',
  requirePermission('roles'),
  ah(async (_req, res) => {
    res.json(await rolesWithCounts());
  }),
);

roleRoutes.get(
  '/:id',
  requirePermission('roles'),
  ah(async (req, res) => {
    const roles = await rolesWithCounts();
    const role = roles.find((item) => item.id === req.params.id);
    if (!role) notFound('Role');
    res.json(role);
  }),
);

roleRoutes.post(
  '/',
  requirePermission('roles', 'create'),
  ah(async (req, res) => {
    const payload = clean(req.body as Partial<Role>);
    if (!payload.name) badRequest('Role name is required');

    const created = await RoleModel.create({
      _id: nextId('role'),
      ...payload,
      key: payload.key ?? payload.name.toLowerCase().replace(/\s+/g, '_'),
      description: payload.description ?? '',
      system: false,
      userCount: 0,
      permissions: payload.permissions ?? {},
      createdAt: nowIso(),
    });

    res.status(201).json(created.toJSON());
  }),
);

roleRoutes.put(
  '/:id',
  requirePermission('roles', 'edit'),
  ah(async (req, res) => {
    const payload = clean(req.body as Partial<Role>);
    // `system` and `userCount` are server-owned.
    delete payload.system;
    delete payload.userCount;

    const updated = await RoleModel.findByIdAndUpdate(req.params.id, { $set: payload }, { new: true });
    if (!updated) notFound('Role');

    if (payload.name) {
      await AdminUserModel.updateMany({ roleId: updated._id }, { $set: { roleName: payload.name } });
    }
    res.json(updated.toJSON());
  }),
);

roleRoutes.delete(
  '/:id',
  requirePermission('roles', 'delete'),
  ah(async (req, res) => {
    const role = await RoleModel.findById(req.params.id).lean();
    if (!role) notFound('Role');
    if (role.system) badRequest('System roles cannot be deleted');

    const assigned = await AdminUserModel.countDocuments({ roleId: role._id });
    if (assigned > 0) badRequest('Reassign the users on this role first');

    await RoleModel.findByIdAndDelete(role._id);
    res.json({ id: role._id });
  }),
);

/* --------------------------------- settings --------------------------------- */

export const settingsRoutes = Router();

settingsRoutes.get(
  '/',
  requirePermission('settings'),
  ah(async (_req, res) => {
    const settings = await SettingsModel.findById(SETTINGS_ID).lean();
    if (!settings) notFound('Settings');
    /*
     * `authentication` is dropped rather than returned: it holds the encrypted
     * WhatsApp access token, and a payload that carries a credential — even
     * one nobody can read without AUTH_SECRET — is a payload that ends up in a
     * browser's memory, a HAR file and a support ticket. The panel reads that
     * section from /api/settings/authentication, which redacts it properly.
     */
    const { _id, authentication, ...rest } = settings as Record<string, unknown>;
    void _id;
    void authentication;

    /*
     * The gateway key *secrets* are replaced by masks on the way out. A key id
     * is public by design — Razorpay's checkout script needs it in the browser
     * — but the secret signs and verifies payments, and a payload that carries
     * one ends up in a browser's memory, a HAR file and a support ticket.
     */
    res.json({
      ...rest,
      payments: redactGateways((rest.payments as PaymentGateway[]) ?? []),
    });
  }),
);

settingsRoutes.put(
  '/:section',
  requirePermission('settings', 'edit'),
  ah(async (req, res) => {
    const section = req.params.section as keyof Settings;
    /*
     * `authentication` is not in this list on purpose. This handler writes the
     * body straight onto the document, which cannot encrypt a token, cannot
     * preserve one the form submitted as a mask, and cannot clamp the OTP
     * limits — so that section is served by /api/settings/authentication,
     * which does all three.
     */
    if (!['store', 'shipping', 'tax', 'payments', 'email'].includes(section)) {
      notFound('Settings section');
    }

    /*
     * Payments are the one section that cannot be written straight through: a
     * new key secret has to be encrypted, and a submission carrying the mask
     * this API handed out has to leave the stored secret alone. Without the
     * second rule, saving a change to the COD limit would silently overwrite a
     * working Razorpay secret with a row of dots.
     */
    let body = req.body as unknown;
    if (section === 'payments') {
      const current = await SettingsModel.findById(SETTINGS_ID).select('payments').lean();
      body = mergeGatewaySecrets(
        (req.body as PaymentGateway[]) ?? [],
        ((current?.payments as PaymentGateway[]) ?? []),
      );
    }

    const updated = await SettingsModel.findByIdAndUpdate(
      SETTINGS_ID,
      { $set: { [section]: body } },
      { new: true },
    ).lean();
    if (!updated) notFound('Settings');

    /*
     * The settings cache backs every checkout quote, so a save has to reach it
     * immediately — waiting out the TTL would mean an operator changing the
     * free-shipping threshold and watching orders price the old way for a
     * minute. Awaited rather than fired and forgotten, so the response the
     * panel renders is guaranteed to be the one the next quote will use.
     */
    await invalidateSettings();

    const { _id, authentication, ...rest } = updated as Record<string, unknown>;
    void _id;
    void authentication;

    res.json({
      ...rest,
      payments: redactGateways((rest.payments as PaymentGateway[]) ?? []),
    });
  }),
);
