import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Image } from '../ui/Image';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';

/**
 * Product image gallery.
 * Desktop: thumbnail rail + hover-to-zoom on the main image.
 * Mobile: a swipeable scroll-snap strip with dot indicators.
 * Both open the same full-screen lightbox.
 *
 * `thumbnails` is the same photographs at rail size. The rail renders them
 * 80 px wide, so reusing the 1200 px detail crop would download roughly two
 * hundred times the pixels it shows — for a five-image gallery, before the
 * shopper has looked at anything. Falls back to `images` for a catalogue that
 * has not been migrated to the CDN yet.
 */
export function ProductGallery({ images = [], thumbnails, alt, badge }) {
  const rail = thumbnails?.length === images.length ? thumbnails : images;
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const [lightbox, setLightbox] = useState(false);
  const stripRef = useRef(null);

  useLockBodyScroll(lightbox);

  // Reset when the product changes.
  useEffect(() => setIndex(0), [images]);

  // Keyboard navigation inside the lightbox.
  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % images.length);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, images.length]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
  };

  /** Keeps the dot indicator in sync with the mobile swipe strip. */
  const handleStripScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (images.length === 0) return null;

  return (
    <>
      {/* ------------------------------- Mobile ------------------------------ */}
      <div className="lg:hidden">
        <div className="relative">
          <div
            ref={stripRef}
            onScroll={handleStripScroll}
            className="hide-scrollbar flex snap-x snap-mandatory overflow-x-auto"
          >
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => {
                  setIndex(i);
                  setLightbox(true);
                }}
                className="w-full shrink-0 snap-center"
                aria-label={`View image ${i + 1} full screen`}
              >
                <Image
                  src={src}
                  alt={`${alt} — view ${i + 1}`}
                  ratio="aspect-[4/5]"
                  priority={i === 0}
                  /* The product page's hero image, and usually its LCP element. */
                  preset="detail"
                />
              </button>
            ))}
          </div>

          {badge ? <div className="pointer-events-none absolute left-4 top-4">{badge}</div> : null}

          <span className="pointer-events-none absolute bottom-3 right-3 bg-charcoal/70 px-2 py-1 text-[10px] text-cream">
            {index + 1} / {images.length}
          </span>
        </div>

        {/* `-mt-1` absorbs the padding the taller hit areas add, so the rail
            sits where it always did. */}
        <div className="-mt-1 flex justify-center" role="tablist" aria-label="Product images">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Image ${i + 1}`}
              onClick={() => {
                stripRef.current?.scrollTo({ left: i * stripRef.current.clientWidth, behavior: 'smooth' });
              }}
              /* The indicator is 4px tall; the control around it is 44px.
                 A 4px tap target is not a control, it is a decoration. */
              className="grid h-11 place-items-center px-1.5"
            >
              <span
                className={cn(
                  'block h-1 transition-all duration-300',
                  i === index ? 'w-6 bg-charcoal' : 'w-3 bg-beige',
                )}
              />
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------ Desktop ------------------------------ */}
      <div className="hidden gap-4 lg:flex">
        {/* Thumbnails */}
        <div className="flex w-20 shrink-0 flex-col gap-3" role="tablist" aria-label="Product images">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              className={cn(
                'overflow-hidden border transition-all duration-200',
                i === index ? 'border-charcoal' : 'border-transparent opacity-65 hover:opacity-100',
              )}
            >
              <Image
                src={rail[i]}
                alt={`${alt} — thumbnail ${i + 1}`}
                ratio="aspect-[4/5]"
                preset="tile"
                sizes="120px"
              />
            </button>
          ))}
        </div>

        {/* Main image with hover zoom */}
        <div className="relative flex-1">
          <div
            className="group relative cursor-zoom-in overflow-hidden bg-sand"
            onMouseEnter={() => setZoomed(true)}
            onMouseLeave={() => setZoomed(false)}
            onMouseMove={handleMouseMove}
            onClick={() => setLightbox(true)}
            role="presentation"
          >
            <Image
              src={images[index]}
              alt={`${alt} — view ${index + 1}`}
              ratio="aspect-[4/5]"
              priority
              sizes="(min-width: 1024px) 45vw, 100vw"
              className={cn(
                'transition-transform duration-300 ease-out motion-reduce:transform-none',
                zoomed ? 'scale-[1.75]' : 'scale-100',
              )}
              style={{ transformOrigin: origin }}
            />

            {badge ? <div className="pointer-events-none absolute left-4 top-4">{badge}</div> : null}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(true);
              }}
              aria-label="Open full screen viewer"
              className="absolute bottom-4 right-4 grid h-10 w-10 place-items-center bg-cream/90 text-charcoal opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            >
              <Expand size={16} aria-hidden="true" />
            </button>
          </div>

          <p className="mt-2 text-center text-[11px] text-charcoal-faint">
            Hover to zoom · Click to expand
          </p>
        </div>
      </div>

      {/* ------------------------------ Lightbox ----------------------------- */}
      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} image viewer`}
          className="fixed inset-0 z-[75] flex flex-col bg-charcoal/95 animate-fade-in"
        >
          <div className="flex items-center justify-between px-5 py-4 text-cream">
            <span className="text-[11px] uppercase tracking-widest2">
              {index + 1} / {images.length}
            </span>
            <button
              type="button"
              onClick={() => setLightbox(false)}
              aria-label="Close viewer"
              autoFocus
              className="grid h-10 w-10 place-items-center text-cream/70 transition-colors hover:text-cream"
            >
              <X size={22} aria-hidden="true" />
            </button>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-8">
            <img
              src={images[index]}
              alt={`${alt} — view ${index + 1}`}
              className="max-h-full max-w-full animate-scale-in object-contain"
            />

            {images.length > 1 ? (
              <>
                <LightboxArrow
                  direction="left"
                  onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
                />
                <LightboxArrow
                  direction="right"
                  onClick={() => setIndex((i) => (i + 1) % images.length)}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function LightboxArrow({ direction, onClick }) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'left' ? 'Previous image' : 'Next image'}
      className={cn(
        'absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center border border-cream/25 text-cream transition-colors hover:bg-cream hover:text-charcoal',
        direction === 'left' ? 'left-3 sm:left-6' : 'right-3 sm:right-6',
      )}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}
