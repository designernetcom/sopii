import { useNavigate } from 'react-router-dom';
import { Download, Mail, Users } from 'lucide-react';
import { useDocumentTitle, useListQuery } from '@/hooks';
import { useGetCustomersQuery } from '@/store/api/commerceApi';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { Badge, StatusBadge } from '@/components/common/Badge';
import { Avatar } from '@/components/common/AppImage';
import { SearchInput, FilterChip } from '@/components/common/SearchInput';
import { Select } from '@/components/common/Field';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useToast } from '@/components/common/Toast';
import { CUSTOMER_TIER } from '@/utils/constants';
import { formatCurrency, formatDate, formatNumber, formatRelativeTime } from '@/utils/format';
import { downloadCsv } from '@/utils/export';
import type { Customer } from '@/types';

const TIER_FILTERS = [
  { key: 'all', label: 'All customers' },
  { key: 'platinum', label: 'Platinum' },
  { key: 'gold', label: 'Gold' },
  { key: 'silver', label: 'Silver' },
  { key: 'regular', label: 'Regular' },
  { key: 'new', label: 'New' },
];

export default function CustomerListPage() {
  useDocumentTitle('Customers');

  const navigate = useNavigate();
  const toast = useToast();

  const query = useListQuery({ pageSize: 10, sortBy: 'totalSpent', sortDir: 'desc' });
  const { data, isLoading, isError, refetch } = useGetCustomersQuery(query.params);

  const exportCustomers = () => {
    const rows = data?.items ?? [];
    if (!rows.length) {
      toast.warning('Nothing to export', 'Adjust your filters and try again.');
      return;
    }
    downloadCsv('sopii-customers', rows, [
      { key: 'name', header: 'Customer', value: (row) => row.name },
      { key: 'email', header: 'Email', value: (row) => row.email },
      { key: 'phone', header: 'Phone', value: (row) => row.phone },
      { key: 'tier', header: 'Tier', value: (row) => row.tier },
      { key: 'orders', header: 'Orders', value: (row) => row.ordersCount },
      { key: 'spent', header: 'Total Spent', value: (row) => row.totalSpent },
      { key: 'last', header: 'Last Order', value: (row) => formatDate(row.lastOrderAt) },
      { key: 'status', header: 'Status', value: (row) => row.status },
      { key: 'joined', header: 'Joined', value: (row) => formatDate(row.createdAt) },
    ]);
    toast.success('Export ready', `${rows.length} customers downloaded as CSV.`);
  };

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      sortable: true,
      hideable: false,
      render: (customer) => (
        <div className="flex items-center gap-3">
          <Avatar name={customer.name} src={customer.avatar} size="sm" />
          <div className="min-w-0">
            <p className="max-w-[14rem] truncate font-medium text-ink-900 dark:text-ink-100">
              {customer.name}
            </p>
            <p className="max-w-[14rem] truncate text-2xs text-ink-500 dark:text-ink-400">
              Joined {formatDate(customer.createdAt)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (customer) => (
        <a
          href={`mailto:${customer.email}`}
          onClick={(event) => event.stopPropagation()}
          className="block max-w-[16rem] truncate text-ink-600 hover:text-brand-600 dark:text-ink-400 dark:hover:text-brand-400"
        >
          {customer.email}
        </a>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (customer) => (
        <span className="whitespace-nowrap text-ink-600 dark:text-ink-400">{customer.phone}</span>
      ),
    },
    {
      key: 'ordersCount',
      header: 'Orders',
      sortable: true,
      align: 'right',
      render: (customer) => (
        <span className="tabular-nums text-ink-700 dark:text-ink-300">
          {formatNumber(customer.ordersCount)}
        </span>
      ),
    },
    {
      key: 'totalSpent',
      header: 'Total Spent',
      sortable: true,
      align: 'right',
      render: (customer) => (
        <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
          {formatCurrency(customer.totalSpent)}
        </span>
      ),
    },
    {
      key: 'lastOrderAt',
      header: 'Last Order',
      sortable: true,
      render: (customer) => (
        <span className="whitespace-nowrap text-ink-600 dark:text-ink-400">
          {customer.lastOrderAt ? formatRelativeTime(customer.lastOrderAt) : '—'}
        </span>
      ),
    },
    {
      key: 'tier',
      header: 'Tier',
      sortable: true,
      render: (customer) => <StatusBadge tone={CUSTOMER_TIER[customer.tier]} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (customer) =>
        customer.status === 'active' ? (
          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400" dot="bg-emerald-500">
            Active
          </Badge>
        ) : (
          <Badge className="bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400" dot="bg-rose-500">
            Blocked
          </Badge>
        ),
    },
  ];

  const activeTier = (query.state.tier as string) || 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="Everyone who has shopped or signed up with SOPII."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Mail className="h-4 w-4" />}
              onClick={() =>
                toast.info('Campaigns', 'Email campaigns connect once the marketing API is wired up.')
              }
            >
              Email customers
            </Button>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCustomers}>
              Export
            </Button>
          </>
        }
      />

      <DataTable
        storageKey="customers"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(customer) => customer.id}
        loading={isLoading}
        error={isError || undefined}
        onRetry={refetch}
        sort={query.sort}
        onSortChange={query.setSort}
        onRowClick={(customer) => navigate(`/admin/customers/${customer.id}`)}
        emptyIcon={Users}
        emptyTitle="No customers found."
        emptyDescription="Try a different search or tier filter."
        toolbar={
          <>
            <SearchInput
              value={query.state.search}
              onChange={query.setSearch}
              placeholder="Search name, email or phone…"
            />
            <Select
              sizeVariant="sm"
              className="w-auto"
              value={(query.state.hasOrders as string) ?? ''}
              onChange={(event) => query.setFilter('hasOrders', event.target.value || undefined)}
              options={[
                { value: '', label: 'All accounts' },
                { value: 'true', label: 'Has ordered' },
                { value: 'false', label: 'Never ordered' },
              ]}
            />
            <Select
              sizeVariant="sm"
              className="w-auto"
              value={(query.state.status as string) ?? ''}
              onChange={(event) => query.setFilter('status', event.target.value || undefined)}
              options={[
                { value: '', label: 'Any status' },
                { value: 'active', label: 'Active' },
                { value: 'blocked', label: 'Blocked' },
              ]}
            />
          </>
        }
        filters={
          <div className="flex flex-wrap gap-1.5">
            {TIER_FILTERS.map((filter) => (
              <FilterChip
                key={filter.key}
                label={filter.label}
                active={activeTier === filter.key}
                onClick={() => query.setFilter('tier', filter.key === 'all' ? undefined : filter.key)}
              />
            ))}
          </div>
        }
        mobileCard={(customer) => (
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <Avatar name={customer.name} src={customer.avatar} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                  {customer.name}
                </p>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">{customer.email}</p>
                <div className="mt-1.5">
                  <StatusBadge tone={CUSTOMER_TIER[customer.tier]} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                  {formatCurrency(customer.totalSpent)}
                </p>
                <p className="text-2xs text-ink-500 dark:text-ink-400">
                  {formatNumber(customer.ordersCount)} orders
                </p>
              </div>
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
          label: 'customers',
        }}
      />
    </div>
  );
}
