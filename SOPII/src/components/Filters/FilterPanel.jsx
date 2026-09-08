import { useState } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatPrice } from '../../utils/format';
import { swatchFor } from '../../services/adapters';

/**
 * The shop's filter sidebar. Rendered inline on desktop and inside a drawer
 * on mobile — same component, so the two can never diverge.
 */
export function FilterPanel({ filters, facets, onChange, priceBounds }) {
  const toggleMulti = (key, value) => {
    const current = filters[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next });
  };

  return (
    <div className="divide-y divide-beige border-t border-beige">
      <FilterGroup title="Category" defaultOpen count={filters.category.length}>
        <CheckList
          options={facets.category}
          selected={filters.category}
          onToggle={(v) => toggleMulti('category', v)}
          name="category"
        />
      </FilterGroup>

      {/* Subcategories only earn a group when the scope actually spans more
          than one — on /sarees they are the useful filter, on a single-type
          listing they would just be a row of one. */}
      {facets.subcategory?.length > 1 ? (
        <FilterGroup title="Type" defaultOpen count={filters.subcategory.length}>
          <CheckList
            options={facets.subcategory}
            selected={filters.subcategory}
            onToggle={(v) => toggleMulti('subcategory', v)}
            name="subcategory"
          />
        </FilterGroup>
      ) : null}

      <FilterGroup title="Price" defaultOpen count={(filters.minPrice ? 1 : 0) + (filters.maxPrice ? 1 : 0)}>
        <PriceFilter
          min={priceBounds.min}
          max={priceBounds.max}
          value={filters.maxPrice}
          minValue={filters.minPrice}
          onChange={(minPrice, maxPrice) => onChange({ ...filters, minPrice, maxPrice })}
        />
      </FilterGroup>

      <FilterGroup title="Size" count={filters.size.length}>
        <div className="flex flex-wrap gap-2">
          {facets.size.map((opt) => {
            const active = filters.size.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleMulti('size', opt.value)}
                aria-pressed={active}
                className={cn(
                  'border px-3 py-1.5 text-[11px] transition-colors',
                  active
                    ? 'border-charcoal bg-charcoal text-cream'
                    : 'border-beige text-charcoal-soft hover:border-charcoal',
                )}
              >
                {opt.value}
              </button>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup title="Colour" count={filters.color.length}>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
          {facets.color.map((opt) => {
            const active = filters.color.includes(opt.value);
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => toggleMulti('color', opt.value)}
                  aria-pressed={active}
                  className="flex w-full items-center gap-2 py-1 text-left"
                >
                  <span
                    className={cn(
                      'grid h-4 w-4 shrink-0 place-items-center rounded-full border',
                      active ? 'border-charcoal ring-1 ring-charcoal ring-offset-1' : 'border-black/15',
                    )}
                    style={{ backgroundColor: swatchFor(opt.value) }}
                  />
                  <span
                    className={cn(
                      'truncate text-[12px]',
                      active ? 'text-charcoal' : 'text-charcoal-muted',
                    )}
                  >
                    {opt.value}
                  </span>
                  <span className="ml-auto text-[10px] text-charcoal-faint">{opt.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </FilterGroup>

      <FilterGroup title="Fabric" count={filters.fabric.length}>
        <CheckList
          options={facets.fabric}
          selected={filters.fabric}
          onToggle={(v) => toggleMulti('fabric', v)}
          name="fabric"
        />
      </FilterGroup>

      <FilterGroup title="Occasion" count={filters.occasion.length}>
        <CheckList
          options={facets.occasion}
          selected={filters.occasion}
          onToggle={(v) => toggleMulti('occasion', v)}
          name="occasion"
        />
      </FilterGroup>

      <FilterGroup title="Rating" count={filters.rating ? 1 : 0}>
        <ul className="space-y-1.5">
          {[4.5, 4, 3.5].map((value) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => onChange({ ...filters, rating: filters.rating === value ? null : value })}
                aria-pressed={filters.rating === value}
                className={cn(
                  'flex w-full items-center gap-2 py-1 text-left text-[12px] transition-colors',
                  filters.rating === value ? 'text-charcoal' : 'text-charcoal-muted hover:text-charcoal',
                )}
              >
                <span className="flex gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      size={11}
                      strokeWidth={0}
                      fill="currentColor"
                      className={i < Math.floor(value) ? 'text-gold' : 'text-beige'}
                    />
                  ))}
                </span>
                {value} & above
              </button>
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup title="Availability" count={filters.inStockOnly ? 1 : 0}>
        <label className="flex cursor-pointer items-center gap-2.5 py-1 text-[12px] text-charcoal-muted">
          <input
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={(e) => onChange({ ...filters, inStockOnly: e.target.checked })}
            className="h-3.5 w-3.5 accent-charcoal"
          />
          In stock only
        </label>
      </FilterGroup>
    </div>
  );
}

/* ------------------------------ Internals -------------------------------- */

function FilterGroup({ title, children, defaultOpen = false, count = 0 }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="py-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest2 text-charcoal">
          {title}
          {count > 0 ? (
            <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-charcoal px-1 text-[9px] text-cream">
              {count}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={cn('text-charcoal-faint transition-transform duration-300', open && 'rotate-180')}
        />
      </button>

      {open ? <div className="mt-3.5">{children}</div> : null}
    </div>
  );
}

function CheckList({ options, selected, onToggle, name }) {
  return (
    <ul className="space-y-1.5">
      {options.map((opt) => (
        <li key={opt.value}>
          <label className="flex cursor-pointer items-center gap-2.5 py-0.5 text-[12px]">
            <input
              type="checkbox"
              name={name}
              value={opt.value}
              checked={selected.includes(opt.value)}
              onChange={() => onToggle(opt.value)}
              className="h-3.5 w-3.5 shrink-0 accent-charcoal"
            />
            <span
              className={cn(
                'flex-1 truncate',
                selected.includes(opt.value) ? 'text-charcoal' : 'text-charcoal-muted',
              )}
            >
              {opt.value}
            </span>
            <span className="text-[10px] text-charcoal-faint">{opt.count}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * Price is a single max slider plus quick bands. A dual-thumb range needs a
 * custom control; this covers the same ground with native inputs.
 */
function PriceFilter({ min, max, value, minValue, onChange }) {
  const step = 100;
  const current = value || max;

  const bands = [
    { label: 'Under ₹2,000', min: null, max: 2000 },
    { label: '₹2,000 – ₹5,000', min: 2000, max: 5000 },
    { label: '₹5,000 – ₹10,000', min: 5000, max: 10000 },
    { label: 'Over ₹10,000', min: 10000, max: null },
  ];

  return (
    <div>
      <label htmlFor="price-max" className="sr-only">
        Maximum price
      </label>
      <input
        id="price-max"
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(minValue, Number(e.target.value))}
        className="w-full accent-charcoal"
      />
      <div className="mt-1 flex justify-between text-[11px] text-charcoal-muted">
        <span>{formatPrice(minValue || min)}</span>
        <span>{formatPrice(current)}</span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {bands.map((band) => {
          const active = minValue === band.min && value === band.max;
          return (
            <li key={band.label}>
              <button
                type="button"
                onClick={() => (active ? onChange(null, null) : onChange(band.min, band.max))}
                aria-pressed={active}
                className={cn(
                  'w-full text-left text-[12px] transition-colors',
                  active ? 'text-charcoal underline underline-offset-4' : 'text-charcoal-muted hover:text-charcoal',
                )}
              >
                {band.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
