import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../utils/cn';

/** Shared eyebrow + title + optional "view all" used by every home section. */
export function SectionHeading({ eyebrow, title, subtitle, action, align = 'left', className }) {
  const centered = align === 'center';

  return (
    <div
      className={cn(
        'mb-8 flex flex-col gap-4 sm:mb-10 lg:mb-12',
        centered ? 'items-center text-center' : 'sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className={cn(centered && 'max-w-2xl')}>
        {eyebrow ? <p className="eyebrow mb-3 text-[#692D58]">{eyebrow}</p> : null}
        <h2 className="section-title tracking-[-0.04em] text-[#6B2E5A]">{title}</h2>
        {subtitle ? (
          <p className={cn('section-sub max-w-lg text-charcoal-muted', centered && 'mx-auto')}>{subtitle}</p>
        ) : null}
      </div>

      {action ? (
        <Link
          to={action.to}
          className="group inline-flex min-h-[44px] shrink-0 items-center gap-2 text-[11px] font-medium uppercase tracking-widest2 text-charcoal sm:min-h-0"
        >
          <span className="link-underline">{action.label}</span>
          <ArrowRight
            size={14}
            aria-hidden="true"
            className="transition-transform duration-300 ease-silk group-hover:translate-x-1"
          />
        </Link>
      ) : null}
    </div>
  );
}
