import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import type { BadgeTone } from '@/utils/constants';

export interface BadgeProps {
  children: ReactNode;
  className?: string;
  dot?: string;
  size?: 'sm' | 'md';
}

export function Badge({ children, className, dot, size = 'sm' }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
        'bg-ink-100 text-ink-700 ring-ink-500/20 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-600/30',
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />}
      {children}
    </span>
  );
}

export interface StatusBadgeProps {
  tone: BadgeTone | undefined;
  fallback?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Renders one of the shared status maps in `utils/constants`. */
export function StatusBadge({ tone, fallback = '—', size = 'sm', className }: StatusBadgeProps) {
  if (!tone) return <Badge size={size}>{fallback}</Badge>;
  return (
    <Badge className={cn(tone.className, className)} dot={tone.dot} size={size}>
      {tone.label}
    </Badge>
  );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        'inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-2xs font-semibold tabular-nums',
        'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
