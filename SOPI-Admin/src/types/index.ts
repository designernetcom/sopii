/* ------------------------------------------------------------------ *
 * SOPII Admin — shared domain types
 * ------------------------------------------------------------------ */

export type ID = string;
export type ISODate = string;

/* ---------------------------------- common --------------------------------- */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  [key: string]: unknown;
}

export type Status = 'active' | 'inactive';

/* --------------------------------- products -------------------------------- */

export type ProductStatus = 'published' | 'draft' | 'archived';

export interface ProductVariant {
  id: ID;
  sku: string;
  color?: string;
  size?: string;
  fabric?: string;
  price: number;
  stock: number;
  image?: string;
}

export interface ProductImage {
  id: ID;
  /** A Cloudinary delivery URL for anything uploaded since the migration. */
  url: string;
  /**
   * The Cloudinary handle that owns `url`, e.g. `sopii/products/prd_0001/ab12`.
   *
   * Present on everything uploaded through the panel; absent on records that
   * predate the migration (a `/media/...` path on disk, or a pasted URL). It is
   * what lets a replaced or deleted image take its stored asset with it, so a
   * gallery edit does not leave a paid-for orphan behind.
   */
  publicId?: string;
  alt?: string;
  isMain?: boolean;
}

export interface ProductDetails {
  fabric?: string;
  pattern?: string;
  occasion?: string;
  fit?: string;
  careInstructions?: string;
  countryOfOrigin?: string;
}

export interface Product {
  id: ID;
  name: string;
  sku: string;
  slug: string;
  categoryId: ID;
  subcategoryId?: ID;
  brand?: string;
  shortDescription?: string;
  description?: string;

  price: number;
  mrp: number;
  costPrice?: number;
  taxRate: number;

  barcode?: string;
  stock: number;
  lowStockThreshold: number;
  reserved: number;
  trackInventory: boolean;
  allowBackorders: boolean;

  variants: ProductVariant[];
  images: ProductImage[];
  details: ProductDetails;
  seo: ProductSeo;

  status: ProductStatus;
  featured: boolean;
  collectionIds: ID[];
  tags: string[];

  rating: number;
  reviewCount: number;
  unitsSold: number;
  revenue: number;

  createdAt: ISODate;
  updatedAt: ISODate;
}

/* -------------------------------- categories ------------------------------- */

export interface Category {
  id: ID;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parentId: ID | null;
  sortOrder: number;
  status: Status;
  productCount: number;
  /** Metadata for this category's page, edited on its SEO tab. */
  seo?: CategorySeo;
  createdAt: ISODate;
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

/* ------------------------------- collections ------------------------------- */

export interface Collection {
  id: ID;
  name: string;
  slug: string;
  description?: string;
  banner?: string;
  productIds: ID[];
  startDate?: ISODate;
  endDate?: ISODate;
  status: Status;
  featured: boolean;
  sortOrder: number;
  /** Metadata for this collection's page, edited on its SEO tab. */
  seo?: CollectionSeo;
  createdAt: ISODate;
}

/* ---------------------------------- orders --------------------------------- */

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned';

export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';
export type PaymentMethod = 'razorpay' | 'upi' | 'card' | 'netbanking' | 'cod';
export type FulfillmentStatus = 'unfulfilled' | 'partial' | 'fulfilled' | 'returned';

export interface Address {
  /** Shop accounts hold several addresses; an order's copy carries neither. */
  id?: ID;
  label?: string;
  isDefault?: boolean;
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface OrderItem {
  id: ID;
  productId: ID;
  name: string;
  sku: string;
  image?: string;
  /** Printed on the packing slip; `size`/`color` keep the parts addressable. */
  variant?: string;
  size?: string;
  color?: string;
  price: number;
  quantity: number;
  total: number;
}

export interface OrderEvent {
  id: ID;
  status: OrderStatus | 'note';
  label: string;
  note?: string;
  at: ISODate;
  by: string;
}

export interface Order {
  id: ID;
  code: string;
  customerId: ID;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  couponCode?: string;
  tax: number;
  shipping: number;
  /** Cash-on-delivery fee, charged by the storefront checkout only. */
  codCharge?: number;
  /** The delivery zone the shipping rate came from, e.g. "Metro Cities". */
  shippingLabel?: string;
  /** That zone's quoted transit time, e.g. "2–3 days". */
  shippingEta?: string;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** The gateway that settled it — `razorpay`. Absent on a COD order. */
  paymentProvider?: string;
  /** The gateway's payment id, e.g. `pay_Nq3…`. */
  paymentReference?: string;
  /** The gateway's order id, e.g. `order_Nq3…`. */
  paymentOrderId?: string;
  paidAt?: ISODate;
  paymentMethod: PaymentMethod;
  fulfillment: FulfillmentStatus;
  shippingAddress: Address;
  billingAddress: Address;
  trackingNumber?: string;
  courier?: string;
  notes?: string;
  timeline: OrderEvent[];
  emailNotifications?: OrderEmailNotification[];
  placedAt: ISODate;
  updatedAt: ISODate;
}

/** The lifecycle emails the server can send about an order. */
export type OrderEmailKind =
  | 'order_confirmation'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled';

/**
 * What was emailed about an order and what became of it.
 *
 * `skipped` is not a failure: it means no mailer is configured, which is an
 * operator's problem to fix rather than something that went wrong with this
 * order. The panel distinguishes the two.
 */
export interface OrderEmailNotification {
  kind: OrderEmailKind;
  status: 'sent' | 'failed' | 'skipped';
  recipient: string;
  messageId?: string;
  error?: string;
  attempts: number;
  /** Last *successful* send — a later failure does not clear it. */
  sentAt?: ISODate;
  lastAttemptAt?: ISODate;
}

/* -------------------------------- customers -------------------------------- */

export type CustomerStatus = 'active' | 'blocked';
export type CustomerTier = 'new' | 'regular' | 'silver' | 'gold' | 'platinum';

export interface CustomerActivity {
  id: ID;
  type: 'order' | 'login' | 'review' | 'wishlist' | 'account';
  message: string;
  at: ISODate;
}

export interface Customer {
  id: ID;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  status: CustomerStatus;
  tier: CustomerTier;
  addresses: Address[];
  wishlist: ID[];
  ordersCount: number;
  totalSpent: number;
  lastOrderAt?: ISODate;
  activity: CustomerActivity[];
  acceptsMarketing: boolean;
  notes?: string;
  createdAt: ISODate;
}

/* ---------------------------------- coupons -------------------------------- */

export type DiscountType = 'percentage' | 'fixed' | 'free_shipping';
export type CouponStatus = 'active' | 'scheduled' | 'expired' | 'disabled';

export interface Coupon {
  id: ID;
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  usageLimit: number;
  perCustomerLimit: number;
  usedCount: number;
  startDate: ISODate;
  endDate: ISODate;
  productIds: ID[];
  categoryIds: ID[];
  status: CouponStatus;
  createdAt: ISODate;
}

/* ---------------------------------- reviews -------------------------------- */

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Review {
  id: ID;
  productId: ID;
  productName: string;
  productImage?: string;
  customerId: ID;
  customerName: string;
  customerAvatar?: string;
  rating: number;
  title?: string;
  body: string;
  images: string[];
  status: ReviewStatus;
  verifiedPurchase: boolean;
  reply?: { body: string; at: ISODate; by: string };
  helpfulCount: number;
  createdAt: ISODate;
}

/* -------------------------------- inventory -------------------------------- */

export type StockMovementType =
  | 'purchase'
  | 'sale'
  | 'return'
  | 'adjustment'
  | 'damaged'
  | 'cancelled';

export interface StockMovement {
  id: ID;
  productId: ID;
  productName: string;
  sku: string;
  type: StockMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  reference?: string;
  admin: string;
  at: ISODate;
}

export interface InventoryRow {
  productId: ID;
  name: string;
  sku: string;
  image?: string;
  category: string;
  stock: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  costPrice: number;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
}

/* ---------------------------------- homepage ------------------------------- */

export interface Banner {
  id: ID;
  title: string;
  heading: string;
  subheading?: string;
  desktopImage: string;
  /** Cloudinary handle for `desktopImage`; see `ProductImage.publicId`. */
  desktopImagePublicId?: string;
  mobileImage?: string;
  mobileImagePublicId?: string;
  buttonText?: string;
  buttonLink?: string;
  startDate?: ISODate;
  endDate?: ISODate;
  sortOrder: number;
  status: Status;
}

export type HomeSectionKey =
  | 'hero'
  | 'categories'
  | 'new_arrivals'
  | 'bestsellers'
  | 'collections'
  | 'featured'
  | 'reviews'
  | 'instagram'
  | 'newsletter';

export interface HomeSection {
  id: ID;
  key: HomeSectionKey;
  title: string;
  subtitle?: string;
  enabled: boolean;
  sortOrder: number;
  itemLimit?: number;
}

/** One numbered point under the Featured Collection copy. Its number is its position. */
export interface FeaturedCollectionPillar {
  id: ID;
  title: string;
  text: string;
  enabled: boolean;
}

/**
 * The home page's split image/copy section ("SOPII Signature").
 *
 * A single document: the store has one of these. Where it sits on the page is
 * still the `collections` home section's business — this is only what it says.
 *
 * `heading` keeps its line breaks; each line renders as its own line on the
 * storefront. `pillars` are stored in display order. The CTA fields are flat,
 * like a banner's `buttonText`/`buttonLink`.
 */
export interface FeaturedCollectionSection {
  enabled: boolean;
  eyebrow: string;
  heading: string;
  description: string;
  image: string;
  /** Cloudinary handle for `image`; see `ProductImage.publicId`. */
  imagePublicId: string;
  imageAlt: string;
  pillars: FeaturedCollectionPillar[];
  ctaEnabled: boolean;
  ctaText: string;
  ctaLink: string;
  updatedAt?: ISODate;
}

/**
 * One message in the storefront's scrolling strip above the header.
 *
 * `priority` is the display order — lower runs first. `startDate`/`endDate`
 * are an optional window; `null` means "no limit on that side", so a cleared
 * date survives the API's strip-undefined patch handling.
 */
export interface Announcement {
  id: ID;
  message: string;
  isActive: boolean;
  priority: number;
  startDate: ISODate | null;
  endDate: ISODate | null;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

/* ---------------------------------- footer --------------------------------- */

/**
 * The kinds of block the storefront footer is built from.
 *
 * Where each one renders is fixed by its type, not stored: `brand`, `links`,
 * `text` and `social` are the columns across the top; `utility`, `copyright`
 * and `payments` share the tinted bar under them; `legal` and `credit` are
 * the full-width lines at the very bottom. Order within each area follows the
 * section list.
 */
export type FooterSectionType =
  | 'brand'
  | 'links'
  | 'text'
  | 'social'
  | 'utility'
  | 'copyright'
  | 'payments'
  | 'legal'
  | 'credit';

/**
 * One entry inside a footer section — a link, a social channel or a payment
 * badge. Which fields matter depends on the section: a payment badge is just
 * a `label`, a social channel also carries an `icon` and a `color`.
 */
export interface FooterItem {
  id: ID;
  label: string;
  /** A site path (`/pages/faq`), an absolute http(s) URL, `mailto:` or `tel:`. */
  url: string;
  /** A name from the footer icon list; empty for none. */
  icon: string;
  /** `#rrggbb`, social channels only — the rail's hover colour. */
  color: string;
  enabled: boolean;
  openInNewTab: boolean;
}

/** Which of the store's contact details the brand column shows. */
export interface FooterBrandDisplay {
  logo: boolean;
  address: boolean;
  email: boolean;
  phone: boolean;
}

export interface FooterSection {
  id: ID;
  type: FooterSectionType;
  /** Column heading, or the admin's own label for blocks that show none. */
  title: string;
  enabled: boolean;
  /** Body copy: the brand blurb, a text column, the copyright line, the credit's lead-in. */
  content: string;
  items: FooterItem[];
  /** Brand sections only. */
  display?: FooterBrandDisplay;
}

/**
 * The whole footer, in display order.
 *
 * `updatedAt` is `null` until the first save: until then the API serves the
 * built-in default footer, so a store that has never opened this screen still
 * shows its policies and contact details.
 */
export interface FooterConfig {
  sections: FooterSection[];
  updatedAt: ISODate | null;
}

/* ----------------------------------- media --------------------------------- */

export type MediaFolder = 'products' | 'banners' | 'categories' | 'collections' | 'blog' | 'other';

export interface MediaAsset {
  id: ID;
  name: string;
  url: string;
  /** Cloudinary handle for `url`; see `ProductImage.publicId`. */
  publicId?: string;
  folder: MediaFolder;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  alt?: string;
  uploadedBy: string;
  createdAt: ISODate;
}

/* ------------------------------- notifications ----------------------------- */

export type NotificationType =
  | 'new_order'
  | 'low_stock'
  | 'new_customer'
  | 'new_review'
  | 'payment_received'
  | 'order_cancelled'
  | 'return_requested';

export interface AppNotification {
  id: ID;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: ISODate;
}

/* --------------------------------- admin/rbac ------------------------------ */

export type ResourceKey =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'collections'
  | 'inventory'
  | 'orders'
  | 'customers'
  | 'coupons'
  | 'reviews'
  | 'homepage'
  | 'media'
  | 'reports'
  | 'notifications'
  | 'seo'
  | 'admin_users'
  | 'roles'
  | 'settings';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export type PermissionMatrix = Record<ResourceKey, Record<PermissionAction, boolean>>;

export type RoleKey = 'super_admin' | 'admin' | 'manager' | 'content_manager' | 'support';

export interface Role {
  id: ID;
  key: RoleKey | string;
  name: string;
  description: string;
  system: boolean;
  userCount: number;
  permissions: PermissionMatrix;
  createdAt: ISODate;
}

export interface LoginActivity {
  id: ID;
  device: string;
  browser: string;
  ip: string;
  location: string;
  at: ISODate;
  current: boolean;
}

export interface AdminUser {
  id: ID;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  roleId: ID;
  roleName: string;
  status: 'active' | 'invited' | 'suspended';
  twoFactorEnabled: boolean;
  lastLoginAt?: ISODate;
  loginActivity: LoginActivity[];
  createdAt: ISODate;
}

export interface AuthUser extends AdminUser {
  permissions: PermissionMatrix;
  roleKey: string;
}

/* --------------------------------- settings -------------------------------- */

export interface StoreSettings {
  storeName: string;
  legalName: string;
  logo: string;
  supportEmail: string;
  phone: string;
  address: Address;
  currency: string;
  currencySymbol: string;
  timezone: string;
  weightUnit: string;
}

export interface ShippingZone {
  id: ID;
  name: string;
  states: string[];
  charge: number;
  etaDays: string;
  enabled: boolean;
}

export interface ShippingSettings {
  flatRate: number;
  freeShippingThreshold: number;
  codCharge: number;
  processingTime: string;
  zones: ShippingZone[];
}

export interface TaxRule {
  id: ID;
  name: string;
  rate: number;
  appliesTo: string;
  enabled: boolean;
}

export interface TaxSettings {
  gstin: string;
  pricesIncludeTax: boolean;
  defaultRate: number;
  rules: TaxRule[];
}

export interface PaymentGateway {
  id: ID;
  key: 'razorpay' | 'stripe' | 'cod' | 'upi';
  name: string;
  description: string;
  enabled: boolean;
  testMode: boolean;
  /**
   * Public by design — Razorpay's checkout script needs it in the browser, and
   * for the UPI row it is the merchant VPA. Never treated as a secret.
   */
  keyId?: string;
  /**
   * Write-only. The API never returns this: it is AES-GCM encrypted at rest and
   * comes back as `keySecretMasked`. Send a value to replace the stored one,
   * omit it (or send the mask) to keep what is already there.
   */
  keySecret?: string;
  /** `rzp_••••••••3f2a`, for confirming which key is installed. Read-only. */
  keySecretMasked?: string;
  /** Whether a secret is stored at all, so the form can say "replace" or "add". */
  hasKeySecret?: boolean;
  /** COD only: the order-value window this method may cover. 0 = no limit. */
  minOrderValue?: number;
  maxOrderValue?: number;
}

export interface EmailTemplate {
  id: ID;
  key: string;
  name: string;
  subject: string;
  body: string;
  enabled: boolean;
}

export interface EmailSettings {
  senderName: string;
  senderEmail: string;
  replyTo: string;
  templates: EmailTemplate[];
}

export interface Settings {
  store: StoreSettings;
  shipping: ShippingSettings;
  tax: TaxSettings;
  payments: PaymentGateway[];
  email: EmailSettings;
}

/* ------------------------------ authentication ----------------------------- */

/** Only official WhatsApp Business API providers. */
export type WhatsAppProvider = 'meta' | 'twilio' | 'webhook';

/**
 * The WhatsApp OTP configuration, as the panel sees it.
 *
 * Note what is missing: `accessToken`. The API never returns it — not
 * encrypted, not partially, not once. `accessTokenMasked` is four characters
 * either side of some dots, which is enough to confirm *which* token is
 * installed and useless to anyone who intercepts the response. Writing a new
 * token is a one-way trip: `WhatsAppSettingsInput` carries one up, and nothing
 * carries it back down.
 */
export interface WhatsAppSettings {
  enabled: boolean;
  provider: WhatsAppProvider;
  apiUrl: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessTokenMasked: string;
  hasAccessToken: boolean;
  /** True when the token comes from server/.env rather than this form. */
  accessTokenFromEnv: boolean;
  templateName: string;
  templateLanguage: string;
  /** Twilio only: the WhatsApp-enabled sender. */
  fromNumber: string;
  /** Twilio only: the account SID. */
  accountSid: string;
  otpExpiryMinutes: number;
  maxAttempts: number;
  resendLimit: number;
  /** Switched on *and* completely configured — the shop offers it only then. */
  ready: boolean;
  /** Which required fields are still empty, for the panel to point at. */
  missing: string[];
  updatedAt: ISODate | null;
}

/**
 * What the form submits. `accessToken` is omitted to keep the stored one, so
 * saving a change to the expiry does not require re-typing the credential.
 */
export type WhatsAppSettingsInput = Omit<
  WhatsAppSettings,
  'accessTokenMasked' | 'hasAccessToken' | 'accessTokenFromEnv' | 'ready' | 'missing' | 'updatedAt'
> & { accessToken?: string };

export interface WhatsAppTestResult {
  ok: boolean;
  transport: string;
  to: string;
  message: string;
  detail: string | null;
}

/* -------------------------------- dashboard -------------------------------- */

export type RangeKey = 'today' | '7d' | '30d' | '3m' | '6m' | '1y';

export interface KpiStat {
  key: string;
  label: string;
  value: number;
  format: 'currency' | 'number';
  change: number;
  previousValue: number;
  trend: number[];
  tone: 'brand' | 'emerald' | 'sky' | 'amber' | 'rose' | 'violet';
}

export interface SalesPoint {
  label: string;
  revenue: number;
  orders: number;
  aov: number;
}

export interface CategorySlice {
  name: string;
  revenue: number;
  orders: number;
  percentage: number;
}

export interface TopProductRow {
  id: ID;
  name: string;
  image?: string;
  category: string;
  sold: number;
  revenue: number;
  stock: number;
}

export interface DashboardSummary {
  kpis: KpiStat[];
  sales: SalesPoint[];
  totals: { revenue: number; orders: number; aov: number };
  categories: CategorySlice[];
  topProducts: TopProductRow[];
  recentOrders: Order[];
  statusBreakdown: { status: OrderStatus; count: number }[];
}

/* --------------------------------- reports --------------------------------- */

export interface SalesReportRow {
  period: string;
  orders: number;
  units: number;
  revenue: number;
  discount: number;
  tax: number;
  net: number;
}

export interface CustomerReportRow {
  id: ID;
  name: string;
  email: string;
  orders: number;
  totalSpent: number;
  aov: number;
  lastOrderAt?: ISODate;
  type: 'new' | 'returning';
}

export interface OrderReportRow {
  status: OrderStatus;
  count: number;
  revenue: number;
  share: number;
}

/* ------------------------------------------------------------------ *
 * SEO
 * ------------------------------------------------------------------ *
 * Three stores, and each page's metadata comes from exactly one of the
 * first two — never both — so a route can never end up with two titles
 * or two canonicals:
 *
 *   seo_settings  singleton: site identity, defaults, organisation,
 *                 robots.txt and sitemap policy.
 *   seo_pages     standalone routes the catalogue does not own — the
 *                 homepage, static pages, blog posts, system pages.
 *   embedded seo  products, categories and collections carry their own
 *                 `seo` block, edited on the record's SEO tab.
 *
 * `SeoResolved` is what the storefront actually renders: settings merged
 * with whichever override applies, flattened to one tag per field.
 */

/** Every page type the panel can manage metadata for. */
export type SeoPageType =
  | 'home'
  | 'category'
  | 'collection'
  | 'product'
  | 'static'
  | 'blog'
  | 'system';

/** The editable field set — identical everywhere SEO is edited. */
export interface SeoMeta {
  title?: string;
  metaDescription?: string;
  keywords?: string[];
  /** Record-level slug. Blank means "keep the record's own slug". */
  slug?: string;
  /** Absolute URL. Blank means "derive from siteUrl + path". */
  canonicalUrl?: string;

  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;

  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;

  robotsIndex?: boolean;
  robotsFollow?: boolean;

  /** Raw JSON-LD, merged alongside the generated graph. */
  structuredData?: string;
}

/** Products, categories and collections embed this on the record itself. */
export type ProductSeo = SeoMeta;
export type CategorySeo = SeoMeta;
export type CollectionSeo = SeoMeta;

/** A row in `seo_pages` — a route the catalogue does not own. */
export interface SeoPage extends SeoMeta {
  id: ID;
  pageType: SeoPageType;
  /** Human label for the panel's list. */
  label: string;
  /** The route this describes, leading slash, no origin: `/pages/faq`. */
  path: string;
  /** Set for catalogue-backed rows the panel surfaces read-only. */
  refId?: ID | null;
  /** Locked rows (`/`, `/shop`) cannot be deleted, only edited. */
  system?: boolean;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface SeoOrganization {
  name: string;
  legalName?: string;
  logo?: string;
  description?: string;
  email?: string;
  phone?: string;
  streetAddress?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  /** Social and profile URLs — becomes schema.org `sameAs`. */
  sameAs: string[];
}

export interface SeoSitemapSettings {
  enabled: boolean;
  includeProducts: boolean;
  includeCategories: boolean;
  includeCollections: boolean;
  includeStaticPages: boolean;
  /** Routes excluded from the sitemap, one path per entry. */
  excludePaths: string[];
}

export interface SeoVerification {
  google?: string;
  bing?: string;
  pinterest?: string;
  facebook?: string;
}

export interface SeoSettings {
  /** Origin the canonicals and sitemap are built from, no trailing slash. */
  siteUrl: string;
  siteName: string;
  /** `%s` is replaced by the page title. Blank means "title as-is". */
  titleTemplate: string;
  defaultTitle: string;
  defaultMetaDescription: string;
  defaultOgImage: string;

  twitterSite?: string;
  twitterCreator?: string;
  twitterCardType: 'summary' | 'summary_large_image';

  /** Site-wide default, overridable per page. */
  robotsIndex: boolean;
  robotsFollow: boolean;
  /** Appended verbatim to the generated robots.txt. */
  robotsTxtExtra?: string;

  organization: SeoOrganization;
  sitemap: SeoSitemapSettings;
  verification: SeoVerification;
}

/**
 * One page's metadata after resolution — exactly one value per tag.
 * This is the only shape the storefront renders from.
 */
export interface SeoResolved {
  title: string;
  metaDescription: string;
  keywords: string[];
  canonicalUrl: string;
  robots: string;
  og: {
    title: string;
    description: string;
    image: string;
    url: string;
    type: string;
    siteName: string;
  };
  twitter: {
    card: string;
    title: string;
    description: string;
    image: string;
    site?: string;
    creator?: string;
  };
}
