import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Download, Package, RefreshCw, ShoppingBag } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle } from '@/hooks';
import { useGetDashboardQuery } from '@/store/api/platformApi';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/Badge';
import { AppImage } from '@/components/common/AppImage';
import { CardSkeleton, ChartSkeleton, EmptyState, ErrorState, TableSkeleton } from '@/components/common/States';
import { StatCard } from '@/components/charts/StatCard';
import { RevenueChart, type SalesMetric } from '@/components/charts/RevenueChart';
import { CategoryDonut, OrderStatusBars } from '@/components/charts/CategoryDonut';
import { ORDER_STATUS, PAYMENT_STATUS, RANGE_OPTIONS } from '@/utils/constants';
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber } from '@/utils/format';
import { downloadCsv } from '@/utils/export';
import { useToast } from '@/components/common/Toast';
import type { Order, RangeKey } from '@/types';

function RangeFilter({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (range: RangeKey) => void;
}) {
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

function RecentOrdersTable({ orders }: { orders: Order[] }) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-2xs uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
            <th scope="col" className="px-5 py-2.5 text-left font-semibold">Order ID</th>
            <th scope="col" className="px-3 py-2.5 text-left font-semibold">Customer</th>
            <th scope="col" className="px-3 py-2.5 text-left font-semibold">Date</th>
            <th scope="col" className="px-3 py-2.5 text-center font-semibold">Items</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Amount</th>
            <th scope="col" className="px-3 py-2.5 text-left font-semibold">Payment</th>
            <th scope="col" className="px-3 py-2.5 text-left font-semibold">Status</th>
            <th scope="col" className="px-5 py-2.5 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
          {orders.map((order) => (
            <tr
              key={order.id}
              onClick={() => navigate(`/admin/orders/${order.id}`)}
              className="cursor-pointer transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/40"
            >
              <td className="whitespace-nowrap px-5 py-3 font-medium text-ink-900 dark:text-ink-100">
                #{order.code}
              </td>
              <td className="px-3 py-3">
                <span className="block max-w-[11rem] truncate text-ink-800 dark:text-ink-200">
                  {order.customerName}
                </span>
                <span className="block max-w-[11rem] truncate text-2xs text-ink-500 dark:text-ink-400">
                  {order.customerEmail}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-ink-600 dark:text-ink-400">
                {formatDate(order.placedAt)}
              </td>
              <td className="px-3 py-3 text-center tabular-nums text-ink-600 dark:text-ink-400">
                {order.items.length}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-ink-900 dark:text-ink-100">
                {formatCurrency(order.total)}
              </td>
              <td className="px-3 py-3">
                <StatusBadge tone={PAYMENT_STATUS[order.paymentStatus]} />
              </td>
              <td className="px-3 py-3">
                <StatusBadge tone={ORDER_STATUS[order.status]} />
              </td>
              <td className="px-5 py-3 text-right">
                <Link
                  to={`/admin/orders/${order.id}`}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  View
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');

  const [range, setRange] = useState<RangeKey>('30d');
  const [metric, setMetric] = useState<SalesMetric>('revenue');
  const toast = useToast();
  const navigate = useNavigate();

  const { data, isLoading, isFetching, isError, refetch } = useGetDashboardQuery(range);

  const rangeLabel = RANGE_OPTIONS.find((option) => option.key === range)?.label ?? '';

  const exportSummary = () => {
    if (!data) return;
    downloadCsv(`sopii-dashboard-${range}`, data.sales, [
      { key: 'label', header: 'Period', value: (row) => row.label },
      { key: 'revenue', header: 'Revenue (INR)', value: (row) => row.revenue },
      { key: 'orders', header: 'Orders', value: (row) => row.orders },
      { key: 'aov', header: 'Average Order Value (INR)', value: (row) => row.aov },
    ]);
    toast.success('Dashboard exported', `${rangeLabel} sales data downloaded as CSV.`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={`Store performance for the last ${rangeLabel.toLowerCase()}.`}
        actions={
          <>
            <RangeFilter value={range} onChange={setRange} />
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />}
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={exportSummary}
              disabled={!data}
            >
              <span className="hidden sm:inline">Export</span>
            </Button>
          </>
        }
      />

      {isError ? (
        <Card>
          <ErrorState
            title="We could not load the dashboard"
            description="The analytics request failed. Try again in a moment."
            onRetry={refetch}
          />
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {isLoading
              ? Array.from({ length: 6 }).map((_, index) => <CardSkeleton key={index} />)
              : data?.kpis.map((stat) => (
                  <StatCard
                    key={stat.key}
                    stat={stat}
                    range={range}
                    onClick={() => {
                      if (stat.key === 'orders' || stat.key === 'pending') navigate('/admin/orders');
                      else if (stat.key === 'customers') navigate('/admin/customers');
                      else if (stat.key === 'products') navigate('/admin/products');
                      else if (stat.key === 'low_stock') navigate('/admin/inventory');
                      else navigate('/admin/reports');
                    }}
                  />
                ))}
          </div>

          {/* Sales chart */}
          <Card>
            <CardHeader
              title="Sales performance"
              description={`Revenue, orders and average order value across the last ${rangeLabel.toLowerCase()}.`}
              action={
                data && (
                  <div className="flex flex-wrap gap-4 sm:gap-6">
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-ink-400">Revenue</p>
                      <p className="text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                        {formatCompactCurrency(data.totals.revenue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-ink-400">Orders</p>
                      <p className="text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                        {formatNumber(data.totals.orders)}
                      </p>
                    </div>
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-ink-400">Avg order</p>
                      <p className="text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                        {formatCurrency(data.totals.aov)}
                      </p>
                    </div>
                  </div>
                )
              }
            />
            <div className="py-4">
              {isLoading ? (
                <ChartSkeleton />
              ) : (
                <RevenueChart
                  data={data?.sales ?? []}
                  metric={metric}
                  onMetricChange={setMetric}
                  variant={range === 'today' || range === '7d' ? 'bar' : 'area'}
                />
              )}
            </div>
          </Card>

          {/* Category + status */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Sales by category"
                description="Revenue share across the top-level catalogue."
                action={
                  <Button size="sm" variant="ghost" to="/admin/reports">
                    View reports
                  </Button>
                }
              />
              <div className="p-5">
                {isLoading ? (
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="skeleton mx-auto h-48 w-48 rounded-full" />
                    <div className="flex-1 space-y-3">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="skeleton h-4 w-full" />
                      ))}
                    </div>
                  </div>
                ) : data?.categories.length ? (
                  <CategoryDonut data={data.categories} />
                ) : (
                  <EmptyState
                    compact
                    title="No category sales yet"
                    description="Once orders come in for this period, the split appears here."
                  />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Order pipeline" description={`Status split · ${rangeLabel}`} />
              <div className="p-5">
                {isLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 7 }).map((_, index) => (
                      <div key={index} className="skeleton h-6 w-full" />
                    ))}
                  </div>
                ) : (
                  <OrderStatusBars data={data?.statusBreakdown ?? []} />
                )}
              </div>
            </Card>
          </div>

          {/* Recent orders */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Recent orders"
              description="The latest activity across the store."
              action={
                <Button size="sm" variant="secondary" to="/admin/orders">
                  All orders
                </Button>
              }
            />
            {isLoading ? (
              <TableSkeleton rows={6} columns={7} />
            ) : data?.recentOrders.length ? (
              <RecentOrdersTable orders={data.recentOrders} />
            ) : (
              <EmptyState
                icon={ShoppingBag}
                title="No orders found."
                description="New orders will appear here as soon as they are placed."
              />
            )}
          </Card>

          {/* Top products */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Top selling products"
              description={`Best performers over the last ${rangeLabel.toLowerCase()}.`}
              action={
                <Button size="sm" variant="secondary" to="/admin/products">
                  All products
                </Button>
              }
            />
            {isLoading ? (
              <TableSkeleton rows={5} columns={5} />
            ) : data?.topProducts.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-2xs uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
                      <th scope="col" className="px-5 py-2.5 text-left font-semibold">Product</th>
                      <th scope="col" className="px-3 py-2.5 text-left font-semibold">Category</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Sold</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Revenue</th>
                      <th scope="col" className="px-5 py-2.5 text-right font-semibold">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                    {data.topProducts.map((product) => (
                      <tr
                        key={product.id}
                        onClick={() => navigate(`/admin/products/${product.id}`)}
                        className="cursor-pointer transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/40"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <AppImage
                              src={product.image}
                              alt={product.name}
                              seed={product.id}
                              wrapperClassName="h-10 w-10 shrink-0"
                            />
                            <span className="min-w-0">
                              <span className="block max-w-[16rem] truncate font-medium text-ink-900 dark:text-ink-100">
                                {product.name}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-ink-600 dark:text-ink-400">
                          {product.category}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-ink-700 dark:text-ink-300">
                          {formatNumber(product.sold)}
                        </td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums text-ink-900 dark:text-ink-100">
                          {formatCurrency(product.revenue)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={cn(
                              'tabular-nums',
                              product.stock === 0
                                ? 'font-medium text-rose-600 dark:text-rose-400'
                                : product.stock < 20
                                  ? 'font-medium text-amber-600 dark:text-amber-400'
                                  : 'text-ink-700 dark:text-ink-300',
                            )}
                          >
                            {formatNumber(product.stock)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Package}
                title="No product sales in this period"
                description="Try widening the date range to see best sellers."
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
