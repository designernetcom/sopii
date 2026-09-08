import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnnouncementBar } from '../AnnouncementBar/AnnouncementBar';
import { Header } from '../Header/Header';
import { Footer } from '../Footer/Footer';
import { BottomNav } from '../MobileNav/BottomNav';
import { MobileMenu } from '../MobileNav/MobileMenu';
import { CartDrawer } from '../CartDrawer/CartDrawer';
import { SearchOverlay } from '../SearchOverlay/SearchOverlay';
import { QuickViewModal } from '../QuickView/QuickViewModal';
import { StructuredData } from '../SEO/StructuredData';
import { RouteSkeleton } from '../ui/PageSkeletons';
import { useSeoConfig } from '../../context/SeoContext';
import { organizationSchema, websiteSchema } from '../../lib/seo';

/** Resets scroll on navigation, but preserves it for back/forward. */
function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (window.history.scrollRestoration) {
      window.history.scrollRestoration = 'manual';
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [pathname, search]);

  return null;
}

export function Layout() {
  const { settings } = useSeoConfig();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Site-level graphs. Mounted here rather than on a page because they
          describe the business and the site, not any single route — emitting
          them per page would repeat the same two objects on every URL. */}
      <StructuredData id="ld-organization" schema={organizationSchema(settings)} />
      <StructuredData id="ld-website" schema={websiteSchema(settings)} />

      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <ScrollToTop />
      <AnnouncementBar />
      <Header />

      <main id="main" className="flex-1">
        {/*
          Every route below is a lazily loaded chunk, so this is where a
          shopper waits when they move between pages. The boundary sits here
          rather than around <Routes> so the header, footer and nav stay put
          and only the page area shimmers into the shape of what is coming.
        */}
        <Suspense fallback={<RouteSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      <Footer />

      {/* Global overlays — mounted once, driven by UIContext */}
      <BottomNav />
      <MobileMenu />
      <CartDrawer />
      <SearchOverlay />
      <QuickViewModal />
    </div>
  );
}
