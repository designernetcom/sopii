import { Fragment, useMemo } from 'react';
import { Hero } from '../components/Hero/Hero';
import { ProductCarousel } from '../components/ProductCarousel/ProductCarousel';
import { CollectionBanner } from '../components/CollectionBanner/CollectionBanner';
import { OccasionGrid } from '../components/OccasionGrid/OccasionGrid';
import { FeaturedCollection } from '../components/FeaturedCollection/FeaturedCollection';
import { InstagramSection } from '../components/InstagramSection/InstagramSection';
import { SocialRail } from '../components/SocialRail/SocialRail';
import { ReviewSection } from '../components/ReviewSection/ReviewSection';
import { TrustSection } from '../components/TrustSection/TrustSection';
import { useRecentlyViewed } from '../context/RecentlyViewedContext';
import { useCatalog } from '../context/CatalogContext';
import { SEOHead } from '../components/SEO/SEOHead';
import { useSiteSettings } from '../context/CatalogContext';

/** Sections an editorial banner may follow, in the order they are filled. */
const BANNER_SLOTS = ['new_arrivals', 'bestsellers', 'collections'];

/**
 * The home page is assembled from the admin panel's Homepage settings: which
 * sections are switched on, the order they appear in, and how many products
 * each rail carries. Re-order them there and this page re-orders with it.
 *
 * The panel's own titles are admin-facing labels ("Category tiles"), so they
 * are used as section eyebrows only — the editorial copy stays here, where it
 * was written.
 */
export default function Home() {
  const { getNewArrivals, getBestsellers, products, editorialBanners, homeSections } = useCatalog();
  const { brand: BRAND } = useSiteSettings();
  const { products: recentlyViewed } = useRecentlyViewed();

  const newArrivals = useMemo(() => getNewArrivals(24), [getNewArrivals]);
  const bestsellers = useMemo(() => getBestsellers(24), [getBestsellers]);
  const featured = useMemo(() => products.filter((product) => product.featured), [products]);

  /* Banners published in the panel drop in after the rails, in their own sort
     order. Matched to the sections that are actually switched on, so hiding a
     rail does not strand the banner that followed it. */
  const bannerFor = useMemo(() => {
    const map = new Map();
    homeSections
      .filter((section) => BANNER_SLOTS.includes(section.key))
      .forEach((section, index) => {
        if (editorialBanners[index]) map.set(section.key, editorialBanners[index]);
      });
    return map;
  }, [homeSections, editorialBanners]);

  const rail = (list, limit, props) =>
    list.length ? (
      <ProductCarousel {...props} products={limit ? list.slice(0, limit) : list} />
    ) : null;

  const banner = (key) => {
    const found = bannerFor.get(key);
    return found ? <CollectionBanner banner={found} /> : null;
  };

  const render = ({ key, title, limit }) => {
    switch (key) {
      case 'hero':
        return (
          <>
            <Hero />
            <TrustSection bordered={false} className="border-b border-beige bg-cream" />
          </>
        );

      // case 'categories':
      //   return <CategoryGrid limit={limit} />;

      case 'new_arrivals':
        return (
          <>
            {rail(newArrivals, limit, {
              eyebrow: title || 'New Arrivals',
              title: 'Fresh pieces. Just for you.',
              subtitle: 'The newest additions to the studio, in limited runs.',
              action: { label: 'View All', to: '/new-arrivals' },
              priorityFirst: true,
            })}
            {banner(key)}
          </>
        );

      case 'bestsellers':
        return (
          <>
            {rail(bestsellers, limit, {
              eyebrow: title || 'Bestsellers',
              title: 'The pieces everyone is loving.',
              subtitle: 'Reordered more than anything else in the collection.',
              action: { label: 'Shop Bestsellers', to: '/bestsellers' },
              className: 'bg-sand/40',
            })}
            {banner(key)}
          </>
        );

      case 'featured':
        return rail(featured, limit, {
          eyebrow: title || 'Featured',
          title: 'Hand-picked by the studio.',
          subtitle: 'The pieces we would reach for first.',
          action: { label: 'Shop All', to: '/shop' },
        });

      case 'collections':
        return (
          <>
            <OccasionGrid />
            <FeaturedCollection />
            {banner(key)}
          </>
        );

      // case 'reviews':
      //   return (
      //     <>
      //       {recentlyViewed.length >= 3 ? (
      //         <ProductCarousel
      //           eyebrow="Pick Up Where You Left Off"
      //           title="Recently viewed"
      //           products={recentlyViewed}
      //         />
      //       ) : null}
      //       <ReviewSection limit={limit} />
      //     </>
      //   );

      // case 'instagram':
      //   return <InstagramSection limit={limit} />;

      /* The newsletter block is site-wide — the footer renders it on every
         page, so the home page does not repeat it. */
      case 'newsletter':
        return null;

      default:
        return null;
    }
  };

  return (
    <div className="home-page">
      {/* The homepage's copy is written in the panel; nothing is hardcoded
          here beyond the route it lives at. */}
      <SEOHead path="/" type="website" />

      {/*
        The document's single h1. The hero's own headline is commented out in
        Hero.jsx, which left the homepage — the most important page on the site
        — with no h1 at all and its section titles starting at h2. This restores
        the heading hierarchy for crawlers and screen readers without putting
        anything new on screen.
      */}
      <h1 className="sr-only">
        {BRAND.name} — {BRAND.tagline}
      </h1>

      {/* Fixed to the left edge, so it is mounted here rather than inside a
          section — it belongs to the page, not to any band of it. */}
      <SocialRail />

      {homeSections.map((section) => (
        <Fragment key={section.key}>{render(section)}</Fragment>
      ))}
    </div>
  );
}
