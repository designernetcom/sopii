import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

export interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: ReactNode | ((props: { close: () => void }) => ReactNode);
  align?: 'left' | 'right';
  className?: string;
  panelClassName?: string;
  /** Keeps the panel open after an item click (used by filter panels). */
  persistent?: boolean;
}

export function Dropdown({
  trigger,
  children,
  align = 'right',
  className,
  panelClassName,
  persistent = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((value) => !value), id })}
      {open && (
        <div
          id={id}
          role="menu"
          onClick={persistent ? undefined : () => setOpen(false)}
          className={cn(
            'absolute z-50 mt-1.5 min-w-[11rem] animate-scale-in overflow-hidden rounded-xl border p-1 shadow-pop',
            'border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            panelClassName,
          )}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}

export interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  to?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

export function DropdownItem({
  children,
  onClick,
  to,
  icon,
  danger,
  disabled,
  shortcut,
}: DropdownItemProps) {
  const classes = cn(
    'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
    danger
      ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10'
      : 'text-ink-700 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
    disabled && 'pointer-events-none opacity-40',
  );

  const content = (
    <>
      {icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="text-2xs text-ink-400">{shortcut}</span>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} role="menuitem">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} className={classes}>
      {content}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="my-1 h-px bg-ink-200 dark:bg-ink-800" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-400">
      {children}
    </p>
  );
}
