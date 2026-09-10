import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * A footer column that collapses on a phone and stays open from `sm`.
 *
 * Built on `<details>`/`<summary>` rather than on state and a click handler,
 * which buys three things for no JavaScript at all: the open/closed state is
 * keyboard-operable and announced correctly by screen readers without any
 * ARIA, the content is present in the DOM for search engines whether or not it
 * is expanded, and it works before hydration.
 *
 * The desktop layout is untouched. From `sm` the marker is hidden, the panel is
 * forced open by CSS, and the heading loses its button affordance — so what
 * ships to a laptop is the same stacked list of links it always was.
 *
 * The colours are the footer's: a beige hairline between the collapsed rows
 * and a chevron in clay. It is only ever rendered inside `<Footer>`, so it
 * carries that palette directly instead of a `tone` prop with one caller.
 */
export function FooterSection({ title, children, className }) {
  return (
    <details className={cn('footer-section border-b border-beige sm:border-0', className)}>
      <summary
        className={cn(
          'flex min-h-[52px] cursor-pointer list-none items-center justify-between py-3',
          'sm:pointer-events-none sm:min-h-0 sm:cursor-default sm:py-0',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <h2 className="footer-eyebrow sm:mb-4">{title}</h2>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="footer-chevron shrink-0 text-clay transition-transform duration-300 sm:hidden"
        />
      </summary>

      <div className="pb-4 sm:pb-0">{children}</div>
    </details>
  );
}
