import type { FooterItem, FooterSection, FooterSectionType } from '@/types';

/*
 * The storefront footer: its built-in content and the rules for editing it.
 * ===========================================================================
 * Imported by both the panel and the API (`server/src/lib/footer.ts`), so the
 * limits a form checks before a round trip are the limits the server enforces,
 * rather than a copy that drifts.
 *
 * `DEFAULT_FOOTER_SECTIONS` is the footer the shop front shipped hard-coded
 * before it became editable — same columns, same links, same small print. The
 * API serves it until an admin first saves the footer, so a store upgraded in
 * place keeps its policy links instead of losing them to an empty collection.
 * Links that were commented out in the old source are here too, switched off,
 * so turning one back on is a toggle rather than retyping it.
 */

/* ---------------------------------- rules ---------------------------------- */

export const FOOTER_LIMITS = {
  sections: 30,
  title: 60,
  label: 60,
  url: 500,
  /** Per section type; anything not listed takes no body copy. */
  content: { brand: 400, text: 1000, copyright: 200, credit: 120 } as Partial<
    Record<FooterSectionType, number>
  >,
} as const;

/** How the items of a section are shaped, and how many it may hold. */
export type FooterItemKind = 'none' | 'link' | 'social' | 'badge';

export interface FooterTypeRule {
  label: string;
  description: string;
  /** Where on the storefront it renders. */
  area: 'columns' | 'bottom';
  /** A footer holds at most one section of this type. */
  single: boolean;
  items: FooterItemKind;
  maxItems: number;
  /** Whether items may carry an icon from `FOOTER_UTILITY_ICONS`. */
  itemIcons: boolean;
  /** Whether the shop front shows the section title. */
  showsTitle: boolean;
  defaultTitle: string;
}

export const FOOTER_TYPES: Record<FooterSectionType, FooterTypeRule> = {
  brand: {
    label: 'Brand & contact',
    description: 'Logo, a short blurb and the store address, email and phone from Settings.',
    area: 'columns',
    single: true,
    items: 'none',
    maxItems: 0,
    itemIcons: false,
    showsTitle: false,
    defaultTitle: 'Brand & contact',
  },
  links: {
    label: 'Link column',
    description: 'A headed list of links, collapsible on phones.',
    area: 'columns',
    single: false,
    items: 'link',
    maxItems: 30,
    itemIcons: false,
    showsTitle: true,
    defaultTitle: '',
  },
  text: {
    label: 'Text column',
    description: 'A heading and free text — store hours, a note, a short story.',
    area: 'columns',
    single: false,
    items: 'none',
    maxItems: 0,
    itemIcons: false,
    showsTitle: true,
    defaultTitle: '',
  },
  social: {
    label: 'Social links',
    description:
      'Your social channels. They also feed the floating social rail on desktop pages, even while this column is hidden.',
    area: 'columns',
    single: true,
    items: 'social',
    maxItems: 12,
    itemIcons: false,
    showsTitle: true,
    defaultTitle: 'Follow Us',
  },
  utility: {
    label: 'Quick links',
    description: 'Small icon links in the bottom bar — track order, help centre.',
    area: 'bottom',
    single: false,
    items: 'link',
    maxItems: 12,
    itemIcons: true,
    showsTitle: false,
    defaultTitle: 'Quick links',
  },
  copyright: {
    label: 'Copyright',
    description: 'The copyright line in the bottom bar.',
    area: 'bottom',
    single: true,
    items: 'none',
    maxItems: 0,
    itemIcons: false,
    showsTitle: false,
    defaultTitle: 'Copyright',
  },
  payments: {
    label: 'Payment badges',
    description: 'The "we accept" chips in the bottom bar.',
    area: 'bottom',
    single: true,
    items: 'badge',
    maxItems: 20,
    itemIcons: false,
    showsTitle: true,
    defaultTitle: 'We Accept',
  },
  legal: {
    label: 'Policy links',
    description: 'A centred line of small-print links — privacy, terms, refunds.',
    area: 'bottom',
    single: false,
    items: 'link',
    maxItems: 30,
    itemIcons: false,
    showsTitle: false,
    defaultTitle: 'Policies',
  },
  credit: {
    label: 'Credit line',
    description: 'The last line of the page — who built the site.',
    area: 'bottom',
    single: true,
    items: 'link',
    maxItems: 1,
    itemIcons: false,
    showsTitle: false,
    defaultTitle: 'Credit',
  },
};

export const FOOTER_SECTION_TYPES = Object.keys(FOOTER_TYPES) as FooterSectionType[];

/**
 * Icons a quick link may use — lucide-react export names. The shop front maps
 * each one to a component, so this list is the whole vocabulary: a name that
 * is not here is refused by the API rather than rendered as nothing.
 */
export const FOOTER_UTILITY_ICONS = [
  'Package',
  'LifeBuoy',
  'Truck',
  'RefreshCw',
  'Ruler',
  'HelpCircle',
  'Phone',
  'Mail',
  'MapPin',
  'Store',
  'Gift',
  'Heart',
  'Star',
  'ShieldCheck',
  'Scissors',
  'Briefcase',
] as const;

/** Social platforms the shop front has a mark for. `Globe` is "anything else". */
export const FOOTER_SOCIAL_ICONS = [
  'Instagram',
  'Facebook',
  'Youtube',
  'Twitter',
  'Linkedin',
  'Globe',
] as const;

/** `#rrggbb`, or empty for the default. */
export const FOOTER_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Tokens the copyright line may use. Replaced on the shop front, so the year
 * rolls over and a renamed store is reflected without editing this text.
 */
export const FOOTER_COPYRIGHT_TOKENS = ['{year}', '{store}'] as const;

/**
 * Where a footer link may point: a path on this site, an http(s) page, an
 * email address or a phone number.
 *
 * An allow-list rather than a block-list, because this string ends up in an
 * `href` on every page of the shop and `javascript:` is only the best-known of
 * the schemes that execute. `//host` is refused too: it looks like a site path
 * and is really an off-site link.
 */
export function isSafeFooterUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  if (value.startsWith('/')) return !value.startsWith('//') && !value.startsWith('/\\');
  return /^(https?:\/\/[^\s/]+|mailto:[^\s]+|tel:\+?[0-9][0-9\s()-]*)/i.test(value);
}

/* --------------------------------- defaults -------------------------------- */

const link = (
  id: string,
  label: string,
  url: string,
  extra: Partial<FooterItem> = {},
): FooterItem => ({
  id,
  label,
  url,
  icon: '',
  color: '',
  enabled: true,
  openInNewTab: false,
  ...extra,
});

export const DEFAULT_FOOTER_SECTIONS: FooterSection[] = [
  {
    id: 'fsec_brand',
    type: 'brand',
    title: 'Brand & contact',
    enabled: true,
    content:
      'Contemporary Indian Fashion. Handwoven textiles and considered silhouettes, made with craftspeople across India.',
    items: [],
    display: { logo: true, address: true, email: true, phone: true },
  },
  {
    id: 'fsec_shop',
    type: 'links',
    title: 'Shop',
    enabled: true,
    content: '',
    items: [
      link('fitm_shop_new', 'New Arrivals', '/new-arrivals'),
      link('fitm_shop_sarees', 'Sarees', '/sarees'),
      link('fitm_shop_blouses', 'Blouses', '/blouses', { enabled: false }),
      link('fitm_shop_dresses', 'Dresses', '/shop?category=Dresses', { enabled: false }),
      link('fitm_shop_best', 'Bestsellers', '/bestsellers'),
      link('fitm_shop_sale', 'Sale', '/sale'),
    ],
  },
  {
    id: 'fsec_care',
    type: 'links',
    title: 'Customer Care',
    enabled: true,
    content: '',
    items: [
      link('fitm_care_contact', 'Contact Us', '/pages/contact'),
      link('fitm_care_shipping', 'Shipping', '/pages/shipping'),
      link('fitm_care_returns', 'Returns', '/pages/returns'),
      link('fitm_care_faq', 'FAQ', '/pages/faq'),
      link('fitm_care_track', 'Track Order', '/orders'),
      link('fitm_care_size', 'Size Guide', '/pages/size-guide', { enabled: false }),
    ],
  },
  {
    id: 'fsec_about',
    type: 'links',
    title: 'About SOPII',
    enabled: true,
    content: '',
    items: [
      link('fitm_about_story', 'Our Story', '/pages/our-story'),
      link('fitm_about_craft', 'Our Craft', '/pages/our-craft', { enabled: false }),
      link('fitm_about_sustain', 'Sustainability', '/pages/sustainability', { enabled: false }),
      link('fitm_about_careers', 'Careers', '/pages/careers', { enabled: false }),
    ],
  },
  {
    /* Hidden from the footer, as it was before; its channels still drive the
       desktop social rail. */
    id: 'fsec_social',
    type: 'social',
    title: 'Follow Us',
    enabled: false,
    content: '',
    items: [
      link(
        'fitm_social_instagram',
        'Instagram',
        'https://www.instagram.com/sopiiofficial?stkn=MXQ1cXdodTc5d3M4&utm_source=qr',
        { icon: 'Instagram', color: '#E1306C', openInNewTab: true },
      ),
      link('fitm_social_facebook', 'Facebook', 'https://facebook.com', {
        icon: 'Facebook',
        color: '#1877F2',
        openInNewTab: true,
        enabled: false,
      }),
      link('fitm_social_youtube', 'YouTube', 'https://youtube.com', {
        icon: 'Youtube',
        color: '#FF0000',
        openInNewTab: true,
      }),
    ],
  },
  {
    id: 'fsec_utility',
    type: 'utility',
    title: 'Quick links',
    enabled: true,
    content: '',
    items: [
      link('fitm_util_track', 'Track Order', '/orders', { icon: 'Package' }),
      link('fitm_util_help', 'Help Centre', '/pages/faq', { icon: 'LifeBuoy' }),
      link('fitm_util_craft', 'Our Craft', '/pages/our-craft', { icon: 'Scissors', enabled: false }),
      link('fitm_util_careers', 'Careers', '/pages/careers', { icon: 'Briefcase', enabled: false }),
    ],
  },
  {
    id: 'fsec_copyright',
    type: 'copyright',
    title: 'Copyright',
    enabled: true,
    content: '© {year} {store}. All Rights Reserved.',
    items: [],
  },
  {
    id: 'fsec_payments',
    type: 'payments',
    title: 'We Accept',
    enabled: true,
    content: '',
    items: ['UPI', 'Visa', 'Mastercard', 'RuPay', 'Net Banking', 'COD'].map((label) =>
      link(`fitm_pay_${label.toLowerCase().replace(/\s+/g, '_')}`, label, ''),
    ),
  },
  {
    id: 'fsec_legal',
    type: 'legal',
    title: 'Policies',
    enabled: true,
    content: '',
    items: [
      link('fitm_legal_privacy', 'Privacy Policy', '/pages/privacy-policy'),
      link('fitm_legal_terms', 'Terms & Conditions', '/pages/terms'),
      link('fitm_legal_shipping', 'Shipping Policy', '/pages/shipping'),
      link('fitm_legal_returns', 'Return Policy', '/pages/returns'),
      link('fitm_legal_refund', 'Refund Policy', '/pages/refund'),
    ],
  },
  {
    id: 'fsec_credit',
    type: 'credit',
    title: 'Credit',
    enabled: true,
    content: 'Designed and Developed by',
    items: [
      link('fitm_credit_netcom', 'Netcom Business Solutions Pvt Ltd', 'https://netcom-india.com/', {
        openInNewTab: true,
      }),
    ],
  },
];
