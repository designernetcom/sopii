import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Image } from '../ui/Image';
import { Reveal } from '../ui/Reveal';

const PILLARS = [
  { n: '01', title: 'Woven by hand', text: 'Eleven weaving clusters across five states.' },
  { n: '02', title: 'Natural fibres', text: 'Cotton, silk and linen. Nothing synthetic.' },
  { n: '03', title: 'Made to last', text: 'Cut and finished to survive a decade of wear.' },
];

/**
 * SOPII Signature — the split image/content section.
 * Image left, content right on desktop; stacked on mobile.
 */
export function FeaturedCollection() {
  return (
    <section className="section" aria-labelledby="signature-heading">
      <div className="container-site">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div className="relative">
              <div className="absolute -left-4 top-6 hidden h-20 w-20 border border-gold/70 lg:block" aria-hidden="true" />
              <Image
                src="/media/products/saree-04.jpg"
                alt="A model wearing a piece from the SOPII Signature collection"
                ratio="aspect-[4/5]"
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="shadow-[0_28px_60px_-32px_rgba(45,31,43,0.45)]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-4 -right-4 hidden h-32 w-32 border border-gold/60 lg:block"
              />
            </div>
          </Reveal>

          <Reveal delay={120} className="lg:pl-4">
            <p className="eyebrow">SOPII Signature</p>

            <h2 id="signature-heading" className="mt-4 max-w-xl font-display text-[30px] leading-[1.04] tracking-[-0.04em] text-[#6B2E5A] sm:text-4xl lg:text-[46px]">
              Timeless silhouettes.
              <br />
              Contemporary craftsmanship.
            </h2>

            <p className="mt-5 max-w-md text-sm leading-relaxed text-charcoal-muted sm:text-base">
              Our Signature pieces are the ones we refine season after season rather than
              replace. Each begins on a loom with a weaver we know by name, and ends in a cut
              designed for how women actually move through an Indian day.
            </p>

            <ul className="mt-8 space-y-5 border-t border-beige pt-8">
              {PILLARS.map((pillar) => (
                <li key={pillar.n} className="flex gap-5">
                  <span className="font-display text-lg text-gold">{pillar.n}</span>
                  <div>
                    <h3 className="text-[13px] font-medium uppercase tracking-widest2">
                      {pillar.title}
                    </h3>
                    <p className="mt-1 text-sm text-charcoal-muted">{pillar.text}</p>
                  </div>
                </li>
              ))}
            </ul>

            <Link to="/collections/sopii-signature" className="btn-primary group mt-9">
              Explore Signature
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
