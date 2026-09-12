import { Check } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Size and colour pickers, shared by the quick view and the product page so
 * the two never drift apart visually.
 */

export function SizeSelector({ sizes = [], value, onChange, onSizeGuide, className }) {
  if (sizes.length === 0) return null;
  const singleSize = sizes.length === 1;

  return (
    <fieldset className={className}>
      <div className="mb-2.5 flex items-center justify-between">
        <legend className="text-[11px] font-medium uppercase tracking-widest2 text-charcoal-muted">
          Size{value ? <span className="ml-2 text-charcoal">{value}</span> : null}
        </legend>
        {onSizeGuide ? (
          <button
            type="button"
            onClick={onSizeGuide}
            className="text-[11px] text-brand-soft underline underline-offset-4 hover:text-charcoal"
          >
            Size Guide
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {sizes.map((size) => {
          const selected = value === size;
          return (
            <label
              key={size}
              className={cn(
                'cursor-pointer border px-4 py-2.5 text-[12px] transition-all duration-200',
                'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold',
                selected
                  ? 'border-charcoal bg-charcoal text-cream'
                  : 'border-beige text-charcoal-soft hover:border-charcoal',
                singleSize && 'cursor-default',
              )}
            >
              <input
                type="radio"
                name="size"
                value={size}
                checked={selected}
                onChange={() => onChange(size)}
                className="sr-only"
              />
              {size}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ColorSelector({ colors = [], value, onChange, className }) {
  if (colors.length === 0) return null;

  return (
    <fieldset className={className}>
      <legend className="mb-2.5 text-[11px] font-medium uppercase tracking-widest2 text-charcoal-muted">
        Colour{value ? <span className="ml-2 text-charcoal">{value}</span> : null}
      </legend>

      <div className="flex flex-wrap gap-2.5">
        {colors.map((color) => {
          const selected = value === color.name;
          return (
            <label
              key={color.name}
              title={color.name}
              className={cn(
                'grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 transition-all duration-200',
                'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold',
                selected ? 'border-charcoal' : 'border-transparent hover:border-beige',
              )}
            >
              <input
                type="radio"
                name="color"
                value={color.name}
                checked={selected}
                onChange={() => onChange(color.name)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="grid h-7 w-7 place-items-center rounded-full border border-black/10"
                style={{ backgroundColor: color.hex }}
              >
                {selected ? (
                  <Check
                    size={13}
                    strokeWidth={2.5}
                    /* Flip the tick to dark on pale swatches so it stays visible */
                    className={isLight(color.hex) ? 'text-charcoal' : 'text-cream'}
                  />
                ) : null}
              </span>
              <span className="sr-only">{color.name}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Relative luminance check — decides tick colour on a swatch. */
function isLight(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}
