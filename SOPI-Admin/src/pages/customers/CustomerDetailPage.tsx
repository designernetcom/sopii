import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  Heart,
  IndianRupee,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShoppingBag,
  Star,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, usePermissions } from '@/hooks';
import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import { useGetCustomerQuery, useUpdateCustomerMutation } from '@/store/api/commerceApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader, Tabs } from '@/components/common/PageHeader';
import { Card, CardBody, DetailRow } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge, StatusBadge } from '@/components/common/Badge';
import { AppImage, Avatar } from '@/components/common/AppImage';
import { Field, Textarea } from '@/components/common/Field';
import { EmptyState, ErrorState, PageLoader } from '@/components/common/States';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { FormModal } from '@/components/modals/FormModal';
import { useToast } from '@/components/common/Toast';
import { CUSTOMER_TIER, ORDER_STATUS, REVIEW_STATUS } from '@/utils/constants';
import { formatCurrency, formatDate, formatNumber, formatRelativeTime } from '@/utils/format';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();

  const [tab, setTab] = useState('profile');
  const [blockOpen, setBlockOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');

  const { data, isLoading, isError, refetch } = useGetCustomerQuery(id!);
  const [updateCustomer, { isLoading: updating }] = useUpdateCustomerMutation();

  useDocumentTitle(data?.customer.name ?? 'Customer');
  useBreadcrumbLabel(data?.customer.name);

  if (isLoading) return <PageLoader />;

  if (isError || !data) {
    return (
      <Card>
        <ErrorState
          title="We could not load this customer"
          description="They may have been deleted, or the request failed."
          onRetry={refetch}
        />
      </Card>
    );
  }

  const { customer, orders, reviews, wishlist, stats } = data;

  const toggleBlock = async () => {
    try {
      await updateCustomer({
        id: customer.id,
        body: { status: customer.status === 'active' ? 'blocked' : 'active' },
      }).unwrap();
      toast.success(
        customer.status === 'active' ? 'Customer blocked' : 'Customer unblocked',
        customer.name,
      );
      setBlockOpen(false);
    } catch (error) {
      toast.error('Could not update the customer', errorMessage(error));
    }
  };

  const saveNote = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateCustomer({ id: customer.id, body: { notes: note.trim() || undefined } }).unwrap();
      toast.success('Note saved', customer.name);
      setNoteOpen(false);
    } catch (error) {
      toast.error('Could not save the note', errorMessage(error));
    }
  };

  const statCards = [
    {
      label: 'Total orders',
      value: formatNumber(stats.totalOrders),
      icon: ShoppingBag,
      tone: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',
    },
    {
      label: 'Total spent',
      value: formatCurrency(stats.totalSpent),
      icon: IndianRupee,
      tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    },
    {
      label: 'Average order',
      value: formatCurrency(stats.aov),
      icon: IndianRupee,
      tone: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
    },
    {
      label: 'Last purchase',
      value: stats.lastPurchase ? formatRelativeTime(stats.lastPurchase) : 'Never',
      icon: CalendarClock,
      tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        back={
          <Button
            variant="ghost"
            size="xs"
            className="mb-2 -ml-2"
            onClick={() => navigate('/admin/customers')}
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
          >
            Back to customers
          </Button>
        }
        title={customer.name}
        description={`Customer since ${formatDate(customer.createdAt)}`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={CUSTOMER_TIER[customer.tier]} size="md" />
            {customer.status === 'blocked' && (
              <Badge
                size="md"
                className="bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400"
              >
                Blocked
              </Badge>
            )}
            {customer.acceptsMarketing && <Badge size="md">Subscribed</Badge>}
          </div>
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Mail className="h-4 w-4" />}
              onClick={() => window.open(`mailto:${customer.email}`)}
            >
              Email
            </Button>
            {can('customers', 'edit') && (
              <>
                <Button
                  variant="secondary"
                  icon={<MessageSquare className="h-4 w-4" />}
                  onClick={() => {
                    setNote(customer.notes ?? '');
                    setNoteOpen(true);
                  }}
                >
                  Add note
                </Button>
                <Button
                  variant={customer.status === 'active' ? 'secondary' : 'primary'}
                  icon={
                    customer.status === 'active' ? (
                      <Ban className="h-4 w-4" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )
                  }
                  onClick={() => setBlockOpen(true)}
                >
                  {customer.status === 'active' ? 'Block' : 'Unblock'}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center gap-3">
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', stat.tone)}>
                <stat.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-2xs text-ink-500 dark:text-ink-400">{stat.label}</p>
                <p className="truncate text-base font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                  {stat.value}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-1">
          <CardBody className="space-y-5">
            <div className="flex flex-col items-center text-center">
              <Avatar name={customer.name} src={customer.avatar} size="lg" />
              <h3 className="mt-3 text-base font-semibold text-ink-900 dark:text-ink-100">
                {customer.name}
              </h3>
              <p className="text-xs text-ink-500 dark:text-ink-400">{customer.email}</p>
            </div>

            <dl className="divide-y divide-ink-200 dark:divide-ink-800">
              <DetailRow label="Phone">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-ink-400" />
                  {customer.phone}
                </span>
              </DetailRow>
              <DetailRow label="Tier">
                <StatusBadge tone={CUSTOMER_TIER[customer.tier]} />
              </DetailRow>
              <DetailRow label="Marketing">
                {customer.acceptsMarketing ? 'Subscribed' : 'Not subscribed'}
              </DetailRow>
              <DetailRow label="Addresses">{customer.addresses.length}</DetailRow>
              <DetailRow label="Wishlist">{wishlist.length} items</DetailRow>
            </dl>

            {customer.notes && (
              <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-500/10">
                <p className="text-2xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Internal note
                </p>
                <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">{customer.notes}</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <Tabs
            className="px-4 pt-1"
            items={[
              { key: 'profile', label: 'Profile' },
              { key: 'orders', label: 'Orders', count: orders.length },
              { key: 'addresses', label: 'Addresses', count: customer.addresses.length },
              { key: 'wishlist', label: 'Wishlist', count: wishlist.length },
              { key: 'reviews', label: 'Reviews', count: reviews.length },
              { key: 'activity', label: 'Activity' },
            ]}
            active={tab}
            onChange={setTab}
          />

          <CardBody>
            {tab === 'profile' && (
              <dl className="divide-y divide-ink-200 dark:divide-ink-800">
                <DetailRow label="Full name">{customer.name}</DetailRow>
                <DetailRow label="Email">
                  <a
                    href={`mailto:${customer.email}`}
                    className="text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {customer.email}
                  </a>
                </DetailRow>
                <DetailRow label="Phone">{customer.phone}</DetailRow>
                <DetailRow label="Account status">
                  {customer.status === 'active' ? 'Active' : 'Blocked'}
                </DetailRow>
                <DetailRow label="Joined">{formatDate(customer.createdAt, true)}</DetailRow>
                <DetailRow label="Lifetime value">{formatCurrency(stats.totalSpent)}</DetailRow>
                <DetailRow label="Average order value">{formatCurrency(stats.aov)}</DetailRow>
              </dl>
            )}

            {tab === 'orders' &&
              (orders.length === 0 ? (
                <EmptyState
                  compact
                  icon={ShoppingBag}
                  title="No orders yet"
                  description="This customer has not placed an order."
                />
              ) : (
                <div className="-mx-5 overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-sm">
                    <thead>
                      <tr className="border-b border-ink-200 text-2xs uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
                        <th scope="col" className="px-5 py-2 text-left font-semibold">Order</th>
                        <th scope="col" className="px-3 py-2 text-left font-semibold">Date</th>
                        <th scope="col" className="px-3 py-2 text-center font-semibold">Items</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Total</th>
                        <th scope="col" className="px-5 py-2 text-left font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                      {orders.map((order) => (
                        <tr
                          key={order.id}
                          onClick={() => navigate(`/admin/orders/${order.id}`)}
                          className="cursor-pointer transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/40"
                        >
                          <td className="px-5 py-2.5 font-medium text-ink-900 dark:text-ink-100">
                            #{order.code}
                          </td>
                          <td className="px-3 py-2.5 text-ink-600 dark:text-ink-400">
                            {formatDate(order.placedAt)}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-ink-600 dark:text-ink-400">
                            {order.items.length}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink-900 dark:text-ink-100">
                            {formatCurrency(order.total)}
                          </td>
                          <td className="px-5 py-2.5">
                            <StatusBadge tone={ORDER_STATUS[order.status]} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {tab === 'addresses' &&
              (customer.addresses.length === 0 ? (
                <EmptyState compact icon={MapPin} title="No saved addresses" />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {customer.addresses.map((address, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-ink-200 p-4 dark:border-ink-700"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-ink-900 dark:text-ink-100">
                          {index === 0 ? 'Default address' : `Address ${index + 1}`}
                        </p>
                        <MapPin className="h-3.5 w-3.5 text-ink-400" />
                      </div>
                      <address className="text-sm not-italic leading-relaxed text-ink-600 dark:text-ink-400">
                        {address.name}
                        <br />
                        {address.line1}
                        {address.line2 && (
                          <>
                            <br />
                            {address.line2}
                          </>
                        )}
                        <br />
                        {address.city}, {address.state} {address.pincode}
                        <br />
                        {address.phone}
                      </address>
                    </div>
                  ))}
                </div>
              ))}

            {tab === 'wishlist' &&
              (wishlist.length === 0 ? (
                <EmptyState
                  compact
                  icon={Heart}
                  title="Wishlist is empty"
                  description="Saved products appear here."
                />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {wishlist.map((product) => (
                    <li key={product.id}>
                      <Link
                        to={`/admin/products/${product.id}`}
                        className="flex items-center gap-3 rounded-lg border border-ink-200 p-3 transition-colors hover:border-brand-300 hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800/40"
                      >
                        <AppImage
                          src={product.images[0]?.url}
                          alt={product.name}
                          seed={product.id}
                          wrapperClassName="h-11 w-11 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                            {product.name}
                          </p>
                          <p className="text-xs tabular-nums text-ink-500 dark:text-ink-400">
                            {formatCurrency(product.price)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === 'reviews' &&
              (reviews.length === 0 ? (
                <EmptyState
                  compact
                  icon={Star}
                  title="No reviews written"
                  description="Reviews left by this customer appear here."
                />
              ) : (
                <ul className="space-y-3">
                  {reviews.map((review) => (
                    <li key={review.id} className="rounded-lg border border-ink-200 p-4 dark:border-ink-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/admin/products/${review.productId}`}
                          className="text-sm font-medium text-ink-900 hover:text-brand-600 dark:text-ink-100 dark:hover:text-brand-400"
                        >
                          {review.productName}
                        </Link>
                        <span className="inline-flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, index) => (
                            <Star
                              key={index}
                              className={cn(
                                'h-3 w-3',
                                index < review.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-ink-300 dark:text-ink-600',
                              )}
                            />
                          ))}
                        </span>
                        <StatusBadge tone={REVIEW_STATUS[review.status]} />
                        <span className="ml-auto text-2xs text-ink-400">
                          {formatDate(review.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-ink-600 dark:text-ink-400">{review.body}</p>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === 'activity' && (
              <ol className="relative space-y-5 border-l border-ink-200 pl-6 dark:border-ink-800">
                {customer.activity.map((item) => (
                  <li key={item.id} className="relative">
                    <span className="absolute -left-[1.9rem] top-1 h-4 w-4 rounded-full bg-brand-500 ring-4 ring-white dark:ring-ink-900" />
                    <p className="text-sm text-ink-800 dark:text-ink-200">{item.message}</p>
                    <p className="mt-0.5 text-2xs text-ink-400">
                      {formatDate(item.at, true)} · {formatRelativeTime(item.at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmModal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onConfirm={toggleBlock}
        loading={updating}
        tone={customer.status === 'active' ? 'danger' : 'primary'}
        title={
          customer.status === 'active'
            ? `Block ${customer.name}?`
            : `Unblock ${customer.name}?`
        }
        description={
          customer.status === 'active'
            ? 'They will not be able to sign in or place new orders. Existing orders are unaffected.'
            : 'They will be able to sign in and place orders again.'
        }
        confirmLabel={customer.status === 'active' ? 'Block customer' : 'Unblock customer'}
      />

      <FormModal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        onSubmit={saveNote}
        title="Internal note"
        description={`Visible only to your team · ${customer.name}`}
        submitLabel="Save note"
        loading={updating}
      >
        <Field label="Note">
          <Textarea
            rows={4}
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Prefers delivery before 6 PM. Asked to be notified about silk restocks."
          />
        </Field>
      </FormModal>
    </div>
  );
}
