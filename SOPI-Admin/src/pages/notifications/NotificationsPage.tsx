import { useState } from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle } from '@/hooks';
import {
  useClearNotificationsMutation,
  useDeleteNotificationMutation,
  useGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/store/api/platformApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader, Tabs } from '@/components/common/PageHeader';
import { Card } from '@/components/common/Card';
import { Button, IconButton } from '@/components/common/Button';
import { FilterChip } from '@/components/common/SearchInput';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/States';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { NotificationRow } from '@/components/header/Header';
import { useToast } from '@/components/common/Toast';
import { formatNumber } from '@/utils/format';
import type { NotificationType } from '@/types';

const TYPE_FILTERS: { key: NotificationType | 'all'; label: string }[] = [
  { key: 'all', label: 'All types' },
  { key: 'new_order', label: 'Orders' },
  { key: 'payment_received', label: 'Payments' },
  { key: 'low_stock', label: 'Low stock' },
  { key: 'new_customer', label: 'Customers' },
  { key: 'new_review', label: 'Reviews' },
  { key: 'order_cancelled', label: 'Cancellations' },
  { key: 'return_requested', label: 'Returns' },
];

export default function NotificationsPage() {
  useDocumentTitle('Notifications');

  const toast = useToast();

  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [type, setType] = useState<NotificationType | 'all'>('all');
  const [clearOpen, setClearOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useGetNotificationsQuery({
    type: type === 'all' ? undefined : type,
    unread: tab === 'unread' ? true : undefined,
  });

  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
  const [deleteNotification] = useDeleteNotificationMutation();
  const [clearAll, { isLoading: clearing }] = useClearNotificationsMutation();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const handleMarkAll = async () => {
    try {
      const result = await markAllRead().unwrap();
      toast.success(`${result.affected} notifications marked as read`);
    } catch (error) {
      toast.error('Could not mark notifications as read', errorMessage(error));
    }
  };

  const handleDelete = async (id: string, title: string) => {
    try {
      await deleteNotification(id).unwrap();
      toast.success('Notification dismissed', title);
    } catch (error) {
      toast.error('Could not dismiss the notification', errorMessage(error));
    }
  };

  const handleClearAll = async () => {
    try {
      const result = await clearAll().unwrap();
      toast.success(`${result.affected} notifications cleared`);
      setClearOpen(false);
    } catch (error) {
      toast.error('Could not clear notifications', errorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description={
          unread > 0
            ? `${formatNumber(unread)} unread ${unread === 1 ? 'update' : 'updates'} across the store.`
            : 'Everything here has been read.'
        }
        actions={
          <>
            <Button
              size="sm"
              variant="secondary"
              icon={<CheckCheck className="h-3.5 w-3.5" />}
              loading={markingAll}
              disabled={unread === 0}
              onClick={handleMarkAll}
            >
              Mark all read
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              disabled={(data?.total ?? 0) === 0}
              onClick={() => setClearOpen(true)}
            >
              <span className="hidden sm:inline">Clear all</span>
            </Button>
          </>
        }
      />

      <Tabs
        items={[
          { key: 'all', label: 'All', count: type === 'all' ? data?.total : undefined },
          { key: 'unread', label: 'Unread', count: unread },
        ]}
        active={tab}
        onChange={(key) => setTab(key as 'all' | 'unread')}
      />

      <div className="flex flex-wrap gap-1.5">
        {TYPE_FILTERS.map((filter) => (
          <FilterChip
            key={filter.key}
            label={filter.label}
            active={type === filter.key}
            onClick={() => setType(filter.key)}
          />
        ))}
      </div>

      <Card className="overflow-hidden">
        {isError ? (
          <ErrorState onRetry={refetch} />
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={tab === 'unread' ? 'No unread notifications.' : 'No notifications found.'}
            description={
              tab === 'unread'
                ? 'You are all caught up.'
                : 'Store activity such as new orders and low stock alerts lands here.'
            }
          />
        ) : (
          <ul className="divide-y divide-ink-200 dark:divide-ink-800">
            {items.map((notification) => (
              <li
                key={notification.id}
                className={cn(
                  'group relative transition-colors',
                  !notification.read && 'bg-brand-50/30 dark:bg-brand-500/5',
                )}
              >
                <div className="p-1.5 pr-12">
                  <NotificationRow
                    notification={notification}
                    onRead={(id) => markRead(id)}
                  />
                </div>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <IconButton
                    label={`Dismiss ${notification.title}`}
                    size="sm"
                    onClick={() => handleDelete(notification.id, notification.title)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmModal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={handleClearAll}
        loading={clearing}
        tone="danger"
        confirmLabel="Clear all"
        title="Clear every notification?"
        description="The full notification history will be removed for all admins. This cannot be undone."
      />
    </div>
  );
}
