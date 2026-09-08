import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import { useCatalog } from '../../context/CatalogContext';
import { Rating } from '../ui/Rating';

/**
 * Testimonial rail. Same scroll-snap approach as the product carousel.
 *
 * @param {number} [limit] How many to show, as set on the panel's Homepage screen.
 */
export function ReviewSection({ limit = 0 }) {
  /* Reviews approved in the admin panel, newest and most helpful first. */
  const { testimonials } = useCatalog();
  const TESTIMONIALS = limit ? testimonials.slice(0, limit) : testimonials;
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = trackRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const scrollBy = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: 'smooth' });
  };

  return (
    <section className="section bg-charcoal text-cream" aria-labelledby="reviews-heading">
      <div className="container-site">
        <div className="relative">
          <div className="mb-8 sm:mb-10">
            <p className="eyebrow text-gold">What Our Customers Say</p>
            <h2 id="reviews-heading" className="mt-3 font-display text-[26px] text-cream sm:text-4xl">
              Over 40,000 pieces, shipped and worn.
            </h2>
          </div>

          <div className="absolute right-0 top-0 hidden gap-2 sm:flex">
            <ReviewArrow direction="left" disabled={atStart} onClick={() => scrollBy(-1)} />
            <ReviewArrow direction="right" disabled={atEnd} onClick={() => scrollBy(1)} />
          </div>
        </div>
      </div>

      <div
        ref={trackRef}
        className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 sm:gap-6 sm:px-6 lg:px-8 xl:px-10"
      >
        {TESTIMONIALS.map((review) => (
          <figure
            key={review.id}
            className="flex w-[82vw] shrink-0 snap-start flex-col border border-cream/15 p-6 sm:w-[46vw] sm:p-8 lg:w-[30vw] xl:w-[420px]"
          >
            <Quote size={22} className="mb-4 text-gold" strokeWidth={1.25} aria-hidden="true" />

            <Rating value={review.rating} size={13} className="mb-4" />

            <h3 className="font-display text-lg text-cream">{review.title}</h3>

            <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-cream/70">
              {review.body}
            </blockquote>

            <figcaption className="mt-6 border-t border-cream/15 pt-4">
              <p className="text-[12px] font-medium text-cream">{review.author}</p>
              <p className="mt-0.5 text-[11px] text-cream/50">
                {[review.location, review.product].filter(Boolean).join(' · ')}
              </p>
            </figcaption>
          </figure>
        ))}
        <div aria-hidden="true" className="w-1 shrink-0" />
      </div>
    </section>
  );
}

function ReviewArrow({ direction, disabled, onClick }) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'left' ? 'Previous reviews' : 'Next reviews'}
      className="grid h-10 w-10 place-items-center border border-cream/25 text-cream transition-all duration-300 hover:border-cream hover:bg-cream hover:text-charcoal disabled:cursor-not-allowed disabled:border-cream/10 disabled:text-cream/25 disabled:hover:bg-transparent disabled:hover:text-cream/25"
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
