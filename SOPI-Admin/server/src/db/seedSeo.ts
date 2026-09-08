/*
 * SEO seed.
 * ---------------------------------------------------------------------------
 * Idempotent: it creates the settings document and one `seo_pages` row per
 * route the catalogue does not own, and never overwrites a row an admin has
 * since edited. Safe to run on every boot, which is what makes a new route
 * appear in the panel the moment it is added here.
 *
 * Only routes worth a search result get real copy. Everything transactional or
 * personal — cart, checkout, account, login — is seeded `noindex, nofollow`,
 * because those pages have nothing to offer a searcher and would otherwise
 * compete with the pages that do.
 */

import { SEO_SETTINGS_ID, SeoPageModel, SeoSettingsModel } from './models.js';
import { SEO_DEFAULTS } from '../lib/seo.js';
import type { SeoPageType } from '@/types';

interface SeedRow {
  path: string;
  label: string;
  pageType: SeoPageType;
  title?: string;
  metaDescription?: string;
  robotsIndex?: boolean;
  robotsFollow?: boolean;
}

/** Pages that should never reach an index, and why they exist as rows at all:
    so an admin can see the decision rather than wonder why they are missing. */
const PRIVATE: Pick<SeedRow, 'robotsIndex' | 'robotsFollow'> = {
  robotsIndex: false,
  robotsFollow: false,
};

const ROWS: SeedRow[] = [
  {
    path: '/',
    label: 'Homepage',
    pageType: 'home',
    title: 'SOPII — Contemporary Indian Fashion',
    metaDescription:
      'Handwoven sarees, blouses and everyday silhouettes, made with craftspeople across India. Shop new arrivals, bestsellers and curated collections.',
  },

  /* Catalogue listing routes. These are real landing pages, so each gets its
     own description rather than inheriting one generic line. */
  {
    path: '/shop',
    label: 'Shop — All Products',
    pageType: 'system',
    title: 'Shop All',
    metaDescription:
      'Browse the full SOPII collection — sarees, blouses, dresses and jewellery, filtered by fabric, occasion and price.',
  },
  {
    path: '/new-arrivals',
    label: 'New Arrivals',
    pageType: 'system',
    title: 'New Arrivals',
    metaDescription:
      'The newest pieces in the studio, added in limited runs. Fresh sarees, blouses and separates from SOPII.',
  },
  {
    path: '/bestsellers',
    label: 'Bestsellers',
    pageType: 'system',
    title: 'Bestsellers',
    metaDescription:
      'The pieces reordered more than anything else in the collection — SOPII customer favourites.',
  },
  {
    path: '/sale',
    label: 'Sale',
    pageType: 'system',
    title: 'Sale',
    metaDescription: 'Reduced pieces from past SOPII collections, while stock lasts.',
  },
  /*
   * Deliberately absent: /sarees, /blouses, /women and every other category
   * route. Those are category pages, and a category's metadata lives on the
   * Category record — seeding a row here as well would give one route two
   * owners, which is the exact thing this module exists to prevent.
   */
  {
    path: '/collections',
    label: 'Collections',
    pageType: 'system',
    title: 'Collections',
    metaDescription:
      'Curated SOPII collections, grouped by story, season and the looms they came from.',
  },

  /* Personal, transactional or infinite-surface routes. */
  { path: '/search', label: 'Search Results', pageType: 'system', title: 'Search', ...PRIVATE },
  { path: '/cart', label: 'Cart', pageType: 'system', title: 'Your Bag', ...PRIVATE },
  { path: '/checkout', label: 'Checkout', pageType: 'system', title: 'Checkout', ...PRIVATE },
  { path: '/wishlist', label: 'Wishlist', pageType: 'system', title: 'Wishlist', ...PRIVATE },
  { path: '/account', label: 'Account', pageType: 'system', title: 'My Account', ...PRIVATE },
  { path: '/orders', label: 'Orders', pageType: 'system', title: 'My Orders', ...PRIVATE },
  { path: '/login', label: 'Log In', pageType: 'system', title: 'Log In', ...PRIVATE },
  { path: '/register', label: 'Create Account', pageType: 'system', title: 'Create Account', ...PRIVATE },
  { path: '/404', label: 'Not Found', pageType: 'system', title: 'Page Not Found', ...PRIVATE },

  /* Static content. */
  {
    path: '/pages/our-story',
    label: 'Our Story',
    pageType: 'static',
    title: 'Our Story',
    metaDescription:
      'How SOPII began, and the weavers and printers the studio works with across India.',
  },
  {
    path: '/pages/our-craft',
    label: 'Our Craft',
    pageType: 'static',
    title: 'Our Craft',
    metaDescription:
      'Handloom, block printing and natural dyeing — the techniques behind every SOPII piece.',
  },
  {
    path: '/pages/sustainability',
    label: 'Sustainability',
    pageType: 'static',
    title: 'Sustainability',
    metaDescription:
      'Fair wages, natural fibres and small-batch production: how SOPII approaches responsible making.',
  },
  {
    path: '/pages/careers',
    label: 'Careers',
    pageType: 'static',
    title: 'Careers',
    metaDescription: 'Open roles at SOPII and what it is like to work with the studio.',
  },
  {
    path: '/pages/contact',
    label: 'Contact Us',
    pageType: 'static',
    title: 'Contact Us',
    metaDescription:
      'Reach the SOPII care team by email or phone, or visit the studio in Mumbai.',
  },
  {
    path: '/pages/shipping',
    label: 'Shipping',
    pageType: 'static',
    title: 'Shipping',
    metaDescription:
      'Delivery timelines, charges and free-shipping thresholds for SOPII orders across India.',
  },
  {
    path: '/pages/returns',
    label: 'Returns',
    pageType: 'static',
    title: 'Returns',
    metaDescription: 'How SOPII handles returns and exchanges, and what is covered.',
  },
  {
    path: '/pages/size-guide',
    label: 'Size Guide',
    pageType: 'static',
    title: 'Size Guide',
    metaDescription:
      'Measurements and fit notes for SOPII sarees, blouses and readymade garments.',
  },
  {
    path: '/pages/faq',
    label: 'FAQ',
    pageType: 'static',
    title: 'Frequently Asked Questions',
    metaDescription:
      'Answers to common questions about SOPII orders, fabrics, care, sizing and delivery.',
  },
  {
    path: '/pages/privacy-policy',
    label: 'Privacy Policy',
    pageType: 'static',
    title: 'Privacy Policy',
    metaDescription: 'How SOPII collects, stores and uses your personal information.',
    robotsIndex: true,
    robotsFollow: true,
  },
  {
    path: '/pages/terms',
    label: 'Terms & Conditions',
    pageType: 'static',
    title: 'Terms & Conditions',
    metaDescription: 'The terms that apply when you shop with SOPII.',
  },
];

export async function seedSeo() {
  /* Settings: created once, never overwritten. An admin who has tuned the
     site title should not have it reset by a restart. */
  const existing = await SeoSettingsModel.findById(SEO_SETTINGS_ID).lean();
  if (!existing) {
    await SeoSettingsModel.create({ _id: SEO_SETTINGS_ID, ...SEO_DEFAULTS });
  }

  const now = new Date().toISOString();
  let created = 0;

  for (const row of ROWS) {
    /* `updateOne` with `$setOnInsert` is the whole idempotence story: an
       existing row is left exactly as the admin last saved it. */
    const result = await SeoPageModel.updateOne(
      { path: row.path },
      {
        $setOnInsert: {
          _id: `seo_${row.path === '/' ? 'home' : row.path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`,
          pageType: row.pageType,
          label: row.label,
          path: row.path,
          refId: null,
          system: true,
          title: row.title ?? '',
          metaDescription: row.metaDescription ?? '',
          keywords: [],
          robotsIndex: row.robotsIndex,
          robotsFollow: row.robotsFollow,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount) created += 1;
  }

  if (created) console.log(`[api] seeded ${created} SEO page record(s)`);
}
