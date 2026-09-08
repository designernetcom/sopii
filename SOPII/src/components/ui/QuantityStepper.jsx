import { Minus, Plus } from 'lucide-react';
import { cn } from '../../utils/cn';

/** Accessible - / value / + control used in the cart, drawer and PDP. */
export function QuantityStepper({ value, onChange, min = 1, max = 10, size = 'md', label = 'Quantity' }) {
  const dims = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const text = size === 'sm' ? 'text-xs w-8' : 'text-sm w-10';

  return (
    <div className="inline-flex items-center border border-beige" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className={cn(
          dims,
          'grid place-items-center text-charcoal transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:text-charcoal-faint disabled:hover:bg-transparent',
        )}
      >
        <Minus size={14} aria-hidden="true" />
      </button>

      <span className={cn(text, 'text-center font-medium tabular-nums')} aria-live="polite">
        {value}
      </span>

      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="Increase quantity"
        className={cn(
          dims,
          'grid place-items-center text-charcoal transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:text-charcoal-faint disabled:hover:bg-transparent',
        )}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
