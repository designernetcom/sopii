import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Image } from '../ui/Image';
import { photo } from '../../utils/images';
import { useCatalog } from '../../context/CatalogContext';
import { SectionHeading } from '../ui/SectionHeading';
import { Reveal } from '../ui/Reveal';

/** A single editorial category tile. */
export function CategoryCard({ category, large = false, priority = false }) {
  /* Used when the panel has no image for this category, and again if the one
     it points at cannot be loaded. */
  const art = photo({
    seed: category.seed,
    tags: category.tags,
    w: large ? 1000 : 700,
    h: large ? 1250 : 875,
  });

  return (
    <Link to={category.to} className="group relative block h-full overflow-hidden bg-sand ring-1 ring-black/5 transition-shadow duration-300 hover:shadow-[0_18px_44px_-28px_rgba(45,31,43,0.55)]">
      <Image
        src={category.image || art}
        fallbackSrc={art}
        alt={category.name}
        priority={priority}
        ratio={large ? 'aspect-[4/5] lg:aspect-auto' : 'aspect-[4/5]'}
        wrapperClassName={large ? 'lg:h-full' : undefined}
        sizes={large ? '(min-width: 1024px) 50vw, 100vw' : '(min-width: 1024px) 25vw, 50vw'}
        className="transition-transform duration-[1100ms] ease-silk group-hover:scale-[1.06]"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-[#1f1418]/80 via-[#1f1418]/18 to-transparent transition-opacity duration-500 group-hover:from-[#1f1418]/85" />

      <div className="absolute inset-x-0 bottom-0 p-5 text-cream sm:p-6">
        <div className="mb-2 inline-flex items-center gap-2 border border-white/20 bg-white/5 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.22em] text-cream/80 backdrop-blur-[2px]">
          Curated edit
        </div>
        <h3
          className={cn(
            'font-display leading-[0.95] text-cream',
            large ? 'text-2xl sm:text-3xl lg:text-4xl' : 'text-xl sm:text-2xl',
          )}
        >
          {category.name}
        </h3>
        <p className="mt-2 max-w-[22ch] text-[12px] leading-snug text-cream/80">
          {category.blurb}
        </p>

        <span className="mt-4 inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-cream">
          <span className="relative">
            Explore
            <span className="absolute -bottom-0.5 left-0 h-px w-full origin-right scale-x-0 bg-current transition-transform duration-300 ease-silk group-hover:origin-left group-hover:scale-x-100" />
          </span>
          <ArrowRight
            size={13}
            aria-hidden="true"
            className="transition-transform duration-300 ease-silk group-hover:translate-x-1"
          />
        </span>
      </div>
    </Link>
  );
}

/**
 * The home page "Shop by Category" section: one hero tile plus a grid.
 *
 * @param {number} [limit] How many tiles to show, as set on the panel's
 *                         Homepage screen. Six fills the layout exactly.
 */
export function CategoryGrid({ limit = 6 }) {
  /* The admin panel's top-level categories, in its own sort order. */
  const { categories } = useCatalog();
  const [featured, ...rest] = limit ? categories.slice(0, limit) : categories;

  if (!featured) return null;

  return (
    <section className="section">
      <div className="container-site">
        <SectionHeading
          eyebrow="Shop by Category"
          title="Find your next favourite"
          subtitle="Built around the way our customers actually dress."
        />

        {/* 3x3 on desktop: the featured tile occupies the top-left 2x2 block
            and the five remaining tiles fill the L-shaped gap exactly. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <Reveal className="col-span-2 lg:row-span-2">
            <CategoryCard category={featured} large priority />
          </Reveal>

          {rest.map((category, i) => (
            <Reveal key={category.slug} delay={80 * (i + 1)}>
              <CategoryCard category={category} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
