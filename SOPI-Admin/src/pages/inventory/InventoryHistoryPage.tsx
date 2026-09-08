import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, History } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, useListQuery } from '@/hooks';
import { useGetStockHistoryQuery } from '@/store/api/commerceApi';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/Badge';
import { SearchInput, FilterChip } from '@/components/common/SearchInput';
import { Input } from '@/components/common/Field';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useToast } from '@/components/common/Toast';
import { MOVEMENT_TYPE } from '@/utils/constants';
import { formatDate, formatNumber } from '@/utils/format';
import { downloadCsv } from '@/utils/export';
import type { StockMovement, StockMovementType } from '@/types';

const TYPE_FILTERS: { key: StockMovementType | 'all'; label: string }[] = [
  { key: 'all', label: 'All types' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'sale', label: 'Sale' },
  { key: 'return', label: 'Return' },
  { key: 'adjustment', label: 'Adjustment' },
  { key: 'damaged', label: 'Damaged' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function InventoryHistoryPage() {
  useDocumentTitle('Stock history');

  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const productId = searchParams.get('productId') ?? undefined;

  const query = useListQuery({ pageSize: 12, sortBy: 'at', sortDir: 'desc' });
  const { setFilter } = query;

  // Deep links from the inventory table pre-filter to one product.
  useEffect(() => {
    setFilter('productId', productId);
  }, [productId, setFilter]);

  const { data, isLoading, isError, refetch } = useGetStockHistoryQuery(query.params);

  const exportHistory = () => {
    const rows = data?.items ?? [];
    if (!rows.length) {
      toast.warning('Nothing to export', 'Adjust your filters and try again.');
      return;
    }
    downloadCsv('sopii-stock-history', rows, [
      { key: 'at', header: 'Date', value: (row) => formatDate(row.at, true) },
      { key: 'product', header: 'Product', value: (row) => row.productName },
      { key: 'sku', header: 'SKU', value: (row) => row.sku },
      { key: 'type', header: 'Type', value: (row) => MOVEMENT_TYPE[row.type].label },
      { key: 'quantity', header: 'Quantity', value: (row) => row.quantity },
      { key: 'previous', header: 'Previous Stock', value: (row) => row.previousStock },
      { key: 'new', header: 'New Stock', value: (row) => row.newStock },
      { key: 'reason', header: 'Reason', value: (row) => row.reason ?? '' },
      { key: 'admin', header: 'Admin', value: (row) => row.admin },
    ]);
    toast.success('Export ready', `${rows.length} movements downloaded as CSV.`);
  };

  const columns: Column<StockMovement>[] = [
    {
      key: 'at',
      header: 'Date',
      sortable: true,
      hideable: false,
      render: (row) => (
        <span className="whitespace-nowrap text-ink-700 dark:text-ink-300">
          {formatDate(row.at, true)}
        </span>
      ),
    },
    {
      key: 'productName',
      header: 'Product',
      sortable: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="max-w-[16rem] truncate font-medium text-ink-900 dark:text-ink-100">
            {row.productName}
          </p>
          <p className="truncate font-mono text-2xs text-ink-500 dark:text-ink-400">{row.sku}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (row) => <StatusBadge tone={MOVEMENT_TYPE[row.type]} />,
    },
    {
      key: 'quantity',
      header: 'Quantity',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span
          className={cn(
            'font-medium tabular-nums',
            row.quantity > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400',
          )}
        >
          {row.quantity > 0 ? '+' : ''}
          {formatNumber(row.quantity)}
        </span>
      ),
    },
    {
      key: 'previousStock',
      header: 'Previous',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-ink-500 dark:text-ink-400">
          {formatNumber(row.previousStock)}
        </span>
      ),
    },
    {
      key: 'newStock',
      header: 'New Stock',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
          {formatNumber(row.newStock)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => (
        <span className="block max-w-[16rem] truncate text-ink-600 dark:text-ink-400">
          {row.reason ?? '—'}
          {row.reference && (
            <span className="ml-1 font-mono text-2xs text-ink-400">#{row.reference}</span>
          )}
        </span>
      ),
    },
    {
      key: 'admin',
      header: 'Admin',
      sortable: true,
      render: (row) => <span className="text-ink-600 dark:text-ink-400">{row.admin}</span>,
    },
  ];

  const activeType = (query.state.type as string) || 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        back={
          <Button
            variant="ghost"
            size="xs"
            className="mb-2 -ml-2"
            to="/admin/inventory"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
          >
            Back to inventory
          </Button>
        }
        title="Stock history"
        description="Every stock movement, with who made it and why."
        actions={
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportHistory}>
            Export
          </Button>
        }
      />

      {productId && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm dark:border-brand-500/20 dark:bg-brand-500/10">
          <History className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <span className="text-brand-800 dark:text-brand-200">
            Showing movements for a single product.
          </span>
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto"
            onClick={() => setSearchParams({})}
          >
            Show all products
          </Button>
        </div>
      )}

      <DataTable
        storageKey="stock-history"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        loading={isLoading}
        error={isError || undefined}
        onRetry={refetch}
        sort={query.sort}
        onSortChange={query.setSort}
        density="compact"
        emptyIcon={History}
        emptyTitle="No stock movements found."
        emptyDescription="Adjustments, sales and returns are logged here as they happen."
        toolbar={
          <>
            <SearchInput
              value={query.state.search}
              onChange={query.setSearch}
              placeholder="Search product, SKU or reason…"
            />
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                sizeVariant="sm"
                aria-label="From date"
                value={(query.state.from as string) ?? ''}
                onChange={(event) => query.setFilter('from', event.target.value || undefined)}
                className="w-auto"
              />
              <span className="text-xs text-ink-400">to</span>
              <Input
                type="date"
                sizeVariant="sm"
                aria-label="To date"
                value={(query.state.to as string) ?? ''}
                onChange={(event) => query.setFilter('to', event.target.value || undefined)}
                className="w-auto"
              />
            </div>
          </>
        }
        filters={
          <div className="flex flex-wrap gap-1.5">
            {TYPE_FILTERS.map((filter) => (
              <FilterChip
                key={filter.key}
                label={filter.label}
                active={activeType === filter.key}
                onClick={() => query.setFilter('type', filter.key === 'all' ? undefined : filter.key)}
              />
            ))}
          </div>
        }
        pagination={{
          page: data?.page ?? 1,
          pageSize: data?.pageSize ?? 12,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
          onPageChange: query.setPage,
          onPageSizeChange: query.setPageSize,
          label: 'movements',
        }}
      />
    </div>
  );
}
