import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Heart, Menu, Search, ShoppingBag, User } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useCatalog, useSiteSettings } from '../../context/CatalogContext';
import { MegaMenu } from '../MegaMenu/MegaMenu';
import { BrandLogo } from '../ui/BrandLogo';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';

export function Header() {
  const { brand: BRAND } = useSiteSettings();
  const { navigation: NAV_ITEMS } = useCatalog();
  const [openIndex, setOpenIndex] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef(null);
  const location = useLocation();

  const { itemCount } = useCart();
  const { count: wishlistCount } = useWishlist();
  const { openCart, openSearch, openMenu } = useUI();
  const { isAuthenticated } = useAuth();

  // The bar is solid at all times; scrolling only lifts it off the page.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Any navigation closes the mega menu.
  useEffect(() => setOpenIndex(null), [location.pathname, location.search]);

  /* A short close delay keeps the panel open while the pointer crosses the
     gap between the nav item and the panel itself. */
  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenIndex(null), 140);
  };
  const cancelClose = () => clearTimeout(closeTimer.current);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <header
      className={cn(
        /* Opaque cream on every page and at every scroll position, so the
           charcoal wordmark, nav and icons never sit over moving content. */
        'sticky top-0 z-50 border-b border-beige bg-cream',
        'transition-shadow duration-300 ease-silk',
        scrolled || openIndex !== null
          ? 'shadow-[0_4px_14px_-2px_rgba(45,31,43,0.10)]'
          : 'shadow-none',
      )}
      onMouseLeave={scheduleClose}
    >
      <div className="container-site relative flex h-14 items-center justify-between gap-1 min-[400px]:h-16 lg:h-20 lg:gap-4">
        {/* Mobile menu */}
        <button
          type="button"
          onClick={openMenu}
          aria-label="Open menu"
          className="tap-square -ml-2 grid h-11 w-11 shrink-0 place-items-center text-charcoal lg:hidden"
        >
          <Menu size={22} aria-hidden="true" strokeWidth={1.5} />
        </button>

        {/* Wordmark. In the compact bar it is taken out of the flex row and
            centred on the container: the lone hamburger on the left and the
            icon cluster on the right are different widths, so `justify-between`
            alone would leave it visibly off-centre. From `lg` the desktop nav
            appears and the wordmark returns to the start of the row. */}
        {/*
          Centred on the *container* rather than left in the flex row, because
          the lone hamburger and the icon cluster are different widths and
          `justify-between` alone would leave the wordmark visibly off-centre.

          The four mobile icons take roughly 172px of a 288px content box at
          320px, so the wordmark is given the remaining width explicitly and
          clipped to it — an absolutely positioned element takes no part in
          flex sizing, and without a cap it would happily overlap the cart
          button on the narrowest phones.
        */}
        <Link
          to="/"
          className="absolute left-1/2 top-1/2 flex min-h-[44px] max-w-[calc(100%-13rem)] shrink-0 -translate-x-1/2 -translate-y-1/2 items-center justify-center min-[400px]:max-w-[calc(100%-14rem)] lg:static lg:min-h-0 lg:max-w-none lg:translate-x-0 lg:translate-y-0"
          aria-label={`${BRAND.name} home`}
        >
          {/* The bar is 56px on the smallest phones, so the wordmark is
              stepped down to sit inside it rather than colliding with the
              bottom border. */}
          <BrandLogo
            name={BRAND.name}
            priority
            className="max-h-9 min-[400px]:max-h-10 sm:max-h-12 lg:max-h-[72px]"
          />
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Main" className="hidden min-w-0 lg:block">
          <ul className="flex items-center gap-[14px] xl:gap-7">
            {NAV_ITEMS.map((item, i) => (
              <li
                key={item.label}
                onMouseEnter={() => {
                  cancelClose();
                  setOpenIndex(item.columns ? i : null);
                }}
              >
                <NavLink
                  to={item.to}
                  onFocus={() => setOpenIndex(item.columns ? i : null)}
                  aria-expanded={item.columns ? openIndex === i : undefined}
                  aria-haspopup={item.columns ? 'true' : undefined}
                  className={({ isActive }) =>
                    cn(
                      'relative block whitespace-nowrap py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-charcoal transition-colors duration-200',
                      'xl:text-[11px] xl:tracking-[0.22em]',
                      'after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-300 after:ease-silk',
                      'hover:after:origin-left hover:after:scale-x-100',
                      item.accent ? 'text-sale' : 'text-charcoal',
                      (isActive || openIndex === i) && 'after:origin-left after:scale-x-100',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/*
          Utilities. Search, Wishlist and Bag are on the mobile bar; Account is
          the one that stays behind until `sm`, because it is a tap away in both
          the drawer and the bottom tab bar and a fourth icon at 320px is what
          pushes the wordmark into the cluster.
        */}
        <div className="flex shrink-0 items-center gap-0 sm:gap-1">
          <button
            type="button"
            onClick={openSearch}
            aria-label="Search"
            className="tap-square grid h-11 w-11 place-items-center text-charcoal transition-colors hover:text-brand-soft"
          >
            <Search size={20} aria-hidden="true" strokeWidth={1.5} />
          </button>

          <Link
            to={isAuthenticated ? '/account' : '/login'}
            aria-label={isAuthenticated ? 'My account' : 'Log in'}
            className="hidden h-11 w-11 place-items-center text-charcoal transition-colors hover:text-brand-soft sm:grid"
          >
            <User size={20} aria-hidden="true" strokeWidth={1.5} />
          </Link>

          <Link
            to="/wishlist"
            aria-label={`Wishlist, ${wishlistCount} ${wishlistCount === 1 ? 'item' : 'items'}`}
            className="tap-square relative grid h-11 w-11 place-items-center text-charcoal transition-colors hover:text-brand-soft"
          >
            <Heart size={20} aria-hidden="true" strokeWidth={1.5} />
            {wishlistCount > 0 ? <CountDot value={wishlistCount} /> : null}
          </Link>

          <button
            type="button"
            onClick={openCart}
            aria-label={`Shopping bag, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
            className="tap-square relative -mr-2 grid h-11 w-11 place-items-center text-charcoal transition-colors hover:text-brand-soft"
          >
            <ShoppingBag size={20} aria-hidden="true" strokeWidth={1.5} />
            {itemCount > 0 ? <CountDot value={itemCount} /> : null}
          </button>
        </div>
      </div>

      {/* Mega panel */}
      {openIndex !== null && NAV_ITEMS[openIndex]?.columns ? (
        <div
          className="absolute inset-x-0 top-full hidden animate-slide-down lg:block"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <MegaMenu item={NAV_ITEMS[openIndex]} onNavigate={() => setOpenIndex(null)} />
        </div>
      ) : null}
    </header>
  );
}

function CountDot({ value }) {
  return (
    <span
      aria-hidden="true"
      className="absolute right-0.5 top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-charcoal px-1 text-[9px] font-medium leading-none text-cream"
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}
