import { useMemo } from 'react';
import { SEOHead } from './SEOHead';
import { useSeoConfig } from '../../context/SeoContext';
import { absoluteUrl, breadcrumbSchema, itemListSchema, truncate } from '../../lib/seo';

/**
 * Metadata for a listing page — a category, a collection, or one of the
 * curated rails such as /new-arrivals.
 *
 * The interesting part is `filtered`. A listing with facets applied is the
 * same set of products in a different order, so it must not compete with the
 * unfiltered page in the index: the canonical stays on the clean path and the
 * filtered view is marked noindex. Without that, one category can generate
 * hundreds of near-duplicate URLs and dilute every one of them.
 */
export function CategorySEO({
  /** The category/collection record, when the page has one. */
  record,
  /** Fallbacks for rails that are not backed by a record. */
  title,
  description,
  image,
  /** Canonical path — always the unfiltered one. */
  path,
  products = [],
  breadcrumbs = [],
  /** True when any filter, sort or page beyond the first is applied. */
  filtered = false,
}) {
  const { settings } = useSeoConfig();

  const seo = record?.seo ?? {};
  const canonicalPath = path || '/shop';
  const url = absoluteUrl(settings?.siteUrl, canonicalPath);

  const jsonLd = useMemo(
    () =>
      [
        breadcrumbSchema(breadcrumbs, settings),
        /* A filtered view's item list describes a subset the canonical URL
           does not show, so it is only emitted for the clean page. */
        filtered ? null : itemListSchema(products, { settings, url }),
      ].filter(Boolean),
    [breadcrumbs, products, settings, url, filtered],
  );

  return (
    <SEOHead
      title={record?.name || title}
      description={truncate(record?.description || description || '', 170)}
      image={record?.image || record?.banner || image}
      type="website"
      path={canonicalPath}
      override={record ? seo : undefined}
      jsonLd={jsonLd}
      noindex={filtered}
    />
  );
}
