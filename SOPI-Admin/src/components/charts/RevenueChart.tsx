import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/utils/cn';
import type { SalesPoint } from '@/types';
import { formatCompactCurrency, formatCompactNumber } from '@/utils/format';
import { useChartTheme } from './chartTheme';
import { ChartTooltip } from './ChartTooltip';

export type SalesMetric = 'revenue' | 'orders' | 'aov';

const METRICS: { key: SalesMetric; label: string; color: string }[] = [
  { key: 'revenue', label: 'Revenue', color: '#6d4ae4' },
  { key: 'orders', label: 'Orders', color: '#0ea5e9' },
  { key: 'aov', label: 'Avg Order Value', color: '#10b981' },
];

export function RevenueChart({
  data,
  metric,
  onMetricChange,
  variant = 'area',
  height = 300,
}: {
  data: SalesPoint[];
  metric: SalesMetric;
  onMetricChange?: (metric: SalesMetric) => void;
  variant?: 'area' | 'bar' | 'line';
  height?: number;
}) {
  const theme = useChartTheme();
  const config = METRICS.find((item) => item.key === metric) ?? METRICS[0];

  const formatValue = useMemo(
    () =>
      metric === 'orders'
        ? (value: number) => formatCompactNumber(value)
        : (value: number) => formatCompactCurrency(value),
    [metric],
  );

  const formats = {
    [metric]: { label: config.label, format: formatValue, color: config.color },
  };

  const axisProps = {
    stroke: theme.axis,
    tick: { fill: theme.axis, fontSize: 11 },
    tickLine: false,
    axisLine: false,
  } as const;

  return (
    <div>
      {onMetricChange && (
        <div className="mb-4 flex flex-wrap gap-1.5 px-5">
          {METRICS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onMetricChange(item.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                metric === item.key
                  ? 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-900'
                  : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-400 dark:hover:bg-ink-700',
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        {variant === 'bar' ? (
          <BarChart data={data} margin={{ top: 8, right: 20, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={16} />
            <YAxis {...axisProps} width={54} tickFormatter={formatValue} />
            <Tooltip
              content={<ChartTooltip formats={formats} />}
              cursor={{ fill: theme.cursor }}
            />
            <Bar dataKey={metric} fill={config.color} radius={[4, 4, 0, 0]} maxBarSize={38} />
          </BarChart>
        ) : variant === 'line' ? (
          <LineChart data={data} margin={{ top: 8, right: 20, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={16} />
            <YAxis {...axisProps} width={54} tickFormatter={formatValue} />
            <Tooltip content={<ChartTooltip formats={formats} />} cursor={{ stroke: theme.grid }} />
            <Line
              type="monotone"
              dataKey={metric}
              stroke={config.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
            />
          </LineChart>
        ) : (
          <AreaChart data={data} margin={{ top: 8, right: 20, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={config.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={config.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={16} />
            <YAxis {...axisProps} width={54} tickFormatter={formatValue} />
            <Tooltip content={<ChartTooltip formats={formats} />} cursor={{ stroke: theme.grid }} />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={config.color}
              strokeWidth={2}
              fill={`url(#fill-${metric})`}
              activeDot={{ r: 4, strokeWidth: 2 }}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Compact inline trend used inside KPI cards. */
export function Sparkline({ data, color = '#6d4ae4' }: { data: number[]; color?: string }) {
  const points = data.map((value, index) => ({ index, value }));
  const id = useState(() => `spark-${Math.random().toString(36).slice(2, 8)}`)[0];

  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${id})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
