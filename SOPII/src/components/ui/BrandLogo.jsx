import { cn } from '../../utils/cn';

/**
 * The SOPII wordmark.
 *
 * One component for the three places it appears — header, drawer, footer — so
 * the responsive sources and the intrinsic size are declared once instead of
 * being copied and drifting apart.
 *
 * The artwork is unchanged; what changed is how much of it a phone downloads.
 * The original is 1679px wide and 184 KB, for a slot that is 67px wide on a
 * 320px screen — roughly 180 KB spent to paint a thumbnail. The `srcset` below
 * lets the browser pick a 240px source (15 KB) on a phone and a 480px one on a
 * retina desktop, with the original PNG as the fallback for anything that
 * cannot read WebP.
 *
 * `width`/`height` are the *intrinsic* ratio, not the rendered size: they let
 * the browser reserve the right box before the file arrives. Without them the
 * wordmark pops in and shifts the header on every cold load, which is a
 * layout-shift penalty on the one element that appears on every page.
 */
export function BrandLogo({ name = 'SOPII', className, priority = false, ...rest }) {
  return (
    <picture>
      <source
        type="image/webp"
        srcSet="/final_logo-240.webp 240w, /final_logo-480.webp 480w"
        sizes="(min-width: 1024px) 160px, 100px"
      />
      <img
        src="/final_logo.png"
        srcSet="/final_logo-240.png 240w, /final_logo-480.png 480w, /final_logo.png 1679w"
        sizes="(min-width: 1024px) 160px, 100px"
        alt={`${name} logo`}
        width={1679}
        height={908}
        decoding={priority ? 'sync' : 'async'}
        loading={priority ? 'eager' : 'lazy'}
        {...(priority ? { fetchpriority: 'high' } : {})}
        className={cn('brand-logo w-auto max-w-full object-contain', className)}
        {...rest}
      />
    </picture>
  );
}
