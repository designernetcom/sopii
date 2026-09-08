import { Router } from 'express';
import type { PipelineStage } from 'mongoose';
import type { Coupon, Review } from '@/types';
import { CouponModel, ReviewModel } from '../db/models.js';
import { requirePermission } from '../lib/auth.js';
import {
  ah,
  badRequest,
  clean,
  list,
  nextId,
  notFound,
  nowIso,
  pageParams,
  paginated,
  searchFilter,
  serialize,
  serializeMany,
  sortSpec,
  str,
} from '../lib/http.js';

/* --------------------------------- coupons ---------------------------------- */

export const couponRoutes = Router();

const COUPON_DERIVED = ['createdAtDate', 'endDateDate', 'startDateDate'];

/**
 * A coupon's stored status only distinguishes enabled from disabled — whether
 * it is scheduled, active or expired falls out of its date window, so the API
 * derives it on read. Doing it in the pipeline means the status filter and the
 * status sort both operate on the value the client actually sees.
 */
const withDerivedStatus: PipelineStage = {
  $addFields: {
    createdAtDate: { $toDate: '$createdAt' },
    startDateDate: { $toDate: '$startDate' },
    endDateDate: { $toDate: '$endDate' },
    status: {
      $switch: {
        branches: [
          { case: { $eq: ['$status', 'disabled'] }, then: 'disabled' },
          { case: { $gt: [{ $toDate: '$startDate' }, '$$NOW'] }, then: 'scheduled' },
          { case: { $lt: [{ $toDate: '$endDate' }, '$$NOW'] }, then: 'expired' },
        ],
        default: 'active',
      },
    },
  },
};

couponRoutes.get(
  '/',
  requirePermission('coupons'),
  ah(async (req, res) => {
    const { page, pageSize, skip } = pageParams(req.query, 10);
    const match: Record<string, unknown> = {};

    const search = searchFilter(str(req.query, 'search'), ['code', 'description']);
    if (search) Object.assign(match, search);

    const statuses = list(req.query, 'status');
    if (statuses.length) match.status = { $in: statuses };

    const types = list(req.query, 'discountType');
    if (types.length) match.discountType = { $in: types };

    const [result] = await CouponModel.aggregate([
      withDerivedStatus,
      { $match: match },
      {
        $sort: sortSpec(req.query, 'createdAt', 'desc', {
          createdAt: 'createdAtDate',
          endDate: 'endDateDate',
          startDate: 'startDateDate',
        }),
      },
      { $facet: { items: [{ $skip: skip }, { $limit: pageSize }], total: [{ $count: 'count' }] } },
    ]);

    const items = (result?.items ?? []) as ({ _id: string } & Coupon)[];
    const total = (result?.total?.[0]?.count ?? 0) as number;

    res.json(paginated(serializeMany(items, COUPON_DERIVED), total, page, pageSize));
  }),
);

couponRoutes.get(
  '/:id',
  requirePermission('coupons'),
  ah(async (req, res) => {
    const [coupon] = await CouponModel.aggregate([
      { $match: { _id: req.params.id } },
      withDerivedStatus,
    ]);
    if (!coupon) notFound('Coupon');
    res.json(serialize(coupon, COUPON_DERIVED));
  }),
);

couponRoutes.post(
  '/',
  requirePermission('coupons', 'create'),
  ah(async (req, res) => {
    const payload = clean(req.body as Partial<Coupon>);
    if (!payload.code) badRequest('Coupon code is required');

    const code = payload.code.toUpperCase().trim();
    if (await CouponModel.exists({ code })) badRequest('That coupon code already exists');

    const created = await CouponModel.create({
      _id: nextId('cpn'),
      discountType: 'percentage',
      discountValue: 0,
      minOrderValue: 0,
      usageLimit: 0,
      perCustomerLimit: 1,
      productIds: [],
      categoryIds: [],
      status: 'active',
      ...payload,
      code,
      usedCount: 0,
      startDate: payload.startDate ?? nowIso(),
      endDate: payload.endDate ?? nowIso(),
      createdAt: nowIso(),
    });

    res.status(201).json(created.toJSON());
  }),
);

couponRoutes.put(
  '/:id',
  requirePermission('coupons', 'edit'),
  ah(async (req, res) => {
    const payload = clean(req.body as Partial<Coupon>);

    if (payload.code) {
      payload.code = payload.code.toUpperCase().trim();
      if (await CouponModel.exists({ code: payload.code, _id: { $ne: req.params.id } })) {
        badRequest('That coupon code already exists');
      }
    }

    const updated = await CouponModel.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true },
    );
    if (!updated) notFound('Coupon');
    res.json(updated.toJSON());
  }),
);

couponRoutes.delete(
  '/:id',
  requirePermission('coupons', 'delete'),
  ah(async (req, res) => {
    const removed = await CouponModel.findByIdAndDelete(req.params.id).lean();
    if (!removed) notFound('Coupon');
    res.json({ id: removed._id });
  }),
);

/* --------------------------------- reviews ---------------------------------- */

export const reviewRoutes = Router();

reviewRoutes.get(
  '/counts',
  requirePermission('reviews'),
  ah(async (_req, res) => {
    const [summary] = await ReviewModel.aggregate([
      {
        $group: {
          _id: null,
          all: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          averageRating: { $avg: '$rating' },
        },
      },
      { $project: { _id: 0 } },
    ]);

    res.json({
      all: summary?.all ?? 0,
      pending: summary?.pending ?? 0,
      approved: summary?.approved ?? 0,
      rejected: summary?.rejected ?? 0,
      averageRating: summary?.averageRating ? Number(summary.averageRating.toFixed(2)) : 0,
    });
  }),
);

reviewRoutes.post(
  '/bulk',
  requirePermission('reviews', 'edit'),
  ah(async (req, res) => {
    const { action, ids, status } = req.body as {
      action: 'status' | 'delete';
      ids: string[];
      status?: Review['status'];
    };
    if (!ids?.length) badRequest('No reviews selected');

    if (action === 'delete') {
      const result = await ReviewModel.deleteMany({ _id: { $in: ids } });
      res.json({ affected: result.deletedCount ?? 0 });
      return;
    }

    if (!status) badRequest('No status supplied');
    const result = await ReviewModel.updateMany({ _id: { $in: ids } }, { $set: { status } });
    res.json({ affected: result.modifiedCount ?? 0 });
  }),
);

reviewRoutes.get(
  '/',
  requirePermission('reviews'),
  ah(async (req, res) => {
    const { page, pageSize, skip } = pageParams(req.query, 10);
    const filter: Record<string, unknown> = {};

    const search = searchFilter(str(req.query, 'search'), [
      'customerName',
      'productName',
      'body',
      'title',
    ]);
    if (search) Object.assign(filter, search);

    const statuses = list(req.query, 'status');
    if (statuses.length) filter.status = { $in: statuses };

    const ratings = list(req.query, 'rating').map(Number).filter(Number.isFinite);
    if (ratings.length) filter.rating = { $in: ratings };

    const productId = str(req.query, 'productId');
    if (productId) filter.productId = productId;

    const [items, total] = await Promise.all([
      ReviewModel.find(filter)
        .sort(sortSpec(req.query, 'createdAt', 'desc'))
        .skip(skip)
        .limit(pageSize)
        .lean(),
      ReviewModel.countDocuments(filter),
    ]);

    res.json(paginated(serializeMany(items), total, page, pageSize));
  }),
);

reviewRoutes.put(
  '/:id/status',
  requirePermission('reviews', 'edit'),
  ah(async (req, res) => {
    const { status } = req.body as { status: Review['status'] };
    const updated = await ReviewModel.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true },
    );
    if (!updated) notFound('Review');
    res.json(updated.toJSON());
  }),
);

reviewRoutes.post(
  '/:id/reply',
  requirePermission('reviews', 'edit'),
  ah(async (req, res) => {
    const { reply, by } = req.body as { reply: string; by?: string };
    if (!reply?.trim()) badRequest('Reply cannot be empty');

    const updated = await ReviewModel.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          reply: { body: reply, at: nowIso(), by: by ?? req.auth?.user.name ?? 'Admin' },
        },
      },
      { new: true },
    );
    if (!updated) notFound('Review');
    res.json(updated.toJSON());
  }),
);

reviewRoutes.delete(
  '/:id',
  requirePermission('reviews', 'delete'),
  ah(async (req, res) => {
    const removed = await ReviewModel.findByIdAndDelete(req.params.id).lean();
    if (!removed) notFound('Review');
    res.json({ id: removed._id });
  }),
);
