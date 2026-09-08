import { Instagram } from 'lucide-react';
import { photo } from '../../utils/images';
import { INSTAGRAM_POSTS } from '../../data/site';
import { useSiteSettings } from '../../context/CatalogContext';
import { Image } from '../ui/Image';
import { Reveal } from '../ui/Reveal';

/**
 * Social proof grid. Links out to the brand profile rather than a fake feed.
 *
 * @param {number} [limit] How many tiles to show, as set on the panel's
 *                         Homepage screen. Six fills the row on desktop.
 */
export function InstagramSection({ limit = 6 }) {
  const { brand: BRAND } = useSiteSettings();
  const posts = limit ? INSTAGRAM_POSTS.slice(0, limit) : INSTAGRAM_POSTS;
  return (
    <section className="section" aria-labelledby="instagram-heading">
      <div className="container-site">
        <div className="mb-8 text-center sm:mb-10">
          <p className="eyebrow">{BRAND.handle}</p>
          <h2 id="instagram-heading" className="mt-3 section-title">
            Styled by you.
            <br className="sm:hidden" /> Loved by everyone.
          </h2>
          <p className="section-sub mx-auto">
            Tag {BRAND.handle} to be featured in our next edit.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
          {posts.map((post, i) => (
            <li key={post.id}>
              <Reveal delay={i * 50}>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group relative block overflow-hidden"
                  aria-label={`Open Instagram: ${post.caption}`}
                >
                  <Image
                    src={photo({ seed: post.seed, tags: post.tags, w: 500, h: 500 })}
                    alt={post.caption}
                    ratio="aspect-square"
                    sizes="(min-width: 1024px) 16vw, 45vw"
                    className="transition-transform duration-[900ms] ease-silk group-hover:scale-110"
                  />

                  <span className="absolute inset-0 grid place-items-center bg-charcoal/0 opacity-0 transition-all duration-300 ease-silk group-hover:bg-charcoal/45 group-hover:opacity-100">
                    <Instagram size={22} className="text-cream" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                </a>
              </Reveal>
            </li>
          ))}
        </ul>

        <div className="mt-9 text-center">
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noreferrer noopener"
            className="btn-outline"
          >
            <Instagram size={14} aria-hidden="true" />
            Follow Us
          </a>
        </div>
      </div>
    </section>
  );
}
