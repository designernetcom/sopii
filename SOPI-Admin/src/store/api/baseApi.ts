import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';

/**
 * Single API slice. Every feature injects its own endpoints so the domains stay
 * in separate files while sharing one cache, one middleware and one tag space.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: [
    'Product',
    'Category',
    'Collection',
    'Order',
    'Customer',
    'Inventory',
    'StockMovement',
    'Coupon',
    'Review',
    'Banner',
    'HomeSection',
    'Media',
    'Notification',
    'AdminUser',
    'Role',
    'Settings',
    'Seo',
    'Dashboard',
    'Report',
    'Auth',
  ],
  refetchOnMountOrArgChange: false,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
