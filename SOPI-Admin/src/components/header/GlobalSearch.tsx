import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Package, Search, ShoppingCart, Tag, Users, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDebounce } from '@/hooks';
import { useLazyGlobalSearchQuery, type SearchResults } from '@/store/api/platformApi';
import { AppImage } from '@/components/common/AppImage';
import { formatCurrency } from '@/utils/format';
import { ORDER_STATUS } from '@/utils/constants';
import type { OrderStatus } from '@/types';

interface FlatResult {
  id: string;
  group: string;
  label: string;
  meta: string;
  to: string;
  image?: string;
}

function flatten(results: SearchResults | undefined): FlatResult[] {
  if (!results) return [];
  return [
    ...results.products.map((product) => ({
      id: `p-${product.id}`,
      group: 'Products',
      label: product.name,
      meta: `${product.sku} · ${formatCurrency(product.price)}`,
      to: `/admin/products/${product.id}`,
      image: product.image,
    })),
    ...results.orders.map((order) => ({
      id: `o-${order.id}`,
      group: 'Orders',
      label: `#${order.code}`,
      meta: `${order.customerName} · ${ORDER_STATUS[order.status as OrderStatus]?.label ?? order.status}`,
      to: `/admin/orders/${order.id}`,
    })),
    ...results.customers.map((customer) => ({
      id: `c-${customer.id}`,
      group: 'Customers',
      label: customer.name,
      meta: `${customer.email} · ${customer.ordersCount} orders`,
      to: `/admin/customers/${customer.id}`,
    })),
    ...results.coupons.map((coupon) => ({
      id: `cp-${coupon.id}`,
      group: 'Coupons',
      label: coupon.code,
      meta:
        coupon.discountType === 'percentage'
          ? `${coupon.discountValue}% off`
          : coupon.discountType === 'fixed'
            ? `${formatCurrency(coupon.discountValue)} off`
            : 'Free shipping',
      to: '/admin/coupons',
    })),
  ];
}

const GROUP_ICONS: Record<string, typeof Package> = {
  Products: Package,
  Orders: ShoppingCart,
  Customers: Users,
  Coupons: Tag,
};

export function GlobalSearch({ className }: { className?: string }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const debounced = useDebounce(term, 250);
  const [trigger, { data, isFetching }] = useLazyGlobalSearchQuery();

  useEffect(() => {
    if (debounced.trim().length >= 2) {
      trigger(debounced.trim());
      setOpen(true);
      setHighlight(0);
    }
  }, [debounced, trigger]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const results = flatten(data);
  const showPanel = open && term.trim().length >= 2;

  const go = (result: FlatResult) => {
    navigate(result.to);
    setOpen(false);
    setTerm('');
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showPanel || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((index) => (index + 1) % results.length);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => (index - 1 + results.length) % results.length);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const result = results[highlight];
      if (result) go(result);
    }
  };

  let lastGroup = '';

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        onFocus={() => term.trim().length >= 2 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search products, orders, customers…"
        className="h-9 w-full rounded-lg border border-ink-200 bg-ink-50 pl-9 pr-16 text-sm text-ink-900 transition-colors placeholder:text-ink-400 hover:bg-white focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-ink-700 dark:bg-ink-800/60 dark:text-ink-100 dark:placeholder:text-ink-500 dark:hover:bg-ink-800 dark:focus:bg-ink-800"
      />

      <div className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
        {term ? (
          <button
            type="button"
            onClick={() => {
              setTerm('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="pointer-events-auto rounded p-0.5 text-ink-400 hover:bg-ink-200 hover:text-ink-700 dark:hover:bg-ink-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-ink-200 bg-white px-1.5 py-0.5 text-2xs font-medium text-ink-400 dark:border-ink-700 dark:bg-ink-900 sm:block">
            ⌘K
          </kbd>
        )}
      </div>

      {showPanel && (
        <div
          id="global-search-results"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] animate-scale-in overflow-y-auto rounded-xl border border-ink-200 bg-white p-1.5 shadow-pop dark:border-ink-700 dark:bg-ink-900"
        >
          {isFetching && !data ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="skeleton h-9 w-full" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-ink-800 dark:text-ink-200">
                No matches for “{term}”
              </p>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                Try a product name, SKU, order code, email or phone number.
              </p>
            </div>
          ) : (
            results.map((result, index) => {
              const showHeader = result.group !== lastGroup;
              lastGroup = result.group;
              const Icon = GROUP_ICONS[result.group] ?? Search;

              return (
                <div key={result.id}>
                  {showHeader && (
                    <p className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-ink-400">
                      {result.group}
                    </p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => go(result)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      index === highlight
                        ? 'bg-ink-100 dark:bg-ink-800'
                        : 'hover:bg-ink-50 dark:hover:bg-ink-800/60',
                    )}
                  >
                    {result.image ? (
                      <AppImage
                        src={result.image}
                        alt={result.label}
                        seed={result.id}
                        wrapperClassName="h-8 w-8 shrink-0"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                        <Icon className="h-4 w-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                        {result.label}
                      </span>
                      <span className="block truncate text-xs text-ink-500 dark:text-ink-400">
                        {result.meta}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
