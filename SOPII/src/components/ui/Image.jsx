import { useState } from 'react';
import { cn } from '../../utils/cn';
import { cdnSrcSet, fallbackImage, IMAGE_SIZES, PLACEHOLDER_TONE } from '../../utils/images';

/**
 * Lazy, responsive image with a tinted box, a fade-in on decode and an
 * on-brand SVG fallback. Every product/editorial image in SOPII goes through
 * this so we never show a broken-image icon or a layout shift.
 *
 * RESPONSIVE DELIVERY
 * ---------------------------------------------------------------------------
 * Pass `preset` and the component builds a `srcset` and a matching `sizes`, so
 * a phone downloads a 300-pixel-wide file where a desktop downloads a 900. That
 * is the largest single saving available on a listing page: the same card that
 * costs ~120 KB at one fixed width costs ~30 KB at the width a phone actually
 * renders it, and it is the phone that is on the slow connection.
 *
 * `sizes` matters as much as `srcset`. Without it the browser assumes the image
 * fills the viewport and picks the *largest* candidate — which would make the
 * srcset worse than no srcset at all on mobile. `IMAGE_SIZES` holds the real
 * CSS widths for each layout; an explicit `sizes` prop still wins for a call
 * site that lays its images out differently.
 *
 * Non-Cloudinary sources (a `/media/...` path, a generated swatch) get no
 * srcset, because there is no resizing service behind them and four identical
 * URLs would only make the markup bigger.
 *
 * @param {string} [fallbackSrc] Shown if `src` fails to load. Defaults to a
 *   product swatch; editorial call sites pass the generated art they would
 *   have used anyway, so a photograph the panel points at but has not uploaded
 *   yet degrades to the right placeholder rather than a generic one.
 * @param {'card'|'detail'|'tile'|'bannerDesktop'|'bannerMobile'} [preset]
 *   Which width ladder to offer. Omit for images that are always one size.
 */
export function Image({
  src,
  alt,
  className,
  wrapperClassName,
  ratio = 'aspect-[4/5]',
  priority = false,
  preset,
  sizes,
  fallbackSrc,
  ...rest
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const srcSet = failed || !preset ? undefined : (cdnSrcSet(src, preset) ?? undefined);

  /* A srcset without sizes is worse than neither — see the note above. */
  const resolvedSizes =
    sizes ??
    (srcSet
      ? IMAGE_SIZES[preset === 'bannerDesktop' || preset === 'bannerMobile' ? 'banner' : preset]
      : undefined);

  return (
    <div
      className={cn('relative overflow-hidden', ratio, wrapperClassName)}
      style={{ backgroundColor: PLACEHOLDER_TONE }}
    >
      <img
        src={failed ? fallbackSrc || fallbackImage(alt) : src}
        srcSet={srcSet}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : undefined}
        sizes={resolvedSizes}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          setLoaded(true);
        }}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-700 ease-silk',
          loaded ? 'opacity-100' : 'opacity-0',
          className,
        )}
        {...rest}
      />
    </div>
  );
}
