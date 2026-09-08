import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Check, Heart, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = { success: Check, wishlist: Heart, info: Info };
const DURATION = 3200;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message, { type = 'success', action } = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((t) => [...t.slice(-2), { id, message, type, action }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION),
      );
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Live region so screen readers announce cart/wishlist changes */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+16px)] z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-8 lg:right-8 lg:left-auto lg:items-end lg:px-0"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-center gap-3 border border-charcoal/10 bg-charcoal px-4 py-3 text-cream shadow-lg"
            >
              <Icon
                size={16}
                className="shrink-0 text-gold"
                aria-hidden="true"
                fill={t.type === 'wishlist' ? 'currentColor' : 'none'}
              />
              <p className="flex-1 text-[13px] leading-snug">{t.message}</p>
              {t.action ? (
                <button
                  type="button"
                  onClick={() => {
                    t.action.onClick();
                    dismiss(t.id);
                  }}
                  className="shrink-0 text-[11px] font-medium uppercase tracking-widest2 text-gold underline-offset-4 hover:underline"
                >
                  {t.action.label}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 text-cream/60 transition-colors hover:text-cream"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
