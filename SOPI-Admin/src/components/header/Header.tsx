import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  ChevronRight,
  ExternalLink,
  LogOut,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Sun,
  TriangleAlert,
  User,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { mobileNavToggled, themeChanged, type ThemePreference } from '@/store/slices/uiSlice';
import { useLogout } from '@/hooks/useLogout';
import { buildCrumbs } from '@/routes/navigation';
import { Avatar } from '@/components/common/AppImage';
import { Button, IconButton } from '@/components/common/Button';
import { Dropdown, DropdownDivider, DropdownItem, DropdownLabel } from '@/components/common/Dropdown';
import { GlobalSearch } from './GlobalSearch';
import { useToast } from '@/components/common/Toast';
import {
  useGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/store/api/platformApi';
import { formatRelativeTime } from '@/utils/format';
import type { AppNotification, NotificationType } from '@/types';

/* -------------------------------- breadcrumb ------------------------------- */

function Breadcrumbs({ label }: { label?: string }) {
  const location = useLocation();
  const crumbs = buildCrumbs(location.pathname, label);

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
      <ol className="flex items-center gap-1 text-xs">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-ink-300" aria-hidden />}
            {crumb.to ? (
              <Link
                to={crumb.to}
                className="truncate text-ink-500 transition-colors hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-ink-900 dark:text-ink-100">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ------------------------------- theme toggle ------------------------------ */

const THEME_OPTIONS: { key: ThemePreference; label: string; icon: typeof Sun }[] = [
  { key: 'light', label: 'Light Mode', icon: Sun },
  { key: 'dark', label: 'Dark Mode', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((state) => state.ui.theme);
  const Current = THEME_OPTIONS.find((option) => option.key === theme)?.icon ?? Monitor;

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <IconButton label="Change theme" onClick={toggle}>
          <Current className="h-4 w-4" />
        </IconButton>
      )}
      panelClassName="w-40"
    >
      <DropdownLabel>Appearance</DropdownLabel>
      {THEME_OPTIONS.map((option) => (
        <DropdownItem
          key={option.key}
          icon={<option.icon />}
          onClick={() => dispatch(themeChanged(option.key))}
        >
          <span className="flex items-center justify-between gap-2">
            {option.label}
            {theme === option.key && <Check className="h-3.5 w-3.5 text-brand-600" />}
          </span>
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

/* ------------------------------- notifications ----------------------------- */

const NOTIFICATION_ICONS: Record<NotificationType, { icon: typeof Bell; tone: string }> = {
  new_order: { icon: ShoppingCart, tone: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400' },
  payment_received: { icon: Check, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  low_stock: { icon: TriangleAlert, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  new_customer: { icon: UserPlus, tone: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
  new_review: { icon: MessageSquare, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' },
  order_cancelled: { icon: Package, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
  return_requested: { icon: Package, tone: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' },
};

export function NotificationRow({
  notification,
  onRead,
  onNavigate,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const config = NOTIFICATION_ICONS[notification.type] ?? NOTIFICATION_ICONS.new_order;
  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={() => {
        if (!notification.read) onRead(notification.id);
        if (notification.link) navigate(notification.link);
        onNavigate?.();
      }}
      className={cn(
        'flex w-full gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/60',
        !notification.read && 'bg-brand-50/40 dark:bg-brand-500/5',
      )}
    >
      <span
        className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', config.tone)}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-sm font-medium text-ink-900 dark:text-ink-100">
            {notification.title}
          </span>
          {!notification.read && (
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
          )}
        </span>
        <span className="mt-0.5 block line-clamp-2 text-xs text-ink-500 dark:text-ink-400">
          {notification.message}
        </span>
        <span className="mt-1 block text-2xs text-ink-400">
          {formatRelativeTime(notification.createdAt)}
        </span>
      </span>
    </button>
  );
}

function NotificationsMenu() {
  const { data, isLoading } = useGetNotificationsQuery({ limit: 6 });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
  const toast = useToast();

  const unread = data?.unread ?? 0;

  return (
    <Dropdown
      persistent
      trigger={({ toggle }) => (
        <IconButton label={`Notifications${unread ? ` (${unread} unread)` : ''}`} onClick={toggle}>
          <span className="relative">
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </span>
        </IconButton>
      )}
      panelClassName="w-[22rem] max-w-[calc(100vw-1.5rem)]"
    >
      {({ close }) => (
        <>
          <div className="flex items-center justify-between px-2.5 py-2">
            <p className="text-sm font-semibold text-ink-900 dark:text-ink-100">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                disabled={markingAll}
                onClick={async () => {
                  await markAllRead().unwrap();
                  toast.success('All notifications marked as read');
                }}
                className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
              >
                Mark all read
              </button>
            )}
          </div>
          <DropdownDivider />
          <div className="max-h-80 overflow-y-auto p-1">
            {isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-14 w-full" />
                ))}
              </div>
            ) : data?.items.length ? (
              data.items.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onRead={(id) => markRead(id)}
                  onNavigate={close}
                />
              ))
            ) : (
              <p className="px-3 py-8 text-center text-sm text-ink-500 dark:text-ink-400">
                You are all caught up.
              </p>
            )}
          </div>
          <DropdownDivider />
          <DropdownItem to="/admin/notifications" onClick={close}>
            View all notifications
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}

/* --------------------------------- profile --------------------------------- */

function ProfileMenu() {
  const logout = useLogout();
  const user = useAppSelector((state) => state.auth.user);
  const toast = useToast();

  if (!user) return null;

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 rounded-lg p-1 pr-1.5 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
          aria-label="Account menu"
        >
          <Avatar name={user.name} src={user.avatar} size="sm" />
          <span className="hidden min-w-0 text-left lg:block">
            <span className="block max-w-[9rem] truncate text-xs font-medium text-ink-900 dark:text-ink-100">
              {user.name}
            </span>
            <span className="block max-w-[9rem] truncate text-2xs text-ink-500 dark:text-ink-400">
              {user.roleName}
            </span>
          </span>
        </button>
      )}
      panelClassName="w-56"
    >
      <div className="px-2.5 py-2">
        <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">{user.name}</p>
        <p className="truncate text-xs text-ink-500 dark:text-ink-400">{user.email}</p>
      </div>
      <DropdownDivider />
      <DropdownItem to="/admin/profile" icon={<User />}>
        My Profile
      </DropdownItem>
      <DropdownItem to="/admin/profile" icon={<Settings />}>
        Account Settings
      </DropdownItem>
      <DropdownItem to="/admin/settings" icon={<Store />}>
        Store Settings
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem
        danger
        icon={<LogOut />}
        onClick={() => {
          void logout();
          toast.info('Signed out', 'You have been logged out of the admin console.');
        }}
      >
        Logout
      </DropdownItem>
    </Dropdown>
  );
}

/* ---------------------------------- header --------------------------------- */

export function Header({ breadcrumbLabel }: { breadcrumbLabel?: string }) {
  const dispatch = useAppDispatch();
  const toast = useToast();

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/85 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/85">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
        <IconButton
          label="Open navigation"
          className="lg:hidden"
          onClick={() => dispatch(mobileNavToggled(true))}
        >
          <Menu className="h-4 w-4" />
        </IconButton>

        <Breadcrumbs label={breadcrumbLabel} />

        <div className="mx-auto hidden w-full max-w-md md:block">
          <GlobalSearch />
        </div>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <IconButton
            label="Messages"
            className="hidden sm:inline-flex"
            onClick={() =>
              toast.info('Messages', 'The support inbox connects once the API is wired up.')
            }
          >
            <span className="relative">
              <MessageSquare className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-brand-500" />
            </span>
          </IconButton>

          <NotificationsMenu />
          <ThemeToggle />

          <Button
            variant="ghost"
            size="sm"
            className="hidden xl:inline-flex"
            iconRight={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() =>
              toast.info('Store preview', 'Opens the SOPII storefront once it is deployed.')
            }
          >
            View store
          </Button>

          <div className="mx-1 hidden h-5 w-px bg-ink-200 dark:bg-ink-700 sm:block" />
          <ProfileMenu />
        </div>
      </div>

      <div className="border-t border-ink-200 px-3 py-2 dark:border-ink-800 md:hidden">
        <GlobalSearch />
      </div>
    </header>
  );
}
