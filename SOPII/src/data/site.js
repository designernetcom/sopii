/**
 * Site-wide copy and configuration.
 * Edit this file to change the trust badges and occasion grid without touching
 * a single component. The announcement bar and the footer are not edited here:
 * they are managed in the admin panel (Homepage → Announcements, and
 * Storefront → Footer); `FOOTER` below is only the offline fallback.
 */

export const BRAND = {
  name: 'SOPII',
  tagline: 'Contemporary Indian Fashion',
  handle: '@sopii.fashion',
  email: 'care@sopiistore.com',
  phone: '+91 8105292614',
  /*
   * The number the WhatsApp rail opens a chat with — deliberately separate
   * from `phone` above. A store's published contact number is often a landline
   * (the panel currently publishes +91 22 4890 1200), and wa.me will happily
   * build a link to one that opens to an error page. Only a number that can
   * actually receive WhatsApp belongs here.
   */
  whatsapp: '+91 8105292614',
  address: 'Studio 4, Kala Ghoda, Mumbai 400001',
};

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
      'https://res.cloudinary.com/w2brnx9l/image/upload/f_auto,q_auto,c_fill,g_auto,w_600,h_750,dpr_auto/v1788952767/sopii/products/unassigned/y3mocozgvsytgifdpwne.jpg',
  },
  {
    name: 'Office Wear',
    slug: 'office-wear',
    tags: 'workwear',
    seed: 402,
    image:
      'https://res.cloudinary.com/w2brnx9l/image/upload/v1788955282/images_1.jpg',
  },
  {
    name: 'Festive',
    slug: 'festive',
    tags: 'silk',
    seed: 403,
    image:
      'https://res.cloudinary.com/w2brnx9l/image/upload/v1788955429/A1iINuxGMAL._AC_UY1100_.jpg',
  },
  {
    name: 'Wedding',
    slug: 'wedding',
    tags: 'wedding',
    seed: 404,
    image:
      'https://sopiistore.com/cdn/shop/files/Dress_9b943c2b-cc46-436c-abd2-7f9fa1081829.jpg?format=webp&v=1752903598&width=1000',
  },
  {
    name: 'Party',
    slug: 'party',
    tags: 'evening',
    seed: 405,
    image:
      'https://res.cloudinary.com/w2brnx9l/image/upload/v1788955801/xl-mens-formal-casual-daily-wear-plain-shirt-with-colors-original-imagxxfnhxsc2bsz.webp',
  },
  {
    name: 'Vacation',
    slug: 'vacation',
    tags: 'summer',
    seed: 406,
    image:
      'https://res.cloudinary.com/w2brnx9l/image/upload/v1788955925/i-need-a-vacation.jpg',
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

/**
 * The footer — a fallback only.
 *
 * The live footer (columns, links, social channels, payment badges, policies,
 * copyright and credit) is managed in the admin panel under Storefront →
 * Footer and arrives in the `/bootstrap` feed. This copy, in the feed's own
 * shape, is used only when there is no feed to read: the demo catalogue with
 * the API unreachable, or an API older than the footer screen. It matches the
 * panel's built-in default, which is what a store that has never edited its
 * footer is served.
 *
 * `socialLinks` also drives the desktop social rail. A channel's `color` is
 * its own brand hue, used by the rail for the hover state and label pill only;
 * the footer ignores it and stays oxblood, because a column of four brand
 * colours reads as a ransom note.
 */
const footerLink = (id, label, url, extra = {}) => ({
  id,
  label,
  url,
  icon: '',
  color: '',
  openInNewTab: false,
  ...extra,
});

const FOOTER_SOCIAL = [
  footerLink(
    'fitm_social_instagram',
    'Instagram',
    'https://www.instagram.com/sopiiofficial?stkn=MXQ1cXdodTc5d3M4&utm_source=qr',
    { icon: 'Instagram', color: '#E1306C', openInNewTab: true },
  ),
  footerLink('fitm_social_youtube', 'YouTube', 'https://youtube.com', {
    icon: 'Youtube',
    color: '#FF0000',
    openInNewTab: true,
  }),
];

export const FOOTER = {
  sections: [
    {
      id: 'fsec_brand',
      type: 'brand',
      title: 'Brand & contact',
      content:
        'Contemporary Indian Fashion. Handwoven textiles and considered silhouettes, made with craftspeople across India.',
      items: [],
      display: { logo: true, address: true, email: true, phone: true },
    },
    {
      id: 'fsec_shop',
      type: 'links',
      title: 'Shop',
      content: '',
      items: [
        footerLink('fitm_shop_new', 'New Arrivals', '/new-arrivals'),
        footerLink('fitm_shop_sarees', 'Sarees', '/sarees'),
        footerLink('fitm_shop_best', 'Bestsellers', '/bestsellers'),
        footerLink('fitm_shop_sale', 'Sale', '/sale'),
      ],
    },
    {
      id: 'fsec_care',
      type: 'links',
      title: 'Customer Care',
      content: '',
      items: [
        footerLink('fitm_care_contact', 'Contact Us', '/pages/contact'),
        footerLink('fitm_care_shipping', 'Shipping', '/pages/shipping'),
        footerLink('fitm_care_returns', 'Returns', '/pages/returns'),
        footerLink('fitm_care_faq', 'FAQ', '/pages/faq'),
        footerLink('fitm_care_track', 'Track Order', '/orders'),
      ],
    },
    {
      id: 'fsec_about',
      type: 'links',
      title: 'About SOPII',
      content: '',
      items: [footerLink('fitm_about_story', 'Our Story', '/pages/our-story')],
    },
    {
      id: 'fsec_utility',
      type: 'utility',
      title: 'Quick links',
      content: '',
      items: [
        footerLink('fitm_util_track', 'Track Order', '/orders', { icon: 'Package' }),
        footerLink('fitm_util_help', 'Help Centre', '/pages/faq', { icon: 'LifeBuoy' }),
      ],
    },
    {
      id: 'fsec_copyright',
      type: 'copyright',
      title: 'Copyright',
      content: '© {year} {store}. All Rights Reserved.',
      items: [],
    },
    {
      /* Text, not card artwork: six logos is six image requests on every page
         for a row nobody scrolls to, and the words carry the reassurance. */
      id: 'fsec_payments',
      type: 'payments',
      title: 'We Accept',
      content: '',
      items: ['UPI', 'Visa', 'Mastercard', 'RuPay', 'Net Banking', 'COD'].map((label) =>
        footerLink(`fitm_pay_${label.toLowerCase().replace(/\s+/g, '_')}`, label, ''),
      ),
    },
    {
      id: 'fsec_legal',
      type: 'legal',
      title: 'Policies',
      content: '',
      items: [
        footerLink('fitm_legal_privacy', 'Privacy Policy', '/pages/privacy-policy'),
        footerLink('fitm_legal_terms', 'Terms & Conditions', '/pages/terms'),
        footerLink('fitm_legal_shipping', 'Shipping Policy', '/pages/shipping'),
        footerLink('fitm_legal_returns', 'Return Policy', '/pages/returns'),
        footerLink('fitm_legal_refund', 'Refund Policy', '/pages/refund'),
      ],
    },
    {
      id: 'fsec_credit',
      type: 'credit',
      title: 'Credit',
      content: 'Designed and Developed by',
      items: [
        footerLink('fitm_credit_netcom', 'Netcom Business Solutions Pvt Ltd', 'https://netcom-india.com/', {
          openInNewTab: true,
        }),
      ],
    },
  ],
  socialLinks: FOOTER_SOCIAL,
};

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
