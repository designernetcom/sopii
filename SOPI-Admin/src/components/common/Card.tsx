import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface CardProps {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  /** Anchor target, used by in-page section navigation. */
  id?: string;
}

export function Card({ children, className, padded = false, id }: CardProps) {
  return (
    <div id={id} className={cn('card', padded && 'p-5', className)}>
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function CardHeader({ title, description, action, className, compact }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 dark:border-ink-800',
        compact ? 'px-4 py-3' : 'px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={cn(padded && 'p-5', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-ink-200 px-5 py-3 dark:border-ink-800',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Two-column labelled row used across detail pages. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2 text-sm', className)}>
      <dt className="shrink-0 text-ink-500 dark:text-ink-400">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-ink-900 dark:text-ink-100">{children}</dd>
    </div>
  );
}
