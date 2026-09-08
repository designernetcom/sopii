import { Link } from 'react-router-dom';
import { useCatalog } from '../context/CatalogContext';
import { SEOHead } from '../components/SEO/SEOHead';

export default function NotFound() {
  const { categories } = useCatalog();

  return (
    <div className="container-site flex flex-col items-center py-20 text-center lg:py-32">
      {/* A 404 must never be indexed. This is a client-rendered app, so the
          HTTP status is still 200 — see docs/SEO.md for the host rule that
          makes unknown paths return a real 404. */}
      <SEOHead
        path="/404"
        title="Page Not Found"
        description="The page you were looking for is not here. Browse the collection instead."
        noindex
      />

      <p className="font-display text-[72px] leading-none text-beige sm:text-[110px]">404</p>

      <h1 className="mt-4 font-display text-3xl sm:text-4xl">This page has wandered off</h1>

      <p className="mt-4 max-w-md text-sm text-charcoal-muted">
        The link may be out of date, or the piece you were looking for may have sold out. Try one
        of these instead.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to="/" className="btn-primary">
          Back to Home
        </Link>
        <Link to="/shop" className="btn-outline">
          Shop All
        </Link>
      </div>

      <nav aria-label="Popular categories" className="mt-14 w-full max-w-lg border-t border-beige pt-8">
        <p className="eyebrow mb-4">Popular Categories</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                to={category.to}
                className="inline-block border border-beige px-3.5 py-2 text-[12px] text-charcoal-soft transition-colors hover:border-charcoal hover:text-charcoal"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
