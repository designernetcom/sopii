import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Check, CreditCard, MapPin, Package, Truck } from 'lucide-react';
import { formatDate, formatPrice } from '../utils/format';
import { Image } from '../components/ui/Image';
import { EmptyState } from '../components/ui/EmptyState';
import { OrderSuccessSkeleton } from '../components/ui/PageSkeletons';
import { ProductCarousel } from '../components/ProductCarousel/ProductCarousel';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { usePageSeo } from '../components/SEO/SEOHead';

/**
 * Reads a delivery window like "4–6 days" and answers the far end of it, so a
 * receipt can promise a date rather than a range. Six days is the fallback for
 * a zone whose ETA is written as free text with no number in it.
 */
function etaDays(eta) {
  const match = String(eta ?? '').match(/(\d+)\s*\D*$/);
  return match ? Number(match[1]) : 6;
}

export default function OrderSuccess() {
  /* Personal and transactional — nothing here belongs in an index.
     Called as a hook so it runs before this component's early returns. */
  usePageSeo({ path: '/order-success', title: 'Order Confirmed', noindex: true });

  const { id } = useParams();
  const location = useLocation();
  const { getOrder, guestOrderEmail, lookupOrder, ordersStatus, isAuthenticated } = useAuth();
  const { getBestsellers } = useCatalog();
  const recommended = useMemo(() => getBestsellers(8), [getBestsellers]);

  /* Straight after checkout the order arrives in router state. On a reload it
     is fetched: from the account's history if signed in, otherwise from the
     handles this browser kept for its guest orders. */
  const known = location.state?.order || getOrder(id);

  const [fetched, setFetched] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const order = known || fetched;

  /*
   * One silent attempt first.
   *
   * A signed-in shopper is entitled to their own order and needs nothing else.
   * A guest is not — the API refuses an order to somebody who knows only its
   * code — but this browser kept the email alongside the code when the order
   * was placed, so a guest reloading their own receipt is served without being
   * asked to type it again. Anyone else falls through to the form below, which
   * is exactly the point of the guard.
   */
  useEffect(() => {
    if (order || ordersStatus === 'loading') return undefined;

    const remembered = isAuthenticated ? undefined : guestOrderEmail(id);
    if (!isAuthenticated && !remembered) return undefined;

    let live = true;
    lookupOrder(id, remembered).then((result) => {
      if (live && result.ok) setFetched(result.order);
    });
    return () => {
      live = false;
    };
  }, [id, order, ordersStatus, isAuthenticated, guestOrderEmail, lookupOrder]);

  const deliveryWindow = useMemo(() => {
    if (!order) return '';
    const base = new Date(order.placedAt);
    const eta = new Date(base.getTime() + etaDays(order.shippingEta) * 86400000);
    return formatDate(eta);
  }, [order]);

  const handleLookup = async (event) => {
    event.preventDefault();
    setLookingUp(true);
    setError('');

    const result = await lookupOrder(id, email.trim());
    setLookingUp(false);

    if (result.ok) setFetched(result.order);
    else setError(result.message);
  };

  if (!order && ordersStatus === 'loading') return <OrderSuccessSkeleton />;

  /* No order in hand, and nothing proves this browser is entitled to it — ask
     for the email it was placed with, which is what the API checks. */
  if (!order) {
    return (
      <div className="container-site py-12 lg:py-20">
        <div className="mx-auto max-w-md text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sand">
            <Package size={24} className="text-brand-soft" strokeWidth={1.5} aria-hidden="true" />
          </span>

          <h1 className="mt-6 font-display text-3xl">Find order #{id}</h1>
          <p className="mt-3 text-sm text-charcoal-muted">
            For your privacy, enter the email address this order was placed with.
          </p>

          <form onSubmit={handleLookup} noValidate className="mt-8 space-y-4 text-left">
            <div>
              <label htmlFor="lookup-email" className="field-label">
                Email address
              </label>
              <input
                id="lookup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                className="field"
                required
              />
            </div>

            {error ? (
              <p role="alert" className="text-[12px] text-danger">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={lookingUp} className="btn-primary w-full">
              {lookingUp ? 'Looking up…' : 'View Order'}
            </button>
          </form>

          <div className="mt-8">
            <EmptyState
              icon={Package}
              title="Not the order you meant?"
              text="Sign in to see every order on your account, or head back to the shop."
              action={{ label: 'Continue Shopping', to: '/shop' }}
              secondaryAction={{ label: 'My Orders', to: '/orders' }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="container-site py-12 lg:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mx-auto grid h-16 w-16 animate-scale-in place-items-center rounded-full bg-charcoal">
            <Check size={28} className="text-gold" strokeWidth={1.75} aria-hidden="true" />
          </span>

          <h1 className="mt-6 font-display text-3xl sm:text-4xl lg:text-[46px]">
            {order.cancelled ? `Order ${order.status}` : 'Order Confirmed'}
          </h1>

          <p className="mt-4 text-sm text-charcoal-muted sm:text-base">
            {order.paymentMethod === 'cod' ? (
              <>
                Your order has been placed successfully. You can pay when the order is delivered.
                A confirmation is on its way to{' '}
                <span className="text-charcoal">{order.email}</span>.
              </>
            ) : (
              <>
                Thank you for shopping with SOPII. Your payment was received and your order has
                been placed successfully — a confirmation is on its way to{' '}
                <span className="text-charcoal">{order.email}</span>.
              </>
            )}
          </p>

          <div className="mt-7 inline-flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border border-beige bg-cream px-7 py-4">
            <span>
              <span className="block text-[10px] uppercase tracking-widest2 text-charcoal-faint">
                Order Number
              </span>
              <span className="font-display text-lg">#{order.id}</span>
            </span>
            <span>
              <span className="block text-[10px] uppercase tracking-widest2 text-charcoal-faint">
                Placed On
              </span>
              <span className="font-display text-lg">{formatDate(order.placedAt)}</span>
            </span>
            <span>
              <span className="block text-[10px] uppercase tracking-widest2 text-charcoal-faint">
                {order.cancelled ? 'Status' : 'Arriving By'}
              </span>
              <span className="font-display text-lg">
                {order.cancelled ? order.status : deliveryWindow}
              </span>
            </span>
          </div>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/shop" className="btn-primary">
              Continue Shopping
            </Link>
            <Link to="/orders" className="btn-outline">
              View Order
            </Link>
          </div>
        </div>

        {/* Receipt */}
        <div className="mx-auto mt-14 max-w-3xl border border-beige bg-cream">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-beige px-6 py-4">
            <h2 className="text-[12px] font-medium uppercase tracking-widest2">Order Details</h2>
            <span className="border border-brand-soft/40 bg-sand/60 px-3 py-1 text-[10px] uppercase tracking-widest2 text-brand-soft">
              {order.status}
            </span>
          </div>

          <ul className="divide-y divide-beige px-6">
            {order.items.map((line) => (
              <li key={line.id} className="flex gap-4 py-5">
                <Link to={`/product/${line.productId}`} className="w-16 shrink-0 sm:w-20">
                  <Image src={line.image} alt={line.name} ratio="aspect-[4/5]" />
                </Link>

                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug">{line.name}</p>
                  <p className="mt-1 text-[11px] text-charcoal-muted">
                    {line.size}
                    {line.color ? ` · ${line.color}` : ''} · Qty {line.quantity}
                  </p>
                </div>

                <span className="shrink-0 text-[13px] font-medium">
                  {formatPrice(line.price * line.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="space-y-2.5 border-t border-beige px-6 py-5 text-[13px]">
            <Row label="Subtotal" value={formatPrice(order.totals.subtotal)} />
            {order.totals.discount > 0 ? (
              <Row
                label={`Discount${order.coupon ? ` (${order.coupon})` : ''}`}
                value={`-${formatPrice(order.totals.discount)}`}
                valueClass="text-brand-soft"
              />
            ) : null}
            <Row
              label="Shipping"
              value={order.totals.shipping === 0 ? 'Free' : formatPrice(order.totals.shipping)}
              valueClass={order.totals.shipping === 0 ? 'text-brand-soft' : undefined}
            />
            {order.totals.codCharge > 0 ? (
              <Row label="Cash on delivery fee" value={formatPrice(order.totals.codCharge)} />
            ) : null}
            {order.totals.tax > 0 ? <Row label="GST" value={formatPrice(order.totals.tax)} /> : null}
            <div className="flex items-baseline justify-between border-t border-charcoal pt-3">
              <dt className="text-[12px] font-medium uppercase tracking-widest2">Total</dt>
              <dd className="font-display text-xl">{formatPrice(order.totals.total)}</dd>
            </div>
          </dl>

          <div className="grid gap-6 border-t border-beige px-6 py-5 sm:grid-cols-3">
            <InfoBlock icon={MapPin} title="Delivering to">
              {order.address.fullName}
              <br />
              {order.address.line1}
              {order.address.line2 ? (
                <>
                  <br />
                  {order.address.line2}
                </>
              ) : null}
              <br />
              {order.address.city}, {order.address.state} {order.address.pincode}
              <br />
              {order.address.phone}
            </InfoBlock>

            <InfoBlock icon={Truck} title="Shipping">
              {order.shippingLabel}
              <br />
              {order.cancelled ? order.status : `Arriving by ${deliveryWindow}`}
              {order.trackingNumber ? (
                <>
                  <br />
                  {order.courier} · {order.trackingNumber}
                </>
              ) : null}
            </InfoBlock>

            <InfoBlock icon={CreditCard} title="Payment">
              {order.paymentLabel}
              <br />
              {order.paymentStatusLabel}
              {order.paymentMethod === 'cod' ? (
                <>
                  <br />
                  Pay {formatPrice(order.totals.total)} on delivery
                </>
              ) : null}
            </InfoBlock>
          </div>
        </div>

        {order.paymentStatus === 'paid' ? null : (
          <p className="mx-auto mt-6 max-w-3xl text-center text-[11px] text-charcoal-faint">
            {order.paymentMethod === 'cod'
              ? 'Please keep the exact amount ready — our delivery partner may not carry change.'
              : 'Your order is awaiting payment confirmation. We will email you as soon as it clears.'}
          </p>
        )}
      </div>

      <ProductCarousel
        eyebrow="Before You Go"
        title="You might also like"
        products={recommended}
        className="bg-sand/40"
      />
    </div>
  );
}

function Row({ label, value, valueClass = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-charcoal-muted">{label}</dt>
      <dd className={`font-medium ${valueClass}`}>{value}</dd>
    </div>
  );
}

function InfoBlock({ icon: Icon, title, children }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest2 text-charcoal-faint">
        <Icon size={13} className="text-brand-soft" aria-hidden="true" />
        {title}
      </h3>
      <p className="text-[12px] leading-relaxed text-charcoal-muted">{children}</p>
    </div>
  );
}
