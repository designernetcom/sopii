import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { fetchBootstrap, fetchProductPage, fetchVersion } from '../services/api';
import {
  adaptAnnouncements,
  adaptCategories,
  adaptCollections,
  adaptCoupons,
  adaptEditorialBanner,
  adaptFeaturedCollection,
  adaptFooter,
  adaptHeroSlide,
  adaptHomeSections,
  adaptProducts,
  adaptSettings,
  adaptTestimonials,
  buildNavigation,
} from '../services/adapters';
import {
  getBestsellers,
  getCompleteTheLook,
  getNewArrivals,
  getOnSale,
  getProductById,
  getRelatedProducts,
  resolveCollection,
  searchProducts,
} from '../utils/catalog';

/*
 * The bundled demo catalogue is **not** imported here.
 *
 * It used to be — six static imports at the top of this file — which put ~39 KB
 * of demo product copy into the initial bundle of every visitor to a working
 * store. It now lives behind a dynamic import in `data/fallback.js` and is
 * fetched only on the branch that needs it. `data/site` stays static because
 * `BRAND` is the shop's own name and logo, rendered in the header on first
 * paint by `SeoContext` as well as this one — and `FOOTER`, the small offline
 * copy of the footer, which the footer used to import from there directly.
 */
import { BRAND, FOOTER } from '../data/site';
import { RouteSkeleton } from '../components/ui/PageSkeletons';
import { useToast } from './ToastContext';

const CatalogContext = createContext(null);

/**
 * How often to ask the API whether anything changed.
 *
 * Raised from 30 s to 120 s, and the reason is arithmetic rather than taste.
 * Every open tab polls this; at a hundred thousand concurrent tabs, a
 * thirty-second interval is ~3,300 requests a second of pure "has anything
 * changed?" traffic, and the answer is almost always no. Two minutes is four
 * times cheaper and still means a product published in the panel appears on the
 * shop while the person who published it is still looking at it.
 *
 * The check itself is now cached and CDN-fronted on the server side, so most of
 * these never reach the origin at all. Set to 0 to disable.
 */
const POLL_MS = Number(import.meta.env.VITE_CATALOG_POLL_MS ?? 120000);

/** Don't re-check on every tab switch — only if this long has passed. */
const FOCUS_MIN_GAP_MS = 30000;

/**
 * The most products this shop will hold in memory.
 *
 * Everything the storefront does client-side — filtering, sorting, search,
 * related products — needs the products in the browser, and that is a fine
 * design up to a point. This is the point. Past it the shop stops fetching more
 * pages and the server-side `/storefront/products` endpoint (which supports the
 * same filters, sorts and search) is the correct thing to page through instead.
 *
 * 2000 products is roughly 3 MB of JSON at the slim projection, which is
 * comfortable on a mid-range Android and far past the size of a real SOPII
 * catalogue. Lower it for a phone-first store; raise it only with a plan.
 */
const MAX_CLIENT_PRODUCTS = Number(import.meta.env.VITE_CATALOG_MAX_PRODUCTS ?? 2000);

/** Products per background page. Matched to the server's own page cap. */
const PAGE_SIZE = 60;

/** How many live banners head the page as hero slides; the rest go inline. */
const HERO_SLIDE_COUNT = 3;

/** The bundled footer, for when there is no feed to read one from. */
const BUNDLED_FOOTER = adaptFooter(FOOTER);

/** The shape every consumer reads, before anything has loaded. */
const EMPTY = {
  products: [],
  categories: [],
  navigation: [],
  collections: [],
  heroSlides: [],
  editorialBanners: [],
  announcements: [],
  /** The home page's split image/copy section; `null` renders nothing. */
  featuredCollection: null,
  /** `{ sections, socialLinks }` — see `adaptFooter`. */
  footer: BUNDLED_FOOTER,
  testimonials: [],
  coupons: [],
  homeSections: [],
  settings: {
    brand: BRAND,
    currencySymbol: '₹',
    freeShippingThreshold: 0,
    shippingFee: 0,
    codCharge: 0,
    processingTime: '',
    shippingZones: [],
    paymentMethods: [],
    pricesIncludeTax: true,
    taxRate: 0,
  },
};

/** API bootstrap payload → everything the shop renders. */
function adaptBootstrap(payload, editorial) {
  const banners = payload.banners ?? [];
  const heroBanners = banners.slice(0, HERO_SLIDE_COUNT);
  const editorialBanners = banners.slice(HERO_SLIDE_COUNT);

  const testimonials = adaptTestimonials(payload.testimonials);
  const coupons = adaptCoupons(payload.coupons);
  const categories = adaptCategories(payload.categories);
  const collections = adaptCollections(payload.collections);
  const homeSections = adaptHomeSections(payload.homeSections);

  return {
    products: adaptProducts(payload.products, payload.categories),
    categories,
    collections,
    navigation: buildNavigation(categories),

    /* Banners are the only home page imagery the panel controls. If none are
       live, the bundled editorial slides stand in rather than leaving a hole
       where the hero should be — which is the one place the bundled data is
       reached on the success path, hence the separate small import. */
    heroSlides: heroBanners.length ? heroBanners.map(adaptHeroSlide) : (editorial?.heroSlides ?? []),
    editorialBanners: editorialBanners.length
      ? editorialBanners.map(adaptEditorialBanner)
      : (editorial?.editorialBanners ?? []),

    /* No bundled stand-in: an announcement is a statement about the live
       store — an offer, a shipping rule — and the demo copy saying one the
       store never made is worse than an empty strip. */
    announcements: adaptAnnouncements(payload.announcements),

    /* Always sent by the API — its defaults when the panel has never saved the
       section — so `null` here means hidden in the panel, or an API too old to
       know the section. Either way the home page leaves it out. */
    featuredCollection: adaptFeaturedCollection(payload.featuredCollection),

    /* The API sends its built-in footer until the panel saves one, so a missing
       key means an API that predates the footer screen — the bundled copy
       stands in. An empty section list is the panel's answer and is kept. */
    footer: adaptFooter(payload.footer) ?? BUNDLED_FOOTER,

    testimonials,
    coupons,

    /* The home page renders these in order. A store that has switched every
       section off gets whatever the API said, which may be nothing — the
       sections have sensible defaults downstream. */
    homeSections,

    settings: payload.settings ? adaptSettings(payload.settings, BRAND) : EMPTY.settings,
  };
}

export function CatalogProvider({ children }) {
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [source, setSource] = useState('none'); // api | fallback | none
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  /** False while more of the catalogue is still arriving in the background. */
  const [catalogComplete, setCatalogComplete] = useState(true);

  const versionRef = useRef(null);
  const lastCheckRef = useRef(0);
  /** Guards against two background fills racing after a refresh. */
  const fillRef = useRef(0);
  /*
   * The raw category rows the bootstrap returned.
   *
   * `adaptProduct` resolves a product's `categoryId` to a display name through
   * this index, so background pages have to be adapted against the same one —
   * otherwise a product that arrived in page three would render with a blank
   * category while an identical one from the first page renders correctly.
   */
  const rawCategoriesRef = useRef([]);
  const { toast } = useToast();

  /**
   * Fills the rest of the catalogue **after** the first paint.
   *
   * This is the half that makes the smaller bootstrap payload invisible. The
   * first request carries what the home page and the first two screens of a
   * listing need; everything else arrives in the background, page by page,
   * while the shopper is already reading. By the time they open a filter the
   * catalogue is usually complete, and if it is not, the pages that have
   * arrived are still filtered correctly — there are simply fewer of them for
   * a moment.
   *
   * Sequential rather than parallel on purpose: these are background requests
   * competing with images the shopper can actually see, and firing ten at once
   * would win the race against the thing they are looking at.
   */
  const fillCatalogue = useCallback(async (payload, generation) => {
    if (!payload.hasMoreProducts) {
      setCatalogComplete(true);
      return;
    }

    setCatalogComplete(false);
    const pageSize = PAGE_SIZE;
    // The bootstrap already delivered its own first slice.
    let page = Math.floor((payload.productLimit ?? 0) / pageSize) + 1;
    let held = payload.products.length;

    while (held < MAX_CLIENT_PRODUCTS) {
      // A newer load has started; abandon this fill rather than appending to it.
      if (fillRef.current !== generation) return;

      let batch;
      try {
         
        batch = await fetchProductPage({ page, pageSize });
      } catch {
        // A failed background page is not worth surfacing — the shopper has a
        // working catalogue, just a shorter one.
        break;
      }

      const items = batch?.items ?? [];
      if (!items.length) break;

      if (fillRef.current !== generation) return;

      setData((current) => {
        const known = new Set(current.products.map((product) => product.id));
        const added = adaptProducts(items, rawCategoriesRef.current).filter(
          (product) => !known.has(product.id),
        );
        return added.length ? { ...current, products: [...current.products, ...added] } : current;
      });

      held += items.length;
      page += 1;
      if (page > (batch.totalPages ?? 1)) break;
    }

    if (fillRef.current === generation) setCatalogComplete(true);
  }, []);

  /**
   * Pull the catalogue. `announce` is set for background refreshes so the
   * shopper is told the page just changed under them; the first load stays
   * silent.
   */
  const load = useCallback(
    async ({ announce = false, signal } = {}) => {
      const generation = fillRef.current + 1;
      fillRef.current = generation;

      try {
        const [payload, version] = await Promise.all([
          fetchBootstrap({ signal }),
          fetchVersion({ signal }).catch(() => null),
        ]);

        /* Only fetched when the store has published no banners of its own. */
        const editorial = (payload.banners ?? []).length
          ? null
          : await import('../data/fallback')
              .then((module) => module.loadEditorialFallback())
              .catch(() => null);

        rawCategoriesRef.current = payload.categories ?? [];
        setData(adaptBootstrap(payload, editorial));
        setSource('api');
        setError(null);
        setStatus('ready');
        setLastUpdated(payload.fetchedAt ?? new Date().toISOString());
        versionRef.current = version?.token ?? null;
        lastCheckRef.current = Date.now();

        if (announce) toast('Catalogue updated', { type: 'info' });

        // Deliberately not awaited: the shop is ready to render now.
        void fillCatalogue(payload, generation);
        return true;
      } catch (cause) {
        if (cause?.name === 'AbortError') return false;

        /* The bundled catalogue degrades an unreachable API to a browsable demo
           shop rather than an empty page. Imported here rather than at the top
           of the module — see `data/fallback.js`. */
        console.warn('[catalog] falling back to bundled data:', cause?.message ?? cause);
        try {
          const { loadFallbackCatalogue } = await import('../data/fallback');
          setData(await loadFallbackCatalogue());
          setSource('fallback');
        } catch {
          setSource('none');
        }

        setError(cause);
        setStatus('error');
        setCatalogComplete(true);
        return false;
      }
    },
    [toast, fillCatalogue],
  );

  /* Initial load. */
  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  /** Cheap "did anything change?" check; re-loads only when it did. */
  const checkForChanges = useCallback(async () => {
    lastCheckRef.current = Date.now();
    try {
      const version = await fetchVersion();
      if (versionRef.current && version.token === versionRef.current) return;

      const known = versionRef.current;
      versionRef.current = version.token;
      await load({ announce: Boolean(known) });
    } catch {
      // A failed poll is not worth surfacing — the next one may well succeed.
    }
  }, [load]);

  /* Poll while the tab is visible. */
  useEffect(() => {
    if (!POLL_MS) return undefined;

    const tick = () => {
      if (document.hidden) return;
      checkForChanges();
    };

    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [checkForChanges]);

  /* Check again when the shopper comes back to the tab. */
  useEffect(() => {
    const onFocus = () => {
      if (document.hidden) return;
      if (Date.now() - lastCheckRef.current < FOCUS_MIN_GAP_MS) return;
      checkForChanges();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [checkForChanges]);

  const { products, collections } = data;

  /*
   * Selectors bound to the live catalogue. Memoised on the product list so the
   * references stay stable between renders — pages pass them straight into
   * their own `useMemo` dependency arrays.
   */
  const selectors = useMemo(
    () => ({
      getProductById: (id) => getProductById(products, id),
      getNewArrivals: (limit) => getNewArrivals(products, limit),
      getBestsellers: (limit) => getBestsellers(products, limit),
      getOnSale: (limit) => getOnSale(products, limit),
      searchProducts: (query, limit) => searchProducts(products, query, limit),
      getRelatedProducts: (product, limit) => getRelatedProducts(products, product, limit),
      getCompleteTheLook: (product, limit) => getCompleteTheLook(products, product, limit),
      getCollection: (slug) => collections.find((c) => c.slug === slug),
      getCollectionProducts: (collection) => resolveCollection(collection, products),
    }),
    [products, collections],
  );

  const value = useMemo(
    () => ({
      ...data,
      ...selectors,
      status,
      source,
      error,
      lastUpdated,
      isLive: source === 'api',
      /** False while background pages are still arriving. */
      catalogComplete,
      refresh: () => load({ announce: false }),
    }),
    [data, selectors, status, source, error, lastUpdated, catalogComplete, load],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return ctx;
}

/** Convenience for the many components that only want the product list. */
export const useProducts = () => useCatalog().products;

/** Store identity and shipping rules, as configured in the admin panel. */
export const useSiteSettings = () => useCatalog().settings;

/** The footer's sections and the social channels, as arranged in the admin panel. */
export const useFooter = () => useCatalog().footer;

/**
 * Holds the first paint until the catalogue is in — rendering the shop against
 * bundled demo data for a beat and then swapping it for the real thing is a
 * worse experience than a brief shimmer.
 *
 * What shimmers is the page that was actually asked for: `RouteSkeleton` reads
 * the URL, so a cold open of /product/123 fills in a product page rather than
 * spinning on a blank screen. `chrome` is set because this gate runs above
 * <Layout>, so there is no header or footer on screen yet to shimmer beneath.
 *
 * Note what it now waits for: the *first page* of the catalogue, not all of it.
 * The rest arrives behind this gate while the shopper is already reading, which
 * is what turns a smaller bootstrap payload into a faster first paint rather
 * than a shorter catalogue.
 */
export function CatalogGate({ children }) {
  const { status } = useCatalog();
  if (status === 'loading') return <RouteSkeleton chrome />;
  return children;
}
