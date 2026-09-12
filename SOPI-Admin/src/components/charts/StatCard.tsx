import {
  AlertTriangle,
  Clock,
  IndianRupee,
  Package,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import type { KpiStat } from '@/types';
import { formatCompactCurrency, formatNumber, formatPercent } from '@/utils/format';
import { Sparkline } from './RevenueChart';

const ICONS: Record<string, LucideIcon> = {
  revenue: IndianRupee,
  orders: ShoppingBag,
  customers: Users,
  products: Package,
  pending: Clock,
  low_stock: AlertTriangle,
};

const TONES: Record<KpiStat['tone'], { bg: string; spark: string }> = {
  brand: { bg: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400', spark: '#7E1F20' },
  sky: { bg: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400', spark: '#0ea5e9' },
  emerald: { bg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400', spark: '#10b981' },
  amber: { bg: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400', spark: '#f59e0b' },
  rose: { bg: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400', spark: '#f43f5e' },
  violet: { bg: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400', spark: '#8b5cf6' },
};

const PERIOD_LABEL: Record<string, string> = {
  today: 'vs yesterday',
  '7d': 'vs previous 7 days',
  '30d': 'vs previous 30 days',
  '3m': 'vs previous quarter',
  '6m': 'vs previous 6 months',
  '1y': 'vs previous year',
};

export function StatCard({
  stat,
  range,
  onClick,
}: {
  stat: KpiStat;
  range: string;
  onClick?: () => void;
}) {
  const Icon = ICONS[stat.key] ?? Package;
  const tone = TONES[stat.tone];
  const positive = stat.change >= 0;

  // For these two, a rise is a problem rather than growth.
  const inverted = stat.key === 'pending' || stat.key === 'low_stock';
  const good = inverted ? !positive : positive;

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'card group relative overflow-hidden p-4 text-left transition-shadow',
        onClick && 'cursor-pointer hover:shadow-pop',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink-500 dark:text-ink-400">
            {stat.label}
          </p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-ink-900 dark:text-ink-50 sm:text-2xl">
            {stat.format === 'currency'
              ? formatCompactCurrency(stat.value)
              : formatNumber(stat.value)}
          </p>
        </div>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            tone.bg,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums',
              good
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
            )}
          >
            {positive ? (
              <TrendingUp className="h-3 w-3" aria-hidden />
            ) : (
              <TrendingDown className="h-3 w-3" aria-hidden />
            )}
            {formatPercent(stat.change)}
          </span>
          <span className="ml-1.5 truncate text-2xs text-ink-400">
            {PERIOD_LABEL[range] ?? 'vs previous period'}
          </span>
        </div>
        <div className="h-10 w-20 shrink-0 opacity-80">
          <Sparkline data={stat.trend} color={tone.spark} />
        </div>
      </div>
    </Wrapper>
  );
}
