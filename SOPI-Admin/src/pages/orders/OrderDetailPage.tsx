import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CreditCard,
  Mail,
  MailWarning,
  MapPin,
  MessageSquarePlus,
  Printer,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, usePermissions } from '@/hooks';
import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import {
  useAddOrderNoteMutation,
  useGetOrderQuery,
  useResendOrderEmailMutation,
  useUpdateOrderMutation,
  useUpdateOrderStatusMutation,
} from '@/store/api/commerceApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardBody, CardHeader, DetailRow } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/Badge';
import { AppImage, Avatar } from '@/components/common/AppImage';
import { Field, Input, Select, Textarea } from '@/components/common/Field';
import { ErrorState, PageLoader } from '@/components/common/States';
import { FormModal } from '@/components/modals/FormModal';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useToast } from '@/components/common/Toast';
import {
  FULFILLMENT_STATUS,
  ORDER_STATUS,
  ORDER_STATUS_FLOW,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS,
} from '@/utils/constants';
import { formatCurrency, formatDate, formatRelativeTime } from '@/utils/format';
import { printPage } from '@/utils/export';
import { useAppSelector } from '@/store/hooks';
import type { Address, OrderEmailNotification, OrderStatus } from '@/types';

/**
 * `skipped` reads as "Not configured" rather than as a failure, because that is
 * what it is: nobody set `MAILTRAP_*` on the server. Showing it as an error
 * would send an operator looking for a problem with this order.
 */
const EMAIL_STATUS_LABEL: Record<OrderEmailNotification['status'], string> = {
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Not configured',
};

function AddressBlock({ title, address, icon: Icon }: { title: string; address: Address; icon: typeof MapPin }) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h4>
      <address className="text-sm not-italic leading-relaxed text-ink-700 dark:text-ink-300">
        <span className="block font-medium text-ink-900 dark:text-ink-100">{address.name}</span>
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
        {address.country}
        <br />
        <span className="text-ink-500 dark:text-ink-400">{address.phone}</span>
      </address>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const admin = useAppSelector((state) => state.auth.user);

  const { data: order, isLoading, isError, refetch } = useGetOrderQuery(id!);
  const [updateStatus, { isLoading: updatingStatus }] = useUpdateOrderStatusMutation();
  const [updateOrder, { isLoading: savingShipping }] = useUpdateOrderMutation();
  const [addNote, { isLoading: savingNote }] = useAddOrderNoteMutation();
  const [resendEmail, { isLoading: resending }] = useResendOrderEmailMutation();

  const [statusModal, setStatusModal] = useState(false);
  const [nextStatus, setNextStatus] = useState<OrderStatus>('confirmed');
  const [statusNote, setStatusNote] = useState('');
  const [noteModal, setNoteModal] = useState(false);
  const [note, setNote] = useState('');
  const [shippingModal, setShippingModal] = useState(false);
  const [courier, setCourier] = useState('');
  const [tracking, setTracking] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  useDocumentTitle(order ? `Order #${order.code}` : 'Order');
  useBreadcrumbLabel(order ? `#${order.code}` : undefined);

  if (isLoading) return <PageLoader />;

  if (isError || !order) {
    return (
      <Card>
        <ErrorState
          title="We could not load this order"
          description="It may have been deleted, or the request failed."
          onRetry={refetch}
        />
      </Card>
    );
  }

  const currentStep = ORDER_STATUS_FLOW.indexOf(order.status);
  const isTerminal = order.status === 'cancelled' || order.status === 'returned';

  const changeStatus = async (status: OrderStatus, noteText?: string) => {
    try {
      await updateStatus({ id: order.id, status, note: noteText, by: admin?.name }).unwrap();
      toast.success('Order status updated.', `#${order.code} → ${ORDER_STATUS[status].label}`);
      setStatusModal(false);
      setStatusNote('');
      setCancelOpen(false);
    } catch (error) {
      toast.error('Could not update the order', errorMessage(error));
    }
  };

  /*
   * The confirmation is the one the panel surfaces. Shipped/delivered/cancelled
   * mail is recorded on the same array and readable through the API, but an
   * operator opening an order wants to know one thing: did the customer get
   * their receipt.
   */
  const confirmationEmail = order.emailNotifications?.find(
    (entry) => entry.kind === 'order_confirmation',
  );

  const handleResendEmail = async () => {
    try {
      const result = await resendEmail({ id: order.id, kind: 'order_confirmation' }).unwrap();
      toast.success('Confirmation email sent', result.recipient);
    } catch (error) {
      /* The server answers 502 with the relay's own reason on a failed send,
         which `errorMessage` unwraps — so the operator sees "550 Sender address
         rejected" rather than "request failed". */
      toast.error('Could not send the confirmation email', errorMessage(error));
    }
  };

  const saveShipping = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateOrder({
        id: order.id,
        body: { courier: courier || undefined, trackingNumber: tracking || undefined },
      }).unwrap();
      toast.success('Shipping details saved', `#${order.code}`);
      setShippingModal(false);
    } catch (error) {
      toast.error('Could not save shipping details', errorMessage(error));
    }
  };

  const saveNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    try {
      await addNote({ id: order.id, note: note.trim(), by: admin?.name }).unwrap();
      toast.success('Note added to the order timeline');
      setNote('');
      setNoteModal(false);
    } catch (error) {
      toast.error('Could not add the note', errorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        back={
          <Button
            variant="ghost"
            size="xs"
            className="mb-2 -ml-2"
            onClick={() => navigate('/admin/orders')}
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
          >
            Back to orders
          </Button>
        }
        title={`Order #${order.code}`}
        description={`Placed ${formatDate(order.placedAt, true)} · ${formatRelativeTime(order.placedAt)}`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={ORDER_STATUS[order.status]} size="md" />
            <StatusBadge tone={PAYMENT_STATUS[order.paymentStatus]} size="md" />
            <StatusBadge tone={FULFILLMENT_STATUS[order.fulfillment]} size="md" />
          </div>
        }
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={printPage}>
              Print
            </Button>
            {can('orders', 'edit') && (
              <>
                <Button
                  variant="secondary"
                  icon={<MessageSquarePlus className="h-4 w-4" />}
                  onClick={() => setNoteModal(true)}
                >
                  Add note
                </Button>
                <Button
                  variant="primary"
                  icon={<Check className="h-4 w-4" />}
                  onClick={() => {
                    setNextStatus(
                      currentStep >= 0 && currentStep < ORDER_STATUS_FLOW.length - 1
                        ? ORDER_STATUS_FLOW[currentStep + 1]
                        : order.status,
                    );
                    setStatusModal(true);
                  }}
                >
                  Update status
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Progress timeline */}
      <Card className="no-print">
        <CardBody>
          {isTerminal ? (
            <div className="flex items-center gap-3 rounded-lg bg-rose-50 px-4 py-3 dark:bg-rose-500/10">
              <XCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div>
                <p className="text-sm font-medium text-rose-900 dark:text-rose-200">
                  This order was {ORDER_STATUS[order.status].label.toLowerCase()}.
                </p>
                <p className="text-xs text-rose-700 dark:text-rose-300">
                  {order.timeline[order.timeline.length - 1]?.note ?? 'No reason recorded.'}
                </p>
              </div>
            </div>
          ) : (
            <ol className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {ORDER_STATUS_FLOW.map((status, index) => {
                const done = index <= currentStep;
                const isCurrent = index === currentStep;
                return (
                  <li key={status} className="flex flex-1 items-center gap-3">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                        done
                          ? 'bg-brand-600 text-white'
                          : 'bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500',
                        isCurrent && 'ring-4 ring-brand-500/20',
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-xs font-medium',
                          done
                            ? 'text-ink-900 dark:text-ink-100'
                            : 'text-ink-400 dark:text-ink-500',
                        )}
                      >
                        {ORDER_STATUS[status].label}
                      </p>
                      {done && (
                        <p className="truncate text-2xs text-ink-500 dark:text-ink-400">
                          {formatDate(
                            order.timeline.find((event) => event.status === status)?.at,
                          )}
                        </p>
                      )}
                    </div>
                    {index < ORDER_STATUS_FLOW.length - 1 && (
                      <span
                        className={cn(
                          'hidden h-0.5 flex-1 rounded-full sm:block',
                          index < currentStep
                            ? 'bg-brand-600'
                            : 'bg-ink-200 dark:bg-ink-800',
                        )}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Items */}
          <Card>
            <CardHeader
              title="Products"
              description={`${order.items.length} line item${order.items.length === 1 ? '' : 's'}`}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-2xs uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
                    <th scope="col" className="px-5 py-2.5 text-left font-semibold">Product</th>
                    <th scope="col" className="px-3 py-2.5 text-left font-semibold">SKU</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Price</th>
                    <th scope="col" className="px-3 py-2.5 text-center font-semibold">Qty</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <AppImage
                            src={item.image}
                            alt={item.name}
                            seed={item.productId}
                            wrapperClassName="h-11 w-11 shrink-0"
                          />
                          <div className="min-w-0">
                            <Link
                              to={`/admin/products/${item.productId}`}
                              className="block max-w-[16rem] truncate font-medium text-ink-900 hover:text-brand-600 dark:text-ink-100 dark:hover:text-brand-400"
                            >
                              {item.name}
                            </Link>
                            {item.variant && (
                              <p className="text-2xs text-ink-500 dark:text-ink-400">{item.variant}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-ink-600 dark:text-ink-400">
                        {item.sku}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-700 dark:text-ink-300">
                        {formatCurrency(item.price)}
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums text-ink-700 dark:text-ink-300">
                        {item.quantity}
                      </td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums text-ink-900 dark:text-ink-100">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-ink-200 px-5 py-4 dark:border-ink-800">
              <dl className="ml-auto max-w-xs space-y-1">
                <DetailRow label="Subtotal">{formatCurrency(order.subtotal)}</DetailRow>
                {order.discount > 0 && (
                  <DetailRow label={`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`}>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      −{formatCurrency(order.discount)}
                    </span>
                  </DetailRow>
                )}
                <DetailRow label="Tax (GST)">{formatCurrency(order.tax)}</DetailRow>
                <DetailRow label="Shipping">
                  {order.shipping === 0 ? 'Free' : formatCurrency(order.shipping)}
                </DetailRow>
                {/* Storefront orders paying cash on delivery carry the fee from
                    Settings → Shipping; older orders have none. */}
                {(order.codCharge ?? 0) > 0 && (
                  <DetailRow label="Cash on delivery fee">
                    {formatCurrency(order.codCharge ?? 0)}
                  </DetailRow>
                )}
                <div className="mt-1 border-t border-ink-200 pt-2 dark:border-ink-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink-900 dark:text-ink-100">Total</span>
                    <span className="text-base font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                      {formatCurrency(order.total)}
                    </span>
                  </div>
                </div>
              </dl>
            </div>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader title="Order timeline" description="Every status change and note." />
            <CardBody>
              <ol className="relative space-y-5 border-l border-ink-200 pl-6 dark:border-ink-800">
                {[...order.timeline].reverse().map((event) => {
                  const tone =
                    event.status === 'note' ? undefined : ORDER_STATUS[event.status as OrderStatus];
                  return (
                    <li key={event.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[1.9rem] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white dark:ring-ink-900',
                          tone?.dot ?? 'bg-ink-300 dark:bg-ink-600',
                        )}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink-900 dark:text-ink-100">
                          {event.label}
                        </p>
                        <span className="text-2xs text-ink-400">
                          {formatDate(event.at, true)}
                        </span>
                      </div>
                      {event.note && (
                        <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-400">{event.note}</p>
                      )}
                      <p className="mt-0.5 text-2xs text-ink-400">by {event.by}</p>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          {/* Customer */}
          <Card>
            <CardHeader
              title="Customer"
              action={
                <Button size="sm" variant="ghost" to={`/admin/customers/${order.customerId}`}>
                  View profile
                </Button>
              }
            />
            <CardBody className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={order.customerName} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                    {order.customerName}
                  </p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                    {order.customerEmail}
                  </p>
                </div>
              </div>
              <dl className="divide-y divide-ink-200 dark:divide-ink-800">
                <DetailRow label="Phone">{order.customerPhone}</DetailRow>
                <DetailRow label="Email">
                  <a
                    href={`mailto:${order.customerEmail}`}
                    className="text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {order.customerEmail}
                  </a>
                </DetailRow>
              </dl>
            </CardBody>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader title="Payment" />
            <CardBody>
              <dl className="divide-y divide-ink-200 dark:divide-ink-800">
                <DetailRow label="Method">
                  <span className="inline-flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-ink-400" />
                    {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                  </span>
                </DetailRow>
                <DetailRow label="Status">
                  <StatusBadge tone={PAYMENT_STATUS[order.paymentStatus]} />
                </DetailRow>
                <DetailRow label="Amount">{formatCurrency(order.total)}</DetailRow>
              </dl>
            </CardBody>
          </Card>

          {/* Email notification */}
          <Card>
            <CardHeader
              title="Order confirmation"
              description="What was emailed to the customer, and what became of it."
            />
            <CardBody>
              {confirmationEmail ? (
                <dl className="divide-y divide-ink-200 dark:divide-ink-800">
                  <DetailRow label="Status">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 font-medium',
                        confirmationEmail.status === 'sent' && 'text-emerald-600 dark:text-emerald-400',
                        confirmationEmail.status === 'failed' && 'text-rose-600 dark:text-rose-400',
                        confirmationEmail.status === 'skipped' && 'text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {confirmationEmail.status === 'sent' && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {confirmationEmail.status === 'failed' && <AlertCircle className="h-3.5 w-3.5" />}
                      {confirmationEmail.status === 'skipped' && <MailWarning className="h-3.5 w-3.5" />}
                      {EMAIL_STATUS_LABEL[confirmationEmail.status]}
                    </span>
                  </DetailRow>
                  <DetailRow label="Recipient">
                    <span className="break-all">{confirmationEmail.recipient || '—'}</span>
                  </DetailRow>
                  <DetailRow label="Sent at">
                    {confirmationEmail.sentAt ? formatDate(confirmationEmail.sentAt, true) : '—'}
                  </DetailRow>
                  {confirmationEmail.attempts > 1 && (
                    <DetailRow label="Attempts">{confirmationEmail.attempts}</DetailRow>
                  )}
                  {/*
                    Mailtrap's own words, not a paraphrase. "550 Sender address
                    rejected" is actionable; "email failed" is not.
                  */}
                  {confirmationEmail.error && (
                    <DetailRow label="Reason">
                      <span className="text-rose-600 dark:text-rose-400">{confirmationEmail.error}</span>
                    </DetailRow>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-ink-500">
                  No confirmation email has been recorded for this order yet.
                </p>
              )}

              {can('orders', 'edit') && (
                <Button
                  variant="secondary"
                  className="mt-4 w-full"
                  icon={<Mail className="h-4 w-4" />}
                  loading={resending}
                  onClick={handleResendEmail}
                >
                  {confirmationEmail?.status === 'sent'
                    ? 'Resend confirmation email'
                    : 'Send confirmation email'}
                </Button>
              )}
            </CardBody>
          </Card>

          {/* Shipping */}
          <Card>
            <CardHeader
              title="Shipping"
              action={
                can('orders', 'edit') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCourier(order.courier ?? '');
                      setTracking(order.trackingNumber ?? '');
                      setShippingModal(true);
                    }}
                  >
                    Edit
                  </Button>
                )
              }
            />
            <CardBody className="space-y-4">
              <AddressBlock title="Shipping address" address={order.shippingAddress} icon={MapPin} />
              <dl className="divide-y divide-ink-200 border-t border-ink-200 dark:divide-ink-800 dark:border-ink-800">
                <DetailRow label="Courier">
                  <span className="inline-flex items-center gap-1.5">
                    {order.courier && <Truck className="h-3.5 w-3.5 text-ink-400" />}
                    {order.courier ?? '—'}
                  </span>
                </DetailRow>
                <DetailRow label="Tracking">
                  <span className="font-mono text-xs">{order.trackingNumber ?? '—'}</span>
                </DetailRow>
              </dl>
            </CardBody>
          </Card>

          {/* Billing */}
          <Card>
            <CardHeader title="Billing address" />
            <CardBody>
              <AddressBlock title="Billed to" address={order.billingAddress} icon={User} />
            </CardBody>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader title="Customer note" />
              <CardBody>
                <p className="text-sm text-ink-600 dark:text-ink-400">{order.notes}</p>
              </CardBody>
            </Card>
          )}

          {can('orders', 'edit') && !isTerminal && order.status !== 'delivered' && (
            <Button
              variant="secondary"
              fullWidth
              icon={<XCircle className="h-4 w-4" />}
              onClick={() => setCancelOpen(true)}
            >
              Cancel this order
            </Button>
          )}
        </div>
      </div>

      {/* Status modal */}
      <FormModal
        open={statusModal}
        onClose={() => setStatusModal(false)}
        onSubmit={(event) => {
          event.preventDefault();
          changeStatus(nextStatus, statusNote.trim() || undefined);
        }}
        title="Update order status"
        description={`Order #${order.code}`}
        submitLabel="Update status"
        loading={updatingStatus}
      >
        <Field label="New status" required>
          <Select
            value={nextStatus}
            onChange={(event) => setNextStatus(event.target.value as OrderStatus)}
            options={(Object.keys(ORDER_STATUS) as OrderStatus[]).map((status) => ({
              value: status,
              label: ORDER_STATUS[status].label,
            }))}
          />
        </Field>
        <Field label="Note" hint="Added to the order timeline and visible to your team.">
          <Textarea
            rows={3}
            value={statusNote}
            onChange={(event) => setStatusNote(event.target.value)}
            placeholder="Handed to Delhivery for delivery."
          />
        </Field>
        {(nextStatus === 'cancelled' || nextStatus === 'returned') && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            Stock from this order will be returned to inventory automatically.
          </p>
        )}
      </FormModal>

      {/* Shipping modal */}
      <FormModal
        open={shippingModal}
        onClose={() => setShippingModal(false)}
        onSubmit={saveShipping}
        title="Shipping details"
        description={`Order #${order.code}`}
        submitLabel="Save details"
        loading={savingShipping}
      >
        <Field label="Courier">
          <Select
            value={courier}
            onChange={(event) => setCourier(event.target.value)}
            placeholder="Select a courier"
            options={[
              { value: 'Delhivery', label: 'Delhivery' },
              { value: 'Blue Dart', label: 'Blue Dart' },
              { value: 'DTDC', label: 'DTDC' },
              { value: 'Ekart', label: 'Ekart' },
              { value: 'Shiprocket', label: 'Shiprocket' },
            ]}
          />
        </Field>
        <Field label="Tracking number">
          <Input
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
            placeholder="DL123456789"
            className="font-mono"
          />
        </Field>
      </FormModal>

      {/* Note modal */}
      <FormModal
        open={noteModal}
        onClose={() => setNoteModal(false)}
        onSubmit={saveNote}
        title="Add an internal note"
        description={`Order #${order.code}`}
        submitLabel="Add note"
        loading={savingNote}
      >
        <Field label="Note" required>
          <Textarea
            rows={4}
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Customer called to confirm the delivery window."
          />
        </Field>
      </FormModal>

      <ConfirmModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => changeStatus('cancelled', 'Cancelled from the admin console.')}
        loading={updatingStatus}
        tone="danger"
        title={`Cancel order #${order.code}?`}
        description="Stock is returned to inventory and the customer is notified. Paid orders will need a refund."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
      />
    </div>
  );
}
