import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

/* ---------------------------------- shell ---------------------------------- */

export interface FieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
  /** Right-aligned helper such as a character counter. */
  addon?: ReactNode;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
  addon,
}: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || addon) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <label
              htmlFor={htmlFor}
              className="text-xs font-medium text-ink-700 dark:text-ink-300"
            >
              {label}
              {required && <span className="ml-0.5 text-rose-500">*</span>}
            </label>
          )}
          {addon && <span className="text-2xs text-ink-400">{addon}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p className="flex items-start gap-1 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-500 dark:text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL =
  'w-full rounded-lg border bg-white px-3 text-sm text-ink-900 transition-colors placeholder:text-ink-400 ' +
  'border-ink-200 hover:border-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400 ' +
  'dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:placeholder:text-ink-500 dark:hover:border-ink-600 ' +
  'dark:focus:border-brand-500 dark:disabled:bg-ink-900/60';

const ERROR_RING = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/25 dark:border-rose-500';

/* ---------------------------------- input ---------------------------------- */

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  invalid?: boolean;
  /** Static text rendered inside the control, e.g. a currency symbol. */
  prefix?: ReactNode;
  suffix?: ReactNode;
  sizeVariant?: 'sm' | 'md';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, prefix, suffix, sizeVariant = 'md', ...props },
  ref,
) {
  const height = sizeVariant === 'sm' ? 'h-8' : 'h-9';

  if (prefix || suffix) {
    return (
      <div
        className={cn(
          'flex items-center rounded-lg border bg-white transition-colors',
          'border-ink-200 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/25',
          'dark:border-ink-700 dark:bg-ink-900',
          invalid && ERROR_RING,
          height,
          className,
        )}
      >
        {prefix && (
          <span className="pl-3 text-sm text-ink-400 dark:text-ink-500">{prefix}</span>
        )}
        <input
          ref={ref}
          className="h-full w-full bg-transparent px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none dark:text-ink-100 dark:placeholder:text-ink-500"
          {...props}
        />
        {suffix && (
          <span className="pr-3 text-sm text-ink-400 dark:text-ink-500">{suffix}</span>
        )}
      </div>
    );
  }

  return (
    <input
      ref={ref}
      className={cn(CONTROL, height, invalid && ERROR_RING, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

/* --------------------------------- textarea -------------------------------- */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(CONTROL, 'py-2 leading-relaxed', invalid && ERROR_RING, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

/* ---------------------------------- select --------------------------------- */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  options?: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  sizeVariant?: 'sm' | 'md';
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, options, placeholder, children, sizeVariant = 'md', ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        CONTROL,
        sizeVariant === 'sm' ? 'h-8' : 'h-9',
        'cursor-pointer appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7787' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        invalid && ERROR_RING,
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options?.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );
});

/* -------------------------------- checkbox --------------------------------- */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  description?: string;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, indeterminate, ...props },
  ref,
) {
  const id = useId();
  const inputId = props.id ?? id;

  const input = (
    <input
      ref={(node) => {
        if (node) node.indeterminate = Boolean(indeterminate);
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as { current: HTMLInputElement | null }).current = node;
      }}
      id={inputId}
      type="checkbox"
      className={cn(
        'h-4 w-4 shrink-0 cursor-pointer rounded border-ink-300 text-brand-600 transition-colors',
        'focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-0',
        'dark:border-ink-600 dark:bg-ink-800 dark:checked:bg-brand-600',
        className,
      )}
      {...props}
    />
  );

  if (!label && !description) return input;

  return (
    <div className="flex items-start gap-2.5">
      <div className="pt-0.5">{input}</div>
      <div className="min-w-0">
        <label
          htmlFor={inputId}
          className="cursor-pointer text-sm font-medium text-ink-800 dark:text-ink-200"
        >
          {label}
        </label>
        {description && (
          <p className="text-xs text-ink-500 dark:text-ink-400">{description}</p>
        )}
      </div>
    </div>
  );
});

/* --------------------------------- switch ---------------------------------- */

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  size = 'md',
  className,
}: SwitchProps) {
  const track = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9';
  const knob = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const travel = size === 'sm' ? 'translate-x-3' : 'translate-x-4';

  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={typeof label === 'string' ? label : 'Toggle'}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        track,
        checked ? 'bg-brand-600' : 'bg-ink-300 dark:bg-ink-700',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block transform rounded-full bg-white shadow transition-transform',
          knob,
          checked ? travel : 'translate-x-0.5',
        )}
      />
    </button>
  );

  if (!label && !description) return control;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {label && (
          <p className="text-sm font-medium text-ink-800 dark:text-ink-200">{label}</p>
        )}
        {description && (
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{description}</p>
        )}
      </div>
      {control}
    </div>
  );
}
