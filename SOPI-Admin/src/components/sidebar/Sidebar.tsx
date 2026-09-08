import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { NAVIGATION, type NavItem } from '@/routes/navigation';
import { usePermissions } from '@/hooks';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { mobileNavToggled, sidebarToggled } from '@/store/slices/uiSlice';
import { IconButton } from '@/components/common/Button';
import { USE_MOCK_API } from '@/store/api/baseQuery';

export interface SidebarBadges {
  pendingOrders?: number;
  pendingReviews?: number;
  lowStock?: number;
  unreadNotifications?: number;
}

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        S
      </span>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            SOPII
          </p>
          <p className="truncate text-2xs text-ink-500 dark:text-ink-400">Admin Console</p>
        </div>
      )}
    </div>
  );
}

function NavBadge({ value, collapsed }: { value?: number; collapsed: boolean }) {
  if (!value) return null;
  if (collapsed) {
    return (
      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-500" />
    );
  }
  return (
    <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-100 px-1.5 text-2xs font-semibold tabular-nums text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
      {value > 99 ? '99+' : value}
    </span>
  );
}

function SidebarItem({
  item,
  collapsed,
  badges,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  badges: SidebarBadges;
  onNavigate: () => void;
}) {
  const location = useLocation();
  const isSectionActive = item.match
    ? location.pathname.startsWith(item.match)
    : location.pathname === item.to;

  const [expanded, setExpanded] = useState(isSectionActive);

  useEffect(() => {
    if (isSectionActive) setExpanded(true);
  }, [isSectionActive]);

  const badgeValue = item.badge ? badges[item.badge] : undefined;
  const Icon = item.icon;
  const hasChildren = Boolean(item.children?.length) && !collapsed;

  return (
    <li>
      <div className="relative">
        <NavLink
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0',
              isActive || isSectionActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100',
            )
          }
        >
          {(isSectionActive || location.pathname === item.to) && (
            <span className="absolute inset-y-1 -left-2 w-0.5 rounded-full bg-brand-600 dark:bg-brand-400" />
          )}
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && <span className="truncate">{item.label}</span>}
          <NavBadge value={badgeValue} collapsed={collapsed} />
        </NavLink>

        {hasChildren && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.label} submenu`}
            aria-expanded={expanded}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 transition-colors hover:bg-ink-200/60 hover:text-ink-700 dark:hover:bg-ink-700"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-ink-200 pl-3 dark:border-ink-800">
          {item.children?.map((child) => (
            <li key={child.to}>
              <NavLink
                to={child.to}
                end={child.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'block truncate rounded-md px-2 py-1.5 text-xs transition-colors',
                    isActive
                      ? 'font-medium text-brand-700 dark:text-brand-300'
                      : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-200',
                  )
                }
              >
                {child.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function SidebarContent({
  collapsed,
  badges,
  onNavigate,
}: {
  collapsed: boolean;
  badges: SidebarBadges;
  onNavigate: () => void;
}) {
  const { can } = usePermissions();

  const sections = useMemo(
    () =>
      NAVIGATION.map((section) => ({
        ...section,
        items: section.items.filter((item) => can(item.resource, 'view')),
      })).filter((section) => section.items.length > 0),
    [can],
  );

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
      {sections.map((section, index) => (
        <div key={section.label ?? index}>
          {section.label && !collapsed && (
            <p className="mb-1.5 px-2.5 text-2xs font-semibold uppercase tracking-wider text-ink-400 dark:text-ink-500">
              {section.label}
            </p>
          )}
          {section.label && collapsed && index > 0 && (
            <div className="mx-auto mb-2 h-px w-6 bg-ink-200 dark:bg-ink-800" />
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <SidebarItem
                key={item.to}
                item={item}
                collapsed={collapsed}
                badges={badges}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ badges }: { badges: SidebarBadges }) {
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);
  const mobileOpen = useAppSelector((state) => state.ui.mobileNavOpen);
  const location = useLocation();

  useEffect(() => {
    dispatch(mobileNavToggled(false));
  }, [location.pathname, dispatch]);

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col border-r border-ink-200 bg-white transition-[width] duration-200 dark:border-ink-800 dark:bg-ink-900 lg:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b border-ink-200 px-4 dark:border-ink-800',
            collapsed ? 'justify-center px-2' : 'justify-between',
          )}
        >
          <Logo collapsed={collapsed} />
          {!collapsed && (
            <IconButton
              label="Collapse sidebar"
              size="sm"
              onClick={() => dispatch(sidebarToggled())}
            >
              <PanelLeftClose className="h-4 w-4" />
            </IconButton>
          )}
        </div>

        <SidebarContent collapsed={collapsed} badges={badges} onNavigate={() => {}} />

        <div className="border-t border-ink-200 p-3 dark:border-ink-800">
          {collapsed ? (
            <IconButton
              label="Expand sidebar"
              size="sm"
              className="mx-auto"
              onClick={() => dispatch(sidebarToggled())}
            >
              <PanelLeftOpen className="h-4 w-4" />
            </IconButton>
          ) : (
            <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-800/60">
              <p className="text-xs font-medium text-ink-800 dark:text-ink-200">
                {USE_MOCK_API ? 'Demo dataset' : 'Live data'}
              </p>
              <p className="mt-0.5 text-2xs leading-relaxed text-ink-500 dark:text-ink-400">
                {USE_MOCK_API
                  ? 'Every screen runs on mock data served by the in-app API layer.'
                  : 'Every screen reads and writes the live SOPII API.'}
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-[2px]"
            onClick={() => dispatch(mobileNavToggled(false))}
            aria-hidden
          />
          <aside className="relative flex h-full w-[17rem] max-w-[85vw] animate-slide-in-right flex-col border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink-200 px-4 dark:border-ink-800">
              <Logo collapsed={false} />
              <IconButton
                label="Close navigation"
                size="sm"
                onClick={() => dispatch(mobileNavToggled(false))}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <SidebarContent
              collapsed={false}
              badges={badges}
              onNavigate={() => dispatch(mobileNavToggled(false))}
            />
          </aside>
        </div>
      )}
    </>
  );
}
