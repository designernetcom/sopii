import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Disclosure list used for the PDP information panels.
 * `items`: [{ id, title, content }]. Pass `defaultOpen` with an item id.
 */
export function Accordion({ items = [], defaultOpen, allowMultiple = false, className }) {
  const [open, setOpen] = useState(() => (defaultOpen ? [defaultOpen] : []));

  const toggle = (id) =>
    setOpen((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      return allowMultiple ? [...current, id] : [id];
    });

  return (
    <div className={cn('divide-y divide-beige border-y border-beige', className)}>
      {items.map((item) => {
        const isOpen = open.includes(item.id);
        return (
          <div key={item.id}>
            <h3>
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-expanded={isOpen}
                aria-controls={`panel-${item.id}`}
                id={`accordion-${item.id}`}
                className="flex w-full items-center justify-between gap-4 py-4 text-left text-[12px] font-medium uppercase tracking-widest2 text-charcoal transition-colors hover:text-brand-soft"
              >
                {item.title}
                {isOpen ? (
                  <Minus size={15} className="shrink-0 text-brand-soft" aria-hidden="true" />
                ) : (
                  <Plus size={15} className="shrink-0 text-charcoal-faint" aria-hidden="true" />
                )}
              </button>
            </h3>

            <div
              id={`panel-${item.id}`}
              role="region"
              aria-labelledby={`accordion-${item.id}`}
              hidden={!isOpen}
              className="pb-5 text-sm leading-relaxed text-charcoal-muted"
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
