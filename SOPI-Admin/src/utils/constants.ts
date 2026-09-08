import type {
  CouponStatus,
  CustomerTier,
  FulfillmentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  RangeKey,
  ReviewStatus,
  StockMovementType,
} from '@/types';

/** Tailwind class trio used by every badge in the app. */
export interface BadgeTone {
  label: string;
  className: string;
  dot: string;
}

export const ORDER_STATUS: Record<OrderStatus, BadgeTone> = {
  pending: {
    label: 'Pending',
    className:
      'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/25',
    dot: 'bg-amber-500',
  },
  confirmed: {
    label: 'Confirmed',
    className:
      'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-400/25',
    dot: 'bg-sky-500',
  },
  processing: {
    label: 'Processing',
    className:
      'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-400/25',
    dot: 'bg-violet-500',
  },
  shipped: {
    label: 'Shipped',
    className:
      'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-400/25',
    dot: 'bg-indigo-500',
  },
  delivered: {
    label: 'Delivered',
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    className:
      'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/25',
    dot: 'bg-rose-500',
  },
  returned: {
    label: 'Returned',
    className:
      'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-400/25',
    dot: 'bg-orange-500',
  },
};

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
];

export const PAYMENT_STATUS: Record<PaymentStatus, BadgeTone> = {
  paid: {
    label: 'Paid',
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
  },
  pending: {
    label: 'Pending',
    className:
      'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/25',
    dot: 'bg-amber-500',
  },
  failed: {
    label: 'Failed',
    className:
      'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/25',
    dot: 'bg-rose-500',
  },
  refunded: {
    label: 'Refunded',
    className:
      'bg-ink-100 text-ink-700 ring-ink-500/20 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-600/30',
    dot: 'bg-ink-400',
  },
};

export const FULFILLMENT_STATUS: Record<FulfillmentStatus, BadgeTone> = {
  unfulfilled: {
    label: 'Unfulfilled',
    className:
      'bg-ink-100 text-ink-700 ring-ink-500/20 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-600/30',
    dot: 'bg-ink-400',
  },
  partial: {
    label: 'Partial',
    className:
      'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/25',
    dot: 'bg-amber-500',
  },
  fulfilled: {
    label: 'Fulfilled',
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
  },
  returned: {
    label: 'Returned',
    className:
      'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-400/25',
    dot: 'bg-orange-500',
  },
};

export const PRODUCT_STATUS: Record<ProductStatus, BadgeTone> = {
  published: {
    label: 'Published',
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
  },
  draft: {
    label: 'Draft',
    className:
      'bg-ink-100 text-ink-700 ring-ink-500/20 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-600/30',
    dot: 'bg-ink-400',
  },
  archived: {
    label: 'Archived',
    className:
      'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-400/25',
    dot: 'bg-orange-500',
  },
};

export const REVIEW_STATUS: Record<ReviewStatus, BadgeTone> = {
  pending: {
    label: 'Pending',
    className:
      'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/25',
    dot: 'bg-amber-500',
  },
  approved: {
    label: 'Approved',
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    className:
      'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/25',
    dot: 'bg-rose-500',
  },
};

export const COUPON_STATUS: Record<CouponStatus, BadgeTone> = {
  active: {
    label: 'Active',
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
  },
  scheduled: {
    label: 'Scheduled',
    className:
      'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-400/25',
    dot: 'bg-sky-500',
  },
  expired: {
    label: 'Expired',
    className:
      'bg-ink-100 text-ink-700 ring-ink-500/20 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-600/30',
    dot: 'bg-ink-400',
  },
  disabled: {
    label: 'Disabled',
    className:
      'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/25',
    dot: 'bg-rose-500',
  },
};

export const STOCK_STATUS: Record<'in_stock' | 'low_stock' | 'out_of_stock', BadgeTone> = {
  in_stock: {
    label: 'In stock',
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
  },
  low_stock: {
    label: 'Low stock',
    className:
      'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/25',
    dot: 'bg-amber-500',
  },
  out_of_stock: {
    label: 'Out of stock',
    className:
      'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/25',
    dot: 'bg-rose-500',
  },
};

export const MOVEMENT_TYPE: Record<StockMovementType, BadgeTone> = {
  purchase: {
    label: 'Purchase',
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
  },
  sale: {
    label: 'Sale',
    className:
      'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-400/25',
    dot: 'bg-sky-500',
  },
  return: {
    label: 'Return',
    className:
      'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-400/25',
    dot: 'bg-orange-500',
  },
  adjustment: {
    label: 'Adjustment',
    className:
      'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-400/25',
    dot: 'bg-violet-500',
  },
  damaged: {
    label: 'Damaged',
    className:
      'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/25',
    dot: 'bg-rose-500',
  },
  cancelled: {
    label: 'Cancelled',
    className:
      'bg-ink-100 text-ink-700 ring-ink-500/20 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-600/30',
    dot: 'bg-ink-400',
  },
};

export const CUSTOMER_TIER: Record<CustomerTier, BadgeTone> = {
  new: {
    label: 'New',
    className:
      'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-400/25',
    dot: 'bg-sky-500',
  },
  regular: {
    label: 'Regular',
    className:
      'bg-ink-100 text-ink-700 ring-ink-500/20 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-600/30',
    dot: 'bg-ink-400',
  },
  silver: {
    label: 'Silver',
    className:
      'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/25',
    dot: 'bg-slate-400',
  },
  gold: {
    label: 'Gold',
    className:
      'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/25',
    dot: 'bg-amber-500',
  },
  platinum: {
    label: 'Platinum',
    className:
      'bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/25',
    dot: 'bg-brand-500',
  },
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  razorpay: 'Razorpay',
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Netbanking',
  cod: 'Cash on Delivery',
};

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '3m', label: '3 Months' },
  { key: '6m', label: '6 Months' },
  { key: '1y', label: '1 Year' },
];

export const CHART_COLORS = ['#6d4ae4', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'];

export const COLORS = [
  'Ivory',
  'Black',
  'Pink',
  'Maroon',
  'Emerald',
  'Indigo',
  'Mustard',
  'Teal',
  'Rust',
  'Beige',
];

export const FABRICS = [
  'Cotton',
  'Silk',
  'Chanderi',
  'Linen',
  'Georgette',
  'Organza',
  'Tussar',
  'Banarasi Silk',
  'Khadi',
  'Rayon',
];

export const OCCASIONS = ['Casual', 'Festive', 'Wedding', 'Office', 'Party', 'Daily Wear'];
export const PATTERNS = ['Solid', 'Printed', 'Embroidered', 'Woven', 'Zari Work', 'Block Print'];
export const FITS = ['Regular', 'Slim', 'Relaxed', 'A-Line', 'Straight'];
