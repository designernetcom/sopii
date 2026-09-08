import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import { formatPrice } from '../utils/format';
import { Image } from '../components/ui/Image';
import { Price } from '../components/ui/Price';
import { QuantityStepper } from '../components/ui/QuantityStepper';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { TrustSection } from '../components/TrustSection/TrustSection';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useCatalog } from '../context/CatalogContext';
import { usePageSeo } from '../components/SEO/SEOHead';

export default function Cart() {
  /* Personal and transactional — nothing here belongs in an index.
     Called as a hook so it runs before this component's early returns. */
  usePageSeo({ path: '/cart', title: 'Your Bag', noindex: true });

  const { items, itemCount, totals, coupon, updateQuantity, removeItem, applyCoupon, removeCoupon } =
    useCart();
  const { saveForLater } = useWishlist();
  const { getProductById, coupons } = useCatalog();

  const [code, setCode] = useState('');
  const [couponMessage, setCouponMessage] = useState(null);
  const [applying, setApplying] = useState(false);

  const handleApply = async (e) => {
    e.preventDefault();
    setApplying(true);
    setCouponMessage(null);

    const result = await applyCoupon(code);
    setApplying(false);
    setCouponMessage(result);
    if (result.ok) setCode('');
  };

  if (items.length === 0) {
    return (
      <div className="container-site py-6">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Shopping Bag' }]} />
        <EmptyState
          icon={ShoppingBag}
          title="Your bag is empty"
          text="Once you add something you love, it will show up here."
          action={{ label: 'Explore Collection', to: '/shop' }}
          secondaryAction={{ label: 'View Wishlist', to: '/wishlist' }}
        />
      </div>
    );
  }

  return (
    <div className="container-site py-6 lg:py-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Shopping Bag' }]} />

      <header className="mt-5 flex flex-wrap items-baseline justify-between gap-3 border-b border-beige pb-6">
        <h1 className="font-display text-3xl sm:text-4xl">Shopping Bag</h1>
        <p className="text-[12px] uppercase tracking-widest2 text-charcoal-muted">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </p>
      </header>

      <div className="grid gap-10 py-8 lg:grid-cols-[1fr_360px] lg:gap-14 xl:grid-cols-[1fr_400px]">
        {/* ------------------------------- Lines ---------------------------- */}
        <section aria-label="Bag items" className="min-w-0">
          {/* Column headers, desktop only */}
          <div className="hidden grid-cols-[1fr_140px_120px] gap-4 border-b border-beige pb-3 text-[10px] uppercase tracking-widest2 text-charcoal-muted sm:grid">
            <span>Item</span>
            <span className="text-center">Quantity</span>
            <span className="text-right">Price</span>
          </div>

          <ul className="divide-y divide-beige">
            {items.map((line) => {
              const product = getProductById(line.productId);
              return (
                <li
                  key={line.id}
                  className="grid grid-cols-[88px_1fr] gap-4 py-6 sm:grid-cols-[1fr_140px_120px] sm:items-start"
                >
                  {/* Image + meta */}
                  <div className="contents sm:flex sm:gap-5">
                    <Link to={`/product/${line.productId}`} className="w-[88px] shrink-0 sm:w-24">
                      <Image src={line.image} alt={line.name} ratio="aspect-[4/5]" />
                    </Link>

                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest2 text-charcoal-faint">
                        {line.category}
                      </p>
                      <h2 className="mt-1 text-sm leading-snug">
                        <Link
                          to={`/product/${line.productId}`}
                          className="transition-colors hover:text-clay"
                        >
                          {line.name}
                        </Link>
                      </h2>

                      <p className="mt-1.5 text-[12px] text-charcoal-muted">
                        Size {line.size}
                        {line.color ? ` · ${line.color}` : ''}
                      </p>

                      <Price
                        price={line.price}
                        originalPrice={line.originalPrice}
                        discount={Math.round(
                          ((line.originalPrice - line.price) / line.originalPrice) * 100,
                        )}
                        size="sm"
                        className="mt-2 sm:hidden"
                      />

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <button
                          type="button"
                          onClick={() => saveForLater(line, product)}
                          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest2 text-charcoal-muted transition-colors hover:text-charcoal"
                        >
                          <Heart size={12} aria-hidden="true" /> Save for later
                        </button>

                        <button
                          type="button"
                          onClick={() => removeItem(line.id)}
                          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest2 text-charcoal-muted transition-colors hover:text-sale"
                        >
                          <Trash2 size={12} aria-hidden="true" /> Remove
                        </button>
                      </div>

                      <div className="mt-4 sm:hidden">
                        <QuantityStepper
                          value={line.quantity}
                          onChange={(q) => updateQuantity(line.id, q)}
                          size="sm"
                          label={`Quantity for ${line.name}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quantity — desktop column */}
                  <div className="hidden justify-center sm:flex">
                    <QuantityStepper
                      value={line.quantity}
                      onChange={(q) => updateQuantity(line.id, q)}
                      size="sm"
                      label={`Quantity for ${line.name}`}
                    />
                  </div>

                  {/* Price — desktop column */}
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-medium">{formatPrice(line.price * line.quantity)}</p>
                    {line.originalPrice > line.price ? (
                      <p className="mt-0.5 text-[11px] text-charcoal-faint line-through">
                        {formatPrice(line.originalPrice * line.quantity)}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <Link
            to="/shop"
            className="mt-6 inline-block text-[11px] font-medium uppercase tracking-widest2 text-clay link-underline"
          >
            Continue shopping
          </Link>
        </section>

        {/* ------------------------------ Summary --------------------------- */}
        <aside aria-label="Order summary" className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <div className="border border-beige bg-cream p-6">
            <h2 className="text-[12px] font-medium uppercase tracking-widest2">Order Summary</h2>

            {/* Coupon */}
            <form onSubmit={handleApply} className="mt-5">
              <label htmlFor="coupon" className="field-label">
                Coupon
              </label>

              {coupon ? (
                <div className="flex items-center justify-between gap-3 border border-clay/40 bg-sand/60 px-3.5 py-3">
                  <span className="flex min-w-0 items-center gap-2 text-[12px]">
                    <Tag size={13} className="shrink-0 text-clay" aria-hidden="true" />
                    <span className="truncate">
                      <strong className="font-medium">{coupon.code}</strong> applied
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      removeCoupon();
                      setCouponMessage(null);
                    }}
                    aria-label={`Remove coupon ${coupon.code}`}
                    className="shrink-0 text-charcoal-muted hover:text-sale"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    id="coupon"
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setCouponMessage(null);
                    }}
                    placeholder="Enter code"
                    className="field flex-1 uppercase"
                  />
                  <button type="submit" disabled={applying} className="btn-outline px-5">
                    {applying ? <Spinner size={13} /> : 'Apply'}
                  </button>
                </div>
              )}

              {couponMessage ? (
                <p
                  role="status"
                  className={`mt-2 text-[11px] ${couponMessage.ok ? 'text-clay' : 'text-sale'}`}
                >
                  {couponMessage.message}
                </p>
              ) : null}

              {!coupon ? (
                <ul className="mt-3 space-y-1">
                  {coupons.map((c) => (
                    <li key={c.code}>
                      <button
                        type="button"
                        onClick={() => setCode(c.code)}
                        className="text-left text-[11px] text-charcoal-faint transition-colors hover:text-charcoal"
                      >
                        <span className="font-medium text-clay">{c.code}</span> — {c.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </form>

            {/* Figures */}
            <dl className="mt-6 space-y-2.5 border-t border-beige pt-5 text-[13px]">
              <Row label="Subtotal" value={formatPrice(totals.subtotal)} />

              {totals.savings > 0 ? (
                <Row
                  label="Savings on MRP"
                  value={`-${formatPrice(totals.savings)}`}
                  valueClass="text-clay"
                />
              ) : null}

              <Row
                label="Shipping"
                value={totals.shipping === 0 ? 'Free' : formatPrice(totals.shipping)}
                valueClass={totals.shipping === 0 ? 'text-clay' : undefined}
              />

              {totals.couponDiscount > 0 ? (
                <Row
                  label={`Discount (${coupon.code})`}
                  value={`-${formatPrice(totals.couponDiscount)}`}
                  valueClass="text-clay"
                />
              ) : null}
            </dl>

            <div className="mt-5 flex items-baseline justify-between border-t border-charcoal pt-4">
              <span className="text-[12px] font-medium uppercase tracking-widest2">Total</span>
              <span className="font-display text-2xl">{formatPrice(totals.total)}</span>
            </div>

            <Link to="/checkout" className="btn-primary mt-6 w-full">
              Proceed to Checkout
            </Link>

            {!totals.qualifiesForFreeShipping ? (
              <p className="mt-3 text-center text-[11px] text-charcoal-muted">
                Add {formatPrice(totals.freeShippingRemaining)} more for free shipping
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      <TrustSection />
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
