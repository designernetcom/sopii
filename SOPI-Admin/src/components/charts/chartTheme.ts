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
        grid: '#2b323b',
        axis: '#6b7787',
        tooltipBg: '#1c2129',
        tooltipBorder: '#3f4854',
        tooltipText: '#eef0f2',
        cursor: 'rgba(129, 104, 241, 0.12)',
      }
    : {
        grid: '#eef0f2',
        axis: '#95a0ae',
        tooltipBg: '#ffffff',
        tooltipBorder: '#dfe3e8',
        tooltipText: '#1c2129',
        cursor: 'rgba(109, 74, 228, 0.07)',
      };
}
