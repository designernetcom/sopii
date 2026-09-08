import type { TooltipProps } from 'recharts';
import { useChartTheme } from './chartTheme';

export interface TooltipEntryFormat {
  label: string;
  format?: (value: number) => string;
  color?: string;
}

/**
 * Shared tooltip surface — Recharts' default is unstyled and does not follow
 * the dark theme.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formats,
  labelPrefix,
}: TooltipProps<number, string> & {
  formats?: Record<string, TooltipEntryFormat>;
  labelPrefix?: string;
}) {
  const theme = useChartTheme();
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-pop"
      style={{
        background: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        color: theme.tooltipText,
      }}
    >
      <p className="text-2xs font-semibold uppercase tracking-wide" style={{ color: theme.axis }}>
        {labelPrefix}
        {label}
      </p>
      <div className="mt-1.5 space-y-1">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? '');
          const config = formats?.[key];
          const value = Number(entry.value ?? 0);
          return (
            <div key={key} className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: config?.color ?? entry.color ?? entry.stroke }}
                />
                {config?.label ?? entry.name ?? key}
              </span>
              <span className="font-semibold tabular-nums">
                {config?.format ? config.format(value) : value.toLocaleString('en-IN')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
