import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { photo } from '../../utils/images';
import { Image } from '../ui/Image';
import { Reveal } from '../ui/Reveal';

/**
 * Asymmetric editorial banner dropped between product rails.
 * The copy card overlaps the image on desktop and stacks below it on mobile.
 */
export function CollectionBanner({ banner }) {
  const alignRight = banner.align === 'right';
  const art = photo({ seed: banner.seed, tags: banner.tags, w: 1400, h: 900 });

  return (
    <section className="section">
      <div className="container-site">
        <div className="relative lg:grid lg:grid-cols-12 lg:items-center">
          {/* Both children are pinned to row 1 so they overlap by one column.
              Without the explicit row the image would collide with the copy
              card's column and get pushed onto a second row. */}
          <Reveal
            className={cn(
              'lg:col-span-8 lg:row-start-1',
              alignRight ? 'lg:col-start-5' : 'lg:col-start-1',
            )}
          >
            <Image
              src={banner.image || art}
              fallbackSrc={art}
              alt={banner.title.replace(/\n/g, ' ')}
              ratio="aspect-[4/3] sm:aspect-[16/9] lg:aspect-[3/2]"
              sizes="(min-width: 1024px) 66vw, 100vw"
              className="transition-transform duration-[1200ms] ease-silk hover:scale-[1.03]"
            />
          </Reveal>

          <Reveal
            delay={140}
            className={cn(
              'relative z-10 -mt-10 mx-4 border border-[#eadcc8] bg-[#fffdfb] p-7 shadow-[0_24px_52px_-32px_rgba(28,26,23,0.5)]',
              'sm:mx-8 sm:p-10',
              'lg:col-span-5 lg:mx-0 lg:mt-0 lg:p-12',
              alignRight ? 'lg:col-start-1 lg:row-start-1' : 'lg:col-start-8 lg:row-start-1',
            )}
          >
            <p className="eyebrow">{banner.eyebrow}</p>

            <h2 className="mt-4 whitespace-pre-line font-display text-[26px] leading-[1.08] tracking-[-0.03em] text-[#6B2E5A] sm:text-[34px] lg:text-[40px]">
              {banner.title}
            </h2>

            <p className="mt-4 max-w-md text-sm leading-relaxed text-charcoal-muted">{banner.text}</p>

            <Link to={banner.to} className="btn-outline group mt-8">
              {banner.cta}
              <ArrowRight
                size={14}
                aria-hidden="true"
                className="transition-transform duration-300 ease-silk group-hover:translate-x-1"
              />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
