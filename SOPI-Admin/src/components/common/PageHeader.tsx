import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
  back?: ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
  back,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {back}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 sm:text-2xl">
            {title}
          </h1>
          {meta}
        </div>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-ink-500 dark:text-ink-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface TabItem {
  key: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export function Tabs({
  items,
  active,
  onChange,
  className,
  variant = 'underline',
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  variant?: 'underline' | 'pill';
}) {
  if (variant === 'pill') {
    return (
      <div
        className={cn(
          'inline-flex flex-wrap gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-800/70',
          className,
        )}
        role="tablist"
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active === item.key}
            onClick={() => onChange(item.key)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              active === item.key
                ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-900 dark:text-ink-100'
                : 'text-ink-600 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-200',
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded px-1 text-2xs tabular-nums',
                  active === item.key
                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                    : 'bg-ink-200 text-ink-600 dark:bg-ink-700 dark:text-ink-400',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto scrollbar-none', className)}>
      <div
        className="flex min-w-max gap-1 border-b border-ink-200 dark:border-ink-800"
        role="tablist"
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active === item.key}
            onClick={() => onChange(item.key)}
            className={cn(
              'relative inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors',
              active === item.key
                ? 'text-brand-700 dark:text-brand-300'
                : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200',
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span className="rounded bg-ink-100 px-1 text-2xs tabular-nums text-ink-600 dark:bg-ink-800 dark:text-ink-400">
                {item.count}
              </span>
            )}
            {active === item.key && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-600 dark:bg-brand-400" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
