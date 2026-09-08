import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { IconButton } from '@/components/common/Button';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: ModalSize;
  children: ReactNode;
  footer?: ReactNode;
  /** Disables backdrop/escape dismissal while a mutation is in flight. */
  busy?: boolean;
  className?: string;
  hideClose?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  busy,
  className,
  hideClose,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog so keyboard users land in the right place.
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), textarea, select, button:not([data-modal-close])',
      );
      focusable?.focus();
    }, 30);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [open, onClose, busy]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4">
      <div
        className="fixed inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-[2px]"
        onClick={() => !busy && onClose()}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        className={cn(
          'relative z-10 flex max-h-[92vh] w-full animate-fade-in-up flex-col rounded-t-2xl border bg-white shadow-modal sm:animate-scale-in sm:rounded-2xl',
          'border-ink-200 dark:border-ink-700 dark:bg-ink-900',
          SIZES[size],
          className,
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4 dark:border-ink-800">
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-semibold text-ink-900 dark:text-ink-100">{title}</h2>
              )}
              {description && (
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{description}</p>
              )}
            </div>
            {!hideClose && (
              <IconButton
                label="Close dialog"
                size="sm"
                data-modal-close
                onClick={onClose}
                disabled={busy}
              >
                <X className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-200 px-5 py-3.5 dark:border-ink-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
