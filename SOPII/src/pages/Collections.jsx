import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useCatalog } from '../context/CatalogContext';
import { photo } from '../utils/images';
import { Image } from '../components/ui/Image';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { SEOHead } from '../components/SEO/SEOHead';
import { Reveal } from '../components/ui/Reveal';
import { useSeoConfig } from '../context/SeoContext';
import { breadcrumbSchema } from '../lib/seo';

const CRUMBS = [{ label: 'Home', to: '/' }, { label: 'Collections' }];

/** The tile art used when a collection has no banner, and if one fails. */
const collectionArt = (collection) =>
  photo({ seed: collection.seed, tags: collection.tags, w: 1000, h: 750 });

export default function Collections() {
  const { collections, getCollectionProducts } = useCatalog();
  const { settings } = useSeoConfig();

  return (
    <div className="collection-page container-site py-6 lg:py-10">
      <SEOHead
        path="/collections"
        title="Collections"
        description="Curated SOPII collections, grouped by story, season and the looms they came from."
        jsonLd={breadcrumbSchema(CRUMBS, settings)}
      />

      <Breadcrumbs items={CRUMBS} />

      <header className="mt-5 border-b border-beige pb-6 lg:pb-8">
        <h1 className="font-display text-3xl sm:text-4xl lg:text-[46px] text-[#6B2E5A]">Collections</h1>
        <p className="mt-3 max-w-2xl text-sm text-charcoal-muted sm:text-base">
          {collections.length} edits, each built around a fabric, an occasion or a way of
          dressing.
        </p>
      </header>

      <ul className="grid gap-4 py-8 sm:grid-cols-2 lg:gap-6">
        {collections.map((collection, i) => {
          const count = getCollectionProducts(collection).length;

          return (
            <li key={collection.slug}>
              <Reveal delay={(i % 2) * 90}>
                <Link
                  to={`/collections/${collection.slug}`}
                  className="group relative block overflow-hidden bg-sand"
                >
                  <Image
                    src={collection.banner || collectionArt(collection)}
                    fallbackSrc={collectionArt(collection)}
                    alt={collection.name}
                    ratio="aspect-[4/3]"
                    priority={i < 2}
                    sizes="(min-width: 640px) 50vw, 100vw"
                    className="transition-transform duration-[1100ms] ease-silk group-hover:scale-[1.05]"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-charcoal/25 to-transparent" />

                  <div className="absolute inset-x-0 bottom-0 p-6 text-cream sm:p-8">
                    <p className="text-[10px] uppercase tracking-widest2 text-cream/70">
                      {collection.eyebrow} · {count} pieces
                    </p>

                    <h2 className="mt-2 font-display text-2xl leading-tight sm:text-3xl">
                      {collection.name}
                    </h2>

                    <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-cream/75">
                      {collection.blurb}
                    </p>

                    <span className="mt-4 inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest2">
                      Explore
                      <ArrowRight
                        size={13}
                        aria-hidden="true"
                        className="transition-transform duration-300 ease-silk group-hover:translate-x-1"
                      />
                    </span>
                  </div>
                </Link>
              </Reveal>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
