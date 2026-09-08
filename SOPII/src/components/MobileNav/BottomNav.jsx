import { NavLink, useLocation } from 'react-router-dom';
import { Heart, Home, LayoutGrid, Search, User } from 'lucide-react';
import { cn } from '../../utils/cn';
import { MOBILE_TABS } from '../../data/navigation';
import { useUI } from '../../context/UIContext';
import { useWishlist } from '../../context/WishlistContext';
import { useAuth } from '../../context/AuthContext';

const ICONS = { Home, LayoutGrid, Search, Heart, User };

/**
 * Thumb-reachable tab bar on mobile.
 * Hidden on checkout so nothing competes with the primary action there.
 */
export function BottomNav() {
  const { openSearch, isSearchOpen } = useUI();
  const { count } = useWishlist();
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();

  if (pathname.startsWith('/checkout')) return null;

  return (
    <nav
      aria-label="Quick navigation"
      /* Opaque, not translucent: a blurred bar over a moving product grid
         costs a compositor layer on every scroll frame for an effect nobody
         asked for, and the labels read better on a solid ground. */
      className="fixed inset-x-0 bottom-0 z-40 border-t border-beige bg-cream lg:hidden"
      style={{ paddingBottom: 'var(--safe-b)' }}
    >
      <ul className="grid grid-cols-5">
        {MOBILE_TABS.map((tab) => {
          const Icon = ICONS[tab.icon];
          const to = tab.to === '/account' && !isAuthenticated ? '/login' : tab.to;

          if (tab.action === 'search') {
            return (
              <li key={tab.label}>
                <button
                  type="button"
                  onClick={openSearch}
                  aria-label="Search"
                  className={cn(
                    'flex h-[60px] w-full flex-col items-center justify-center gap-1 whitespace-nowrap text-[9px] uppercase tracking-[0.1em] transition-colors min-[360px]:tracking-widest2',
                    isSearchOpen ? 'text-clay' : 'text-charcoal-muted',
                  )}
                >
                  <Icon size={19} aria-hidden="true" strokeWidth={1.5} />
                  {tab.label}
                </button>
              </li>
            );
          }

          return (
            <li key={tab.label}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    /* `tracking-widest2` is 0.18em; at 320px five labels of that
                       width do not fit in 64px each and "Wishlist" wrapped. */
                    'relative flex h-[60px] w-full flex-col items-center justify-center gap-1 whitespace-nowrap text-[9px] uppercase tracking-[0.1em] transition-colors min-[360px]:tracking-widest2',
                    isActive ? 'text-charcoal' : 'text-charcoal-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icon
                        size={19}
                        aria-hidden="true"
                        strokeWidth={1.5}
                        fill={isActive && tab.icon === 'Heart' ? 'currentColor' : 'none'}
                      />
                      {tab.to === '/wishlist' && count > 0 ? (
                        <span
                          aria-hidden="true"
                          className="absolute -right-2 -top-1 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-charcoal px-1 text-[8px] leading-none text-cream"
                        >
                          {count > 9 ? '9+' : count}
                        </span>
                      ) : null}
                    </span>
                    {tab.label}
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-6 top-0 h-px bg-charcoal"
                      />
                    ) : null}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
