import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  Download,
  History,
  IndianRupee,
  MinusCircle,
  PackageX,
  PlusCircle,
  Settings2,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, useListQuery, usePermissions } from '@/hooks';
import {
  useAdjustStockMutation,
  useGetInventoryQuery,
  useGetInventorySummaryQuery,
} from '@/store/api/commerceApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/Badge';
import { AppImage } from '@/components/common/AppImage';
import { SearchInput, FilterChip } from '@/components/common/SearchInput';
import { Field, Input, Select, Textarea } from '@/components/common/Field';
import { CardSkeleton } from '@/components/common/States';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { FormModal } from '@/components/modals/FormModal';
import { useToast } from '@/components/common/Toast';
import { STOCK_STATUS } from '@/utils/constants';
import { formatCompactCurrency, formatNumber } from '@/utils/format';
import { downloadCsv } from '@/utils/export';
import { useAppSelector } from '@/store/hooks';
import type { InventoryRow, StockMovementType } from '@/types';

const STOCK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in_stock', label: 'In stock' },
  { key: 'low_stock', label: 'Low stock' },
  { key: 'out_of_stock', label: 'Out of stock' },
];

const MOVEMENT_TYPES: { value: StockMovementType; label: string }[] = [
  { value: 'purchase', label: 'Purchase — new stock received' },
  { value: 'return', label: 'Return — customer return restocked' },
  { value: 'adjustment', label: 'Adjustment — stock count correction' },
  { value: 'damaged', label: 'Damaged — write off' },
  { value: 'cancelled', label: 'Cancelled — order released' },
];

interface AdjustState {
  row: InventoryRow;
  mode: 'add' | 'remove' | 'set';
}

export default function InventoryPage() {
  useDocumentTitle('Inventory');

  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const admin = useAppSelector((state) => state.auth.user);

  const query = useListQuery({ pageSize: 10, sortBy: 'stock', sortDir: 'asc' });
  const { data, isLoading, isError, refetch } = useGetInventoryQuery(query.params);
  const { data: summary, isLoading: summaryLoading } = useGetInventorySummaryQuery();
  const [adjustStock, { isLoading: adjusting }] = useAdjustStockMutation();

  const [adjust, setAdjust] = useState<AdjustState | null>(null);
  const [quantity, setQuantity] = useState('');
  const [movementType, setMovementType] = useState<StockMovementType>('purchase');
  const [reason, setReason] = useState('');
  const [quantityError, setQuantityError] = useState('');

  const openAdjust = (row: InventoryRow, mode: AdjustState['mode']) => {
    setAdjust({ row, mode });
    setQuantity(mode === 'set' ? String(row.stock) : '');
    setMovementType(mode === 'add' ? 'purchase' : mode === 'remove' ? 'damaged' : 'adjustment');
    setReason('');
    setQuantityError('');
  };

  const submitAdjust = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adjust) return;

    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || quantity.trim() === '') {
      setQuantityError('Enter a quantity');
      return;
    }
    if (parsed < 0) {
      setQuantityError('Quantity cannot be negative');
      return;
    }
    if (adjust.mode === 'remove' && parsed > adjust.row.stock) {
      setQuantityError(`Only ${adjust.row.stock} units are in stock`);
      return;
    }

    try {
      await adjustStock({
        id: adjust.row.productId,
        type: movementType,
        quantity: adjust.mode === 'remove' ? -parsed : parsed,
        mode: adjust.mode === 'set' ? 'set' : 'add',
        reason: reason.trim() || undefined,
        admin: admin?.name,
      }).unwrap();

      toast.success('Stock updated', `${adjust.row.name} — ${adjust.row.sku}`);
      setAdjust(null);
    } catch (error) {
      toast.error('Could not update stock', errorMessage(error));
    }
  };

  const exportInventory = () => {
    const rows = data?.items ?? [];
    if (!rows.length) {
      toast.warning('Nothing to export', 'Adjust your filters and try again.');
      return;
    }
    downloadCsv('sopii-inventory', rows, [
      { key: 'name', header: 'Product', value: (row) => row.name },
      { key: 'sku', header: 'SKU', value: (row) => row.sku },
      { key: 'category', header: 'Category', value: (row) => row.category },
      { key: 'stock', header: 'Current Stock', value: (row) => row.stock },
      { key: 'reserved', header: 'Reserved', value: (row) => row.reserved },
      { key: 'available', header: 'Available', value: (row) => row.available },
      { key: 'threshold', header: 'Low Stock Limit', value: (row) => row.lowStockThreshold },
      { key: 'status', header: 'Status', value: (row) => STOCK_STATUS[row.stockStatus].label },
    ]);
    toast.success('Export ready', `${rows.length} rows downloaded as CSV.`);
  };

  const stats = [
    {
      label: 'Total stock',
      value: formatNumber(summary?.totalStock ?? 0),
      hint: `${formatNumber(summary?.skuCount ?? 0)} SKUs`,
      icon: Boxes,
      tone: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',
    },
    {
      label: 'Low stock',
      value: formatNumber(summary?.lowStock ?? 0),
      hint: 'At or below threshold',
      icon: AlertTriangle,
      tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    },
    {
      label: 'Out of stock',
      value: formatNumber(summary?.outOfStock ?? 0),
      hint: 'Needs restocking',
      icon: PackageX,
      tone: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
    },
    {
      label: 'Stock value',
      value: formatCompactCurrency(summary?.stockValue ?? 0),
      hint: 'At cost price',
      icon: IndianRupee,
      tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    },
  ];

  const columns: Column<InventoryRow>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      hideable: false,
      render: (row) => (
        <div className="flex items-center gap-3">
          <AppImage
            src={row.image}
            alt={row.name}
            seed={row.productId}
            wrapperClassName="h-10 w-10 shrink-0"
          />
          <div className="min-w-0">
            <p className="max-w-[16rem] truncate font-medium text-ink-900 dark:text-ink-100">
              {row.name}
            </p>
            <p className="truncate text-2xs text-ink-500 dark:text-ink-400">{row.category}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      sortable: true,
      render: (row) => <span className="font-mono text-xs text-ink-600 dark:text-ink-400">{row.sku}</span>,
    },
    {
      key: 'stock',
      header: 'Current Stock',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
          {formatNumber(row.stock)}
        </span>
      ),
    },
    {
      key: 'reserved',
      header: 'Reserved',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-ink-600 dark:text-ink-400">{formatNumber(row.reserved)}</span>
      ),
    },
    {
      key: 'available',
      header: 'Available',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span
          className={cn(
            'tabular-nums',
            row.available <= 0
              ? 'font-medium text-rose-600 dark:text-rose-400'
              : 'text-ink-700 dark:text-ink-300',
          )}
        >
          {formatNumber(row.available)}
        </span>
      ),
    },
    {
      key: 'lowStockThreshold',
      header: 'Low Stock Limit',
      sortable: true,
      align: 'right',
      defaultHidden: true,
      render: (row) => (
        <span className="tabular-nums text-ink-600 dark:text-ink-400">{row.lowStockThreshold}</span>
      ),
    },
    {
      key: 'stockStatus',
      header: 'Status',
      sortable: true,
      render: (row) => <StatusBadge tone={STOCK_STATUS[row.stockStatus]} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      hideable: false,
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          {can('inventory', 'edit') ? (
            <>
              <Button size="xs" variant="secondary" onClick={() => openAdjust(row, 'add')}>
                <PlusCircle className="h-3 w-3" />
                <span className="hidden lg:inline">Add</span>
              </Button>
              <Button size="xs" variant="secondary" onClick={() => openAdjust(row, 'set')}>
                <Settings2 className="h-3 w-3" />
                <span className="hidden lg:inline">Adjust</span>
              </Button>
            </>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => navigate(`/admin/inventory/history?productId=${row.productId}`)}
          >
            <History className="h-3 w-3" />
            <span className="hidden lg:inline">History</span>
          </Button>
        </div>
      ),
    },
  ];

  const activeStock = (query.state.stockStatus as string) || 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        description="Stock levels across every SKU, with adjustments logged to the stock history."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              onClick={exportInventory}
            >
              Export
            </Button>
            <Button variant="secondary" icon={<History className="h-4 w-4" />} to="/admin/inventory/history">
              Stock history
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryLoading
          ? Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)
          : stats.map((stat) => (
              <Card key={stat.label} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink-500 dark:text-ink-400">
                      {stat.label}
                    </p>
                    <p className="mt-1.5 text-xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                      {stat.value}
                    </p>
                    <p className="mt-0.5 truncate text-2xs text-ink-400">{stat.hint}</p>
                  </div>
                  <span
                    className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', stat.tone)}
                  >
                    <stat.icon className="h-4 w-4" />
                  </span>
                </div>
              </Card>
            ))}
      </div>

      <DataTable
        storageKey="inventory"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(row) => row.productId}
        loading={isLoading}
        error={isError || undefined}
        onRetry={refetch}
        sort={query.sort}
        onSortChange={query.setSort}
        onRowClick={(row) => navigate(`/admin/products/${row.productId}`)}
        emptyIcon={Boxes}
        emptyTitle="No inventory records found."
        emptyDescription="Try a different search or stock filter."
        toolbar={
          <SearchInput
            value={query.state.search}
            onChange={query.setSearch}
            placeholder="Search by product or SKU…"
          />
        }
        filters={
          <div className="flex flex-wrap gap-1.5">
            {STOCK_FILTERS.map((filter) => (
              <FilterChip
                key={filter.key}
                label={filter.label}
                active={activeStock === filter.key}
                onClick={() =>
                  query.setFilter('stockStatus', filter.key === 'all' ? undefined : filter.key)
                }
              />
            ))}
          </div>
        }
        mobileCard={(row) => (
          <div className="space-y-2">
            <div className="flex gap-3">
              <AppImage
                src={row.image}
                alt={row.name}
                seed={row.productId}
                wrapperClassName="h-12 w-12 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                  {row.name}
                </p>
                <p className="font-mono text-2xs text-ink-500 dark:text-ink-400">{row.sku}</p>
                <div className="mt-1.5">
                  <StatusBadge tone={STOCK_STATUS[row.stockStatus]} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                  {formatNumber(row.stock)}
                </p>
                <p className="text-2xs text-ink-500 dark:text-ink-400">
                  {formatNumber(row.available)} available
                </p>
              </div>
            </div>
            {can('inventory', 'edit') && (
              <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                <Button size="xs" variant="secondary" onClick={() => openAdjust(row, 'add')}>
                  Add stock
                </Button>
                <Button size="xs" variant="secondary" onClick={() => openAdjust(row, 'set')}>
                  Adjust
                </Button>
              </div>
            )}
          </div>
        )}
        pagination={{
          page: data?.page ?? 1,
          pageSize: data?.pageSize ?? 10,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
          onPageChange: query.setPage,
          onPageSizeChange: query.setPageSize,
          label: 'SKUs',
        }}
      />

      <FormModal
        open={adjust !== null}
        onClose={() => setAdjust(null)}
        onSubmit={submitAdjust}
        title={
          adjust?.mode === 'add'
            ? 'Add stock'
            : adjust?.mode === 'remove'
              ? 'Remove stock'
              : 'Adjust stock'
        }
        description={adjust ? `${adjust.row.name} · ${adjust.row.sku}` : undefined}
        submitLabel="Save movement"
        loading={adjusting}
      >
        {adjust && (
          <>
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-ink-50 p-3 text-center dark:bg-ink-800/60">
              <div>
                <p className="text-2xs uppercase tracking-wide text-ink-400">Current</p>
                <p className="text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                  {adjust.row.stock}
                </p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wide text-ink-400">Reserved</p>
                <p className="text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                  {adjust.row.reserved}
                </p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wide text-ink-400">After</p>
                <p className="text-lg font-semibold tabular-nums text-brand-600 dark:text-brand-400">
                  {adjust.mode === 'set'
                    ? Number(quantity) || 0
                    : adjust.mode === 'remove'
                      ? Math.max(0, adjust.row.stock - (Number(quantity) || 0))
                      : adjust.row.stock + (Number(quantity) || 0)}
                </p>
              </div>
            </div>

            <div className="flex gap-1.5">
              {(['add', 'remove', 'set'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAdjust({ ...adjust, mode })}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors',
                    adjust.mode === mode
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300'
                      : 'border-ink-200 text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
                  )}
                >
                  {mode === 'add' ? 'Add' : mode === 'remove' ? 'Remove' : 'Set exact'}
                </button>
              ))}
            </div>

            <Field
              label={adjust.mode === 'set' ? 'New stock level' : 'Quantity'}
              required
              error={quantityError}
            >
              <Input
                type="number"
                min={0}
                autoFocus
                value={quantity}
                invalid={Boolean(quantityError)}
                onChange={(event) => {
                  setQuantity(event.target.value);
                  setQuantityError('');
                }}
                placeholder="0"
                className="tabular-nums"
                prefix={
                  adjust.mode === 'add' ? (
                    <PlusCircle className="h-3.5 w-3.5" />
                  ) : adjust.mode === 'remove' ? (
                    <MinusCircle className="h-3.5 w-3.5" />
                  ) : undefined
                }
              />
            </Field>

            <Field label="Movement type" required>
              <Select
                value={movementType}
                options={MOVEMENT_TYPES}
                onChange={(event) => setMovementType(event.target.value as StockMovementType)}
              />
            </Field>

            <Field label="Reason" hint="Recorded against the stock history entry.">
              <Textarea
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Restock from weaver cluster — PO-2291"
              />
            </Field>
          </>
        )}
      </FormModal>
    </div>
  );
}
