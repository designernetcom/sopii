import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Package, RotateCw, Search } from 'lucide-react';
import { formatDate, formatPrice } from '../utils/format';
import { Image } from '../components/ui/Image';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { OrderListSkeleton } from '../components/ui/PageSkeletons';
import { useAuth, useOrders } from '../context/AuthContext';
import { ORDER_STAGES } from '../services/adapters';
import { usePageSeo } from '../components/SEO/SEOHead';

export default function Orders() {
  /* Personal and transactional — nothing here belongs in an index.
     Called as a hook so it runs before this component's early returns. */
  usePageSeo({ path: '/orders', title: 'My Orders', noindex: true });

  /* Fetches on mount — orders are no longer loaded on every page of the shop. */
  const { orders, ordersStatus, refreshOrders } = useOrders();
  const { lookupOrder, isAuthenticated } = useAuth();
  const [query, setQuery] = useState('');

  /* Guest lookup — an order code alone is not proof, so the API also wants the
     email it was placed with. */
  const [lookup, setLookup] = useState({ code: '', email: '' });
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const filtered = query.trim()
    ? orders.filter((order) => order.id.toLowerCase().includes(query.trim().toLowerCase()))
    : orders;

  const handleLookup = async (event) => {
    event.preventDefault();
    setLooking(true);
    setLookupError('');

    const result = await lookupOrder(lookup.code.trim().toUpperCase(), lookup.email.trim());
    setLooking(false);

    if (result.ok) setLookup({ code: '', email: '' });
    else setLookupError(result.message);
  };

  return (
    <div className="container-site py-6 lg:py-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'My Orders' }]} />

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-beige pb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">My Orders</h1>
          <p className="mt-3 max-w-xl text-sm text-charcoal-muted">
            {isAuthenticated
              ? 'Every order on your account, with its live status.'
              : 'Orders placed in this browser, plus any you look up below.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => refreshOrders()}
          disabled={ordersStatus === 'loading'}
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest2 text-charcoal-muted transition-colors hover:text-charcoal disabled:opacity-50"
        >
          <RotateCw size={13} aria-hidden="true" /> Refresh
        </button>
      </header>

      {/* Look an order up by its number. Signed in, this searches the list; as a
          guest it fetches the order from the store. */}
      <div className="py-6">
        {isAuthenticated ? (
          <div className="max-w-md">
            <label htmlFor="track" className="field-label">
              Track an order
            </label>
            <div className="relative">
              <Search
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-charcoal-faint"
              />
              <input
                id="track"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter order number, e.g. SOP10245"
                className="field pl-10"
              />
            </div>
          </div>
        ) : (
          <form onSubmit={handleLookup} noValidate className="max-w-2xl">
            <p className="field-label">Look up an order</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input
                type="text"
                value={lookup.code}
                onChange={(e) => setLookup({ ...lookup, code: e.target.value })}
                placeholder="Order number, e.g. SOP10245"
                aria-label="Order number"
                className="field"
                required
              />
              <input
                type="email"
                value={lookup.email}
                onChange={(e) => setLookup({ ...lookup, email: e.target.value })}
                placeholder="Email on the order"
                aria-label="Email address on the order"
                autoComplete="email"
                className="field"
                required
              />
              <button type="submit" disabled={looking} className="btn-outline sm:px-6">
                {looking ? <Spinner size={13} /> : 'Find'}
              </button>
            </div>

            {lookupError ? (
              <p role="alert" className="mt-2 text-[12px] text-sale">
                {lookupError}
              </p>
            ) : null}

            <p className="mt-2 text-[11px] text-charcoal-faint">
              <Link to="/login" className="text-clay underline underline-offset-4">
                Log in
              </Link>{' '}
              to see every order on your account.
            </p>
          </form>
        )}
      </div>

      {ordersStatus === 'loading' && orders.length === 0 ? (
        <OrderListSkeleton className="py-8" />
      ) : null}

      {ordersStatus === 'error' && orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="We could not load your orders"
          text="The store did not answer. Check your connection and try again."
          action={{ label: 'Try Again', onClick: () => refreshOrders() }}
        />
      ) : null}

      {ordersStatus !== 'loading' && ordersStatus !== 'error' && orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          text={
            isAuthenticated
              ? 'When you place an order it will show up here, with tracking.'
              : 'Log in, or place an order — either way it will appear here.'
          }
          action={{ label: 'Start Shopping', to: '/shop' }}
          secondaryAction={isAuthenticated ? undefined : { label: 'Log In', to: '/login' }}
        />
      ) : null}

      {orders.length > 0 && filtered.length === 0 ? (
        <p className="border border-dashed border-beige px-6 py-12 text-center text-sm text-charcoal-muted">
          No order matches “{query}”.
        </p>
      ) : null}

      {filtered.length > 0 ? (
        <ul className="space-y-6 pb-8">
          {filtered.map((order) => (
            <li key={order.id} className="border border-beige bg-cream">
              {/* Header */}
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-beige px-5 py-4 sm:px-6">
                <div>
                  <p className="font-display text-xl">#{order.id}</p>
                  <p className="mt-0.5 text-[11px] text-charcoal-muted">
                    Placed {formatDate(order.placedAt)} ·{' '}
                    {order.items.reduce((sum, line) => sum + line.quantity, 0)} items ·{' '}
                    {formatPrice(order.totals.total)}
                  </p>
                </div>
                <Link
                  to={`/order-success/${order.id}`}
                  className="text-[11px] font-medium uppercase tracking-widest2 text-clay link-underline"
                >
                  View receipt
                </Link>
              </div>

              {/* Where it has got to. Cancelled and returned orders leave the
                  fulfilment track, so they get a plain statement instead. */}
              {order.cancelled ? (
                <p className="border-b border-beige px-5 py-5 text-[12px] text-charcoal-muted sm:px-6">
                  This order was {order.status.toLowerCase()}.{' '}
                  {order.paymentStatus === 'refunded' ? 'Your refund has been processed.' : ''}
                </p>
              ) : (
                <ol className="flex gap-1 overflow-x-auto border-b border-beige px-5 py-5 hide-scrollbar sm:px-6">
                  {ORDER_STAGES.map((step, i) => {
                    const done = i <= order.stage;
                    return (
                      <li key={step} className="flex min-w-[92px] flex-1 flex-col items-center gap-2">
                        <div className="flex w-full items-center">
                          <span
                            className={`h-px flex-1 ${i === 0 ? 'bg-transparent' : done ? 'bg-clay' : 'bg-beige'}`}
                          />
                          {done ? (
                            <CheckCircle2 size={16} className="shrink-0 text-clay" aria-hidden="true" />
                          ) : (
                            <Circle size={16} className="shrink-0 text-beige" aria-hidden="true" />
                          )}
                          <span
                            className={`h-px flex-1 ${
                              i === ORDER_STAGES.length - 1
                                ? 'bg-transparent'
                                : i < order.stage
                                  ? 'bg-clay'
                                  : 'bg-beige'
                            }`}
                          />
                        </div>
                        <span
                          className={`text-center text-[10px] uppercase tracking-widest2 ${
                            done ? 'text-charcoal' : 'text-charcoal-faint'
                          }`}
                        >
                          {step}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {order.stage < 0 && !order.cancelled ? (
                <p className="border-b border-beige px-5 py-3 text-[11px] text-charcoal-muted sm:px-6">
                  {order.paymentStatusLabel} — we will start packing as soon as it clears.
                </p>
              ) : null}

              {/* Items */}
              <ul className="divide-y divide-beige px-5 sm:px-6">
                {order.items.map((line) => (
                  <li key={line.id} className="flex gap-4 py-4">
                    <Link to={`/product/${line.productId}`} className="w-14 shrink-0">
                      <Image src={line.image} alt={line.name} ratio="aspect-[4/5]" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug">
                        <Link
                          to={`/product/${line.productId}`}
                          className="transition-colors hover:text-clay"
                        >
                          {line.name}
                        </Link>
                      </p>
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
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
