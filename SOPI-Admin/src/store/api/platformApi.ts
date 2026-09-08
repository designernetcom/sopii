import type {
  AdminUser,
  AppNotification,
  AuthUser,
  CustomerReportRow,
  DashboardSummary,
  OrderReportRow,
  RangeKey,
  Role,
  SalesReportRow,
  Settings,
  WhatsAppSettings,
  WhatsAppSettingsInput,
  WhatsAppTestResult,
} from '@/types';
import type { SalesGrouping } from '@/data/analytics';
import { baseApi } from './baseApi';

export interface SearchResults {
  products: { id: string; name: string; sku: string; image?: string; price: number }[];
  orders: { id: string; code: string; customerName: string; total: number; status: string }[];
  customers: { id: string; name: string; email: string; ordersCount: number }[];
  coupons: { id: string; code: string; discountType: string; discountValue: number }[];
  total: number;
}

export interface ProductReportRow {
  id: string;
  name: string;
  sku: string;
  image?: string;
  category: string;
  price: number;
  stock: number;
  lowStockThreshold: number;
  unitsSold: number;
  revenue: number;
  status: string;
}

export interface SalesReportResponse {
  rows: SalesReportRow[];
  totals: {
    orders: number;
    units: number;
    revenue: number;
    discount: number;
    tax: number;
    net: number;
  };
}

export interface NotificationFeed {
  items: AppNotification[];
  total: number;
  unread: number;
}

export const platformApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /* -------------------------------- dashboard ------------------------------ */

    getDashboard: builder.query<DashboardSummary, RangeKey>({
      query: (range) => ({ url: '/dashboard', params: { range } }),
      providesTags: ['Dashboard'],
    }),

    /* --------------------------------- reports ------------------------------- */

    getSalesReport: builder.query<SalesReportResponse, { range: RangeKey; grouping: SalesGrouping }>({
      query: (params) => ({ url: '/reports/sales', params }),
      providesTags: ['Report'],
    }),

    getProductReport: builder.query<
      ProductReportRow[],
      { type: 'bestsellers' | 'low_stock' | 'out_of_stock' | 'revenue' }
    >({
      query: (params) => ({ url: '/reports/products', params }),
      providesTags: ['Report'],
    }),

    getCustomerReport: builder.query<
      CustomerReportRow[],
      { range: RangeKey; type: 'top' | 'new' | 'returning' }
    >({
      query: (params) => ({ url: '/reports/customers', params }),
      providesTags: ['Report'],
    }),

    getOrderReport: builder.query<OrderReportRow[], { range: RangeKey }>({
      query: (params) => ({ url: '/reports/orders', params }),
      providesTags: ['Report'],
    }),

    /* ---------------------------------- search ------------------------------- */

    globalSearch: builder.query<SearchResults, string>({
      query: (q) => ({ url: '/search', params: { q } }),
    }),

    /* ------------------------------ notifications ---------------------------- */

    getNotifications: builder.query<NotificationFeed, { limit?: number; type?: string; unread?: boolean } | void>({
      query: (params) => ({ url: '/notifications', params: params ?? {} }),
      providesTags: ['Notification'],
    }),

    markNotificationRead: builder.mutation<AppNotification, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'PUT' }),
      invalidatesTags: ['Notification'],
    }),

    markAllNotificationsRead: builder.mutation<{ affected: number }, void>({
      query: () => ({ url: '/notifications/read-all', method: 'PUT' }),
      invalidatesTags: ['Notification'],
    }),

    deleteNotification: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/notifications/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Notification'],
    }),

    clearNotifications: builder.mutation<{ affected: number }, void>({
      query: () => ({ url: '/notifications', method: 'DELETE' }),
      invalidatesTags: ['Notification'],
    }),

    /* ------------------------------ users & roles ---------------------------- */

    getAdminUsers: builder.query<AdminUser[], { search?: string; roleId?: string; status?: string } | void>({
      query: (params) => ({ url: '/admin-users', params: params ?? {} }),
      providesTags: [{ type: 'AdminUser', id: 'LIST' }],
    }),

    createAdminUser: builder.mutation<AdminUser, Partial<AdminUser>>({
      query: (body) => ({ url: '/admin-users', method: 'POST', body }),
      invalidatesTags: [{ type: 'AdminUser', id: 'LIST' }, 'Role'],
    }),

    updateAdminUser: builder.mutation<AdminUser, { id: string; body: Partial<AdminUser> }>({
      query: ({ id, body }) => ({ url: `/admin-users/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'AdminUser', id: 'LIST' }, 'Role'],
    }),

    deleteAdminUser: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/admin-users/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'AdminUser', id: 'LIST' }, 'Role'],
    }),

    getRoles: builder.query<Role[], void>({
      query: () => '/roles',
      providesTags: ['Role'],
    }),

    createRole: builder.mutation<Role, Partial<Role>>({
      query: (body) => ({ url: '/roles', method: 'POST', body }),
      invalidatesTags: ['Role'],
    }),

    updateRole: builder.mutation<Role, { id: string; body: Partial<Role> }>({
      query: ({ id, body }) => ({ url: `/roles/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Role', 'Auth'],
    }),

    deleteRole: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/roles/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Role'],
    }),

    /* --------------------------------- settings ------------------------------ */

    getSettings: builder.query<Settings, void>({
      query: () => '/settings',
      providesTags: ['Settings'],
    }),

    updateSettings: builder.mutation<Settings, { section: keyof Settings; body: unknown }>({
      query: ({ section, body }) => ({ url: `/settings/${section}`, method: 'PUT', body }),
      invalidatesTags: ['Settings'],
    }),

    /* ------------------------ authentication → whatsapp ---------------------- */

    /*
     * A separate endpoint from `/settings/:section`, and deliberately so. That
     * one writes its body straight onto the settings document, which is right
     * for shipping zones and quite wrong for a credential: the access token has
     * to be encrypted going in, preserved when the form submits a mask instead
     * of a new value, and stripped coming out. The server keeps those three
     * rules; this slice only has to talk to it.
     */
    getWhatsAppSettings: builder.query<WhatsAppSettings, void>({
      query: () => '/settings/authentication/whatsapp',
      providesTags: ['Settings'],
    }),

    updateWhatsAppSettings: builder.mutation<WhatsAppSettings, WhatsAppSettingsInput>({
      query: (body) => ({ url: '/settings/authentication/whatsapp', method: 'PUT', body }),
      invalidatesTags: ['Settings'],
    }),

    /**
     * §9's "Send Test WhatsApp Message".
     *
     * Not a cache mutation of anything — it invalidates no tags because it
     * changes no state. It sends one message through exactly the path a real
     * OTP takes, with a throwaway code the server never returns.
     */
    testWhatsApp: builder.mutation<WhatsAppTestResult, { mobile: string }>({
      query: (body) => ({ url: '/settings/authentication/whatsapp/test', method: 'POST', body }),
    }),

    /* ----------------------------------- auth -------------------------------- */

    /*
     * Signing in is not here: it lives in `authApi.ts`, outside the cache,
     * because it has to set cookies and carry a CSRF header that no other
     * endpoint in this slice wants. See that file for why.
     *
     * What remains are the panel's own self-service mutations. They still run
     * against the legacy `/auth/profile` and `/auth/two-factor` handlers, which
     * write the `admin_users` record every panel screen reads; the caller
     * re-reads `/auth/me` afterwards so the Redux user keeps the unified
     * identity's fields (live sessions, role, permissions) rather than being
     * overwritten with the legacy projection.
     */
    updateProfile: builder.mutation<AuthUser, Partial<AdminUser> & { id: string }>({
      query: (body) => ({ url: '/auth/profile', method: 'PUT', body }),
      invalidatesTags: ['Auth', { type: 'AdminUser', id: 'LIST' }],
    }),

    /*
     * POST, not the legacy PUT: this is the unified module's handler, which
     * applies §4's full password policy and signs out every other device.
     * The legacy PUT only checked a minimum length.
     */
    changePassword: builder.mutation<
      { ok: boolean; message: string; otherDevicesSignedOut: number },
      { currentPassword: string; newPassword: string; confirmPassword: string }
    >({
      query: (body) => ({ url: '/auth/password', method: 'POST', body }),
      invalidatesTags: ['Auth'],
    }),

    setTwoFactor: builder.mutation<AuthUser, { id: string; enabled: boolean }>({
      query: (body) => ({ url: '/auth/two-factor', method: 'PUT', body }),
      invalidatesTags: ['Auth'],
    }),

    /** The unified module's handler: revokes the real session, not an array row. */
    revokeSession: builder.mutation<
      { ok: boolean; selfRevoked: boolean },
      { id: string }
    >({
      query: ({ id }) => ({ url: `/auth/sessions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Auth'],
    }),
  }),
});

export const {
  useGetDashboardQuery,
  useGetSalesReportQuery,
  useGetProductReportQuery,
  useGetCustomerReportQuery,
  useGetOrderReportQuery,
  useGlobalSearchQuery,
  useLazyGlobalSearchQuery,
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useDeleteNotificationMutation,
  useClearNotificationsMutation,
  useGetAdminUsersQuery,
  useCreateAdminUserMutation,
  useUpdateAdminUserMutation,
  useDeleteAdminUserMutation,
  useGetRolesQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  useGetWhatsAppSettingsQuery,
  useUpdateWhatsAppSettingsMutation,
  useTestWhatsAppMutation,
  useUpdateProfileMutation,
  useChangePasswordMutation,
  useSetTwoFactorMutation,
  useRevokeSessionMutation,
} = platformApi;
