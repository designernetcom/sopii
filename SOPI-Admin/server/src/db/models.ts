/*
 * Mongoose models.
 *
 * Two deliberate choices keep the API byte-compatible with what the admin
 * panel already expects:
 *
 * 1. `_id` is a String holding the seeded id (`prd_0001`, `SOP10711`, …) rather
 *    than an ObjectId. Every cross-reference in the dataset — categoryId,
 *    productIds, customerId — is one of those strings, so keeping them as the
 *    primary key means the relations survive the move to a database untouched.
 * 2. A shared `toJSON` transform renames `_id` to `id` and strips `__v`, so
 *    documents serialise into exactly the `@/types` shapes the client parses.
 */

import { Schema, model, type Model } from 'mongoose';
import type {
  AdminUser,
  Announcement,
  AppNotification,
  Banner,
  Category,
  Collection,
  Coupon,
  Customer,
  FeaturedCollectionSection,
  FooterSection,
  HomeSection,
  MediaAsset,
  Order,
  Product,
  Review,
  Role,
  SeoPage,
  SeoSettings,
  Settings,
  StockMovement,
} from '@/types';

/* --------------------------------- helpers --------------------------------- */

const baseOptions = {
  versionKey: false,
  // Sub-schemas opt out of _id individually; see `sub()`.
  toJSON: {
    virtuals: false,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.passwordHash;
      return ret;
    },
  },
  toObject: { virtuals: false },
} as const;

/** Embedded schema: no separate _id, keeps its own `id` string field. */
function sub(definition: Record<string, unknown>) {
  return new Schema(definition, { _id: false, versionKey: false });
}

const addressSchema = sub({
  /* Shop accounts keep several addresses and mark one default, so an address
     needs its own handle. Orders copy an address in and ignore both fields. */
  id: String,
  label: String,
  isDefault: Boolean,
  name: String,
  phone: String,
  line1: String,
  line2: String,
  city: String,
  state: String,
  pincode: String,
  country: String,
});

/* --------------------------------- product --------------------------------- */

const variantSchema = sub({
  id: String,
  sku: String,
  color: String,
  size: String,
  fabric: String,
  price: Number,
  stock: Number,
  image: String,
});

/*
 * A gallery entry is a CDN URL plus the handle that owns it.
 *
 * `publicId` is what makes a replaced or removed image take its Cloudinary
 * asset with it rather than orphaning one — the URL alone is not a reliable
 * handle, since it carries a version segment and a transformation the delivery
 * layer is free to rewrite. Optional, because records predating the migration
 * hold a `/media/...` path (or, historically, a base64 data URI) with no
 * Cloudinary asset behind it.
 */
const productImageSchema = sub({
  id: String,
  url: String,
  publicId: String,
  alt: String,
  isMain: Boolean,
});

/**
 * The SEO block, identical wherever metadata is edited: on a product,
 * category or collection record, and on a `seo_pages` row. Keeping one shape
 * is what lets the resolver flatten any of them the same way.
 *
 * `robotsIndex`/`robotsFollow` are deliberately nullable rather than defaulted:
 * `undefined` means "inherit the site default", which is not the same as an
 * explicit `false`.
 */
const seoSchema = sub({
  title: String,
  metaDescription: String,
  keywords: { type: [String], default: [] },
  slug: String,
  canonicalUrl: String,

  ogTitle: String,
  ogDescription: String,
  ogImage: String,

  twitterTitle: String,
  twitterDescription: String,
  twitterImage: String,

  robotsIndex: { type: Boolean, default: undefined },
  robotsFollow: { type: Boolean, default: undefined },

  structuredData: String,
});

const productSchema = new Schema(
  {
    _id: String,
    name: { type: String, required: true, index: true },
    sku: { type: String, required: true, index: true },
    slug: { type: String, required: true },
    categoryId: { type: String, index: true },
    subcategoryId: String,
    brand: String,
    shortDescription: String,
    description: String,

    price: { type: Number, default: 0, index: true },
    mrp: { type: Number, default: 0 },
    costPrice: Number,
    taxRate: { type: Number, default: 12 },

    barcode: String,
    stock: { type: Number, default: 0, index: true },
    lowStockThreshold: { type: Number, default: 10 },
    reserved: { type: Number, default: 0 },
    trackInventory: { type: Boolean, default: true },
    allowBackorders: { type: Boolean, default: false },

    variants: { type: [variantSchema], default: [] },
    images: { type: [productImageSchema], default: [] },
    details: {
      type: sub({
        fabric: String,
        pattern: String,
        occasion: String,
        fit: String,
        careInstructions: String,
        countryOfOrigin: String,
      }),
      default: {},
    },
    seo: { type: seoSchema, default: {} },

    status: { type: String, enum: ['published', 'draft', 'archived'], default: 'draft', index: true },
    featured: { type: Boolean, default: false },
    collectionIds: { type: [String], default: [], index: true },
    tags: { type: [String], default: [] },

    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    unitsSold: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },

    createdAt: String,
    updatedAt: String,
  },
  baseOptions,
);

/* -------------------------------- taxonomy --------------------------------- */

const categorySchema = new Schema(
  {
    _id: String,
    name: { type: String, required: true, index: true },
    slug: String,
    description: String,
    image: String,
    parentId: { type: String, default: null, index: true },
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    productCount: { type: Number, default: 0 },
    seo: { type: seoSchema, default: {} },
    createdAt: String,
  },
  baseOptions,
);

const collectionSchema = new Schema(
  {
    _id: String,
    name: { type: String, required: true, index: true },
    slug: String,
    description: String,
    banner: String,
    productIds: { type: [String], default: [] },
    startDate: String,
    endDate: String,
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    featured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    seo: { type: seoSchema, default: {} },
    createdAt: String,
  },
  baseOptions,
);

/* -------------------------------- customers -------------------------------- */

const customerSchema = new Schema(
  {
    _id: String,
    name: { type: String, required: true, index: true },
    email: { type: String, required: true, index: true },
    phone: String,
    avatar: String,
    /* Set only for customers who created a shop account. Seeded customers have
       none, so they exist in the panel but cannot sign in until they register.
       Never selected by the storefront routes, and stripped by `serialize`. */
    passwordHash: { type: String, select: false },
    status: { type: String, enum: ['active', 'blocked'], default: 'active', index: true },
    tier: {
      type: String,
      enum: ['new', 'regular', 'silver', 'gold', 'platinum'],
      default: 'new',
      index: true,
    },
    addresses: { type: [addressSchema], default: [] },
    wishlist: { type: [String], default: [] },
    ordersCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0, index: true },
    lastOrderAt: String,
    activity: {
      type: [sub({ id: String, type: String, message: String, at: String })],
      default: [],
    },
    acceptsMarketing: { type: Boolean, default: false },
    notes: String,
    createdAt: String,
  },
  baseOptions,
);

/* ---------------------------------- orders --------------------------------- */

const orderSchema = new Schema(
  {
    _id: String,
    code: { type: String, required: true, index: true },
    customerId: { type: String, index: true },
    customerName: String,
    customerEmail: String,
    customerPhone: String,
    items: {
      type: [
        sub({
          id: String,
          productId: String,
          name: String,
          sku: String,
          image: String,
          /* `variant` is the human string the panel prints on the packing slip;
             size/colour are kept apart so the shop can render its own lines. */
          variant: String,
          size: String,
          color: String,
          price: Number,
          quantity: Number,
          total: Number,
        }),
      ],
      default: [],
    },
    subtotal: Number,
    discount: Number,
    couponCode: String,
    tax: Number,
    shipping: Number,
    /* Set by storefront orders: the cash-on-delivery fee from settings, and the
       delivery zone the shipping rate came from. */
    codCharge: { type: Number, default: 0 },
    shippingLabel: String,
    shippingEta: String,
    total: { type: Number, index: true },
    status: { type: String, index: true },
    paymentStatus: { type: String, index: true },
    paymentMethod: { type: String, index: true },
    /* Set by an online payment: the gateway's own references, so a refund or a
       dispute can be traced from the panel back to the gateway. Absent on a COD
       order, which has nothing to reference until the cash arrives. */
    paymentProvider: String,
    paymentReference: { type: String, index: true, sparse: true },
    paymentOrderId: { type: String, index: true, sparse: true },
    paidAt: String,
    fulfillment: String,
    shippingAddress: { type: addressSchema, default: {} },
    billingAddress: { type: addressSchema, default: {} },
    trackingNumber: String,
    courier: String,
    notes: String,
    timeline: {
      type: [sub({ id: String, status: String, label: String, note: String, at: String, by: String })],
      default: [],
    },
    /*
     * What was emailed about this order, and what became of it.
     *
     * One entry per kind — `order_confirmation`, `order_shipped`, … — upserted
     * rather than pushed, so a retried job or a resend updates the record
     * instead of growing a list nobody can read. That is also what makes the
     * panel's "Sent at" the time of the *latest* attempt rather than the first.
     *
     * `messageId` is the RFC 5322 Message-ID the relay assigned: the handle
     * for finding the message in Mailtrap when a customer says it never
     * arrived. It is set only on a successful send.
     */
    emailNotifications: {
      type: [
        sub({
          kind: String,
          status: String, // sent | failed | skipped
          recipient: String,
          messageId: String,
          error: String,
          attempts: { type: Number, default: 0 },
          sentAt: String,
          lastAttemptAt: String,
        }),
      ],
      default: [],
    },
    placedAt: { type: String, index: true },
    updatedAt: String,
  },
  baseOptions,
);

/* -------------------------------- marketing -------------------------------- */

const couponSchema = new Schema(
  {
    _id: String,
    code: { type: String, required: true, unique: true, index: true },
    description: String,
    discountType: { type: String, enum: ['percentage', 'fixed', 'free_shipping'], default: 'percentage' },
    discountValue: { type: Number, default: 0 },
    minOrderValue: { type: Number, default: 0 },
    maxDiscount: Number,
    usageLimit: { type: Number, default: 0 },
    perCustomerLimit: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    startDate: String,
    endDate: String,
    productIds: { type: [String], default: [] },
    categoryIds: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'scheduled', 'expired', 'disabled'], default: 'active' },
    createdAt: String,
  },
  baseOptions,
);

const reviewSchema = new Schema(
  {
    _id: String,
    productId: { type: String, index: true },
    productName: String,
    productImage: String,
    customerId: { type: String, index: true },
    customerName: String,
    customerAvatar: String,
    rating: { type: Number, index: true },
    title: String,
    body: String,
    images: { type: [String], default: [] },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    verifiedPurchase: { type: Boolean, default: false },
    reply: { type: sub({ body: String, at: String, by: String }), default: undefined },
    helpfulCount: { type: Number, default: 0 },
    createdAt: String,
  },
  baseOptions,
);

/* -------------------------------- inventory -------------------------------- */

const stockMovementSchema = new Schema(
  {
    _id: String,
    productId: { type: String, index: true },
    productName: String,
    sku: String,
    type: { type: String, index: true },
    quantity: Number,
    previousStock: Number,
    newStock: Number,
    reason: String,
    reference: String,
    admin: String,
    at: { type: String, index: true },
  },
  baseOptions,
);

/* ----------------------------------- cms ----------------------------------- */

const bannerSchema = new Schema(
  {
    _id: String,
    title: String,
    heading: { type: String, required: true },
    subheading: String,
    /* The URL stays a plain string so every existing reader — the panel, the
       shop front, the SEO feed — keeps working unchanged. The Cloudinary
       handle rides alongside rather than nesting the URL inside an object,
       which would have been a breaking change for all three. */
    desktopImage: String,
    desktopImagePublicId: String,
    mobileImage: String,
    mobileImagePublicId: String,
    buttonText: String,
    buttonLink: String,
    startDate: String,
    endDate: String,
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
  },
  baseOptions,
);

const homeSectionSchema = new Schema(
  {
    _id: String,
    key: String,
    title: String,
    subtitle: String,
    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    itemLimit: Number,
  },
  baseOptions,
);

/*
 * The storefront's announcement strip. Kept apart from banners rather than
 * folded into them: a banner is imagery with a call to action, an announcement
 * is one line of copy, and sharing a collection would mean every reader of
 * either filtering out the other.
 *
 * Validation of what a request may write lives in `lib/announcements.ts`; the
 * schema limits here are the backstop for anything that bypasses it.
 */
const announcementSchema = new Schema(
  {
    _id: String,
    message: { type: String, required: true, trim: true, maxlength: 200 },
    isActive: { type: Boolean, default: false },
    priority: { type: Number, default: 0, min: 0 },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    createdAt: String,
    updatedAt: String,
  },
  baseOptions,
);

/*
 * The storefront footer — one document holding every section in order.
 *
 * One document rather than a collection of sections, for two reasons. The
 * absence of the document carries meaning: "never edited, serve the default
 * footer", which is what lets a store upgraded in place keep its policy links
 * instead of rendering an empty footer from an empty collection. And a reorder
 * or a delete is then a single atomic write, guarded by `revision`, rather than
 * a bulk update that a concurrent edit can interleave with.
 *
 * Validation lives in `lib/footer.ts`; the limits here are the backstop.
 */
const footerItemSchema = sub({
  id: { type: String, required: true },
  label: { type: String, default: '', maxlength: 60 },
  url: { type: String, default: '', maxlength: 500 },
  icon: { type: String, default: '' },
  color: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  openInNewTab: { type: Boolean, default: false },
});

const footerSectionSchema = sub({
  id: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: ['brand', 'links', 'text', 'social', 'utility', 'copyright', 'payments', 'legal', 'credit'],
  },
  title: { type: String, default: '', maxlength: 60 },
  enabled: { type: Boolean, default: true },
  content: { type: String, default: '', maxlength: 1000 },
  items: { type: [footerItemSchema], default: [] },
  display: {
    type: sub({ logo: Boolean, address: Boolean, email: Boolean, phone: Boolean }),
    default: undefined,
  },
});

const footerSchema = new Schema(
  {
    _id: String,
    sections: { type: [footerSectionSchema], default: [] },
    /** Bumped on every write; the optimistic-concurrency guard. */
    revision: { type: Number, default: 0 },
    updatedAt: String,
  },
  baseOptions,
);

/*
 * The home page's Featured Collection section — one document, `_id` fixed to
 * `FEATURED_COLLECTION_ID`. Validation of what a request may write lives in
 * `lib/featuredCollection.ts`; the limits here are the backstop.
 */
const featuredCollectionPillarSchema = sub({
  id: { type: String, required: true },
  title: { type: String, required: true, trim: true, maxlength: 80 },
  text: { type: String, default: '', trim: true, maxlength: 240 },
  enabled: { type: Boolean, default: true },
});

const featuredCollectionSchema = new Schema(
  {
    _id: String,
    enabled: { type: Boolean, default: true },
    eyebrow: { type: String, default: '', maxlength: 60 },
    heading: { type: String, default: '', maxlength: 160 },
    description: { type: String, default: '', maxlength: 1000 },
    image: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    imageAlt: { type: String, default: '', maxlength: 200 },
    pillars: {
      type: [featuredCollectionPillarSchema],
      default: [],
      validate: [(value: unknown[]) => value.length <= 8, 'At most 8 pillars'],
    },
    ctaEnabled: { type: Boolean, default: false },
    ctaText: { type: String, default: '', maxlength: 40 },
    ctaLink: { type: String, default: '', maxlength: 500 },
    updatedAt: String,
  },
  baseOptions,
);

const mediaSchema = new Schema(
  {
    _id: String,
    name: { type: String, index: true },
    url: String,
    publicId: String,
    folder: { type: String, index: true },
    mimeType: String,
    size: Number,
    width: Number,
    height: Number,
    alt: String,
    uploadedBy: String,
    createdAt: { type: String, index: true },
  },
  baseOptions,
);

const notificationSchema = new Schema(
  {
    _id: String,
    type: { type: String, index: true },
    title: String,
    message: String,
    link: String,
    read: { type: Boolean, default: false, index: true },
    createdAt: String,
  },
  baseOptions,
);

/* --------------------------------- platform -------------------------------- */

const roleSchema = new Schema(
  {
    _id: String,
    key: String,
    name: { type: String, required: true },
    description: String,
    system: { type: Boolean, default: false },
    userCount: { type: Number, default: 0 },
    permissions: { type: Schema.Types.Mixed, default: {} },
    createdAt: String,
  },
  baseOptions,
);

const adminUserSchema = new Schema(
  {
    _id: String,
    name: { type: String, required: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: String,
    avatar: String,
    roleId: { type: String, index: true },
    roleName: String,
    status: { type: String, enum: ['active', 'invited', 'suspended'], default: 'invited', index: true },
    twoFactorEnabled: { type: Boolean, default: false },
    lastLoginAt: String,
    loginActivity: {
      type: [
        sub({
          id: String,
          device: String,
          browser: String,
          ip: String,
          location: String,
          at: String,
          current: Boolean,
        }),
      ],
      default: [],
    },
    createdAt: String,
    /** Never serialised — the shared toJSON transform strips it. */
    passwordHash: { type: String, select: false },
  },
  baseOptions,
);

const settingsSchema = new Schema(
  {
    _id: String,
    store: Schema.Types.Mixed,
    shipping: Schema.Types.Mixed,
    tax: Schema.Types.Mixed,
    payments: Schema.Types.Mixed,
    email: Schema.Types.Mixed,
    /*
     * Login-method configuration — currently `{ whatsapp: {...} }`. Held here
     * rather than in a collection of its own because it is store settings like
     * any other, and read through `auth/whatsappConfig.ts`, which is the only
     * thing that decrypts the credential inside it. Deliberately excluded from
     * the generic `GET /api/settings` payload: it has its own endpoint that
     * knows how to redact.
     */
    authentication: Schema.Types.Mixed,
  },
  baseOptions,
);

/* ----------------------------------- seo ----------------------------------- */

/**
 * `seo_pages` — metadata for routes the catalogue does not own: the homepage,
 * static pages, blog posts and system routes such as /search or /cart.
 *
 * Products, categories and collections are deliberately NOT stored here; they
 * carry their own embedded `seo` block. One page, one source of metadata, so
 * the resolver can never find two competing titles or canonicals for a route.
 *
 * `path` is the lookup key and is unique — that uniqueness is what enforces
 * "no duplicate title/meta tags" at the database level rather than by
 * convention.
 */
const seoPageSchema = new Schema(
  {
    _id: String,
    pageType: {
      type: String,
      enum: ['home', 'category', 'collection', 'product', 'static', 'blog', 'system'],
      required: true,
      index: true,
    },
    label: { type: String, required: true },
    path: { type: String, required: true, unique: true, index: true },
    refId: { type: String, default: null },
    /** Seeded rows for routes that must always exist; editable, not deletable. */
    system: { type: Boolean, default: false },

    title: String,
    metaDescription: String,
    keywords: { type: [String], default: [] },
    slug: String,
    canonicalUrl: String,

    ogTitle: String,
    ogDescription: String,
    ogImage: String,

    twitterTitle: String,
    twitterDescription: String,
    twitterImage: String,

    robotsIndex: { type: Boolean, default: undefined },
    robotsFollow: { type: Boolean, default: undefined },

    structuredData: String,

    createdAt: String,
    updatedAt: String,
  },
  baseOptions,
);

/** `seo_settings` — one document, holding the site-wide defaults. */
const seoSettingsSchema = new Schema(
  {
    _id: String,
    siteUrl: String,
    siteName: String,
    titleTemplate: String,
    defaultTitle: String,
    defaultMetaDescription: String,
    defaultOgImage: String,

    twitterSite: String,
    twitterCreator: String,
    twitterCardType: { type: String, default: 'summary_large_image' },

    robotsIndex: { type: Boolean, default: true },
    robotsFollow: { type: Boolean, default: true },
    robotsTxtExtra: String,

    organization: Schema.Types.Mixed,
    sitemap: Schema.Types.Mixed,
    verification: Schema.Types.Mixed,
  },
  baseOptions,
);

/* --------------------------------- exports --------------------------------- */

type Doc<T> = Omit<T, 'id'> & { _id: string };

/** Customers who registered on the shop front carry a password; panel-created
    ones do not, which is exactly what stops them signing in. */
export type CustomerDoc = Doc<Customer> & { passwordHash?: string };

export const ProductModel = model<Doc<Product>>('Product', productSchema);
export const CategoryModel = model<Doc<Category>>('Category', categorySchema);
export const CollectionModel = model<Doc<Collection>>('Collection', collectionSchema);
export const CustomerModel: Model<CustomerDoc> = model<CustomerDoc>('Customer', customerSchema);
export const OrderModel = model<Doc<Order>>('Order', orderSchema);
export const CouponModel = model<Doc<Coupon>>('Coupon', couponSchema);
export const ReviewModel = model<Doc<Review>>('Review', reviewSchema);
export const StockMovementModel = model<Doc<StockMovement>>('StockMovement', stockMovementSchema);
export const BannerModel = model<Doc<Banner>>('Banner', bannerSchema);
export const HomeSectionModel = model<Doc<HomeSection>>('HomeSection', homeSectionSchema);
export const AnnouncementModel = model<Doc<Announcement>>('Announcement', announcementSchema);
export type FooterDoc = { _id: string; sections: FooterSection[]; revision: number; updatedAt: string };
export const FooterModel: Model<FooterDoc> = model<FooterDoc>('Footer', footerSchema);
/** The footer collection only ever holds this one document. */
export const FOOTER_ID = 'site_footer';

export type FeaturedCollectionDoc = FeaturedCollectionSection & { _id: string };
/** One document, `_id` = `FEATURED_COLLECTION_ID` in `lib/featuredCollection.ts`. */
export const FeaturedCollectionModel: Model<FeaturedCollectionDoc> = model<FeaturedCollectionDoc>(
  'FeaturedCollection',
  featuredCollectionSchema,
  'featured_collection',
);
export const MediaModel = model<Doc<MediaAsset>>('Media', mediaSchema);
export const NotificationModel = model<Doc<AppNotification>>('Notification', notificationSchema);
export const RoleModel = model<Doc<Role>>('Role', roleSchema);

export type AdminUserDoc = Doc<AdminUser> & { passwordHash?: string };
export const AdminUserModel: Model<AdminUserDoc> = model<AdminUserDoc>('AdminUser', adminUserSchema);

export type SeoPageDoc = Doc<SeoPage>;
export const SeoPageModel: Model<SeoPageDoc> = model<SeoPageDoc>(
  'SeoPage',
  seoPageSchema,
  'seo_pages',
);

export type SeoSettingsDoc = SeoSettings & { _id: string };
export const SeoSettingsModel: Model<SeoSettingsDoc> = model<SeoSettingsDoc>(
  'SeoSettings',
  seoSettingsSchema,
  'seo_settings',
);

/** The seo_settings collection only ever holds this one document. */
export const SEO_SETTINGS_ID = 'seo_settings';

export type SettingsDoc = Settings & { _id: string };
export const SettingsModel: Model<SettingsDoc> = model<SettingsDoc>('Settings', settingsSchema);

/** The settings collection only ever holds this one document. */
export const SETTINGS_ID = 'app_settings';

/**
 * Widened to `Model<any>` on purpose: this list only ever drives collection-wide
 * operations (`deleteMany({})` when reseeding), and the union of fifteen
 * distinct model types has no callable common signature.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const allModels: Model<any>[] = [
  ProductModel,
  CategoryModel,
  CollectionModel,
  CustomerModel,
  OrderModel,
  CouponModel,
  ReviewModel,
  StockMovementModel,
  BannerModel,
  HomeSectionModel,
  AnnouncementModel,
  FooterModel,
  FeaturedCollectionModel,
  MediaModel,
  NotificationModel,
  RoleModel,
  AdminUserModel,
  SettingsModel,
  SeoPageModel,
  SeoSettingsModel,
];
