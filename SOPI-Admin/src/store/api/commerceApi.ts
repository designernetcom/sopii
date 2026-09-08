import type {
  Customer,
  InventoryRow,
  ListParams,
  Order,
  OrderEmailKind,
  OrderStatus,
  Paginated,
  Product,
  Review,
  StockMovement,
  StockMovementType,
} from '@/types';
import { baseApi } from './baseApi';

export interface OrderListParams extends ListParams {
  status?: string | string[];
  paymentStatus?: string | string[];
  paymentMethod?: string | string[];
  customerId?: string;
  from?: string;
  to?: string;
  minTotal?: number;
  maxTotal?: number;
}

export interface CustomerDetail {
  customer: Customer;
  orders: Order[];
  reviews: Review[];
  wishlist: Product[];
  stats: { totalOrders: number; totalSpent: number; aov: number; lastPurchase?: string };
}

export interface InventorySummary {
  totalStock: number;
  lowStock: number;
  outOfStock: number;
  stockValue: number;
  skuCount: number;
  reserved: number;
}

export const commerceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /* --------------------------------- orders -------------------------------- */

    getOrders: builder.query<Paginated<Order>, OrderListParams | void>({
      query: (params) => ({ url: '/orders', params: params ?? {} }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Order' as const, id })),
              { type: 'Order' as const, id: 'LIST' },
            ]
          : [{ type: 'Order' as const, id: 'LIST' }],
    }),

    getOrderCounts: builder.query<Record<string, number>, void>({
      query: () => '/orders/counts',
      providesTags: [{ type: 'Order', id: 'COUNTS' }],
    }),

    getOrder: builder.query<Order, string>({
      query: (id) => `/orders/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Order', id }],
    }),

    updateOrderStatus: builder.mutation<
      Order,
      { id: string; status: OrderStatus; note?: string; by?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/orders/${id}/status`, method: 'PUT', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Order', id },
        { type: 'Order', id: 'LIST' },
        { type: 'Order', id: 'COUNTS' },
        'Dashboard',
        'Inventory',
      ],
    }),

    updateOrder: builder.mutation<Order, { id: string; body: Partial<Order> }>({
      query: ({ id, body }) => ({ url: `/orders/${id}`, method: 'PUT', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Order', id },
        { type: 'Order', id: 'LIST' },
      ],
    }),

    addOrderNote: builder.mutation<Order, { id: string; note: string; by?: string }>({
      query: ({ id, ...body }) => ({ url: `/orders/${id}/note`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Order', id }],
    }),

    /**
     * Sends an order email again.
     *
     * The server answers 502 when the send failed, which RTK Query surfaces as
     * an error — so the caller can report the provider's own reason rather than
     * a generic failure. The order comes back on the response either way,
     * because a failed attempt is still recorded against it.
     */
    resendOrderEmail: builder.mutation<
      {
        status: 'sent' | 'failed' | 'skipped';
        recipient: string;
        messageId?: string;
        error?: string;
        order?: Order;
      },
      { id: string; kind?: OrderEmailKind }
    >({
      query: ({ id, kind }) => ({
        url: `/orders/${id}/resend-email`,
        method: 'POST',
        body: { kind: kind ?? 'order_confirmation' },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Order', id }],
    }),

    /* -------------------------------- customers ------------------------------ */

    getCustomers: builder.query<Paginated<Customer>, ListParams | void>({
      query: (params) => ({ url: '/customers', params: params ?? {} }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Customer' as const, id })),
              { type: 'Customer' as const, id: 'LIST' },
            ]
          : [{ type: 'Customer' as const, id: 'LIST' }],
    }),

    getCustomer: builder.query<CustomerDetail, string>({
      query: (id) => `/customers/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Customer', id }],
    }),

    updateCustomer: builder.mutation<Customer, { id: string; body: Partial<Customer> }>({
      query: ({ id, body }) => ({ url: `/customers/${id}`, method: 'PUT', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Customer', id },
        { type: 'Customer', id: 'LIST' },
      ],
    }),

    deleteCustomer: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/customers/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Customer', id: 'LIST' }],
    }),

    /* -------------------------------- inventory ------------------------------ */

    getInventory: builder.query<Paginated<InventoryRow>, ListParams | void>({
      query: (params) => ({ url: '/inventory', params: params ?? {} }),
      providesTags: [{ type: 'Inventory', id: 'LIST' }],
    }),

    getInventorySummary: builder.query<InventorySummary, void>({
      query: () => '/inventory/summary',
      providesTags: [{ type: 'Inventory', id: 'SUMMARY' }],
    }),

    adjustStock: builder.mutation<
      { row: InventoryRow; movement: StockMovement },
      {
        id: string;
        type: StockMovementType;
        quantity: number;
        mode?: 'add' | 'set';
        reason?: string;
        admin?: string;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/inventory/${id}/adjust`, method: 'POST', body }),
      invalidatesTags: [
        { type: 'Inventory', id: 'LIST' },
        { type: 'Inventory', id: 'SUMMARY' },
        'StockMovement',
        { type: 'Product', id: 'LIST' },
      ],
    }),

    getStockHistory: builder.query<Paginated<StockMovement>, ListParams | void>({
      query: (params) => ({ url: '/inventory/history', params: params ?? {} }),
      providesTags: ['StockMovement'],
    }),
  }),
});

export const {
  useGetOrdersQuery,
  useGetOrderCountsQuery,
  useGetOrderQuery,
  useUpdateOrderStatusMutation,
  useUpdateOrderMutation,
  useAddOrderNoteMutation,
  useResendOrderEmailMutation,
  useGetCustomersQuery,
  useGetCustomerQuery,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useGetInventoryQuery,
  useGetInventorySummaryQuery,
  useAdjustStockMutation,
  useGetStockHistoryQuery,
} = commerceApi;
