import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileBarChart, Package, ShoppingBag, Users } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle } from '@/hooks';
import {
  useGetCustomerReportQuery,
  useGetOrderReportQuery,
  useGetProductReportQuery,
  useGetSalesReportQuery,
  type ProductReportRow,
} from '@/store/api/platformApi';
import type { SalesGrouping } from '@/data/analytics';
import { PageHeader, Tabs } from '@/components/common/PageHeader';
import { Card, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/Badge';
import { AppImage } from '@/components/common/AppImage';
import { Select } from '@/components/common/Field';
import { ChartSkeleton } from '@/components/common/States';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { RevenueChart, type SalesMetric } from '@/components/charts/RevenueChart';
import { OrderStatusBars } from '@/components/charts/CategoryDonut';
import { useToast } from '@/components/common/Toast';
import { ORDER_STATUS, PRODUCT_STATUS, RANGE_OPTIONS, STOCK_STATUS } from '@/utils/constants';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/utils/format';
import { downloadCsv, downloadExcel } from '@/utils/export';
import type { CustomerReportRow, OrderReportRow, RangeKey, SalesReportRow } from '@/types';

type ReportTab = 'sales' | 'products' | 'customers' | 'orders';
type ProductReportType = 'bestsellers' | 'revenue' | 'low_stock' | 'out_of_stock';
type CustomerReportType = 'top' | 'new' | 'returning';

function RangeFilter({ value, onChange }: { value: RangeKey; onChange: (range: RangeKey) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg bg-ink-100 p-1 scrollbar-none dark:bg-ink-800/70">
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            'whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === option.key
              ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-900 dark:text-ink-100'
              : 'text-ink-600 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-200',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Compact figure strip shown above each report table. */
function TotalsRow({ items }: { items: { label: string; value: string; tone?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      {items.map((item) => (
        <Card key={item.label} className="p-4">
          <p className="truncate text-xs font-medium text-ink-500 dark:text-ink-400">{item.label}</p>
          <p
            className={cn(
              'mt-1.5 text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-100',
              item.tone,
            )}
          >
            {item.value}
          </p>
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------- sales ---------------------------------- */

function SalesReport({ range }: { range: RangeKey }) {
  const toast = useToast();
  const [grouping, setGrouping] = useState<SalesGrouping>('daily');
  const [metric, setMetric] = useState<SalesMetric>('revenue');

  const { data, isLoading, isError, refetch } = useGetSalesReportQuery({ range, grouping });

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  const columns: Column<SalesReportRow>[] = [
    {
      key: 'period',
      header: 'Period',
      hideable: false,
      render: (row) => (
        <span className="whitespace-nowrap font-medium text-ink-900 dark:text-ink-100">
          {row.period}
        </span>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      render: (row) => <span className="tabular-nums">{formatNumber(row.orders)}</span>,
    },
    {
      key: 'units',
      header: 'Units',
      align: 'right',
      render: (row) => <span className="tabular-nums">{formatNumber(row.units)}</span>,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      render: (row) => (
        <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
          {formatCurrency(row.revenue)}
        </span>
      ),
    },
    {
      key: 'discount',
      header: 'Discount',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-rose-600 dark:text-rose-400">
          {row.discount ? `-${formatCurrency(row.discount)}` : '—'}
        </span>
      ),
    },
    {
      key: 'tax',
      header: 'Tax',
      align: 'right',
      render: (row) => <span className="tabular-nums">{formatCurrency(row.tax)}</span>,
    },
    {
      key: 'net',
      header: 'Net',
      align: 'right',
      render: (row) => (
        <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatCurrency(row.net)}
        </span>
      ),
    },
  ];

  const exportRows = (format: 'csv' | 'xls') => {
    const columnSpec = [
      { key: 'period', header: 'Period', value: (row: SalesReportRow) => row.period },
      { key: 'orders', header: 'Orders', value: (row: SalesReportRow) => row.orders },
      { key: 'units', header: 'Units', value: (row: SalesReportRow) => row.units },
      { key: 'revenue', header: 'Revenue (INR)', value: (row: SalesReportRow) => row.revenue },
      { key: 'discount', header: 'Discount (INR)', value: (row: SalesReportRow) => row.discount },
      { key: 'tax', header: 'Tax (INR)', value: (row: SalesReportRow) => row.tax },
      { key: 'net', header: 'Net (INR)', value: (row: SalesReportRow) => row.net },
    ];
    const name = `sopii-sales-report-${range}-${grouping}`;
    if (format === 'csv') downloadCsv(name, rows, columnSpec);
    else downloadExcel(name, rows, columnSpec);
    toast.success('Sales report exported', `${rows.length} rows downloaded.`);
  };

  return (
    <div className="space-y-4">
      <TotalsRow
        items={[
          { label: 'Orders', value: formatNumber(totals?.orders ?? 0) },
          { label: 'Units sold', value: formatNumber(totals?.units ?? 0) },
          { label: 'Revenue', value: formatCurrency(totals?.revenue ?? 0) },
          {
            label: 'Discounts',
            value: formatCurrency(totals?.discount ?? 0),
            tone: 'text-rose-600 dark:text-rose-400',
          },
          { label: 'Tax collected', value: formatCurrency(totals?.tax ?? 0) },
          {
            label: 'Net revenue',
            value: formatCurrency(totals?.net ?? 0),
            tone: 'text-emerald-600 dark:text-emerald-400',
          },
        ]}
      />

      <Card>
        <CardHeader
          title="Revenue trend"
          description="Each point is one reporting period in the selected grouping."
          action={
            <Select
              sizeVariant="sm"
              className="w-auto"
              value={grouping}
              onChange={(event) => setGrouping(event.target.value as SalesGrouping)}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'yearly', label: 'Yearly' },
              ]}
              aria-label="Group sales by"
            />
          }
        />
        <div className="py-4">
          {isLoading ? (
            <ChartSkeleton />
          ) : (
            <RevenueChart
              data={rows.map((row) => ({
                label: row.period,
                revenue: row.revenue,
                orders: row.orders,
                aov: row.orders ? Math.round(row.revenue / row.orders) : 0,
              }))}
              metric={metric}
              onMetricChange={setMetric}
              variant={grouping === 'daily' ? 'area' : 'bar'}
            />
          )}
        </div>
      </Card>

      <DataTable
        storageKey="report-sales"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.period}
        loading={isLoading}
        error={isError || undefined}
        onRetry={refetch}
        density="compact"
        emptyIcon={FileBarChart}
        emptyTitle="No sales in this period."
        emptyDescription="Widen the date range to see more activity."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => exportRows('csv')}
              disabled={rows.length === 0}
            >
              CSV
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => exportRows('xls')}
              disabled={rows.length === 0}
            >
              Excel
            </Button>
          </div>
        }
      />
    </div>
  );
}

/* --------------------------------- products -------------------------------- */

const PRODUCT_REPORTS: { key: ProductReportType; label: string }[] = [
  { key: 'bestsellers', label: 'Best sellers' },
  { key: 'revenue', label: 'Top revenue' },
  { key: 'low_stock', label: 'Low stock' },
  { key: 'out_of_stock', label: 'Out of stock' },
];

function ProductsReport() {
  const toast = useToast();
  const navigate = useNavigate();
  const [type, setType] = useState<ProductReportType>('bestsellers');

  const { data, isLoading, isError, refetch } = useGetProductReportQuery({ type });
  const rows = data ?? [];

  const columns: Column<ProductReportRow>[] = [
    {
      key: 'name',
      header: 'Product',
      hideable: false,
      render: (row) => (
        <div className="flex items-center gap-3">
          <AppImage
            src={row.image}
            alt={row.name}
            seed={row.id}
            wrapperClassName="h-10 w-10 shrink-0"
          />
          <div className="min-w-0">
            <p className="max-w-[16rem] truncate font-medium text-ink-900 dark:text-ink-100">
              {row.name}
            </p>
            <p className="truncate font-mono text-2xs text-ink-500 dark:text-ink-400">{row.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <span className="text-ink-600 dark:text-ink-400">{row.category}</span>,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (row) => <span className="tabular-nums">{formatCurrency(row.price)}</span>,
    },
    {
      key: 'unitsSold',
      header: 'Units sold',
      align: 'right',
      render: (row) => (
        <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
          {formatNumber(row.unitsSold)}
        </span>
      ),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      render: (row) => (
        <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
          {formatCurrency(row.revenue)}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      render: (row) => {
        const status =
          row.stock <= 0 ? 'out_of_stock' : row.stock <= row.lowStockThreshold ? 'low_stock' : 'in_stock';
        return (
          <div className="flex items-center justify-end gap-2">
            <span className="tabular-nums">{formatNumber(row.stock)}</span>
            <StatusBadge tone={STOCK_STATUS[status]} />
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      defaultHidden: true,
      render: (row) => (
        <StatusBadge tone={PRODUCT_STATUS[row.status as keyof typeof PRODUCT_STATUS]} />
      ),
    },
  ];

  const exportRows = () => {
    downloadCsv(`sopii-product-report-${type}`, rows, [
      { key: 'name', header: 'Product', value: (row) => row.name },
      { key: 'sku', header: 'SKU', value: (row) => row.sku },
      { key: 'category', header: 'Category', value: (row) => row.category },
      { key: 'price', header: 'Price (INR)', value: (row) => row.price },
      { key: 'unitsSold', header: 'Units Sold', value: (row) => row.unitsSold },
      { key: 'revenue', header: 'Revenue (INR)', value: (row) => row.revenue },
      { key: 'stock', header: 'Stock', value: (row) => row.stock },
      { key: 'status', header: 'Status', value: (row) => row.status },
    ]);
    toast.success('Product report exported', `${rows.length} products downloaded.`);
  };

  return (
    <DataTable
      storageKey="report-products"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      loading={isLoading}
      error={isError || undefined}
      onRetry={refetch}
      onRowClick={(row) => navigate(`/admin/products/${row.id}`)}
      emptyIcon={Package}
      emptyTitle="Nothing to report here."
      emptyDescription="No products match this report for the moment."
      toolbar={
        <>
          <Select
            sizeVariant="sm"
            className="w-auto"
            value={type}
            onChange={(event) => setType(event.target.value as ProductReportType)}
            options={PRODUCT_REPORTS.map((report) => ({ value: report.key, label: report.label }))}
            aria-label="Product report type"
          />
          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={exportRows}
            disabled={rows.length === 0}
          >
            Export
          </Button>
        </>
      }
    />
  );
}

/* -------------------------------- customers -------------------------------- */

const CUSTOMER_REPORTS: { key: CustomerReportType; label: string }[] = [
  { key: 'top', label: 'Top spenders' },
  { key: 'new', label: 'New customers' },
  { key: 'returning', label: 'Returning customers' },
];

function CustomersReport({ range }: { range: RangeKey }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [type, setType] = useState<CustomerReportType>('top');

  const { data, isLoading, isError, refetch } = useGetCustomerReportQuery({ range, type });
  const rows = data ?? [];

  const columns: Column<CustomerReportRow>[] = [
    {
      key: 'name',
      header: 'Customer',
      hideable: false,
      render: (row) => (
        <div className="min-w-0">
          <p className="max-w-[14rem] truncate font-medium text-ink-900 dark:text-ink-100">
            {row.name}
          </p>
          <p className="max-w-[14rem] truncate text-2xs text-ink-500 dark:text-ink-400">
            {row.email}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span
          className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset',
            row.type === 'new'
              ? 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400'
              : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400',
          )}
        >
          {row.type === 'new' ? 'New' : 'Returning'}
        </span>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      render: (row) => <span className="tabular-nums">{formatNumber(row.orders)}</span>,
    },
    {
      key: 'totalSpent',
      header: 'Total spent',
      align: 'right',
      render: (row) => (
        <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
          {formatCurrency(row.totalSpent)}
        </span>
      ),
    },
    {
      key: 'aov',
      header: 'Avg order',
      align: 'right',
      render: (row) => <span className="tabular-nums">{formatCurrency(row.aov)}</span>,
    },
    {
      key: 'lastOrderAt',
      header: 'Last order',
      render: (row) => (
        <span className="whitespace-nowrap text-ink-600 dark:text-ink-400">
          {formatDate(row.lastOrderAt)}
        </span>
      ),
    },
  ];

  const exportRows = () => {
    downloadCsv(`sopii-customer-report-${type}-${range}`, rows, [
      { key: 'name', header: 'Customer', value: (row) => row.name },
      { key: 'email', header: 'Email', value: (row) => row.email },
      { key: 'type', header: 'Type', value: (row) => row.type },
      { key: 'orders', header: 'Orders', value: (row) => row.orders },
      { key: 'totalSpent', header: 'Total Spent (INR)', value: (row) => row.totalSpent },
      { key: 'aov', header: 'Average Order Value (INR)', value: (row) => row.aov },
      { key: 'lastOrderAt', header: 'Last Order', value: (row) => formatDate(row.lastOrderAt) },
    ]);
    toast.success('Customer report exported', `${rows.length} customers downloaded.`);
  };

  return (
    <DataTable
      storageKey="report-customers"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      loading={isLoading}
      error={isError || undefined}
      onRetry={refetch}
      onRowClick={(row) => navigate(`/admin/customers/${row.id}`)}
      emptyIcon={Users}
      emptyTitle="No customers in this report."
      emptyDescription="Try a wider date range or a different report type."
      toolbar={
        <>
          <Select
            sizeVariant="sm"
            className="w-auto"
            value={type}
            onChange={(event) => setType(event.target.value as CustomerReportType)}
            options={CUSTOMER_REPORTS.map((report) => ({ value: report.key, label: report.label }))}
            aria-label="Customer report type"
          />
          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={exportRows}
            disabled={rows.length === 0}
          >
            Export
          </Button>
        </>
      }
    />
  );
}

/* ---------------------------------- orders --------------------------------- */

function OrdersReport({ range }: { range: RangeKey }) {
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useGetOrderReportQuery({ range });
  const rows = data ?? [];

  const totalOrders = rows.reduce((sum, row) => sum + row.count, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);

  const columns: Column<OrderReportRow>[] = [
    {
      key: 'status',
      header: 'Status',
      hideable: false,
      render: (row) => <StatusBadge tone={ORDER_STATUS[row.status]} />,
    },
    {
      key: 'count',
      header: 'Orders',
      align: 'right',
      render: (row) => (
        <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
          {formatNumber(row.count)}
        </span>
      ),
    },
    {
      key: 'share',
      header: 'Share',
      align: 'right',
      render: (row) => (
        <div className="ml-auto min-w-[7rem]">
          <p className="tabular-nums text-ink-700 dark:text-ink-300">{row.share}%</p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <div
              className={cn('h-full rounded-full', ORDER_STATUS[row.status].dot)}
              style={{ width: `${Math.max(2, row.share)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      render: (row) => (
        <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
          {formatCurrency(row.revenue)}
        </span>
      ),
    },
  ];

  const exportRows = () => {
    downloadCsv(`sopii-order-report-${range}`, rows, [
      { key: 'status', header: 'Status', value: (row) => row.status },
      { key: 'count', header: 'Orders', value: (row) => row.count },
      { key: 'share', header: 'Share (%)', value: (row) => row.share },
      { key: 'revenue', header: 'Revenue (INR)', value: (row) => row.revenue },
    ]);
    toast.success('Order report exported', `${rows.length} rows downloaded.`);
  };

  return (
    <div className="space-y-4">
      <TotalsRow
        items={[
          { label: 'Total orders', value: formatNumber(totalOrders) },
          { label: 'Total revenue', value: formatCurrency(totalRevenue) },
          {
            label: 'Average order value',
            value: formatCurrency(totalOrders ? Math.round(totalRevenue / totalOrders) : 0),
          },
          {
            label: 'Cancelled + returned',
            value: formatPercent(
              totalOrders
                ? (rows
                    .filter((row) => row.status === 'cancelled' || row.status === 'returned')
                    .reduce((sum, row) => sum + row.count, 0) /
                    totalOrders) *
                    100
                : 0,
              1,
            ),
            tone: 'text-rose-600 dark:text-rose-400',
          },
        ]}
      />

      <Card>
        <CardHeader title="Order pipeline" description="Where orders sit across the fulfilment flow." />
        <div className="p-5">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="skeleton h-6 w-full" />
              ))}
            </div>
          ) : (
            <OrderStatusBars data={rows.map((row) => ({ status: row.status, count: row.count }))} />
          )}
        </div>
      </Card>

      <DataTable
        storageKey="report-orders"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.status}
        loading={isLoading}
        error={isError || undefined}
        onRetry={refetch}
        density="compact"
        emptyIcon={ShoppingBag}
        emptyTitle="No orders in this period."
        emptyDescription="Widen the date range to see more activity."
        toolbar={
          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={exportRows}
            disabled={rows.length === 0}
          >
            Export
          </Button>
        }
      />
    </div>
  );
}

/* ---------------------------------- page ----------------------------------- */

export default function ReportsPage() {
  useDocumentTitle('Reports');

  const [tab, setTab] = useState<ReportTab>('sales');
  const [range, setRange] = useState<RangeKey>('30d');

  const rangeLabel = RANGE_OPTIONS.find((option) => option.key === range)?.label ?? '';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description={`Sales, catalogue and customer performance for the last ${rangeLabel.toLowerCase()}.`}
        actions={<RangeFilter value={range} onChange={setRange} />}
      />

      <Tabs
        items={[
          { key: 'sales', label: 'Sales' },
          { key: 'products', label: 'Products' },
          { key: 'customers', label: 'Customers' },
          { key: 'orders', label: 'Orders' },
        ]}
        active={tab}
        onChange={(key) => setTab(key as ReportTab)}
      />

      {tab === 'sales' && <SalesReport range={range} />}
      {tab === 'products' && <ProductsReport />}
      {tab === 'customers' && <CustomersReport range={range} />}
      {tab === 'orders' && <OrdersReport range={range} />}
    </div>
  );
}
