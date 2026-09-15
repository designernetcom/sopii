/**
 * The bundled demo catalogue — loaded only when it is actually needed.
 * ===========================================================================
 * SOPII ships a complete demo catalogue so the shop is browsable with no API
 * behind it. That is genuinely useful: it is what a developer sees on a clean
 * checkout, and it is what a shopper sees rather than an empty page if the API
 * is unreachable mid-session.
 *
 * It is also about 39 KB of product copy, category trees and testimonials that
 * a working store never renders — and it used to sit in the initial JavaScript
 * bundle, because `CatalogContext` imported it at the top of the module. Every
 * visitor to the real shop downloaded, parsed and evaluated a demo catalogue
 * before the real one could paint.
 *
 * Moving it behind a dynamic `import()` takes it out of the critical path
 * entirely. Vite emits it as a separate chunk that is requested only on the
 * failure branch, so the fallback still works exactly as before — it simply
 * costs one network request at the moment it is needed, which is a moment the
 * shopper is already waiting through.
 */

import { adaptFeaturedCollection, adaptFooter } from '../services/adapters';

let cached = null;

/**
 * Assembles the bundled catalogue, in the shape `adaptBootstrap` produces.
 *
 * Memoised, because a flapping API would otherwise re-import and re-assemble it
 * on every failed poll. The modules themselves are cached by the browser after
 * the first request; this caches the assembly.
 */
export async function loadFallbackCatalogue() {
  if (cached) return cached;

  const [products, categories, collections, reviews, navigation, site] = await Promise.all([
    import('./products'),
    import('./categories'),
    import('./collections'),
    import('./reviews'),
    import('./navigation'),
    import('./site'),
  ]);

  cached = {
    products: products.PRODUCTS,
    categories: categories.CATEGORIES,
    navigation: navigation.NAV_ITEMS,
    collections: collections.COLLECTIONS,
    heroSlides: collections.HERO_SLIDES,
    editorialBanners: collections.HOME_BANNERS,
    /* Announcements come only from the panel. With the API unreachable there
       is no way to know which offers are really running, so the strip hides. */
    announcements: [],
    /* Editorial copy rather than a claim about the store, so — like the hero
       slides — the bundled version stands in and the home page has no hole. */
    featuredCollection: adaptFeaturedCollection(collections.FEATURED_COLLECTION),
    /* Policies, contact details and navigation rather than claims about a
       running offer, so the bundled footer stands in. */
    footer: adaptFooter(site.FOOTER),
    testimonials: reviews.TESTIMONIALS,
    coupons: site.COUPONS,
    homeSections: site.HOME_SECTIONS,
    settings: {
      brand: site.BRAND,
      currencySymbol: '₹',
      freeShippingThreshold: site.FREE_SHIPPING_THRESHOLD,
      shippingFee: site.SHIPPING_FEE,
      codCharge: 0,
      processingTime: '',
      shippingZones: [],
      paymentMethods: site.PAYMENT_METHODS,
      pricesIncludeTax: true,
      taxRate: 0,
    },
  };

  return cached;
}

/**
 * The parts of the bundled data the API has no field for.
 *
 * Hero slides and editorial banners stand in when a store has published no
 * live banners, so this half of the fallback is reachable on the *success*
 * path too — but only when there is a hole to fill, which is why it is a
 * separate, smaller import than the whole catalogue above.
 */
export async function loadEditorialFallback() {
  const collections = await import('./collections');
  return {
    heroSlides: collections.HERO_SLIDES,
    editorialBanners: collections.HOME_BANNERS,
  };
}
