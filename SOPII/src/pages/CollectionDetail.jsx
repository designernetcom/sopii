import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCatalog } from '../context/CatalogContext';
import { sortProducts, SORT_OPTIONS } from '../utils/filters';
import { photo } from '../utils/images';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { ProductTileSkeletons } from '../components/ui/PageSkeletons';
import { CategorySEO } from '../components/SEO/CategorySEO';
import { TrustSection } from '../components/TrustSection/TrustSection';
import NotFound from './NotFound';

/** The header art behind a collection with no banner, or one that fails. */
const headerArt = (collection) =>
  photo({ seed: collection.seed, tags: collection.tags, w: 1920, h: 900 });

export default function CollectionDetail() {
  const { slug } = useParams();
  const { getCollection, getCollectionProducts, catalogComplete } = useCatalog();
  const collection = getCollection(slug);
  const [sort, setSort] = useState('recommended');

  const products = useMemo(
    () => (collection ? sortProducts(getCollectionProducts(collection), sort) : []),
    [collection, getCollectionProducts, sort],
  );

  if (!collection) return <NotFound />;

  const crumbs = [
    { label: 'Home', to: '/' },
    { label: 'Collections', to: '/collections' },
    { label: collection.name },
  ];

  return (
    <div>
      <CategorySEO
        record={collection}
        title={collection.name}
        description={collection.blurb}
        image={collection.banner}
        path={`/collections/${collection.slug || slug}`}
        products={products}
        breadcrumbs={crumbs}
        /* Sorting reorders the same pieces; it is not a second page. */
        filtered={sort !== 'recommended'}
      />

      {/* Editorial header */}
      <header className="relative bg-charcoal">
        <img
          src={collection.banner || headerArt(collection)}
          onError={(e) => {
            const art = headerArt(collection);
            if (e.currentTarget.src !== art) e.currentTarget.src = art;
          }}
          alt=""
          aria-hidden="true"
          className="h-[46vh] min-h-[300px] w-full object-cover opacity-70 lg:h-[56vh]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/85 via-charcoal/40 to-charcoal/20" />

        <div className="absolute inset-0 flex items-end">
          <div className="container-site pb-8 lg:pb-12">
            <p className="text-[10px] uppercase tracking-widest3 text-cream/70">
              {collection.eyebrow}
            </p>
            <h1 className="mt-3 whitespace-pre-line font-display text-[30px] leading-tight text-cream sm:text-5xl lg:text-[56px]">
              {collection.headline}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-cream/80 sm:text-base">
              {collection.blurb}
            </p>
          </div>
        </div>
      </header>

      <div className="container-site py-6 lg:py-10">
        <Breadcrumbs items={crumbs} />

        <div className="mt-6 flex items-center justify-between gap-4 border-b border-beige pb-4">
          <p className="text-[12px] text-charcoal-muted">
            {products.length} {products.length === 1 ? 'piece' : 'pieces'}
          </p>

          <div className="flex items-center gap-2">
            <label
              htmlFor="collection-sort"
              className="hidden text-[11px] uppercase tracking-widest2 text-charcoal-muted sm:block"
            >
              Sort
            </label>
            <select
              id="collection-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="border border-beige bg-cream px-3 py-2.5 text-[11px] uppercase tracking-widest2 outline-none focus:border-charcoal"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-x-3 gap-y-8 py-8 sm:gap-x-4 md:grid-cols-3 lg:gap-x-5 lg:gap-y-10 xl:grid-cols-4">
          {products.map((product, i) => (
            <li key={product.id}>
              <ProductCard product={product} priority={i < 4} />
            </li>
          ))}

          {/* More of the edit may still be arriving with the catalogue. */}
          {!catalogComplete ? <ProductTileSkeletons count={4} /> : null}
        </ul>
      </div>

      <TrustSection />
    </div>
  );
}
