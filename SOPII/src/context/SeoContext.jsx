import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../services/api';
import { BRAND } from '../data/site';

/**
 * Site-wide SEO configuration, fetched once from the admin panel's public
 * feed (`/api/storefront/seo`).
 *
 * Two things come back: the settings singleton, and the `seo_pages` rows for
 * every route the catalogue does not own. Products, categories and collections
 * carry their metadata on the record itself and arrive with the catalogue, so
 * they are deliberately *not* here — one page, one source.
 *
 * The bundled fallback below is what renders before the request resolves and
 * if the API is unreachable. It is intentionally complete: a page with no
 * title is worse than a page with a generic one, and a crawler that arrives
 * during an API outage should still find something coherent.
 */

const FALLBACK_SETTINGS = {
  siteUrl: typeof window !== 'undefined' ? window.location.origin : 'https://sopii.com',
  siteName: BRAND.name,
  titleTemplate: `%s | ${BRAND.name}`,
  defaultTitle: `${BRAND.name} — ${BRAND.tagline}`,
  defaultMetaDescription:
    'Handwoven sarees, blouses and considered silhouettes, made with craftspeople across India.',
  defaultOgImage: '/sopii.png',
  twitterCardType: 'summary_large_image',
  robotsIndex: true,
  robotsFollow: true,
  organization: {
    name: BRAND.name,
    logo: '/sopii.png',
    email: BRAND.email,
    phone: BRAND.phone,
    sameAs: [],
  },
  sitemap: { enabled: true },
  verification: {},
};

const SeoContext = createContext({
  settings: FALLBACK_SETTINGS,
  pages: {},
  ready: false,
});

/** Where `/media/...` paths resolve from — the API origin, not the shop's. */
function mediaOriginFromApiBase() {
  const base = import.meta.env.VITE_API_URL || '/api';
  if (!/^https?:\/\//i.test(base)) return '';
  try {
    return new URL(base).origin;
  } catch {
    return '';
  }
}

export function SeoProvider({ children }) {
  const [data, setData] = useState({ settings: null, pages: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    apiGet('/storefront/seo', { signal: controller.signal })
      .then((payload) => {
        if (cancelled) return;
        setData({ settings: payload?.settings ?? null, pages: payload?.pages ?? [] });
      })
      .catch(() => {
        /* Offline or the panel has no SEO module yet — the fallback below
           still gives every page a title, a description and a canonical. */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const value = useMemo(() => {
    const settings = {
      ...FALLBACK_SETTINGS,
      ...(data.settings ?? {}),
      organization: {
        ...FALLBACK_SETTINGS.organization,
        ...(data.settings?.organization ?? {}),
      },
      mediaOrigin: mediaOriginFromApiBase(),
    };

    /* Indexed by path so a route lookup is O(1) rather than a scan on every
       navigation. */
    const pages = {};
    for (const page of data.pages ?? []) {
      if (page?.path) pages[page.path] = page;
    }

    return { settings, pages, ready };
  }, [data, ready]);

  return <SeoContext.Provider value={value}>{children}</SeoContext.Provider>;
}

export const useSeoConfig = () => useContext(SeoContext);

/** The admin's override for one route, or `{}` if it has none. */
export function useSeoOverride(path) {
  const { pages } = useSeoConfig();
  return pages[path] ?? {};
}
