import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from './Button';

/* -------------------------------- skeletons -------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('card p-5', className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-32" />
      <Skeleton className="mt-3 h-3 w-40" />
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-ink-200 dark:divide-ink-800">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn(
                'h-3.5',
                colIndex === 0 ? 'w-8 shrink-0' : colIndex === 1 ? 'flex-[2]' : 'flex-1',
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="flex items-end gap-2 px-5 pb-5" style={{ height }}>
      {Array.from({ length: 16 }).map((_, index) => (
        <div
          key={index}
          className="skeleton flex-1 rounded-t-md"
          style={{ height: `${28 + ((index * 37) % 68)}%` }}
        />
      ))}
    </div>
  );
}

/* ------------------------------- empty state ------------------------------- */

export interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-6 py-10' : 'px-6 py-16',
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-ink-900 dark:text-ink-100">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-500 dark:text-ink-400">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/* ------------------------------- error state ------------------------------- */

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  title = 'Something went wrong.',
  description = 'We could not load this data. Please try again.',
  onRetry,
  className,
  compact,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-6 py-10' : 'px-6 py-16',
        className,
      )}
      role="alert"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-ink-900 dark:text-ink-100">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-500 dark:text-ink-400">
        {description}
      </p>
      {onRetry && (
        <Button
          className="mt-5"
          size="sm"
          variant="secondary"
          onClick={onRetry}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Retry
        </Button>
      )}
    </div>
  );
}

/* -------------------------------- page load -------------------------------- */

export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600 dark:border-ink-700 dark:border-t-brand-500" />
        <p className="text-xs text-ink-500 dark:text-ink-400">Loading…</p>
      </div>
    </div>
  );
}
