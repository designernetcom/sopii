import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategorySlice, OrderStatus } from '@/types';
import { CHART_COLORS, ORDER_STATUS } from '@/utils/constants';
import { formatCompactCurrency, formatNumber } from '@/utils/format';
import { useChartTheme } from './chartTheme';

export function CategoryDonut({ data }: { data: CategorySlice[] }) {
  const theme = useChartTheme();
  const total = data.reduce((sum, slice) => sum + slice.revenue, 0);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="revenue"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((slice, index) => (
                <Cell key={slice.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const slice = payload[0].payload as CategorySlice;
                return (
                  <div
                    className="rounded-lg border px-3 py-2 text-xs shadow-pop"
                    style={{
                      background: theme.tooltipBg,
                      borderColor: theme.tooltipBorder,
                      color: theme.tooltipText,
                    }}
                  >
                    <p className="font-semibold">{slice.name}</p>
                    <p className="mt-1 tabular-nums">{formatCompactCurrency(slice.revenue)}</p>
                    <p className="tabular-nums" style={{ color: theme.axis }}>
                      {formatNumber(slice.orders)} orders · {slice.percentage}%
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xs uppercase tracking-wide text-ink-400">Total</p>
          <p className="text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-100">
            {formatCompactCurrency(total)}
          </p>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2.5">
        {data.map((slice, index) => (
          <li key={slice.name} className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-ink-700 dark:text-ink-300">
              {slice.name}
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-medium tabular-nums text-ink-900 dark:text-ink-100">
                {formatCompactCurrency(slice.revenue)}
              </span>
              <span className="block text-2xs tabular-nums text-ink-500 dark:text-ink-400">
                {slice.percentage}% · {formatNumber(slice.orders)} orders
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal status bars — reads better than a second pie on the dashboard. */
export function OrderStatusBars({
  data,
}: {
  data: { status: OrderStatus; count: number }[];
}) {
  const max = Math.max(...data.map((item) => item.count), 1);

  return (
    <ul className="space-y-3">
      {data.map((item) => {
        const tone = ORDER_STATUS[item.status];
        return (
          <li key={item.status}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-ink-600 dark:text-ink-400">
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                {tone.label}
              </span>
              <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
                {formatNumber(item.count)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
              <div
                className={`h-full rounded-full ${tone.dot}`}
                style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
