import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Image } from '../ui/Image';
import { photo } from '../../utils/images';

/**
 * Desktop mega panel. Rendered by Header inside the hovered/focused nav item,
 * so keyboard focus moving into the panel keeps it open naturally.
 */
export function MegaMenu({ item, onNavigate }) {
  if (!item.columns) return null;

  return (
    <div className="absolute inset-x-0 top-full border-t border-beige bg-cream shadow-[0_18px_40px_-24px_rgba(28,26,23,0.35)]">
      <div className="container-site grid grid-cols-12 gap-8 py-10 xl:gap-12">
        <div className="col-span-8 grid grid-cols-3 gap-8 xl:col-span-8">
          {item.columns.map((col) => (
            <div key={col.title}>
              <p className="eyebrow mb-4">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      onClick={onNavigate}
                      className="text-[13px] text-charcoal-soft transition-colors duration-200 hover:text-clay"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {item.feature ? (
          <Link
            to={item.feature.to}
            onClick={onNavigate}
            className="group col-span-4 block"
          >
            <div className="relative overflow-hidden">
              <Image
                src={
                  item.feature.image ||
                  photo({ seed: item.feature.seed, tags: item.feature.tags, w: 640, h: 420 })
                }
                alt={item.feature.title}
                ratio="aspect-[16/10]"
                className="transition-transform duration-[900ms] ease-silk group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/70 via-charcoal/10 to-transparent" />
              <div className="absolute inset-x-5 bottom-4 text-cream">
                <p className="text-[10px] uppercase tracking-widest2 text-cream/75">
                  {item.feature.eyebrow}
                </p>
                <p className="mt-1 flex items-center gap-2 font-display text-lg leading-snug">
                  {item.feature.title}
                  <ArrowRight
                    size={15}
                    aria-hidden="true"
                    className="shrink-0 transition-transform duration-300 ease-silk group-hover:translate-x-1"
                  />
                </p>
              </div>
            </div>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
