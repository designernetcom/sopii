import { useMemo } from 'react';
import { SEOHead } from './SEOHead';
import { useSeoConfig } from '../../context/SeoContext';
import { absoluteUrl, breadcrumbSchema, productSchema, truncate } from '../../lib/seo';

/**
 * A product page's metadata and structured data.
 *
 * The record's own `seo` block is the override here, rather than a
 * `seo_pages` row — a product's metadata belongs to the product, and is
 * edited on its SEO tab in the panel. Passing it as `override` is what keeps
 * the precedence identical to every other page type.
 */
export function ProductSEO({ product, reviews = [], breadcrumbs = [] }) {
  const { settings } = useSeoConfig();

  const seo = product?.seo ?? {};
  const path = `/product/${seo.slug || product?.slug || product?.id || ''}`;
  const url = absoluteUrl(settings?.siteUrl, path);

  const jsonLd = useMemo(
    () =>
      [
        productSchema(product, { settings, url, reviews }),
        breadcrumbSchema(breadcrumbs, settings),
      ].filter(Boolean),
    [product, settings, url, reviews, breadcrumbs],
  );

  if (!product) return null;

  /* The description a shopper reads is the one a searcher should see, so the
     short description leads and the long one is the fallback. */
  const description = truncate(
    product.shortDescription || product.description || '',
    170,
  );

  const primaryImage = product.images?.[0];

  return (
    <SEOHead
      title={product.name}
      description={description}
      image={typeof primaryImage === 'string' ? primaryImage : primaryImage?.url}
      type="product"
      path={path}
      override={seo}
      jsonLd={jsonLd}
      /* An unpublished or archived product should never be indexed, whatever
         its own metadata says. */
      noindex={product.status ? product.status !== 'published' : false}
    />
  );
}
