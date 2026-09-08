import type { AdminUser, AuthUser, RangeKey, Role, Settings } from '@/types';
import { db, nextId, nowIso } from '../db';
import { applyPatch, badRequest, matchesSearch, notFound, route, sortBy } from '../utils';
import {
  buildCustomerReport,
  buildDashboard,
  buildOrderReport,
  buildSalesReport,
  buildSalesSeries,
  type SalesGrouping,
} from '@/data/analytics';

/* -------------------------------- dashboard -------------------------------- */

export const dashboardRoutes = [
  route('GET', '/dashboard', ({ query }) => {
    const range = (query.range as RangeKey) ?? '30d';
    return buildDashboard(db.orders, db.products, db.customers, range);
  }),

  route('GET', '/dashboard/sales', ({ query }) =>
    buildSalesSeries(db.orders, (query.range as RangeKey) ?? '30d'),
  ),
];

/* --------------------------------- reports --------------------------------- */

export const reportRoutes = [
  route('GET', '/reports/sales', ({ query }) => {
    const range = (query.range as RangeKey) ?? '30d';
    const grouping = (query.grouping as SalesGrouping) ?? 'daily';
    const rows = buildSalesReport(db.orders, grouping, range);
    return {
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
    };
  }),

  route('GET', '/reports/products', ({ query }) => {
    const type = query.type ?? 'bestsellers';
    const rows = db.products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      image: product.images[0]?.url,
      category: db.categories.find((c) => c.id === product.categoryId)?.name ?? '—',
      price: product.price,
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      unitsSold: product.unitsSold,
      revenue: product.revenue,
      status: product.status,
    }));

    switch (type) {
      case 'low_stock':
        return rows
          .filter((r) => r.stock > 0 && r.stock <= r.lowStockThreshold)
          .sort((a, b) => a.stock - b.stock);
      case 'out_of_stock':
        return rows.filter((r) => r.stock <= 0).sort((a, b) => a.name.localeCompare(b.name));
      case 'revenue':
        return rows.sort((a, b) => b.revenue - a.revenue).slice(0, 50);
      default:
        return rows.sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 50);
    }
  }),

  route('GET', '/reports/customers', ({ query }) => {
    const range = (query.range as RangeKey) ?? '30d';
    const rows = buildCustomerReport(db.customers, db.orders, range);
    const type = query.type ?? 'top';
    if (type === 'new') return rows.filter((r) => r.type === 'new');
    if (type === 'returning') return rows.filter((r) => r.type === 'returning');
    return rows.slice(0, 50);
  }),

  route('GET', '/reports/orders', ({ query }) =>
    buildOrderReport(db.orders, (query.range as RangeKey) ?? '30d'),
  ),
];

/* ------------------------------ global search ------------------------------ */

export const searchRoutes = [
  route('GET', '/search', ({ query }) => {
    const term = (query.q ?? '').trim();
    if (term.length < 2) {
      return { products: [], orders: [], customers: [], coupons: [], total: 0 };
    }

    const products = db.products
      .filter((p) => matchesSearch(term, [p.name, p.sku, p.slug]))
      .slice(0, 5)
      .map((p) => ({ id: p.id, name: p.name, sku: p.sku, image: p.images[0]?.url, price: p.price }));

    const orders = db.orders
      .filter((o) => matchesSearch(term, [o.code, o.customerName, o.customerEmail, o.customerPhone]))
      .slice(0, 5)
      .map((o) => ({
        id: o.id,
        code: o.code,
        customerName: o.customerName,
        total: o.total,
        status: o.status,
      }));

    const customers = db.customers
      .filter((c) => matchesSearch(term, [c.name, c.email, c.phone]))
      .slice(0, 5)
      .map((c) => ({ id: c.id, name: c.name, email: c.email, ordersCount: c.ordersCount }));

    const coupons = db.coupons
      .filter((c) => matchesSearch(term, [c.code, c.description]))
      .slice(0, 4)
      .map((c) => ({ id: c.id, code: c.code, discountType: c.discountType, discountValue: c.discountValue }));

    return {
      products,
      orders,
      customers,
      coupons,
      total: products.length + orders.length + customers.length + coupons.length,
    };
  }),
];

/* ------------------------------ users & roles ------------------------------ */

export const adminRoutes = [
  route('GET', '/admin-users', ({ query }) => {
    const filtered = db.adminUsers
      .filter((u) => matchesSearch(query.search, [u.name, u.email, u.roleName]))
      .filter((u) => (query.roleId ? u.roleId === query.roleId : true))
      .filter((u) => (query.status ? u.status === query.status : true));
    return sortBy(filtered, query.sortBy ?? 'name', query.sortDir ?? 'asc', (u, key) =>
      key === 'lastLoginAt'
        ? new Date(u.lastLoginAt ?? 0).getTime()
        : (u as unknown as Record<string, string>)[key],
    );
  }),

  route('GET', '/admin-users/:id', ({ params }) => {
    const user = db.adminUsers.find((u) => u.id === params.id);
    if (!user) notFound('Admin user');
    return user;
  }),

  route('POST', '/admin-users', ({ body }) => {
    const payload = body as Partial<AdminUser>;
    if (!payload.name || !payload.email) badRequest('Name and email are required');
    if (db.adminUsers.some((u) => u.email === payload.email)) {
      badRequest('An admin with that email already exists');
    }
    const role = db.roles.find((r) => r.id === payload.roleId);
    if (!role) badRequest('Select a valid role');

    const user: AdminUser = {
      id: nextId('adm'),
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      roleId: role.id,
      roleName: role.name,
      status: payload.status ?? 'invited',
      twoFactorEnabled: false,
      loginActivity: [],
      createdAt: nowIso(),
    };
    db.adminUsers.push(user);
    role.userCount += 1;
    return user;
  }),

  route('PUT', '/admin-users/:id', ({ params, body }) => {
    const user = db.adminUsers.find((u) => u.id === params.id);
    if (!user) notFound('Admin user');
    const payload = body as Partial<AdminUser>;
    if (payload.roleId && payload.roleId !== user.roleId) {
      const previous = db.roles.find((r) => r.id === user.roleId);
      const next = db.roles.find((r) => r.id === payload.roleId);
      if (!next) badRequest('Select a valid role');
      if (previous) previous.userCount = Math.max(0, previous.userCount - 1);
      next.userCount += 1;
      payload.roleName = next.name;
    }
    applyPatch(user, payload);
    return user;
  }),

  route('DELETE', '/admin-users/:id', ({ params }) => {
    const index = db.adminUsers.findIndex((u) => u.id === params.id);
    if (index === -1) notFound('Admin user');
    const [removed] = db.adminUsers.splice(index, 1);
    const role = db.roles.find((r) => r.id === removed.roleId);
    if (role) role.userCount = Math.max(0, role.userCount - 1);
    return { id: removed.id };
  }),

  route('GET', '/roles', () => db.roles),

  route('GET', '/roles/:id', ({ params }) => {
    const role = db.roles.find((r) => r.id === params.id);
    if (!role) notFound('Role');
    return role;
  }),

  route('POST', '/roles', ({ body }) => {
    const payload = body as Partial<Role>;
    if (!payload.name) badRequest('Role name is required');
    const template = db.roles.find((r) => r.key === 'support');
    const role: Role = {
      id: nextId('role'),
      key: payload.key ?? payload.name.toLowerCase().replace(/\s+/g, '_'),
      name: payload.name,
      description: payload.description ?? '',
      system: false,
      userCount: 0,
      permissions: payload.permissions ?? structuredClone(template!.permissions),
      createdAt: nowIso(),
    };
    db.roles.push(role);
    return role;
  }),

  route('PUT', '/roles/:id', ({ params, body }) => {
    const role = db.roles.find((r) => r.id === params.id);
    if (!role) notFound('Role');
    applyPatch(role, body as Partial<Role>);
    return role;
  }),

  route('DELETE', '/roles/:id', ({ params }) => {
    const role = db.roles.find((r) => r.id === params.id);
    if (!role) notFound('Role');
    if (role.system) badRequest('System roles cannot be deleted');
    if (role.userCount > 0) badRequest('Reassign the users on this role first');
    db.roles.splice(db.roles.indexOf(role), 1);
    return { id: role.id };
  }),
];

/* --------------------------------- settings -------------------------------- */

export const settingsRoutes = [
  route('GET', '/settings', () => db.settings),

  route('PUT', '/settings/:section', ({ params, body }) => {
    const section = params.section as keyof Settings;
    if (!(section in db.settings)) notFound('Settings section');
    if (section === 'payments') {
      db.settings.payments = body as unknown as Settings['payments'];
    } else {
      Object.assign(db.settings[section] as object, body);
    }
    return db.settings;
  }),
];

/* ----------------------------------- auth ---------------------------------- */

const DEMO_PASSWORD = 'sopii123';

function toAuthUser(user: AdminUser): AuthUser {
  const role = db.roles.find((r) => r.id === user.roleId);
  return {
    ...user,
    roleKey: String(role?.key ?? 'support'),
    permissions: role
      ? structuredClone(role.permissions)
      : ({} as AuthUser['permissions']),
  };
}

export const authRoutes = [
  route('POST', '/auth/login', ({ body }) => {
    const { email, password } = body as { email: string; password: string };
    const user = db.adminUsers.find((u) => u.email.toLowerCase() === email?.toLowerCase().trim());

    if (!user) badRequest('No admin account found for that email');
    if (password !== DEMO_PASSWORD) badRequest('Incorrect password');
    if (user.status === 'suspended') badRequest('This account has been suspended');

    user.lastLoginAt = nowIso();
    return {
      token: `mock.${btoa(user.id)}.${Date.now()}`,
      user: toAuthUser(user),
    };
  }),

  route('GET', '/auth/me', ({ query }) => {
    const user = db.adminUsers.find((u) => u.id === query.userId);
    if (!user) notFound('Session');
    return toAuthUser(user);
  }),

  route('POST', '/auth/logout', () => ({ ok: true })),

  route('PUT', '/auth/profile', ({ body }) => {
    const payload = body as Partial<AdminUser> & { id: string };
    const user = db.adminUsers.find((u) => u.id === payload.id);
    if (!user) notFound('Admin user');
    applyPatch(user, payload);
    return toAuthUser(user);
  }),

  route('PUT', '/auth/password', ({ body }) => {
    const { currentPassword, newPassword } = body as {
      currentPassword: string;
      newPassword: string;
    };
    if (currentPassword !== DEMO_PASSWORD) badRequest('Current password is incorrect');
    if (!newPassword || newPassword.length < 8) badRequest('Use at least 8 characters');
    // Demo build: credentials are not persisted.
    return { ok: true };
  }),

  route('PUT', '/auth/two-factor', ({ body }) => {
    const { id, enabled } = body as { id: string; enabled: boolean };
    const user = db.adminUsers.find((u) => u.id === id);
    if (!user) notFound('Admin user');
    user.twoFactorEnabled = enabled;
    return toAuthUser(user);
  }),

  route('DELETE', '/auth/sessions/:id', ({ params, query }) => {
    const user = db.adminUsers.find((u) => u.id === query.userId);
    if (!user) notFound('Admin user');
    user.loginActivity = user.loginActivity.filter((a) => a.id !== params.id);
    return toAuthUser(user);
  }),
];

export const DEMO_CREDENTIALS = {
  password: DEMO_PASSWORD,
  accounts: () =>
    db.adminUsers
      .filter((u) => u.status === 'active')
      .map((u) => ({ email: u.email, name: u.name, role: u.roleName })),
};
