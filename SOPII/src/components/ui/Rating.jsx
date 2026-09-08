import { Star } from 'lucide-react';
import { cn } from '../../utils/cn';
import { compactCount } from '../../utils/format';

/**
 * Star rating with a half-star rendered via a clipped overlay, so 4.5 actually
 * looks like 4.5 rather than rounding up.
 */
export function Rating({ value = 0, reviews, size = 12, showValue = false, className }) {
  const rounded = Math.round(value * 10) / 10;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span
        className="relative inline-flex"
        role="img"
        aria-label={`Rated ${rounded} out of 5${reviews ? ` from ${reviews} reviews` : ''}`}
      >
        {/* Empty track */}
        <span className="flex gap-0.5" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={size} className="text-beige" fill="currentColor" strokeWidth={0} />
          ))}
        </span>
        {/* Filled overlay clipped to the rating */}
        <span
          className="absolute inset-0 flex gap-0.5 overflow-hidden"
          style={{ width: `${(rounded / 5) * 100}%` }}
          aria-hidden="true"
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              size={size}
              className="shrink-0 text-gold"
              fill="currentColor"
              strokeWidth={0}
            />
          ))}
        </span>
      </span>

      {showValue ? (
        <span className="text-[11px] font-medium text-charcoal-soft">{rounded.toFixed(1)}</span>
      ) : null}

      {typeof reviews === 'number' ? (
        <span className="text-[11px] text-charcoal-faint">({compactCount(reviews)})</span>
      ) : null}
    </div>
  );
}
