import { Link } from 'react-router-dom';
import { photo } from '../../utils/images';
import { OCCASIONS } from '../../data/site';
import { Image } from '../ui/Image';
import { SectionHeading } from '../ui/SectionHeading';
import { Reveal } from '../ui/Reveal';

/** "Shop by Occasion" — six compact tiles that map onto the shop's occasion filter. */
export function OccasionGrid() {
  return (
    <section className="section bg-sand/40">
      <div className="container-site">
        <SectionHeading
          eyebrow="Shop by Occasion"
          title="Dressed for the day ahead"
          subtitle="From a Monday commute to a week of weddings."
          align="center"
        />

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {OCCASIONS.map((occasion, i) => (
            <li key={occasion.slug}>
              <Reveal delay={i * 60}>
                <Link
                  to={`/shop?occasion=${encodeURIComponent(occasion.name)}`}
                  className="group block text-center"
                >
                  <div className="overflow-hidden rounded-full">
                    <Image
                      src={occasion.image || photo({ seed: occasion.seed, tags: occasion.tags, w: 400, h: 400 })}
                      alt={occasion.name}
                      ratio="aspect-square"
                      sizes="(min-width: 1024px) 15vw, 40vw"
                      className="transition-transform duration-[900ms] ease-silk group-hover:scale-110"
                    />
                  </div>
                  <p className="mt-3 text-[11px] font-medium uppercase tracking-widest2 text-charcoal transition-colors group-hover:text-clay">
                    {occasion.name}
                  </p>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
