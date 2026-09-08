import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Copy,
  Download,
  Eye,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, useListQuery, usePermissions } from '@/hooks';
import {
  useBulkProductActionMutation,
  useDeleteProductMutation,
  useDuplicateProductMutation,
  useGetCategoriesQuery,
  useGetProductsQuery,
} from '@/store/api/catalogApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Button, IconButton } from '@/components/common/Button';
import { Badge, StatusBadge } from '@/components/common/Badge';
import { AppImage } from '@/components/common/AppImage';
import { SearchInput, FilterChip } from '@/components/common/SearchInput';
import { Select } from '@/components/common/Field';
import { Dropdown, DropdownDivider, DropdownItem } from '@/components/common/Dropdown';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { DeleteModal } from '@/components/modals/ConfirmModal';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useToast } from '@/components/common/Toast';
import { PRODUCT_STATUS } from '@/utils/constants';
import { discountPercent, formatCurrency, formatDate, formatNumber } from '@/utils/format';
import { downloadCsv } from '@/utils/export';
import type { Product, ProductStatus } from '@/types';

const STATUS_FILTERS: { key: ProductStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Draft' },
  { key: 'archived', label: 'Archived' },
];

const STOCK_FILTERS = [
  { key: 'all', label: 'All stock' },
  { key: 'in_stock', label: 'In stock' },
  { key: 'low_stock', label: 'Low stock' },
  { key: 'out_of_stock', label: 'Out of stock' },
];

export default function ProductListPage() {
  useDocumentTitle('Products');

  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();

  const query = useListQuery({ pageSize: 10, sortBy: 'createdAt', sortDir: 'desc' });
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);

  const { data, isLoading, isFetching, isError, refetch } = useGetProductsQuery(query.params);
  const { data: categories } = useGetCategoriesQuery();

  const [deleteProduct, { isLoading: deleting }] = useDeleteProductMutation();
  const [duplicateProduct] = useDuplicateProductMutation();
  const [bulkAction, { isLoading: bulkRunning }] = useBulkProductActionMutation();

  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'All categories' },
      ...(categories ?? []).map((category) => ({
        value: category.id,
        label: category.parentId ? `— ${category.name}` : category.name,
      })),
    ],
    [categories],
  );

  const categoryName = (id: string) => categories?.find((c) => c.id === id)?.name ?? '—';

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProduct(deleteTarget.id).unwrap();
      toast.success('Product deleted successfully.', deleteTarget.name);
      setDeleteTarget(null);
      setSelected((current) => current.filter((id) => id !== deleteTarget.id));
    } catch (error) {
      toast.error('Could not delete product', errorMessage(error));
    }
  };

  const handleBulk = async (
    action: 'delete' | 'status' | 'feature' | 'unfeature',
    status?: ProductStatus,
  ) => {
    try {
      const result = await bulkAction({ action, ids: selected, status }).unwrap();
      const verb =
        action === 'delete'
          ? 'deleted'
          : action === 'status'
            ? `moved to ${status}`
            : action === 'feature'
              ? 'marked as featured'
              : 'removed from featured';
      toast.success(`${result.affected} product(s) ${verb}.`);
      setSelected([]);
      setBulkDelete(false);
    } catch (error) {
      toast.error('Bulk action failed', errorMessage(error));
    }
  };

  const handleDuplicate = async (product: Product) => {
    try {
      const copy = await duplicateProduct(product.id).unwrap();
      toast.success('Product duplicated', `${copy.name} was created as a draft.`, );
    } catch (error) {
      toast.error('Could not duplicate product', errorMessage(error));
    }
  };

  const exportProducts = () => {
    const rows = data?.items ?? [];
    if (!rows.length) {
      toast.warning('Nothing to export', 'Adjust your filters and try again.');
      return;
    }
    downloadCsv('sopii-products', rows, [
      { key: 'name', header: 'Product', value: (row) => row.name },
      { key: 'sku', header: 'SKU', value: (row) => row.sku },
      { key: 'category', header: 'Category', value: (row) => categoryName(row.categoryId) },
      { key: 'price', header: 'Price', value: (row) => row.price },
      { key: 'mrp', header: 'MRP', value: (row) => row.mrp },
      { key: 'stock', header: 'Stock', value: (row) => row.stock },
      { key: 'status', header: 'Status', value: (row) => row.status },
      { key: 'sold', header: 'Units Sold', value: (row) => row.unitsSold },
      { key: 'created', header: 'Created', value: (row) => formatDate(row.createdAt) },
    ]);
    toast.success('Export ready', `${rows.length} products downloaded as CSV.`);
  };

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      hideable: false,
      render: (product) => (
        <div className="flex items-center gap-3">
          <AppImage
            src={product.images[0]?.url}
            alt={product.name}
            seed={product.id}
            wrapperClassName="h-11 w-11 shrink-0"
          />
          <div className="min-w-0">
            <p className="max-w-[18rem] truncate font-medium text-ink-900 dark:text-ink-100">
              {product.name}
            </p>
            <p className="flex items-center gap-1.5 text-2xs text-ink-500 dark:text-ink-400">
              {product.variants.length > 0 && <span>{product.variants.length} variants</span>}
              {product.featured && (
                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  Featured
                </span>
              )}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      sortable: true,
      render: (product) => (
        <span className="font-mono text-xs text-ink-600 dark:text-ink-400">{product.sku}</span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (product) => <span className="text-ink-600 dark:text-ink-400">{categoryName(product.categoryId)}</span>,
    },
    {
      key: 'price',
      header: 'Price',
      sortable: true,
      align: 'right',
      render: (product) => (
        <div>
          <p className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
            {formatCurrency(product.price)}
          </p>
          {product.mrp > product.price && (
            <p className="text-2xs tabular-nums text-ink-400 line-through">
              {formatCurrency(product.mrp)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      sortable: true,
      align: 'right',
      render: (product) => {
        const out = product.stock <= 0;
        const low = product.stock > 0 && product.stock <= product.lowStockThreshold;
        return (
          <span
            className={cn(
              'tabular-nums',
              out
                ? 'font-medium text-rose-600 dark:text-rose-400'
                : low
                  ? 'font-medium text-amber-600 dark:text-amber-400'
                  : 'text-ink-700 dark:text-ink-300',
            )}
          >
            {out ? 'Out of stock' : formatNumber(product.stock)}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (product) => <StatusBadge tone={PRODUCT_STATUS[product.status]} />,
    },
    {
      key: 'unitsSold',
      header: 'Sold',
      sortable: true,
      align: 'right',
      defaultHidden: true,
      render: (product) => (
        <span className="tabular-nums text-ink-600 dark:text-ink-400">
          {formatNumber(product.unitsSold)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (product) => (
        <span className="whitespace-nowrap text-ink-600 dark:text-ink-400">
          {formatDate(product.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      hideable: false,
      align: 'right',
      width: '3rem',
      render: (product) => (
        <div onClick={(event) => event.stopPropagation()}>
          <Dropdown
            trigger={({ toggle }) => (
              <IconButton label={`Actions for ${product.name}`} size="sm" onClick={toggle}>
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            )}
          >
            <DropdownItem icon={<Eye />} to={`/admin/products/${product.id}`}>
              View
            </DropdownItem>
            {can('products', 'edit') && (
              <DropdownItem icon={<Pencil />} to={`/admin/products/${product.id}/edit`}>
                Edit
              </DropdownItem>
            )}
            {can('products', 'create') && (
              <DropdownItem icon={<Copy />} onClick={() => handleDuplicate(product)}>
                Duplicate
              </DropdownItem>
            )}
            {can('products', 'delete') && (
              <>
                <DropdownDivider />
                <DropdownItem icon={<Trash2 />} danger onClick={() => setDeleteTarget(product)}>
                  Delete
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      ),
    },
  ];

  const activeStatus = (query.state.status as string) || 'all';
  const activeStock = (query.state.stockStatus as string) || 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Products"
        description="Manage the SOPII catalogue — pricing, stock, variants and merchandising."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              onClick={exportProducts}
            >
              Export
            </Button>
            {can('products', 'create') && (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} to="/admin/products/create">
                Add Product
              </Button>
            )}
          </>
        }
      />

      <DataTable
        storageKey="products"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(product) => product.id}
        loading={isLoading}
        error={isError || undefined}
        onRetry={refetch}
        selectable={can('products', 'edit') || can('products', 'delete')}
        selected={selected}
        onSelectedChange={setSelected}
        onRowClick={(product) => navigate(`/admin/products/${product.id}`)}
        sort={query.sort}
        onSortChange={query.setSort}
        emptyIcon={Package}
        emptyTitle="No products found."
        emptyDescription="Try a different search or filter, or add your first product."
        emptyAction={
          can('products', 'create') && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} to="/admin/products/create">
              Add Product
            </Button>
          )
        }
        toolbar={
          <>
            <SearchInput
              value={query.state.search}
              onChange={query.setSearch}
              placeholder="Search by name or SKU…"
            />
            <Select
              sizeVariant="sm"
              className="w-auto min-w-[10rem]"
              options={categoryOptions}
              value={(query.state.categoryId as string) ?? ''}
              onChange={(event) => query.setFilter('categoryId', event.target.value || undefined)}
            />
            {isFetching && !isLoading && (
              <span className="text-2xs text-ink-400">Updating…</span>
            )}
          </>
        }
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((filter) => (
                <FilterChip
                  key={filter.key}
                  label={filter.label}
                  active={activeStatus === filter.key}
                  onClick={() =>
                    query.setFilter('status', filter.key === 'all' ? undefined : filter.key)
                  }
                />
              ))}
            </div>
            <span className="hidden h-4 w-px bg-ink-200 dark:bg-ink-700 sm:block" />
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
            {(query.state.status || query.state.stockStatus || query.state.categoryId || query.state.search) && (
              <Button size="xs" variant="ghost" onClick={query.reset}>
                Clear all
              </Button>
            )}
          </div>
        }
        bulkActions={(ids) => (
          <>
            {can('products', 'edit') && (
              <>
                <Button size="xs" variant="secondary" onClick={() => handleBulk('status', 'published')} disabled={bulkRunning}>
                  Publish
                </Button>
                <Button size="xs" variant="secondary" onClick={() => handleBulk('status', 'draft')} disabled={bulkRunning}>
                  Move to draft
                </Button>
                <Button size="xs" variant="secondary" onClick={() => handleBulk('status', 'archived')} disabled={bulkRunning}>
                  Archive
                </Button>
                <Button size="xs" variant="secondary" onClick={() => handleBulk('feature')} disabled={bulkRunning}>
                  Feature
                </Button>
              </>
            )}
            {can('products', 'delete') && (
              <Button
                size="xs"
                variant="danger"
                icon={<Trash2 className="h-3 w-3" />}
                onClick={() => setBulkDelete(true)}
                disabled={bulkRunning}
              >
                Delete ({ids.length})
              </Button>
            )}
          </>
        )}
        mobileCard={(product) => (
          <div className="space-y-2">
            <div className="flex gap-3">
              <AppImage
                src={product.images[0]?.url}
                alt={product.name}
                seed={product.id}
                wrapperClassName="h-14 w-14 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                  {product.name}
                </p>
                <p className="font-mono text-2xs text-ink-500 dark:text-ink-400">{product.sku}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={PRODUCT_STATUS[product.status]} />
                  {product.stock <= 0 ? (
                    <Badge className="bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400">
                      Out of stock
                    </Badge>
                  ) : (
                    <Badge>{formatNumber(product.stock)} in stock</Badge>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                  {formatCurrency(product.price)}
                </p>
                {product.mrp > product.price && (
                  <p className="text-2xs text-emerald-600 dark:text-emerald-400">
                    {discountPercent(product.mrp, product.price)}% off
                  </p>
                )}
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
          label: 'products',
        }}
      />

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="product"
        name={deleteTarget?.name}
        loading={deleting}
      />

      <ConfirmModal
        open={bulkDelete}
        onClose={() => setBulkDelete(false)}
        onConfirm={() => handleBulk('delete')}
        tone="danger"
        loading={bulkRunning}
        title={`Delete ${selected.length} products?`}
        description="These products will be permanently removed from the catalogue. This action cannot be undone."
        confirmLabel="Delete products"
      />
    </div>
  );
}
