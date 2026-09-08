import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Heart, LogOut, Search, User, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useCatalog, useSiteSettings } from '../../context/CatalogContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { useWishlist } from '../../context/WishlistContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { BrandLogo } from '../ui/BrandLogo';

/** Full-height slide-in navigation for tablet and mobile. */
export function MobileMenu() {
  const { brand: BRAND } = useSiteSettings();
  const { navigation: NAV_ITEMS } = useCatalog();
  const { isMenuOpen, close, openSearch } = useUI();
  const { user, isAuthenticated, logout } = useAuth();
  const { count: wishlistCount } = useWishlist();
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const [expanded, setExpanded] = useState(null);

  useLockBodyScroll(isMenuOpen);
  useFocusTrap(panelRef, isMenuOpen);

  if (!isMenuOpen) return null;

  const go = (to) => {
    close();
    navigate(to);
  };

  return createPortal(
    <div className="fixed inset-0 z-[65] lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={close}
        className="absolute inset-0 animate-fade-in cursor-default bg-charcoal/45"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[min(88%,380px)] animate-slide-in-left flex-col bg-cream outline-none"
      >
        <div className="flex items-center justify-between border-b border-beige px-5 py-4">
          <Link to="/" onClick={close} className="shrink-0">
            <BrandLogo name={BRAND.name} priority className="max-h-9" />
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="-mr-2 grid h-10 w-10 place-items-center text-charcoal-muted hover:text-charcoal"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            close();
            openSearch();
          }}
          className="flex min-h-[52px] w-full items-center gap-3 border-b border-beige px-5 py-4 text-left text-sm text-charcoal-muted"
        >
          <Search size={18} aria-hidden="true" strokeWidth={1.5} className="shrink-0" />
          <span className="truncate">Search sarees, dresses, blouses…</span>
        </button>

        <nav aria-label="Mobile" className="flex-1 overflow-y-auto overscroll-contain">
          <ul className="divide-y divide-beige">
            {NAV_ITEMS.map((item, i) => (
              <li key={item.label}>
                {item.columns ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setExpanded((cur) => (cur === i ? null : i))}
                      aria-expanded={expanded === i}
                      className={cn(
                        'flex min-h-[52px] w-full items-center justify-between gap-3 px-5 py-4 text-left text-[12px] font-medium uppercase tracking-widest2',
                        item.accent ? 'text-sale' : 'text-charcoal',
                      )}
                    >
                      <span className="min-w-0 flex-1">{item.label}</span>
                      <ChevronDown
                        size={18}
                        aria-hidden="true"
                        className={cn(
                          'shrink-0 text-charcoal-faint transition-transform duration-300',
                          expanded === i && 'rotate-180',
                        )}
                      />
                    </button>

                    {expanded === i ? (
                      <div className="animate-slide-down bg-sand/60 px-5 pb-5 pt-1">
                        <button
                          type="button"
                          onClick={() => go(item.to)}
                          className="mb-3 flex min-h-[44px] items-center text-[11px] font-medium uppercase tracking-widest2 text-clay underline underline-offset-4"
                        >
                          Shop all {item.label}
                        </button>
                        {item.columns.map((col) => (
                          <div key={col.title} className="mb-4 last:mb-0">
                            <p className="eyebrow mb-2">{col.title}</p>
                            {/* `-my-1` keeps the visual rhythm the design had
                                while each row still fills 44px of tappable
                                height — the padding grows inward, not the list. */}
                            <ul className="-my-1">
                              {col.links.map((link) => (
                                <li key={link.label}>
                                  <button
                                    type="button"
                                    onClick={() => go(link.to)}
                                    className="flex min-h-[44px] w-full items-center py-1 text-left text-[13px] text-charcoal-soft"
                                  >
                                    {link.label}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => go(item.to)}
                    className={cn(
                      'flex min-h-[52px] w-full items-center px-5 py-4 text-left text-[12px] font-medium uppercase tracking-widest2',
                      item.accent ? 'text-sale' : 'text-charcoal',
                    )}
                  >
                    {item.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="pb-safe border-t border-beige bg-sand/50 px-5 py-4">
          {isAuthenticated ? (
            <div className="space-y-3">
              <p className="text-sm">
                Hello, <span className="font-medium">{user.name}</span>
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={() => go('/account')} className="btn-outline btn-sm flex-1">
                  My Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    close();
                  }}
                  aria-label="Log out"
                  className="grid h-9 w-9 shrink-0 place-items-center border border-beige text-charcoal-muted"
                >
                  <LogOut size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button type="button" onClick={() => go('/login')} className="btn-primary btn-sm flex-1">
                <User size={13} aria-hidden="true" /> Log In
              </button>
              <button type="button" onClick={() => go('/register')} className="btn-outline btn-sm flex-1">
                Register
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => go('/wishlist')}
            className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 text-[11px] uppercase tracking-widest2 text-charcoal-muted"
          >
            <Heart size={13} aria-hidden="true" />
            Wishlist {wishlistCount > 0 ? `(${wishlistCount})` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
