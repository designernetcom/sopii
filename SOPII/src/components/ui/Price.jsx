import { cn } from '../../utils/cn';
import { formatPrice } from '../../utils/format';

/** Current price, struck MRP and the discount, in one consistent block. */
export function Price({ price, originalPrice, discount, size = 'md', className }) {
  const hasDiscount = originalPrice > price;

  /*
   * The third value is the "% off" flag. It was 10px at `md`, which is the
   * size used across the product grid — small enough that the saving, the one
   * number a shopper is scanning for, was the least legible thing on the card.
   * It steps up on mobile and returns to the original size from `sm`.
   */
  const scale = {
    sm: ['text-[13px]', 'text-[11px]', 'text-[10px]'],
    md: ['text-sm', 'text-xs', 'text-[11px] sm:text-[10px]'],
    lg: ['text-xl', 'text-sm', 'text-[11px]'],
  }[size];

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <span className={cn('font-medium text-charcoal', scale[0])}>{formatPrice(price)}</span>
      {hasDiscount ? (
        <>
          <span className={cn('text-charcoal-faint line-through', scale[1])}>
            {formatPrice(originalPrice)}
          </span>
          <span className={cn('font-medium uppercase tracking-wide text-sale', scale[2])}>
            {discount}% off
          </span>
        </>
      ) : null}
    </div>
  );
}
