/**
 * Site-wide copy and configuration.
 * Edit this file to change the announcement bar, trust badges, social grid
 * and footer without touching a single component.
 */

export const BRAND = {
  name: 'SOPII',
  tagline: 'Contemporary Indian Fashion',
  handle: '@sopii.fashion',
  email: 'care@sopii.com',
  phone: '+91 98200 00000',
  address: 'Studio 4, Kala Ghoda, Mumbai 400001',
};

/** Rotating strip above the header. Add or remove items freely. */
export const ANNOUNCEMENTS = [
  'FREE SHIPPING ABOVE ₹1999',
  'EASY 15-DAY RETURNS',
  'COD AVAILABLE ACROSS INDIA',
  'HANDCRAFTED IN INDIA',
];

export const FREE_SHIPPING_THRESHOLD = 1999;
export const SHIPPING_FEE = 99;

/**
 * Home page layout — the fallback for what the admin panel's Homepage screen
 * publishes. Keys match the panel's section keys; `limit` is how many products
 * a rail shows. Used only when the API is unreachable or every section there
 * has been switched off.
 */
export const HOME_SECTIONS = [
  { key: 'hero', title: 'Hero Banner', subtitle: '', limit: 0, sortOrder: 0 },
  { key: 'categories', title: 'Shop by Category', subtitle: '', limit: 6, sortOrder: 1 },
  {
    key: 'new_arrivals',
    title: 'Fresh pieces. Just for you.',
    subtitle: 'The newest additions to the studio, in limited runs.',
    limit: 12,
    sortOrder: 2,
  },
  {
    key: 'bestsellers',
    title: 'The pieces everyone is loving.',
    subtitle: 'Reordered more than anything else in the collection.',
    limit: 12,
    sortOrder: 3,
  },
  { key: 'collections', title: 'Curated Collections', subtitle: '', limit: 3, sortOrder: 4 },
  { key: 'reviews', title: 'Customer Reviews', subtitle: '', limit: 6, sortOrder: 5 },
  { key: 'instagram', title: 'Instagram Feed', subtitle: '', limit: 8, sortOrder: 6 },
];

/**
 * Checkout payment options, for when the API cannot say which gateways the
 * store has switched on. Keys match the panel's payment gateway keys.
 */
export const PAYMENT_METHODS = [
  { key: 'upi', name: 'UPI', description: 'GPay, PhonePe, Paytm & more' },
  { key: 'card', name: 'Credit / Debit Card', description: 'Visa, Mastercard, RuPay, Amex' },
  { key: 'netbanking', name: 'Net Banking', description: 'All major Indian banks' },
  { key: 'cod', name: 'Cash on Delivery', description: 'Pay when your order arrives' },
];

export const TRUST_ITEMS = [
  {
    icon: 'Truck',
    title: 'Free Shipping',
    text: 'On all orders above ₹9999',
  },
  {
    icon: 'RefreshCw',
    title: 'No Returns',
    text: 'No Returns, No Worries',
  },
  {
    icon: 'ShieldCheck',
    title: 'Secure Payment',
    text: '100% secure checkout',
  },
  {
    icon: 'Sparkles',
    title: 'Quality Assured',
    text: 'Handpicked premium fabrics',
  },
];

export const OCCASIONS = [
  {
    name: 'Everyday',
    slug: 'everyday',
    tags: 'cotton,textile',
    seed: 401,
    image:
      'https://suta.in/cdn/shop/files/saree_9656048d-67a5-4c6b-93b9-5fe16f6ef69d.jpg?format=webp&v=1752903494&width=1000',
  },
  {
    name: 'Office Wear',
    slug: 'office-wear',
    tags: 'workwear',
    seed: 402,
    image:
      'https://suta.in/cdn/shop/files/Women_Kurta_48b4326a-29bd-46bb-b479-1782742c8203.jpg?format=webp&v=1752903557&width=1000',
  },
  {
    name: 'Festive',
    slug: 'festive',
    tags: 'silk',
    seed: 403,
    image:
      'https://suta.in/cdn/shop/files/Blouse_246f00ce-a14f-48bc-ab1f-97bd4f2bd429.jpg?format=webp&v=1752903535&width=1000',
  },
  {
    name: 'Wedding',
    slug: 'wedding',
    tags: 'wedding',
    seed: 404,
    image:
      'https://suta.in/cdn/shop/files/Dress_9b943c2b-cc46-436c-abd2-7f9fa1081829.jpg?format=webp&v=1752903598&width=1000',
  },
  {
    name: 'Party',
    slug: 'party',
    tags: 'evening',
    seed: 405,
    image:
      'https://suta.in/cdn/shop/files/men_shirt_a94b3669-cf37-4e2c-b6fc-f20ee013e9f7.jpg?format=webp&v=1752903744&width=1000',
  },
  {
    name: 'Vacation',
    slug: 'vacation',
    tags: 'summer',
    seed: 406,
    image:
      'https://suta.in/cdn/shop/files/lehengas_5cac219a-48dd-4287-a6f1-3e6168e6cb41.jpg?format=webp&v=1752903631&width=1000',
  },
];

export const INSTAGRAM_POSTS = [
  { id: 'ig1', seed: 501, tags: 'saree', caption: 'The Aarohi, styled three ways' },
  { id: 'ig2', seed: 502, tags: 'fashion', caption: 'Morning light, mulmul cotton' },
  { id: 'ig3', seed: 503, tags: 'jewellery', caption: 'Oxidised silver, always' },
  { id: 'ig4', seed: 504, tags: 'dress', caption: 'Off-duty in the Amara midi' },
  { id: 'ig5', seed: 505, tags: 'textile', caption: 'On the loom in Bhuj' },
  { id: 'ig6', seed: 506, tags: 'silk', caption: 'Festive season, unlocked' },
];

export const SOCIAL_LINKS = [
  { name: 'Instagram', icon: 'Instagram', href: 'https://instagram.com' },
  { name: 'Facebook', icon: 'Facebook', href: 'https://facebook.com' },
  { name: 'Pinterest', icon: 'Sparkle', href: 'https://pinterest.com' },
  { name: 'YouTube', icon: 'Youtube', href: 'https://youtube.com' },
];

export const FOOTER_COLUMNS = [
  {
    title: 'Shop',
    links: [
      { label: 'New Arrivals', to: '/new-arrivals' },
      { label: 'Sarees', to: '/sarees' },
      { label: 'Blouses', to: '/blouses' },
      { label: 'Dresses', to: '/shop?category=Dresses' },
      { label: 'Bestsellers', to: '/bestsellers' },
      { label: 'Sale', to: '/sale' },
    ],
  },
  {
    title: 'Customer Care',
    links: [
      { label: 'Contact Us', to: '/pages/contact' },
      { label: 'Shipping', to: '/pages/shipping' },
      { label: 'Returns', to: '/pages/returns' },
      { label: 'FAQ', to: '/pages/faq' },
      { label: 'Track Order', to: '/orders' },
      { label: 'Size Guide', to: '/pages/size-guide' },
    ],
  },
  {
    title: 'About SOPII',
    links: [
      { label: 'Our Story', to: '/pages/our-story' },
      { label: 'Our Craft', to: '/pages/our-craft' },
      { label: 'Sustainability', to: '/pages/sustainability' },
      { label: 'Careers', to: '/pages/careers' },
    ],
  },
];

/**
 * Quick links in the footer's bottom bar — the utility row that sits under the
 * link columns. `icon` is a lucide-react export name; the footer maps it, so an
 * unknown name degrades to a default rather than throwing.
 */
export const FOOTER_UTILITY_LINKS = [
  { label: 'Track Order', to: '/orders', icon: 'Package' },
  { label: 'Help Centre', to: '/pages/faq', icon: 'LifeBuoy' },
  { label: 'Our Craft', to: '/pages/our-craft', icon: 'Scissors' },
  { label: 'Careers', to: '/pages/careers', icon: 'Briefcase' },
];

/**
 * The "we accept" chips in the footer.
 *
 * Deliberately text, not card artwork: six card logos is six more image
 * requests on every page for a row nobody scrolls to, and the marks are
 * trademarked besides. What a customer needs from this row is the reassurance
 * that their method is taken, which the words carry on their own.
 *
 * This is a display list. What checkout actually offers comes from the panel
 * (see `PAYMENT_METHODS` above for the fallback) — keep the two in step.
 */
export const PAYMENT_BADGES = ['UPI', 'Visa', 'Mastercard', 'RuPay', 'Net Banking', 'COD'];

export const LEGAL_LINKS = [
  { label: 'Privacy Policy', to: '/pages/privacy-policy' },
  { label: 'Terms & Conditions', to: '/pages/terms' },
  { label: 'Shipping Policy', to: '/pages/shipping' },
  { label: 'Return Policy', to: '/pages/returns' },
];

/**
 * Fallback coupons — used only when the API cannot be reached. Live codes come
 * from the panel and are validated by it, limits and all.
 */
export const COUPONS = [
  { code: 'SOPII10', type: 'percent', value: 10, minimum: 2000, label: '10% off orders above ₹2,000' },
  { code: 'WELCOME500', type: 'flat', value: 500, minimum: 3000, label: '₹500 off orders above ₹3,000' },
  { code: 'FESTIVE15', type: 'percent', value: 15, minimum: 5000, label: '15% off orders above ₹5,000' },
];

export const POPULAR_SEARCHES = [
  'Sarees',
  'Cotton Sarees',
  'Wedding Wear',
  'New Arrivals',
  'Kurta Sets',
  'Oxidised Jewellery',
];
