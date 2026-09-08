import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useSeoConfig, useSeoOverride } from '../../context/SeoContext';
import { resolveSeo } from '../../lib/seo';

/**
 * Writes one page's metadata into <head>.
 *
 * Every tag it manages is stamped with `data-seo`, and the whole set is
 * rewritten on each render. That is the mechanism that guarantees the thing
 * this feature was asked for: a page can never accumulate two titles, two
 * descriptions or two canonicals, because the previous page's tags are removed
 * before the current page's are written.
 *
 * A note on what client-rendered metadata can and cannot do: Googlebot renders
 * JavaScript and will see these tags. Most social scrapers — Facebook, X,
 * LinkedIn, WhatsApp — do not, so link previews need the tags present in the
 * served HTML. See `docs/SEO.md` for the prerender step that closes that gap.
 */

/*
 * Selectors for every tag this module is responsible for.
 *
 * Deliberately broader than `[data-seo]`: index.html ships a static title and
 * description so that a first paint — and any crawler that does not run
 * JavaScript — sees something sensible. Those static tags are not stamped, so
 * without matching them here the first render would *add* a second
 * description rather than replace the first.
 */
const MANAGED_SELECTORS = [
  '[data-seo]',
  'meta[name="description"]',
  'meta[name="keywords"]',
  'meta[name="robots"]',
  'link[rel="canonical"]',
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
].join(', ');

/** Removes every tag this module owns, so nothing survives a navigation. */
function clearManagedTags() {
  document.head.querySelectorAll(MANAGED_SELECTORS).forEach((node) => node.remove());
}

function meta(attr, key, content) {
  if (!content) return null;
  const node = document.createElement('meta');
  node.setAttribute(attr, key);
  node.setAttribute('content', String(content));
  node.setAttribute('data-seo', '');
  return node;
}

function link(rel, href) {
  if (!href) return null;
  const node = document.createElement('link');
  node.setAttribute('rel', rel);
  node.setAttribute('href', href);
  node.setAttribute('data-seo', '');
  return node;
}

/**
 * @param title        the page's own title, before the site template
 * @param description  the page's own description
 * @param image        social share image
 * @param type         Open Graph type — `website`, `product`, `article`
 * @param noindex      force this page out of the index regardless of settings
 * @param path         override the path used for the canonical (defaults to
 *                     the current route, deliberately without its query string)
 * @param jsonLd       one schema object, or an array of them
 * @param override     the admin's metadata for this page, when it does not
 *                     live in `seo_pages` — products, categories and
 *                     collections carry theirs on the record itself
 */
export function usePageSeo({
  title,
  description,
  image,
  type = 'website',
  noindex = false,
  path,
  jsonLd,
  override: overrideProp,
} = {}) {
  const location = useLocation();
  const { settings } = useSeoConfig();

  /* Canonical paths never carry a query string: ?page=2, ?sort=price and
     ?colour=red are the same content filtered, not different pages. */
  const routePath = path ?? location.pathname;
  const pageOverride = useSeoOverride(routePath);

  /* A record's own SEO block wins over any `seo_pages` row for the same path.
     In practice only one of the two ever exists — that is the point of the
     split — but making the precedence explicit means a stray row can never
     give a product two competing titles. */
  const override = overrideProp ?? pageOverride;

  const resolved = useMemo(
    () => resolveSeo(settings, override, { path: routePath, title, description, image, type, noindex }),
    [settings, override, routePath, title, description, image, type, noindex],
  );

  const schemas = useMemo(() => {
    const list = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    const extra = String(override?.structuredData ?? '').trim();

    if (extra) {
      /* The panel validates this on save; a document that has since been
         hand-edited in the database must not take the page down with it. */
      try {
        list.push(JSON.parse(extra));
      } catch {
        if (import.meta.env.DEV) {
          console.warn(`[seo] ignoring invalid JSON-LD on ${routePath}`);
        }
      }
    }

    return list.filter(Boolean);
  }, [jsonLd, override, routePath]);

  useEffect(() => {
    document.title = resolved.title;

    clearManagedTags();
    const fragment = document.createDocumentFragment();

    const nodes = [
      meta('name', 'description', resolved.metaDescription),
      resolved.keywords.length ? meta('name', 'keywords', resolved.keywords.join(', ')) : null,
      meta('name', 'robots', resolved.robots),
      link('canonical', resolved.canonicalUrl),

      meta('property', 'og:type', resolved.og.type),
      meta('property', 'og:site_name', resolved.og.siteName),
      meta('property', 'og:title', resolved.og.title),
      meta('property', 'og:description', resolved.og.description),
      meta('property', 'og:url', resolved.og.url),
      meta('property', 'og:image', resolved.og.image),
      meta('property', 'og:locale', 'en_IN'),

      meta('name', 'twitter:card', resolved.twitter.card),
      meta('name', 'twitter:title', resolved.twitter.title),
      meta('name', 'twitter:description', resolved.twitter.description),
      meta('name', 'twitter:image', resolved.twitter.image),
      meta('name', 'twitter:site', resolved.twitter.site),
      meta('name', 'twitter:creator', resolved.twitter.creator),
    ];

    /* Search-console ownership tags. They belong to the site, not the page,
       but they have to be in <head> to be found. */
    const verification = settings?.verification ?? {};
    nodes.push(
      meta('name', 'google-site-verification', verification.google),
      meta('name', 'msvalidate.01', verification.bing),
      meta('name', 'p:domain_verify', verification.pinterest),
      meta('name', 'facebook-domain-verification', verification.facebook),
    );

    for (const schema of schemas) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', '');
      script.textContent = JSON.stringify(schema);
      nodes.push(script);
    }

    nodes.filter(Boolean).forEach((node) => fragment.appendChild(node));
    document.head.appendChild(fragment);
  }, [resolved, schemas, settings]);

  /* Deliberately no unmount cleanup. Every page sets its metadata, and each
     one clears before it writes, so the tags are always exactly one page's
     worth. An unmount-time clear would risk running after the next page's
     effect had already written its tags, and blanking them. */
}

/**
 * The component form. Identical to `usePageSeo` — use whichever reads better:
 * the component alongside the page's markup, or the hook at the top of a
 * component that returns early (an empty cart, a missing record) and so has
 * no single place to render an element.
 */
export function SEOHead(props) {
  usePageSeo(props);
  return null;
}
