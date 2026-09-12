import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store/hooks';

/** Tracks the resolved colour scheme so Recharts can be styled to match. */
export function useIsDark() {
  const preference = useAppSelector((state) => state.ui.theme);
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const resolve = () =>
      setDark(preference === 'dark' || (preference === 'system' && media.matches));

    resolve();
    if (preference === 'system') {
      media.addEventListener('change', resolve);
      return () => media.removeEventListener('change', resolve);
    }
    return undefined;
  }, [preference]);

  return dark;
}

/*
 * Recharts styles its grid, axes and tooltip through SVG attributes rather
 * than classes, so these are literals where the rest of the admin uses tokens.
 * They mirror the `--c-ink-*` and `--c-brand-*` values in index.css — when the
 * palette there changes, change them here too.
 */
export interface ChartTheme {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  cursor: string;
}

export function useChartTheme(): ChartTheme {
  const dark = useIsDark();

  return dark
    ? {
        grid: '#36302e',
        axis: '#7e746f',
        tooltipBg: '#24201d',
        tooltipBorder: '#4d4642',
        tooltipText: '#f1efef',
        cursor: 'rgba(201, 114, 112, 0.14)',
      }
    : {
        grid: '#f1efef',
        axis: '#a79d98',
        tooltipBg: '#ffffff',
        tooltipBorder: '#e5e2e0',
        tooltipText: '#24201d',
        cursor: 'rgba(126, 31, 32, 0.07)',
      };
}
