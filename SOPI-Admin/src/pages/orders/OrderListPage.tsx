import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Eye, MoreHorizontal, ShoppingCart, Truck, XCircle } from 'lucide-react';
import { useDocumentTitle, useListQuery, usePermissions } from '@/hooks';
import { useGetOrderCountsQuery, useGetOrdersQuery, useUpdateOrderStatusMutation } from '@/store/api/commerceApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader, Tabs } from '@/components/common/PageHeader';
import { Button, IconButton } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/Badge';
import { Avatar } from '@/components/common/AppImage';
import { SearchInput } from '@/components/common/SearchInput';
import { Input, Select } from '@/components/common/Field';
import { Dropdown, DropdownDivider, DropdownItem, DropdownLabel } from '@/components/common/Dropdown';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useToast } from '@/components/common/Toast';
import {
  FULFILLMENT_STATUS,
  ORDER_STATUS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS,
} from '@/utils/constants';
import { formatCurrency, formatDate, formatNumber } from '@/utils/format';
import { downloadCsv } from '@/utils/export';
import { useAppSelector } from '@/store/hooks';
import type { Order, OrderStatus } from '@/types';

const TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'returned', label: 'Returned' },
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'confirmed',
  confirmed: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
};

export default function OrderListPage() {
  useDocumentTitle('Orders');

  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const admin = useAppSelector((state) => state.auth.user);

  const query = useListQuery({ pageSize: 10, sortBy: 'placedAt', sortDir: 'desc' });
  const { data, isLoading, isError, refetch } = useGetOrdersQuery(query.params);
  const { data: counts } = useGetOrderCountsQuery();
  const [updateStatus, { isLoading: updating }] = useUpdateOrderStatusMutation();

  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  const activeTab = (query.state.status as string) || 'all';

  const advance = async (order: Order, status: OrderStatus) => {
    try {
      await updateStatus({ id: order.id, status, by: admin?.name }).unwrap();
      toast.success('Order status updated.', `#${order.code} → ${ORDER_STATUS[status].label}`);
    } catch (error) {
      toast.error('Could not update the order', errorMessage(error));
    }
  };

  const exportOrders = () => {
    const rows = data?.items ?? [];
    if (!rows.length) {
      toast.warning('Nothing to export', 'Adjust your filters and try again.');
      return;
    }
    downloadCsv('sopii-orders', rows, [
      { key: 'code', header: 'Order ID', value: (row) => row.code },
      { key: 'date', header: 'Date', value: (row) => formatDate(row.placedAt, true) },
      { key: 'customer', header: 'Customer', value: (row) => row.customerName },
      { key: 'email', header: 'Email', value: (row) => row.customerEmail },
      { key: 'phone', header: 'Phone', value: (row) => row.customerPhone },
      { key: 'items', header: 'Items', value: (row) => row.items.length },
      { key: 'subtotal', header: 'Subtotal', value: (row) => row.subtotal },
      { key: 'discount', header: 'Discount', value: (row) => row.discount },
      { key: 'tax', header: 'Tax', value: (row) => row.tax },
      { key: 'shipping', header: 'Shipping', value: (row) => row.shipping },
      { key: 'total', header: 'Total', value: (row) => row.total },
      { key: 'payment', header: 'Payment', value: (row) => PAYMENT_METHOD_LABEL[row.paymentMethod] },
      { key: 'paymentStatus', header: 'Payment Status', value: (row) => row.paymentStatus },
      { key: 'status', header: 'Status', value: (row) => row.status },
    ]);
    toast.success('Export ready', `${rows.length} orders downloaded as CSV.`);
  };

  const columns: Column<Order>[] = [
    {
      key: 'code',
      header: 'Order ID',
      sortable: true,
      hideable: false,
      render: (order) => (
        <div>
          <p className="font-medium text-ink-900 dark:text-ink-100">#{order.code}</p>
          <p className="text-2xs text-ink-500 dark:text-ink-400">
            {order.items.length} item{order.items.length === 1 ? '' : 's'}
          </p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      render: (order) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={order.customerName} size="sm" />
          <div className="min-w-0">
            <p className="max-w-[12rem] truncate font-medium text-ink-900 dark:text-ink-100">
              {order.customerName}
            </p>
            <p className="max-w-[12rem] truncate text-2xs text-ink-500 dark:text-ink-400">
              {order.customerEmail}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'placedAt',
      header: 'Date',
      sortable: true,
      render: (order) => (
        <span className="whitespace-nowrap text-ink-600 dark:text-ink-400">
          {formatDate(order.placedAt)}
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Products',
      align: 'center',
      defaultHidden: true,
      render: (order) => (
        <span className="tabular-nums text-ink-600 dark:text-ink-400">
          {formatNumber(order.items.reduce((sum, item) => sum + item.quantity, 0))}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Amount',
      sortable: true,
      align: 'right',
      render: (order) => (
        <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
          {formatCurrency(order.total)}
        </span>
      ),
    },
    {
      key: 'payment',
      header: 'Payment',
      render: (order) => (
        <div className="space-y-1">
          <StatusBadge tone={PAYMENT_STATUS[order.paymentStatus]} />
          <p className="text-2xs text-ink-500 dark:text-ink-400">
            {PAYMENT_METHOD_LABEL[order.paymentMethod]}
          </p>
        </div>
      ),
    },
    {
      key: 'fulfillment',
      header: 'Fulfillment',
      defaultHidden: true,
      render: (order) => <StatusBadge tone={FULFILLMENT_STATUS[order.fulfillment]} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (order) => <StatusBadge tone={ORDER_STATUS[order.status]} />,
    },
    {
      key: 'actions',
      header: '',
      hideable: false,
      align: 'right',
      width: '3rem',
      render: (order) => {
        const next = NEXT_STATUS[order.status];
        return (
          <div onClick={(event) => event.stopPropagation()}>
            <Dropdown
              trigger={({ toggle }) => (
                <IconButton label={`Actions for order ${order.code}`} size="sm" onClick={toggle}>
                  <MoreHorizontal className="h-4 w-4" />
                </IconButton>
              )}
            >
              <DropdownItem icon={<Eye />} to={`/admin/orders/${order.id}`}>
                View order
              </DropdownItem>
              {can('orders', 'edit') && next && (
                <>
                  <DropdownDivider />
                  <DropdownLabel>Advance status</DropdownLabel>
                  <DropdownItem icon={<Truck />} onClick={() => advance(order, next)}>
                    Mark as {ORDER_STATUS[next].label}
                  </DropdownItem>
                </>
              )}
              {can('orders', 'edit') &&
                order.status !== 'cancelled' &&
                order.status !== 'delivered' &&
                order.status !== 'returned' && (
                  <>
                    <DropdownDivider />
                    <DropdownItem icon={<XCircle />} danger onClick={() => setCancelTarget(order)}>
                      Cancel order
                    </DropdownItem>
                  </>
                )}
            </Dropdown>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Orders"
        description="Track every order from placement through to delivery."
        actions={
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportOrders}>
            Export
          </Button>
        }
      />

      <Tabs
        items={TABS.map((tab) => ({
          ...tab,
          count: counts ? counts[tab.key] : undefined,
        }))}
        active={activeTab}
        onChange={(key) => query.setFilter('status', key === 'all' ? undefined : key)}
      />

      <DataTable
        storageKey="orders"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(order) => order.id}
        loading={isLoading}
        error={isError || undefined}
        onRetry={refetch}
        sort={query.sort}
        onSortChange={query.setSort}
        onRowClick={(order) => navigate(`/admin/orders/${order.id}`)}
        emptyIcon={ShoppingCart}
        emptyTitle="No orders found."
        emptyDescription="Try a different search, status or date range."
        toolbar={
          <>
            <SearchInput
              value={query.state.search}
              onChange={query.setSearch}
              placeholder="Search order ID, name, email or phone…"
            />
            <Select
              sizeVariant="sm"
              className="w-auto"
              value={(query.state.paymentStatus as string) ?? ''}
              onChange={(event) => query.setFilter('paymentStatus', event.target.value || undefined)}
              options={[
                { value: '', label: 'All payments' },
                { value: 'paid', label: 'Paid' },
                { value: 'pending', label: 'Payment pending' },
                { value: 'failed', label: 'Failed' },
                { value: 'refunded', label: 'Refunded' },
              ]}
            />
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                sizeVariant="sm"
                aria-label="From date"
                className="w-auto"
                value={(query.state.from as string) ?? ''}
                onChange={(event) => query.setFilter('from', event.target.value || undefined)}
              />
              <span className="text-xs text-ink-400">to</span>
              <Input
                type="date"
                sizeVariant="sm"
                aria-label="To date"
                className="w-auto"
                value={(query.state.to as string) ?? ''}
                onChange={(event) => query.setFilter('to', event.target.value || undefined)}
              />
            </div>
          </>
        }
        mobileCard={(order) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-ink-900 dark:text-ink-100">#{order.code}</p>
                <p className="truncate text-xs text-ink-600 dark:text-ink-400">
                  {order.customerName}
                </p>
                <p className="text-2xs text-ink-400">{formatDate(order.placedAt)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                  {formatCurrency(order.total)}
                </p>
                <p className="text-2xs text-ink-500 dark:text-ink-400">
                  {order.items.length} item{order.items.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge tone={ORDER_STATUS[order.status]} />
              <StatusBadge tone={PAYMENT_STATUS[order.paymentStatus]} />
            </div>
          </div>
        )}
        pagination={{
          page: data?.page ?? 1,
          pageSize: data?.pageSize ?? 10,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
          onPageChange: query.setPage,
          onPageSizeChange: query.setPageSize,
          label: 'orders',
        }}
      />

      <ConfirmModal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={async () => {
          if (!cancelTarget) return;
          await advance(cancelTarget, 'cancelled');
          setCancelTarget(null);
        }}
        loading={updating}
        tone="danger"
        title={`Cancel order #${cancelTarget?.code}?`}
        description="The customer will be notified and any reserved stock is returned to inventory. Paid orders will need a refund."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
      />
    </div>
  );
}
