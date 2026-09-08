import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { STORAGE_KEYS } from '../utils/storage';
import { ApiError, validateCoupon } from '../services/api';
import { adaptCoupons } from '../services/adapters';
import { useToast } from './ToastContext';
import { useCatalog } from './CatalogContext';

const CartContext = createContext(null);

/** A cart line is unique per product + size + colour combination. */
const lineId = (productId, size, color) => `${productId}::${size || '-'}::${color || '-'}`;

export function CartProvider({ children }) {
  const [items, setItems] = useLocalStorage(STORAGE_KEYS.cart, []);
  const [coupon, setCoupon] = useState(null);
  const { toast } = useToast();

  /* Coupons and the shipping thresholds are configured in the admin panel, so
     a code created there works at checkout without a deploy. */
  const { coupons, settings } = useCatalog();
  const freeShippingThreshold = settings.freeShippingThreshold;
  const shippingFee = settings.shippingFee;

  const addItem = useCallback(
    (product, { size, color, quantity = 1, silent = false } = {}) => {
      const chosenSize = size || product.sizes?.[0] || 'One Size';
      const chosenColor = color || product.colors?.[0]?.name || null;
      const id = lineId(product.id, chosenSize, chosenColor);

      setItems((current) => {
        const existing = current.find((i) => i.id === id);
        if (existing) {
          return current.map((i) =>
            i.id === id ? { ...i, quantity: Math.min(i.quantity + quantity, 10) } : i,
          );
        }
        return [
          ...current,
          {
            id,
            productId: product.id,
            name: product.name,
            slug: product.slug,
            category: product.category,
            image: product.image,
            price: product.price,
            originalPrice: product.originalPrice,
            size: chosenSize,
            color: chosenColor,
            quantity: Math.min(quantity, 10),
          },
        ];
      });

      if (!silent) toast(`${product.name} added to your bag`);
      return id;
    },
    [setItems, toast],
  );

  const removeItem = useCallback(
    (id) => {
      setItems((current) => current.filter((i) => i.id !== id));
    },
    [setItems],
  );

  const updateQuantity = useCallback(
    (id, quantity) => {
      const next = Math.max(1, Math.min(10, quantity));
      setItems((current) => current.map((i) => (i.id === id ? { ...i, quantity: next } : i)));
    },
    [setItems],
  );

  const clearCart = useCallback(() => {
    setItems([]);
    setCoupon(null);
  }, [setItems]);

  const isInCart = useCallback(
    (productId) => items.some((i) => i.productId === productId),
    [items],
  );

  /* ------------------------------ Coupons ------------------------------- */

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items],
  );

  /**
   * Checks a code with the store, which knows things the browser cannot: how
   * many times it has been redeemed overall, whether this shopper has already
   * used it, and whether it is inside its window. The published coupon list is
   * only the fallback for when the API cannot be reached.
   */
  const applyCoupon = useCallback(
    async (code) => {
      const entered = code.trim();
      if (!entered) return { ok: false, message: 'Enter a coupon code.' };

      try {
        const result = await validateCoupon(entered, subtotal);
        const [adapted] = adaptCoupons([result.coupon]);
        setCoupon(adapted);
        return { ok: true, message: `${adapted.code} applied — ${adapted.label}.` };
      } catch (error) {
        /* 422 is the store saying the code is real but not usable yet — "add
           ₹300 more", "already redeemed" — and its wording is better than ours. */
        if (error instanceof ApiError && error.body?.message) {
          return { ok: false, message: error.body.message };
        }
        if (error instanceof ApiError && error.status < 500) {
          return { ok: false, message: error.message };
        }

        // Unreachable API: fall back to the published list.
        const found = coupons.find((c) => c.code.toLowerCase() === entered.toLowerCase());
        if (!found) {
          return { ok: false, message: 'That code is not valid. Please check and try again.' };
        }
        if (subtotal < found.minimum) {
          return {
            ok: false,
            message: `Add ₹${(found.minimum - subtotal).toLocaleString('en-IN')} more to use ${found.code}.`,
          };
        }
        setCoupon(found);
        return { ok: true, message: `${found.code} applied — ${found.label}.` };
      }
    },
    [coupons, subtotal],
  );

  const removeCoupon = useCallback(() => setCoupon(null), []);

  /* ------------------------------ Totals -------------------------------- */

  const totals = useMemo(() => {
    const mrpTotal = items.reduce(
      (sum, i) => sum + (i.originalPrice || i.price) * i.quantity,
      0,
    );
    const savings = mrpTotal - subtotal;

    let couponDiscount = 0;
    if (coupon?.type === 'percent') {
      couponDiscount = Math.round((subtotal * coupon.value) / 100);
      // Percentage coupons from the panel can carry a cap.
      if (coupon.maxDiscount) couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
    } else if (coupon?.type === 'flat') {
      couponDiscount = Math.min(coupon.value, subtotal);
    }

    const afterDiscount = Math.max(0, subtotal - couponDiscount);
    const freeShipping =
      coupon?.type === 'shipping' || afterDiscount >= freeShippingThreshold;
    const shipping = items.length === 0 || freeShipping ? 0 : shippingFee;

    return {
      mrpTotal,
      subtotal,
      savings,
      couponDiscount,
      shipping,
      total: afterDiscount + shipping,
      freeShippingRemaining: Math.max(0, freeShippingThreshold - afterDiscount),
      qualifiesForFreeShipping: freeShipping,
      freeShippingThreshold,
    };
  }, [items, subtotal, coupon, freeShippingThreshold, shippingFee]);

  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  const value = useMemo(
    () => ({
      items,
      itemCount,
      totals,
      coupon,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      isInCart,
      applyCoupon,
      removeCoupon,
    }),
    [
      items,
      itemCount,
      totals,
      coupon,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      isInCart,
      applyCoupon,
      removeCoupon,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
