import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Banknote,
  Building2,
  ChevronLeft,
  CreditCard,
  Lock,
  ShieldCheck,
  Smartphone,
  Truck,
  Wallet,
} from 'lucide-react';
import { cn } from '../utils/cn';
import { formatPrice } from '../utils/format';
import { localQuote, toOrderLines } from '../utils/pricing';
import { Image } from '../components/ui/Image';
import { Spinner } from '../components/ui/Spinner';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useSiteSettings } from '../context/CatalogContext';
import { ApiError, placeOrder as placeOrderApi, quoteCheckout } from '../services/api';
import { fetchPaymentMethods } from '../services/payments';
import { useRazorpayCheckout } from '../hooks/useRazorpayCheckout';
import { adaptOrder } from '../services/adapters';
import { usePageSeo } from '../components/SEO/SEOHead';

/** One icon per payment gateway key the panel can enable. */
const PAYMENT_ICONS = {
  razorpay: Wallet,
  stripe: CreditCard,
  card: CreditCard,
  upi: Smartphone,
  netbanking: Building2,
  cod: Banknote,
};

const EMPTY_ADDRESS = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
};

/** How long to let the address settle before re-pricing the order. */
const QUOTE_DEBOUNCE_MS = 400;

/**
 * A cart line's identity, matching how the bag itself keys its lines.
 *
 * The quote reports the lines it could not price by echoing back what was sent
 * — product, size and colour — because the server has never seen the bag's own
 * line ids. This is what pairs those back up with the items on screen.
 */
const lineKey = (line) =>
  [
    line.productId,
    (line.size ?? '').trim().toLowerCase(),
    (line.color ?? '').trim().toLowerCase(),
  ].join('::');

export default function Checkout() {
  /* Personal and transactional — nothing here belongs in an index.
     Called as a hook so it runs before this component's early returns. */
  usePageSeo({ path: '/checkout', title: 'Checkout', noindex: true });

  const settings = useSiteSettings();
  const { brand: BRAND } = settings;
  const navigate = useNavigate();
  const { items, totals, coupon, clearCart, removeItem } = useCart();
  const { user, isAuthenticated, placeOrder, addresses, saveAddress } = useAuth();

  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0];

  const [email, setEmail] = useState(user?.email || '');
  const [address, setAddress] = useState(() => ({ ...EMPTY_ADDRESS, ...(defaultAddress || {}) }));
  const [paymentMethod, setPaymentMethod] = useState('');
  const [saveThisAddress, setSaveThisAddress] = useState(!defaultAddress);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  /* Set the instant an order is placed. Without it, clearing the bag would
     redirect back to /cart before the navigation to the receipt lands. */
  const [placed, setPlaced] = useState(false);

  /** The store's own pricing of this bag; null until the first quote lands. */
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);

  /**
   * What the API says each method can do right now: whether it settles online,
   * whether its gateway is actually configured, and whether COD covers this
   * total. The bootstrap feed lists the gateways a store has switched on; this
   * is the finer answer, and the same rules are enforced when the order is
   * placed.
   */
  const [methodStates, setMethodStates] = useState(null);

  const paymentSectionRef = useRef(null);

  /*
   * Which gateways the store has switched on. The panel decides; the checkout
   * only draws them.
   *
   * Memoised because `settings.paymentMethods ?? []` allocates a *new* empty
   * array on every render when the setting is absent — and that array is a
   * dependency of the `methods` memo below. A fresh reference every render
   * makes the memo miss every time, which rebuilds the payment method list on
   * every keystroke in the address form and re-renders the whole payment
   * section with it. The memo was quietly doing nothing.
   */
  const paymentMethods = useMemo(() => settings.paymentMethods ?? [], [settings.paymentMethods]);

  /* --------------------------- the order summary --------------------------- */

  /* Shown immediately and whenever the API cannot be reached; replaced by the
     store's own answer as soon as it arrives. */
  const preview = useMemo(
    () =>
      localQuote({
        items,
        coupon,
        discount: totals.couponDiscount,
        settings,
        state: address.state,
        paymentMethod,
      }),
    [items, coupon, totals.couponDiscount, settings, address.state, paymentMethod],
  );

  const lines = useMemo(() => toOrderLines(items), [items]);
  const linesKey = JSON.stringify(lines);

  useEffect(() => {
    if (!lines.length) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setQuoting(true);
      quoteCheckout(
        {
          items: lines,
          couponCode: coupon?.code,
          state: address.state,
          paymentMethod,
        },
        { signal: controller.signal },
      )
        .then(setQuote)
        .catch((error) => {
          if (error?.name === 'AbortError') return;
          // The preview stays on screen; the order is priced server-side anyway.
          console.warn('[checkout] could not price the bag:', error?.message ?? error);
          setQuote(null);
        })
        .finally(() => setQuoting(false));
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `linesKey` stands in for `lines`, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey, coupon?.code, address.state, paymentMethod]);

  const summary = quote ?? preview;

  /* --------------------------- lines that have gone ------------------------- */

  /*
   * A bag outlives a catalogue. It lives in the shopper's browser, so a product
   * that is later unpublished, deleted, or served from a different database
   * leaves a line pointing at nothing — and the store cannot price it.
   *
   * The quote prices everything else and names those lines, which is the whole
   * point of knowing about them here: the summary can mark them, the shopper
   * can drop them in one click, and Pay Now stops promising something that
   * would fail on the server every single time.
   */
  const goneKeys = useMemo(
    () => new Set((quote?.unavailable ?? []).map(lineKey)),
    [quote],
  );
  const goneLines = useMemo(
    () => items.filter((line) => goneKeys.has(lineKey(line))),
    [items, goneKeys],
  );

  const removeUnavailable = () => {
    goneLines.forEach((line) => removeItem(line.id));
    setSubmitError('');
  };

  /* ------------------------- what each method can do ------------------------ */

  /*
   * Re-asked when the total changes, because COD eligibility depends on it. The
   * server owns the rule and the wording; asking rather than reimplementing is
   * what keeps the greyed-out reason and the refusal message identical.
   */
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchPaymentMethods(summary.total, { signal: controller.signal })
        .then((payload) => setMethodStates(payload.methods ?? []))
        .catch((error) => {
          if (error?.name === 'AbortError') return;
          // Leave the previous answer standing rather than blanking the section.
          console.warn('[checkout] could not load payment methods:', error?.message ?? error);
        });
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [summary.total]);

  /** The gateways to draw, each carrying whatever the API said about it. */
  const methods = useMemo(() => {
    const states = new Map((methodStates ?? []).map((entry) => [entry.key, entry]));

    return paymentMethods.map((method) => {
      const state = states.get(method.key);
      return {
        ...method,
        ...state,
        /* Optimistic until the API answers: a store that has switched a method
           on should not have it flicker in as disabled on every page load. */
        available: state ? state.available !== false : true,
        unavailableReason: state?.unavailableReason ?? null,
        kind: state?.kind ?? (method.key === 'cod' ? 'offline' : 'online'),
      };
    });
  }, [paymentMethods, methodStates]);

  const selected = methods.find((method) => method.key === paymentMethod) ?? null;
  const isOnline = selected?.kind === 'online';

  /* Prefer a method that can actually be used — a store whose Razorpay keys are
     missing should land on COD rather than on a button that cannot work. */
  useEffect(() => {
    if (!methods.length) return;
    const current = methods.find((method) => method.key === paymentMethod);
    if (current?.available) return;

    const next = methods.find((method) => method.available) ?? methods[0];
    if (next && next.key !== paymentMethod) setPaymentMethod(next.key);
  }, [methods, paymentMethod]);

  /* A saved address may arrive after the account finishes loading. */
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !defaultAddress) return;
    prefilled.current = true;
    setAddress((current) => (current.line1 ? current : { ...EMPTY_ADDRESS, ...defaultAddress }));
    setSaveThisAddress(false);
  }, [defaultAddress]);

  useEffect(() => {
    if (user?.email) setEmail((current) => current || user.email);
  }, [user]);

  /* ------------------------------ finishing up ----------------------------- */

  /**
   * The single ending for both flows.
   *
   * COD reaches it straight from `POST /orders`; an online payment reaches it
   * from the verification response. The cart is cleared *here* and nowhere
   * else, which is what §2's "payment failed → keep cart" reduces to in code:
   * every failure path simply never gets this far.
   */
  const completeOrder = useCallback(
    async (raw) => {
      const order = adaptOrder(raw);

      if (saveThisAddress && isAuthenticated) {
        // Best effort: a failure here must not cost the shopper their order.
        await saveAddress({ ...address, isDefault: addresses.length === 0 }).catch(() => {});
      }

      placeOrder(order);
      setPlaced(true);
      clearCart();
      navigate(`/order-success/${order.id}`, { replace: true, state: { order } });
    },
    [address, addresses.length, clearCart, isAuthenticated, navigate, placeOrder, saveAddress, saveThisAddress],
  );

  const payment = useRazorpayCheckout({ onPaid: completeOrder });

  /*
   * A refresh mid-payment. If the popup succeeded while the page was reloading,
   * the intent already became an order and the shopper goes to their receipt
   * instead of being invited to pay for it a second time.
   */
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;

    payment.resume().then((result) => {
      if (result?.resumed === 'paid' && result.orderCode) {
        setPlaced(true);
        clearCart();
        navigate(`/order-success/${result.orderCode}`, { replace: true });
      }
    });
    // Runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nothing to check out — bounce to the bag.
  if (items.length === 0 && !placed) return <Navigate to="/cart" replace />;

  const setField = (key, value) => {
    setAddress((a) => ({ ...a, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) next.email = 'Enter a valid email address.';
    if (!address.fullName.trim()) next.fullName = 'Required.';
    if (!/^[6-9]\d{9}$/.test(address.phone.replace(/\s/g, ''))) {
      next.phone = 'Enter a valid 10-digit mobile number.';
    }
    if (!address.line1.trim()) next.line1 = 'Required.';
    if (!address.city.trim()) next.city = 'Required.';
    if (!address.state.trim()) next.state = 'Required.';
    if (!/^\d{6}$/.test(address.pincode)) next.pincode = 'Enter a 6-digit PIN code.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const orderPayload = () => ({
    email,
    address,
    items: lines,
    couponCode: coupon?.code,
    paymentMethod,
  });

  /**
   * Cash on delivery: no gateway, no popup, one call.
   *
   * The order is created outright with `paymentStatus: pending` and
   * `status: confirmed` — there is nothing to collect until the parcel arrives,
   * so waiting on a payment that will not happen for a week would leave every
   * cash order sitting unconfirmed.
   */
  const placeCodOrder = async () => {
    setSubmitting(true);
    try {
      /* The API prices the bag again from the catalogue and writes the order —
         what is charged is never what the browser worked out. */
      const { order } = await placeOrderApi(orderPayload());
      await completeOrder(order);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'We could not reach the store to place your order. Please try again.',
      );
      setSubmitting(false);
    }
  };

  /**
   * Razorpay, and UPI through it.
   *
   * Nothing is written until the server has verified the signature *and* asked
   * Razorpay what the payment actually did. A cancellation, a failure or a dead
   * network all end with the bag exactly as it was.
   */
  const startOnlinePayment = async () => {
    setSubmitError('');
    await payment.pay(orderPayload());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    /* §5: the button is disabled too, but a keyboard submit can outrun a
       render, so the guard is here as well as in the markup. */
    if (submitting || payment.busy) return;

    /* The server prices the bag again on both paths and would refuse it, so
       stop here and say what has to happen rather than spending a failure. */
    if (goneLines.length) {
      setSubmitError(
        goneLines.length === 1
          ? `${goneLines[0].name} is no longer available. Remove it from your bag to continue.`
          : 'Some pieces in your bag are no longer available. Remove them to continue.',
      );
      return;
    }

    if (!validate()) {
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    if (selected && !selected.available) {
      setSubmitError(selected.unavailableReason || 'That payment method is not available.');
      paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (isOnline) await startOnlinePayment();
    else await placeCodOrder();
  };

  /** §6's "Change Payment Method": clear the attempt and go back to the list. */
  const changeMethod = () => {
    payment.reset();
    setSubmitError('');
    paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const paymentBlocked = payment.status === 'failed' || payment.status === 'cancelled';
  const working = submitting || payment.busy;

  return (
    <div className="container-site py-6 lg:py-10">
      <Link
        to="/cart"
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest2 text-charcoal-muted transition-colors hover:text-charcoal"
      >
        <ChevronLeft size={14} aria-hidden="true" /> Back to bag
      </Link>

      <h1 className="mt-4 font-display text-3xl sm:text-4xl">Checkout</h1>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="grid gap-10 py-8 lg:grid-cols-[1fr_380px] lg:gap-14 xl:grid-cols-[1fr_420px]"
      >
        <div className="min-w-0 space-y-10">
          {/* --------------------------- Contact ---------------------------- */}
          <Section number="01" title="Contact Information">
            {!isAuthenticated ? (
              <p className="mb-4 text-[12px] text-charcoal-muted">
                Already have an account?{' '}
                <Link to="/login" className="text-clay underline underline-offset-4">
                  Log in
                </Link>{' '}
                for a faster checkout.
              </p>
            ) : null}

            <Field
              id="email"
              label="Email address"
              type="email"
              value={email}
              onChange={(v) => {
                setEmail(v);
                setErrors((e) => ({ ...e, email: undefined }));
              }}
              error={errors.email}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </Section>

          {/* --------------------------- Address ---------------------------- */}
          <Section number="02" title="Delivery Address">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="fullName"
                label="Full name"
                value={address.fullName}
                onChange={(v) => setField('fullName', v)}
                error={errors.fullName}
                autoComplete="name"
                className="sm:col-span-2"
              />
              <Field
                id="phone"
                label="Mobile number"
                type="tel"
                value={address.phone}
                onChange={(v) => setField('phone', v)}
                error={errors.phone}
                autoComplete="tel"
                placeholder="9876543210"
                className="sm:col-span-2"
              />
              <Field
                id="line1"
                label="Address line 1"
                value={address.line1}
                onChange={(v) => setField('line1', v)}
                error={errors.line1}
                autoComplete="address-line1"
                placeholder="Flat, house no., building"
                className="sm:col-span-2"
              />
              <Field
                id="line2"
                label="Address line 2 (optional)"
                value={address.line2}
                onChange={(v) => setField('line2', v)}
                autoComplete="address-line2"
                placeholder="Area, street, landmark"
                className="sm:col-span-2"
              />
              <Field
                id="city"
                label="City"
                value={address.city}
                onChange={(v) => setField('city', v)}
                error={errors.city}
                autoComplete="address-level2"
              />
              <Field
                id="state"
                label="State"
                value={address.state}
                onChange={(v) => setField('state', v)}
                error={errors.state}
                autoComplete="address-level1"
              />
              <Field
                id="pincode"
                label="PIN code"
                inputMode="numeric"
                value={address.pincode}
                onChange={(v) => setField('pincode', v.replace(/\D/g, '').slice(0, 6))}
                error={errors.pincode}
                autoComplete="postal-code"
              />
            </div>

            {isAuthenticated ? (
              <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[12px] text-charcoal-muted">
                <input
                  type="checkbox"
                  checked={saveThisAddress}
                  onChange={(e) => setSaveThisAddress(e.target.checked)}
                  className="h-3.5 w-3.5 accent-charcoal"
                />
                Save this address to my account
              </label>
            ) : null}
          </Section>

          {/* -------------------------- Shipping ---------------------------- */}
          <Section number="03" title="Delivery">
            {/* The rate comes from the store's shipping zones, so it follows the
                delivery state as it is typed. */}
            <div className="flex items-center gap-4 border border-charcoal bg-sand/50 p-4">
              <Truck size={18} className="shrink-0 text-clay" strokeWidth={1.4} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{summary.shippingLabel}</span>
                <span className="block text-[11px] text-charcoal-muted">
                  {summary.shippingEta ? `Arriving in ${summary.shippingEta}` : 'Dispatched shortly'}
                  {summary.freeShipping && summary.shipping === 0
                    ? ' · Free on this order'
                    : ''}
                </span>
              </span>
              <span className="shrink-0 text-[12px] font-medium">
                {summary.shipping === 0 ? 'Free' : formatPrice(summary.shipping)}
              </span>
            </div>

            {!address.state ? (
              <p className="mt-3 text-[11px] text-charcoal-faint">
                Enter your state above for the exact delivery charge and timeline.
              </p>
            ) : null}
          </Section>

          {/* --------------------------- Payment ---------------------------- */}
          <div ref={paymentSectionRef}>
            <Section number="04" title="Payment Method">
              {methods.length === 0 ? (
                <p className="border border-dashed border-beige px-5 py-8 text-center text-[12px] text-charcoal-muted">
                  No payment method is available on this store right now. Please try again later.
                </p>
              ) : (
                <ul className="space-y-3">
                  {methods.map((method) => (
                    <li key={method.key}>
                      <OptionCard
                        name="payment"
                        checked={paymentMethod === method.key}
                        onChange={() => {
                          setPaymentMethod(method.key);
                          /* Switching method is how somebody recovers from a
                             failed payment — clear the wreckage of the last
                             attempt so the form is usable again. */
                          if (paymentBlocked) payment.reset();
                          setSubmitError('');
                        }}
                        disabled={!method.available || working}
                        icon={PAYMENT_ICONS[method.key] ?? CreditCard}
                        title={method.name}
                        text={method.unavailableReason || method.description}
                        aside={
                          method.key === 'cod' && summary.codCharge > 0
                            ? `+${formatPrice(summary.codCharge)}`
                            : method.testMode
                              ? 'Test mode'
                              : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-4 flex items-start gap-2 text-[11px] text-charcoal-faint">
                {isOnline ? (
                  <>
                    <ShieldCheck size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    You will be taken to a secure payment window to complete the payment. Your card
                    or UPI details are handled by the payment gateway and never reach SOPII. Your
                    order is placed only once the payment is confirmed.
                  </>
                ) : (
                  <>
                    <Lock size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    Pay the delivery partner in cash when your order arrives. Nothing is charged
                    now.
                  </>
                )}
              </p>
            </Section>
          </div>
        </div>

        {/* ---------------------------- Summary ----------------------------- */}
        <aside aria-label="Order summary" className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <div className="border border-beige bg-cream p-6">
            <h2 className="text-[12px] font-medium uppercase tracking-widest2">Order Summary</h2>

            <ul className="mt-5 max-h-72 space-y-4 overflow-y-auto pr-1">
              {items.map((line) => {
                const gone = goneKeys.has(lineKey(line));

                return (
                  <li key={line.id} className={cn('flex gap-3', gone && 'opacity-50')}>
                    <div className="relative w-14 shrink-0">
                      <Image src={line.image} alt={line.name} ratio="aspect-[4/5]" />
                      <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-charcoal px-1 text-[10px] text-cream">
                        {line.quantity}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-[12px]', gone && 'line-through')}>
                        {line.name}
                      </p>
                      <p className="text-[11px] text-charcoal-muted">
                        {line.size}
                        {line.color ? ` · ${line.color}` : ''}
                      </p>
                      {gone ? (
                        <p className="mt-0.5 text-[11px] text-sale">No longer available</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[12px] font-medium">
                      {gone ? '—' : formatPrice(line.price * line.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* The totals below cover the rest of the bag, so the shopper is
                told what is missing from them and given the one action that
                fixes it. Without this the summary quietly disagrees with the
                items above it and Pay Now fails on every attempt. */}
            {goneLines.length ? (
              <div role="alert" className="mt-5 border border-sale/40 bg-sale/5 p-4">
                <p className="flex items-start gap-2 text-[12px] leading-relaxed text-sale">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    {goneLines.length === 1
                      ? `${goneLines[0].name} is no longer available and is not included in the total below.`
                      : `${goneLines.length} pieces in your bag are no longer available and are not included in the total below.`}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={removeUnavailable}
                  disabled={working}
                  className="btn-outline mt-3 w-full py-2.5 text-[11px]"
                >
                  {goneLines.length === 1 ? 'Remove it and continue' : 'Remove them and continue'}
                </button>
              </div>
            ) : null}

            <dl className="mt-5 space-y-2.5 border-t border-beige pt-5 text-[13px]">
              <SummaryRow label="Subtotal" value={formatPrice(summary.subtotal)} />
              {summary.discount > 0 ? (
                <SummaryRow
                  label={`Discount${summary.couponCode ? ` (${summary.couponCode})` : ''}`}
                  value={`-${formatPrice(summary.discount)}`}
                  valueClass="text-clay"
                />
              ) : null}
              <SummaryRow
                label="Shipping"
                value={summary.shipping === 0 ? 'Free' : formatPrice(summary.shipping)}
                valueClass={summary.shipping === 0 ? 'text-clay' : undefined}
              />
              {summary.codCharge > 0 ? (
                <SummaryRow
                  label="Cash on delivery fee"
                  value={formatPrice(summary.codCharge)}
                />
              ) : null}
              {summary.tax > 0 ? (
                <SummaryRow label="GST" value={formatPrice(summary.tax)} />
              ) : null}
            </dl>

            <div className="mt-5 flex items-baseline justify-between border-t border-charcoal pt-4">
              <span className="text-[12px] font-medium uppercase tracking-widest2">Total</span>
              <span className="font-display text-2xl">{formatPrice(summary.total)}</span>
            </div>

            {summary.estimated && !quoting ? (
              <p className="mt-2 text-right text-[10px] text-charcoal-faint">
                Estimated — confirmed when you place the order.
              </p>
            ) : null}

            {submitError ? (
              <p role="alert" className="mt-4 border border-sale/40 bg-sale/5 p-3 text-[12px] text-sale">
                {submitError}
              </p>
            ) : null}

            {/* §6. A failed or cancelled payment says so plainly, insists the
                order was not placed, and offers the two ways forward. */}
            {paymentBlocked ? (
              <div role="alert" className="mt-4 border border-sale/40 bg-sale/5 p-4">
                <p className="flex items-start gap-2 text-[12px] leading-relaxed text-sale">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{payment.error}</span>
                </p>
                <p className="mt-2 text-[11px] text-charcoal-muted">
                  Your bag has been kept exactly as it was.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => payment.retry()}
                    disabled={working}
                    className="btn-primary flex-1 py-2.5 text-[11px]"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={changeMethod}
                    disabled={working}
                    className="btn-outline flex-1 py-2.5 text-[11px]"
                  >
                    Change Payment Method
                  </button>
                </div>
              </div>
            ) : null}

            {!paymentBlocked ? (
              <button
                type="submit"
                /* §5: one click only, until the flow finishes or fails — and
                   never while the bag holds a line the store cannot price. */
                disabled={
                  working ||
                  methods.length === 0 ||
                  !selected?.available ||
                  goneLines.length > 0
                }
                className="btn-primary mt-6 w-full"
              >
                {working ? (
                  <>
                    <Spinner size={14} /> {payLabel(payment.status, isOnline)}
                  </>
                ) : isOnline ? (
                  <>
                    <ShieldCheck size={13} aria-hidden="true" /> Pay Now ·{' '}
                    {formatPrice(summary.total)}
                  </>
                ) : (
                  <>
                    <Lock size={13} aria-hidden="true" /> Place Order
                  </>
                )}
              </button>
            ) : null}

            <p className="mt-3 text-center text-[11px] text-charcoal-faint">
              Need help? Write to {BRAND.email}
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

/**
 * What the button says while it is working.
 *
 * Naming each step is worth the four lines: a shopper watching "Opening payment
 * window" knows a popup is about to appear, and one watching "Confirming
 * payment" knows not to close the tab.
 */
function payLabel(status, isOnline) {
  switch (status) {
    case 'creating':
      return 'Processing…';
    case 'loading':
      return 'Opening payment window';
    case 'open':
      return 'Waiting for payment';
    case 'verifying':
      return 'Confirming payment';
    default:
      return isOnline ? 'Processing…' : 'Placing Order';
  }
}

/* ------------------------------ Sub-components ---------------------------- */

function Section({ number, title, children }) {
  return (
    <section aria-labelledby={`section-${number}`}>
      <h2 id={`section-${number}`} className="mb-5 flex items-baseline gap-3">
        <span className="font-display text-lg text-gold">{number}</span>
        <span className="text-[12px] font-medium uppercase tracking-widest2">{title}</span>
      </h2>
      {children}
    </section>
  );
}

function Field({ id, label, value, onChange, error, className, type = 'text', ...rest }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn('field', error && 'border-sale')}
        {...rest}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[11px] text-sale">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function OptionCard({ name, checked, onChange, icon: Icon, title, text, aside, disabled }) {
  return (
    <label
      className={cn(
        'flex items-center gap-4 border p-4 transition-colors duration-200',
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold',
        disabled
          ? 'cursor-not-allowed border-beige opacity-55'
          : cn(
              'cursor-pointer',
              checked ? 'border-charcoal bg-sand/50' : 'border-beige hover:border-charcoal/40',
            ),
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />

      <span
        className={cn(
          'grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors',
          checked ? 'border-charcoal' : 'border-charcoal-faint',
        )}
        aria-hidden="true"
      >
        {checked ? <span className="h-2 w-2 rounded-full bg-charcoal" /> : null}
      </span>

      <Icon size={18} className="shrink-0 text-clay" strokeWidth={1.4} aria-hidden="true" />

      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block text-[11px] text-charcoal-muted">{text}</span>
      </span>

      {aside ? <span className="shrink-0 text-[12px] font-medium">{aside}</span> : null}
    </label>
  );
}

function SummaryRow({ label, value, valueClass = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-charcoal-muted">{label}</dt>
      <dd className={`font-medium ${valueClass}`}>{value}</dd>
    </div>
  );
}
