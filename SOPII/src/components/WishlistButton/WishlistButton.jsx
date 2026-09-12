import { useState } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useWishlist } from '../../context/WishlistContext';

/**
 * Heart toggle with a short pop animation on save.
 * `variant="floating"` is the circular button that sits on a product image;
 * `variant="inline"` is the text link used on the product detail page.
 */
export function WishlistButton({ product, variant = 'floating', className }) {
  const { has, toggle } = useWishlist();
  const [popping, setPopping] = useState(false);
  const saved = has(product.id);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const added = toggle(product);
    if (added) {
      setPopping(true);
      setTimeout(() => setPopping(false), 350);
    }
  };

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={saved}
        className={cn(
          'inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest2 transition-colors',
          saved ? 'text-brand' : 'text-charcoal-muted hover:text-charcoal',
          className,
        )}
      >
        <Heart
          size={15}
          aria-hidden="true"
          fill={saved ? 'currentColor' : 'none'}
          className={cn(popping && 'animate-pop')}
        />
        {saved ? 'Saved to Wishlist' : 'Add to Wishlist'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-full bg-cream/90 backdrop-blur-sm transition-all duration-300 ease-silk hover:bg-cream',
        saved ? 'text-brand' : 'text-charcoal-soft',
        className,
      )}
    >
      <Heart
        size={15}
        aria-hidden="true"
        fill={saved ? 'currentColor' : 'none'}
        strokeWidth={1.6}
        className={cn(popping && 'animate-pop')}
      />
    </button>
  );
}
