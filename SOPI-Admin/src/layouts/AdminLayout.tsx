import { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { useAppSelector } from '@/store/hooks';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { Header } from '@/components/header/Header';
import { PageLoader } from '@/components/common/States';
import { BreadcrumbProvider, useBreadcrumb } from '@/components/layout/BreadcrumbContext';
import { useGetOrderCountsQuery } from '@/store/api/commerceApi';
import { useGetInventorySummaryQuery } from '@/store/api/commerceApi';
import { useGetReviewCountsQuery } from '@/store/api/marketingApi';
import { useGetNotificationsQuery } from '@/store/api/platformApi';

/** Applies the persisted theme preference and follows the OS when set to system. */
function useThemeEffect() {
  const theme = useAppSelector((state) => state.ui.theme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };

    apply();
    if (theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);
}

function LayoutShell() {
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);
  const { label } = useBreadcrumb();

  const { data: orderCounts } = useGetOrderCountsQuery();
  const { data: reviewCounts } = useGetReviewCountsQuery();
  const { data: inventory } = useGetInventorySummaryQuery();
  const { data: notifications } = useGetNotificationsQuery({ limit: 1 });

  const badges = {
    pendingOrders: orderCounts?.pending ?? 0,
    pendingReviews: reviewCounts?.pending ?? 0,
    lowStock: (inventory?.lowStock ?? 0) + (inventory?.outOfStock ?? 0),
    unreadNotifications: notifications?.unread ?? 0,
  };

  return (
    <div className="min-h-full bg-ink-50 dark:bg-ink-950">
      <Sidebar badges={badges} />

      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64')}>
        <Header breadcrumbLabel={label} />
        <main className="mx-auto w-full max-w-[100rem] px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export function AdminLayout() {
  useThemeEffect();

  return (
    <BreadcrumbProvider>
      <LayoutShell />
    </BreadcrumbProvider>
  );
}
