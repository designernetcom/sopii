import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/**
 * Accessible dialog rendered in a portal.
 * Handles scroll lock, focus trapping, focus restore, Escape and backdrop
 * click. Escape is wired by whichever context owns the open state.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  className,
  hideClose = false,
  labelledBy,
}) {
  const panelRef = useRef(null);
  useLockBodyScroll(open);
  useFocusTrap(panelRef, open);

  if (!open) return null;

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    full: 'max-w-6xl',
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in cursor-default bg-charcoal/45 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          'relative max-h-[92vh] w-full animate-scale-in overflow-y-auto bg-cream shadow-2xl outline-none',
          widths[size],
          className,
        )}
      >
        {title || !hideClose ? (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-beige bg-cream px-5 py-4 sm:px-7">
            {title ? (
              <h2 className="font-display text-lg sm:text-xl">{title}</h2>
            ) : (
              <span />
            )}
            {!hideClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 grid h-9 w-9 place-items-center text-charcoal-muted transition-colors hover:text-charcoal"
              >
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}

        {children}
      </div>
    </div>,
    document.body,
  );
}
