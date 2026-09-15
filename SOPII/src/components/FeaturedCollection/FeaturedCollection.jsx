import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Image } from '../ui/Image';
import { Reveal } from '../ui/Reveal';
import { useCatalog } from '../../context/CatalogContext';

/**
 * The split image/content section ("SOPII Signature").
 * Image left, content right on desktop; stacked on mobile.
 *
 * Every word and the photograph come from the admin panel (Homepage → Featured
 * Collection), through `adaptFeaturedCollection`. Where the section sits on the
 * page is the panel's Page Sections order, applied in `pages/Home.jsx`.
 *
 * Loading needs nothing here: `CatalogGate` holds the page until the catalogue
 * is in. Switched off in the panel, or with no usable copy, it renders nothing;
 * each optional part (description, pillars, button) is left out on its own
 * rather than leaving an empty box.
 */
export function FeaturedCollection() {
  const { featuredCollection: section } = useCatalog();
  if (!section) return null;

  const { eyebrow, headingLines, description, image, fallbackImage, imageAlt, pillars, cta } = section;

  const arrow = (
    <ArrowRight
      size={14}
      aria-hidden="true"
      className="transition-transform duration-300 ease-silk group-hover:translate-x-1"
    />
  );

  return (
    <section className="section" aria-labelledby="signature-heading">
      <div className="container-site">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div className="relative">
              <div className="absolute -left-4 top-6 hidden h-20 w-20 border border-gold/70 lg:block" aria-hidden="true" />
              {/* Keyed by URL: a new photograph from a live refresh starts fresh
                  rather than inheriting the previous one's loaded/failed state. */}
              <Image
                key={image}
                src={image}
                alt={imageAlt}
                ratio="aspect-[4/5]"
                preset="detail"
                sizes="(min-width: 1024px) 50vw, 100vw"
                fallbackSrc={fallbackImage}
                className="shadow-[0_28px_60px_-32px_rgba(45,31,43,0.45)]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-4 -right-4 hidden h-32 w-32 border border-gold/60 lg:block"
              />
            </div>
          </Reveal>

          <Reveal delay={120} className="lg:pl-4">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}

            <h2 id="signature-heading" className="mt-4 max-w-xl font-display text-[30px] leading-[1.04] tracking-[-0.04em] text-brand sm:text-4xl lg:text-[46px]">
              {headingLines.map((line, index) => (
                <Fragment key={index}>
                  {index > 0 ? <br /> : null}
                  {line}
                </Fragment>
              ))}
            </h2>

            {description ? (
              <p className="mt-5 max-w-md text-sm leading-relaxed text-charcoal-muted sm:text-base">
                {description}
              </p>
            ) : null}

            {pillars.length ? (
              <ul className="mt-8 space-y-5 border-t border-beige pt-8">
                {pillars.map((pillar) => (
                  <li key={pillar.id} className="flex gap-5">
                    <span className="font-display text-lg text-gold">{pillar.number}</span>
                    <div>
                      <h3 className="text-[13px] font-medium uppercase tracking-widest2">
                        {pillar.title}
                      </h3>
                      {pillar.text ? (
                        <p className="mt-1 text-sm text-charcoal-muted">{pillar.text}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {cta ? (
              cta.external ? (
                <a
                  href={cta.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary group mt-9"
                >
                  {cta.label}
                  {arrow}
                </a>
              ) : (
                <Link to={cta.to} className="btn-primary group mt-9">
                  {cta.label}
                  {arrow}
                </Link>
              )
            ) : null}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
