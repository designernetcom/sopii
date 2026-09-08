import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';

/** `items`: [{ label, to }] — the last entry renders as the current page. */
export function Breadcrumbs({ items = [], className }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-[11px] tracking-wide', className)}>
      {/* `-my-2` keeps the trail visually where it was while each link gets a
          44px row to be tapped in. */}
      <ol className="-my-2 flex flex-wrap items-center gap-1.5 text-charcoal-muted sm:my-0">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {isLast || !item.to ? (
                <span aria-current={isLast ? 'page' : undefined} className="text-charcoal">
                  {item.label}
                </span>
              ) : (
                <Link
                to={item.to}
                className="flex min-h-[44px] items-center transition-colors hover:text-charcoal sm:min-h-0"
              >
                  {item.label}
                </Link>
              )}
              {!isLast ? <span aria-hidden="true" className="text-charcoal-faint">/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
