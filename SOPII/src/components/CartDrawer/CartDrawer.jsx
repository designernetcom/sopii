import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ShoppingBag, Trash2, Truck, X } from 'lucide-react';
import { formatPrice } from '../../utils/format';
import { Image } from '../ui/Image';
import { QuantityStepper } from '../ui/QuantityStepper';
import { useCart } from '../../context/CartContext';
import { useUI } from '../../context/UIContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/** Right-side bag drawer with a free-shipping progress meter. */
export function CartDrawer() {
  const { isCartOpen, close } = useUI();
  const { items, itemCount, totals, removeItem, updateQuantity } = useCart();
  const panelRef = useRef(null);

  useLockBodyScroll(isCartOpen);
  useFocusTrap(panelRef, isCartOpen);

  if (!isCartOpen) return null;

  const progress = Math.min(
    100,
    Math.round((totals.subtotal / (totals.freeShippingThreshold || 1)) * 100),
  );

  return createPortal(
    <div className="fixed inset-0 z-[65]">
      <button
        type="button"
        aria-label="Close bag"
        onClick={close}
        className="absolute inset-0 animate-fade-in cursor-default bg-charcoal/45 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        tabIndex={-1}
        /* `100%` rather than `100vw`: `vw` includes the scrollbar gutter, so
            on any browser that reserves one the drawer was a few pixels wider
            than the viewport and dragged the page sideways. */
        className="absolute inset-y-0 right-0 flex w-[min(100%,440px)] animate-slide-in-right flex-col bg-cream outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-beige px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-display text-lg">Your Bag</h2>
            <p className="text-[11px] uppercase tracking-widest2 text-charcoal-muted">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close bag"
            className="-mr-2 grid h-10 w-10 place-items-center text-charcoal-muted transition-colors hover:text-charcoal"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <span className="mb-5 grid h-16 w-16 place-items-center rounded-full border border-beige">
              <ShoppingBag size={22} className="text-clay" strokeWidth={1.25} aria-hidden="true" />
            </span>
            <h3 className="font-display text-xl">Your bag is empty</h3>
            <p className="mt-2 text-sm text-charcoal-muted">
              Add something you love and it will appear here.
            </p>
            <Link to="/shop" onClick={close} className="btn-primary mt-7">
              Start Shopping
            </Link>
          </div>
        ) : (
          <>
            {/* Free shipping meter */}
            <div className="border-b border-beige bg-sand/50 px-5 py-3.5 sm:px-6">
              <p className="flex items-center gap-2 text-[11px] text-charcoal-soft">
                <Truck size={14} className="shrink-0 text-clay" aria-hidden="true" />
                {totals.qualifiesForFreeShipping ? (
                  <span className="font-medium">You have unlocked free shipping.</span>
                ) : (
                  <span>
                    Add <strong className="font-medium">{formatPrice(totals.freeShippingRemaining)}</strong>{' '}
                    more for free shipping
                  </span>
                )}
              </p>
              <div
                className="mt-2 h-0.5 w-full overflow-hidden bg-beige"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progress towards free shipping"
              >
                <div
                  className="h-full bg-clay transition-[width] duration-500 ease-silk"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Lines */}
            <ul className="flex-1 divide-y divide-beige overflow-y-auto overscroll-contain px-5 sm:px-6">
              {items.map((line) => (
                <li key={line.id} className="flex gap-4 py-5">
                  <Link
                    to={`/product/${line.productId}`}
                    onClick={close}
                    className="w-20 shrink-0 sm:w-24"
                  >
                    <Image src={line.image} alt={line.name} ratio="aspect-[4/5]" />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        to={`/product/${line.productId}`}
                        onClick={close}
                        className="text-[13px] leading-snug transition-colors hover:text-clay"
                      >
                        {line.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItem(line.id)}
                        aria-label={`Remove ${line.name} from bag`}
                        className="-mt-1 shrink-0 p-1 text-charcoal-faint transition-colors hover:text-sale"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>

                    <p className="mt-1 text-[11px] text-charcoal-muted">
                      {line.size}
                      {line.color ? ` · ${line.color}` : ''}
                    </p>

                    <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                      <QuantityStepper
                        value={line.quantity}
                        onChange={(q) => updateQuantity(line.id, q)}
                        size="sm"
                        label={`Quantity for ${line.name}`}
                      />
                      <span className="text-sm font-medium">
                        {formatPrice(line.price * line.quantity)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Summary */}
            <div className="border-t border-beige px-5 py-4 sm:px-6">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-widest2 text-charcoal-muted">
                  Subtotal
                </span>
                <span className="font-display text-xl">{formatPrice(totals.subtotal)}</span>
              </div>

              <p className="mt-1 text-[11px] text-charcoal-muted">
                {totals.qualifiesForFreeShipping
                  ? 'Shipping free · Taxes included'
                  : `Shipping ${formatPrice(totals.shipping)} · Taxes included`}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Link to="/cart" onClick={close} className="btn-outline">
                  View Bag
                </Link>
                <Link to="/checkout" onClick={close} className="btn-primary">
                  Checkout
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
