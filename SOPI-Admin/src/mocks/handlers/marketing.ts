import type { Coupon, Review } from '@/types';
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

/* --------------------------------- coupons --------------------------------- */

function derivedStatus(coupon: Coupon): Coupon['status'] {
  if (coupon.status === 'disabled') return 'disabled';
  const now = Date.now();
  if (new Date(coupon.startDate).getTime() > now) return 'scheduled';
  if (new Date(coupon.endDate).getTime() < now) return 'expired';
  return 'active';
}

export const couponRoutes = [
  route('GET', '/coupons', ({ query }) => {
    const statuses = list(query.status);
    const types = list(query.discountType);

    const filtered = db.coupons
      .map((coupon) => ({ ...coupon, status: derivedStatus(coupon) }))
      .filter((coupon) => matchesSearch(query.search, [coupon.code, coupon.description]))
      .filter((coupon) => (statuses.length ? statuses.includes(coupon.status) : true))
      .filter((coupon) => (types.length ? types.includes(coupon.discountType) : true));

    const sorted = sortBy(filtered, query.sortBy ?? 'createdAt', query.sortDir ?? 'desc', (c, key) =>
      key === 'createdAt'
        ? new Date(c.createdAt).getTime()
        : key === 'endDate'
          ? new Date(c.endDate).getTime()
          : (c as unknown as Record<string, string | number>)[key],
    );
    return paginate(sorted, num(query.page, 1), num(query.pageSize, 10));
  }),

  route('GET', '/coupons/:id', ({ params }) => {
    const coupon = db.coupons.find((c) => c.id === params.id);
    if (!coupon) notFound('Coupon');
    return coupon;
  }),

  route('POST', '/coupons', ({ body }) => {
    const payload = body as Partial<Coupon>;
    if (!payload.code) badRequest('Coupon code is required');
    const code = payload.code.toUpperCase().trim();
    if (db.coupons.some((c) => c.code === code)) badRequest('That coupon code already exists');

    const coupon: Coupon = {
      id: nextId('cpn'),
      code,
      description: payload.description,
      discountType: payload.discountType ?? 'percentage',
      discountValue: payload.discountValue ?? 0,
      minOrderValue: payload.minOrderValue ?? 0,
      maxDiscount: payload.maxDiscount,
      usageLimit: payload.usageLimit ?? 0,
      perCustomerLimit: payload.perCustomerLimit ?? 1,
      usedCount: 0,
      startDate: payload.startDate ?? nowIso(),
      endDate: payload.endDate ?? nowIso(),
      productIds: payload.productIds ?? [],
      categoryIds: payload.categoryIds ?? [],
      status: payload.status ?? 'active',
      createdAt: nowIso(),
    };
    coupon.status = derivedStatus(coupon);
    db.coupons.unshift(coupon);
    return coupon;
  }),

  route('PUT', '/coupons/:id', ({ params, body }) => {
    const coupon = db.coupons.find((c) => c.id === params.id);
    if (!coupon) notFound('Coupon');
    const payload = body as Partial<Coupon>;
    if (payload.code) {
      const code = payload.code.toUpperCase().trim();
      if (db.coupons.some((c) => c.code === code && c.id !== coupon.id)) {
        badRequest('That coupon code already exists');
      }
      payload.code = code;
    }
    applyPatch(coupon, payload);
    return coupon;
  }),

  route('DELETE', '/coupons/:id', ({ params }) => {
    const index = db.coupons.findIndex((c) => c.id === params.id);
    if (index === -1) notFound('Coupon');
    const [removed] = db.coupons.splice(index, 1);
    return { id: removed.id };
  }),
];

/* --------------------------------- reviews --------------------------------- */

export const reviewRoutes = [
  route('GET', '/reviews', ({ query }) => {
    const statuses = list(query.status);
    const ratings = list(query.rating).map(Number);

    const filtered = db.reviews
      .filter((review) =>
        matchesSearch(query.search, [review.customerName, review.productName, review.body, review.title]),
      )
      .filter((review) => (statuses.length ? statuses.includes(review.status) : true))
      .filter((review) => (ratings.length ? ratings.includes(review.rating) : true))
      .filter((review) => (query.productId ? review.productId === query.productId : true));

    const sorted = sortBy(filtered, query.sortBy ?? 'createdAt', query.sortDir ?? 'desc', (r, key) =>
      key === 'createdAt'
        ? new Date(r.createdAt).getTime()
        : (r as unknown as Record<string, string | number>)[key],
    );
    return paginate(sorted, num(query.page, 1), num(query.pageSize, 10));
  }),

  route('GET', '/reviews/counts', () => ({
    all: db.reviews.length,
    pending: db.reviews.filter((r) => r.status === 'pending').length,
    approved: db.reviews.filter((r) => r.status === 'approved').length,
    rejected: db.reviews.filter((r) => r.status === 'rejected').length,
    averageRating:
      db.reviews.length
        ? Number(
            (db.reviews.reduce((sum, r) => sum + r.rating, 0) / db.reviews.length).toFixed(2),
          )
        : 0,
  })),

  route('PUT', '/reviews/:id/status', ({ params, body }) => {
    const review = db.reviews.find((r) => r.id === params.id);
    if (!review) notFound('Review');
    const { status } = body as { status: Review['status'] };
    review.status = status;
    return review;
  }),

  route('POST', '/reviews/:id/reply', ({ params, body }) => {
    const review = db.reviews.find((r) => r.id === params.id);
    if (!review) notFound('Review');
    const { reply, by } = body as { reply: string; by?: string };
    if (!reply?.trim()) badRequest('Reply cannot be empty');
    review.reply = { body: reply, at: nowIso(), by: by ?? 'Admin' };
    return review;
  }),

  route('POST', '/reviews/bulk', ({ body }) => {
    const { action, ids, status } = body as {
      action: 'status' | 'delete';
      ids: string[];
      status?: Review['status'];
    };
    if (!ids?.length) badRequest('No reviews selected');

    if (action === 'delete') {
      const set = new Set(ids);
      for (let i = db.reviews.length - 1; i >= 0; i -= 1) {
        if (set.has(db.reviews[i].id)) db.reviews.splice(i, 1);
      }
      return { affected: ids.length };
    }
    const targets = db.reviews.filter((r) => ids.includes(r.id));
    targets.forEach((review) => {
      if (status) review.status = status;
    });
    return { affected: targets.length };
  }),

  route('DELETE', '/reviews/:id', ({ params }) => {
    const index = db.reviews.findIndex((r) => r.id === params.id);
    if (index === -1) notFound('Review');
    const [removed] = db.reviews.splice(index, 1);
    return { id: removed.id };
  }),
];
