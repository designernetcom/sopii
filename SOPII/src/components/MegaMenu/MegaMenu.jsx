import { Link } from 'react-router-dom';
import { Image } from '../ui/Image';
import { MEGA_MENU_BANNER } from '../../data/navigation';

/**
 * Desktop mega panel. Rendered by Header inside the hovered/focused nav item,
 * so keyboard focus moving into the panel keeps it open naturally.
 *
 * The right third holds `MEGA_MENU_BANNER` — the image only, with none of the
 * eyebrow/title/arrow overlay the promo tile used to carry, and no link, so it
 * is decoration rather than a destination competing with the columns beside it.
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

        {MEGA_MENU_BANNER ? (
          <div className="col-span-4">
            {/* Decorative, so the alt is empty: the panel's links already say
                everything a screen reader needs from this menu, and "SOPII
                banner" would only be noise between them. */}
            <Image
              src={MEGA_MENU_BANNER}
              alt=""
              aria-hidden="true"
              preset="tile"
              ratio="aspect-[16/10]"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
