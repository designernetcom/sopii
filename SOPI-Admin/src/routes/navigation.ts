import {
  BadgePercent,
  Boxes,
  FileBarChart,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  Search,
  MessageSquareText,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tags,
  Users,
  UserCog,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import type { ResourceKey } from '@/types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  resource: ResourceKey;
  /** Marks the item active for nested routes (`/admin/products/123`). */
  match?: string;
  end?: boolean;
  children?: { label: string; to: string; resource?: ResourceKey; end?: boolean }[];
  /** Key resolved against live counts to render a badge. */
  badge?: 'pendingOrders' | 'pendingReviews' | 'lowStock' | 'unreadNotifications';
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    items: [
      {
        label: 'Dashboard',
        to: '/admin/dashboard',
        icon: LayoutDashboard,
        resource: 'dashboard',
        end: true,
      },
    ],
  },
  {
    label: 'Catalog',
    items: [
      {
        label: 'Products',
        to: '/admin/products',
        icon: Package,
        resource: 'products',
        match: '/admin/products',
        children: [
          { label: 'All Products', to: '/admin/products', end: true },
          { label: 'Add Product', to: '/admin/products/create' },
        ],
      },
      { label: 'Categories', to: '/admin/categories', icon: Tags, resource: 'categories' },
      { label: 'Collections', to: '/admin/collections', icon: Sparkles, resource: 'collections' },
      {
        label: 'Inventory',
        to: '/admin/inventory',
        icon: Boxes,
        resource: 'inventory',
        match: '/admin/inventory',
        badge: 'lowStock',
        children: [
          { label: 'Stock Levels', to: '/admin/inventory', end: true },
          { label: 'Stock History', to: '/admin/inventory/history' },
        ],
      },
    ],
  },
  {
    label: 'Sales',
    items: [
      {
        label: 'Orders',
        to: '/admin/orders',
        icon: ShoppingCart,
        resource: 'orders',
        match: '/admin/orders',
        badge: 'pendingOrders',
      },
      {
        label: 'Customers',
        to: '/admin/customers',
        icon: Users,
        resource: 'customers',
        match: '/admin/customers',
      },
      { label: 'Coupons', to: '/admin/coupons', icon: BadgePercent, resource: 'coupons' },
      {
        label: 'Reviews',
        to: '/admin/reviews',
        icon: MessageSquareText,
        resource: 'reviews',
        badge: 'pendingReviews',
      },
    ],
  },
  {
    label: 'Storefront',
    items: [
      { label: 'Homepage', to: '/admin/homepage', icon: LayoutTemplate, resource: 'homepage' },
      { label: 'SEO Management', to: '/admin/seo', icon: Search, resource: 'seo' },
      { label: 'Media Library', to: '/admin/media', icon: Image, resource: 'media' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports', to: '/admin/reports', icon: FileBarChart, resource: 'reports' },
      {
        label: 'Notifications',
        to: '/admin/notifications',
        icon: Bell,
        resource: 'notifications',
        badge: 'unreadNotifications',
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Admin Users', to: '/admin/admin-users', icon: UserCog, resource: 'admin_users' },
      { label: 'Roles & Permissions', to: '/admin/roles', icon: ShieldCheck, resource: 'roles' },
      { label: 'Settings', to: '/admin/settings', icon: Settings, resource: 'settings' },
    ],
  },
];

/* --------------------------------- crumbs ---------------------------------- */

const CRUMB_LABELS: Record<string, string> = {
  admin: 'Admin',
  dashboard: 'Dashboard',
  products: 'Products',
  create: 'Add Product',
  edit: 'Edit',
  categories: 'Categories',
  collections: 'Collections',
  inventory: 'Inventory',
  history: 'Stock History',
  orders: 'Orders',
  customers: 'Customers',
  coupons: 'Coupons',
  reviews: 'Reviews',
  homepage: 'Homepage',
  media: 'Media Library',
  seo: 'SEO Management',
  reports: 'Reports',
  notifications: 'Notifications',
  'admin-users': 'Admin Users',
  roles: 'Roles & Permissions',
  settings: 'Settings',
  profile: 'My Profile',
};

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * Builds breadcrumbs from the URL. `dynamicLabel` lets a detail page swap the
 * raw id segment for a human name once the record loads.
 */
export function buildCrumbs(pathname: string, dynamicLabel?: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [];

  segments.forEach((segment, index) => {
    const to = `/${segments.slice(0, index + 1).join('/')}`;
    const known = CRUMB_LABELS[segment];
    const isLast = index === segments.length - 1;

    if (segment === 'admin') {
      crumbs.push({ label: 'Admin', to: '/admin/dashboard' });
      return;
    }

    if (known) {
      crumbs.push({ label: known, to: isLast ? undefined : to });
      return;
    }

    // Unrecognised segment — treat it as a record id.
    crumbs.push({
      label: dynamicLabel ?? segment,
      to: isLast ? undefined : to,
    });
  });

  return crumbs;
}
