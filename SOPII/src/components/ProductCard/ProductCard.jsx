import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, ShoppingBag } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Image } from '../ui/Image';
import { Badge } from '../ui/Badge';
import { Price } from '../ui/Price';
import { Rating } from '../ui/Rating';
import { WishlistButton } from '../WishlistButton/WishlistButton';
import { useCart } from '../../context/CartContext';
import { useUI } from '../../context/UIContext';
import { productPath } from '../../utils/catalog';

/**
 * The catalogue's single product tile — used by carousels, the shop grid,
 * search results, recommendations and the wishlist.
 *
 * Products with more than one size open the quick-view instead of adding
 * blindly, so nobody ends up with the wrong size from a one-tap add.
 */
function ProductCardBase({
  product,
  priority = false,
  compact = false,
  className,
}) {
  const { addItem } = useCart();
  const { setQuickView, openCart } = useUI();
  const [adding, setAdding] = useState(false);

  const needsChoice = product.sizes.length > 1;
  const to = productPath(product);

  const handleQuickAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!product.inStock) return;

    if (needsChoice) {
      setQuickView(product);
      return;
    }
    setAdding(true);
    addItem(product, { quantity: 1 });
    openCart();
    setTimeout(() => setAdding(false), 500);
  };

  const handleQuickView = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setQuickView(product);
  };

  return (
    <article className={cn('group relative flex h-full flex-col', className)}>
      {/*
        The media is one link; the quick actions are siblings layered over it.

        They used to sit *inside* the anchor, which is invalid HTML — a button
        inside a link — and left the link's accessible name ("View X") at odds
        with the text a sighted user could see inside it. On a desktop the
        controls only appeared on hover so it rarely mattered; on a phone they
        are always visible, so it always did.
      */}
      <div className="relative overflow-hidden bg-sand">
        <Link
          to={to}
          className="block focus-visible:outline-offset-4"
          aria-label={`View ${product.name}`}
        >
          {/* Primary image */}
          <Image
            src={product.image}
            alt={product.name}
            ratio="aspect-[4/5]"
            priority={priority}
            /* The busiest image in the shop: twenty-four of these to a listing
               page. `card` offers 300/450/600/900, so a phone takes the 300. */
            preset="card"
            sizes="(min-width: 1280px) 22vw, (min-width: 640px) 33vw, 50vw"
            className={cn(
              'transition-transform duration-[900ms] ease-silk',
              'group-hover:scale-[1.04]',
              product.hoverImage && 'md:group-hover:opacity-0'
            )}
          />

          {/* Second image, revealed on hover (desktop only — no hover on touch).
            Wrapped rather than positioned via Image's own class, so `absolute`
            can't collide with the wrapper's default `relative`. */}
          {product.hoverImage ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 hidden opacity-0 transition-opacity duration-700 ease-silk md:block md:group-hover:opacity-100"
            >
              <Image
                src={product.hoverImage}
                alt=""
                ratio="h-full"
                /* Desktop-only (it is revealed on hover), so it never costs a
                   phone anything — but it still picks the right desktop width. */
                preset="card"
                sizes="(min-width: 1280px) 22vw, 33vw"
                className="scale-[1.02]"
              />
            </div>
          ) : null}
        </Link>

        {/* Badges */}
        <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-3.25rem)] flex-col items-start gap-1.5 sm:left-3 sm:top-3">
          {product.badge ? <Badge>{product.badge}</Badge> : null}
          {!product.inStock ? <Badge tone="soft">Sold Out</Badge> : null}
        </div>

        <WishlistButton
          product={product}
          className="absolute right-2 top-2 opacity-100 sm:right-3 sm:top-3 md:opacity-0 md:group-hover:opacity-100"
        />

        {/* Quick actions — always visible on touch, revealed on hover on desktop */}
        {product.inStock ? (
          <div
            className={cn(
              'absolute inset-x-3 bottom-3 flex gap-2',
              'translate-y-0 opacity-100 transition-all duration-300 ease-silk',
              'md:translate-y-3 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100'
            )}
          >
            {/* 44px tall on touch: at two columns on a 320px screen this
                 button is about 112px wide, and it is the primary action on the
                 whole grid. The tracking tightens a step on the narrowest
                 phones so the label never wraps inside it. */}
            <button
              type="button"
              onClick={handleQuickAdd}
              className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 bg-[#fffdfb]/95 px-1 py-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-charcoal backdrop-blur-sm transition-all duration-300 hover:bg-charcoal hover:text-cream sm:min-h-0 sm:gap-2 sm:tracking-[0.16em]"
            >
              <ShoppingBag size={13} aria-hidden="true" className="shrink-0" />
              <span className="truncate">
                {adding ? 'Added' : needsChoice ? 'Quick Add' : 'Add to Bag'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleQuickView}
              aria-label={`Quick view ${product.name}`}
              className="hidden w-10 shrink-0 items-center justify-center bg-cream/95 text-charcoal backdrop-blur-sm transition-colors hover:bg-charcoal hover:text-cream sm:flex"
            >
              <Eye size={14} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Meta */}
      <div
        className={cn(
          'flex flex-1 flex-col pt-3',
          compact ? 'gap-1' : 'gap-1.5'
        )}
      >
        <p className="truncate text-[10px] uppercase tracking-widest2 text-charcoal-faint">
          {product.category}
        </p>

        <h3 className="text-[13px] font-normal leading-snug text-charcoal sm:text-sm">
          <Link to={to} className="transition-colors hover:text-clay">
            {product.name}
          </Link>
        </h3>

        {!compact ? (
          <Rating value={product.rating} reviews={product.reviews} />
        ) : null}

        <Price
          price={product.price}
          originalPrice={product.originalPrice}
          discount={product.discount}
          className="mt-auto pt-1"
        />

        {/* Colour swatches */}
        {product.colors.length > 1 ? (
          <ul
            className="flex items-center gap-1.5 pt-1"
            aria-label="Available colours"
          >
            {product.colors.slice(0, 4).map((c) => (
              <li key={c.name} title={c.name}>
                <span
                  className="block h-3 w-3 rounded-full border border-black/10"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="sr-only">{c.name}</span>
              </li>
            ))}
            {product.colors.length > 4 ? (
              <li className="text-[10px] text-charcoal-faint">
                +{product.colors.length - 4}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

/** Memoised — grids re-render on every filter keystroke otherwise. */
export const ProductCard = memo(ProductCardBase);

/* The matching shimmer tile lives with the rest of the skeletons, in
   components/ui/PageSkeletons.jsx. It is defined there rather than here so
   that the catalogue gate, which renders it, does not have to import this
   file and the cart and wishlist contexts behind it. */
