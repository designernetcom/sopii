import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { ProductCard } from '../ProductCard/ProductCard';
import { SectionHeading } from '../ui/SectionHeading';

/**
 * Horizontal product rail.
 * Uses native scroll-snap rather than a carousel library — it keeps touch
 * momentum, keyboard scrolling and screen-reader order working for free.
 */
export function ProductCarousel({
  products = [],
  eyebrow,
  title,
  subtitle,
  action,
  priorityFirst = false,
  className,
}) {
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows, products.length]);

  const scrollBy = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    // Advance by roughly one card, so the rail never jumps a whole page.
    const card = el.querySelector('[data-carousel-item]');
    const step = card ? card.getBoundingClientRect().width + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: direction * step * (window.innerWidth >= 1024 ? 2 : 1), behavior: 'smooth' });
  };

  if (products.length === 0) return null;

  return (
    <section className={cn('section', className)}>
      <div className="container-site">
        <div className="relative">
          <SectionHeading
            eyebrow={eyebrow}
            title={title}
            subtitle={subtitle}
            action={action}
            className="pr-0 lg:pr-24"
          />

          {/* Arrows sit level with the heading on desktop */}
          <div className="absolute right-0 top-0 hidden gap-2 lg:flex">
            <CarouselArrow
              direction="left"
              disabled={atStart}
              onClick={() => scrollBy(-1)}
            />
            <CarouselArrow direction="right" disabled={atEnd} onClick={() => scrollBy(1)} />
          </div>
        </div>
      </div>

      {/* Full-bleed track that still aligns to the container on the left */}
      <div
        ref={trackRef}
        className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 sm:gap-5 sm:px-6 lg:px-8 xl:px-10"
        style={{ scrollPaddingLeft: '1rem' }}
      >
        {/* Spacer keeps the first card aligned with the container gutter */}
        <div aria-hidden="true" className="hidden shrink-0 lg:block" style={{ width: 'max(0px, calc((100vw - 1440px) / 2))' }} />

        {products.map((product, i) => (
          <div
            key={product.id}
            data-carousel-item
            className="w-[62vw] shrink-0 snap-start sm:w-[38vw] md:w-[30vw] lg:w-[23vw] xl:w-[calc((1440px-5rem-4*1.25rem)/4.5)]"
          >
            <ProductCard product={product} priority={priorityFirst && i < 2} />
          </div>
        ))}

        <div aria-hidden="true" className="w-1 shrink-0" />
      </div>
    </section>
  );
}

function CarouselArrow({ direction, disabled, onClick }) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'left' ? 'Scroll left' : 'Scroll right'}
      className="grid h-10 w-10 place-items-center border border-beige text-charcoal transition-all duration-300 hover:border-charcoal hover:bg-charcoal hover:text-cream disabled:cursor-not-allowed disabled:border-beige disabled:text-charcoal-faint disabled:hover:bg-transparent"
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
