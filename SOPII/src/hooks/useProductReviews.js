import { useEffect, useState } from 'react';
import { fetchProductReviews } from '../services/api';
import { adaptProductReviews } from '../services/adapters';
import { getProductReviews, getRatingBreakdown } from '../data/reviews';

/**
 * Reviews for one product.
 *
 * Approved reviews come from the admin panel — moderate one there and it
 * appears here. Until that request resolves (or if it fails, or if the product
 * genuinely has none yet) the bundled generator stands in, so the PDP never
 * renders an empty reviews section.
 */
export function useProductReviews(product) {
  const [state, setState] = useState(() => fallbackFor(product));

  useEffect(() => {
    if (!product) return undefined;

    setState(fallbackFor(product));
    const controller = new AbortController();

    fetchProductReviews(product.id, { signal: controller.signal })
      .then((payload) => {
        if (!payload.items?.length) return;
        setState({
          reviews: adaptProductReviews(payload.items),
          breakdown: payload.breakdown,
          total: payload.total,
          average: payload.average || product.rating,
          source: 'api',
        });
      })
      .catch(() => {
        // Keep the fallback that is already in state.
      });

    return () => controller.abort();
  }, [product]);

  return state;
}

function fallbackFor(product) {
  return {
    reviews: getProductReviews(product),
    breakdown: getRatingBreakdown(product),
    total: product?.reviews ?? 0,
    average: product?.rating ?? 0,
    source: 'fallback',
  };
}
