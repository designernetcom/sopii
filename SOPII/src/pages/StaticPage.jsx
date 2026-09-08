import { useParams } from 'react-router-dom';
import { getStaticPage } from '../data/pages';
import { photo } from '../utils/images';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { SEOHead } from '../components/SEO/SEOHead';
import { useSeoConfig } from '../context/SeoContext';
import { breadcrumbSchema } from '../lib/seo';
import { Accordion } from '../components/ui/Accordion';
import { Newsletter } from '../components/Newsletter/Newsletter';
import NotFound from './NotFound';

/** Renders every content page from a single data-driven template. */
export default function StaticPage() {
  const { slug } = useParams();
  const page = getStaticPage(slug);
  const { settings } = useSeoConfig();

  if (!page) return <NotFound />;

  const crumbs = [{ label: 'Home', to: '/' }, { label: page.title }];

  return (
    <div>
      {/* Copy comes from the page data; the panel's SEO Management row for
          this path overrides it when an admin has written one. */}
      <SEOHead
        path={`/pages/${slug}`}
        title={page.title}
        description={page.intro}
        type="article"
        jsonLd={breadcrumbSchema(crumbs, settings)}
      />

      {/* Header */}
      <header className="relative bg-charcoal">
        <img
          src={photo({ seed: page.seed, tags: page.tags, w: 1920, h: 640 })}
          alt=""
          aria-hidden="true"
          className="h-[30vh] min-h-[200px] w-full object-cover opacity-55 lg:h-[36vh]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/85 to-charcoal/30" />
        <div className="absolute inset-0 flex items-end">
          <div className="container-site pb-7 lg:pb-10">
            <p className="text-[10px] uppercase tracking-widest3 text-cream/70">{page.eyebrow}</p>
            <h1 className="mt-2.5 font-display text-[30px] leading-tight text-cream sm:text-4xl lg:text-[48px]">
              {page.title}
            </h1>
          </div>
        </div>
      </header>

      <div className="container-site py-6 lg:py-10">
        <Breadcrumbs items={crumbs} />

        <div className="mx-auto max-w-2xl py-8 lg:py-12">
          <p className="font-display text-xl leading-relaxed text-charcoal-soft sm:text-2xl">
            {page.intro}
          </p>

          {page.faq ? (
            <Accordion
              className="mt-10"
              allowMultiple
              defaultOpen={`faq-0`}
              items={page.sections.map((section, i) => ({
                id: `faq-${i}`,
                title: section.heading,
                content: <p>{section.body}</p>,
              }))}
            />
          ) : (
            <div className="mt-10 space-y-9">
              {page.sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="text-[12px] font-medium uppercase tracking-widest2 text-clay">
                    {section.heading}
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-charcoal-muted">
                    {section.body}
                  </p>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <Newsletter />
    </div>
  );
}
