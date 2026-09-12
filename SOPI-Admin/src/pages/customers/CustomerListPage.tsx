import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Eye, Mail, MoreHorizontal, Trash2, Users } from 'lucide-react';
import { useDocumentTitle, useListQuery, usePermissions } from '@/hooks';
import { useDeleteCustomerMutation, useGetCustomersQuery } from '@/store/api/commerceApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Button, IconButton } from '@/components/common/Button';
import { Badge, StatusBadge } from '@/components/common/Badge';
import { Avatar } from '@/components/common/AppImage';
import { SearchInput, FilterChip } from '@/components/common/SearchInput';
import { Select } from '@/components/common/Field';
import { Dropdown, DropdownDivider, DropdownItem } from '@/components/common/Dropdown';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { ConfirmModal, DeleteModal } from '@/components/modals/ConfirmModal';
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
  const { can } = usePermissions();

  const query = useListQuery({ pageSize: 10, sortBy: 'totalSpent', sortDir: 'desc' });
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);

  const { data, isLoading, isError, refetch } = useGetCustomersQuery(query.params);
  const [deleteCustomer, { isLoading: deleting }] = useDeleteCustomerMutation();

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCustomer(deleteTarget.id).unwrap();
      toast.success('Customer deleted.', deleteTarget.name);
      setDeleteTarget(null);
      setSelected((current) => current.filter((id) => id !== deleteTarget.id));
    } catch (error) {
      toast.error('Could not delete customer', errorMessage(error));
    }
  };

  /*
   * Bulk delete, one request per customer.
   *
   * There is no `/customers/bulk` on the API the way there is for products, and
   * a selection is one page of the table at most — so this issues the deletes
   * it already has an endpoint for rather than inventing a second way to do the
   * same thing. `allSettled` because a partial failure (a customer another
   * admin removed a moment ago) should still leave the rest deleted, and should
   * say so.
   */
  const handleBulkDelete = async () => {
    const results = await Promise.allSettled(
      selected.map((id) => deleteCustomer(id).unwrap()),
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    const done = results.length - failed;

    if (done) toast.success(`${done} customer(s) deleted.`);
    if (failed) {
      const reason = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      toast.error(`${failed} could not be deleted`, errorMessage(reason.reason));
    }

    setBulkDelete(false);
    setSelected([]);
  };

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
    {
      key: 'actions',
      header: '',
      hideable: false,
      align: 'right',
      width: '3rem',
      render: (customer) => (
        <div onClick={(event) => event.stopPropagation()}>
          <Dropdown
            trigger={({ toggle }) => (
              <IconButton label={`Actions for ${customer.name}`} size="sm" onClick={toggle}>
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            )}
          >
            <DropdownItem icon={<Eye />} to={`/admin/customers/${customer.id}`}>
              View
            </DropdownItem>
            <DropdownItem icon={<Mail />} onClick={() => window.open(`mailto:${customer.email}`)}>
              Email
            </DropdownItem>
            {can('customers', 'delete') && (
              <>
                <DropdownDivider />
                <DropdownItem icon={<Trash2 />} danger onClick={() => setDeleteTarget(customer)}>
                  Delete
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
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
        selectable={can('customers', 'delete')}
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={(ids) => (
          <Button
            size="xs"
            variant="danger"
            icon={<Trash2 className="h-3 w-3" />}
            onClick={() => setBulkDelete(true)}
            disabled={deleting}
          >
            Delete ({ids.length})
          </Button>
        )}
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

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="customer"
        name={deleteTarget?.name}
        loading={deleting}
        extra={
          deleteTarget && deleteTarget.ordersCount > 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300">
              {formatNumber(deleteTarget.ordersCount)} order(s) stay in the system — each one keeps
              its own copy of the name, email and address it was placed with.
            </p>
          ) : undefined
        }
      />

      <ConfirmModal
        open={bulkDelete}
        onClose={() => setBulkDelete(false)}
        onConfirm={handleBulkDelete}
        tone="danger"
        loading={deleting}
        title={`Delete ${selected.length} customers?`}
        description="These accounts will be permanently removed. Their past orders stay in the system. This action cannot be undone."
        confirmLabel="Delete customers"
      />
    </div>
  );
}
