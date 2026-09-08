import { forwardRef, useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * A labelled input that renders its validation message beneath the field
 * (§23), wired for `aria-invalid` / `aria-describedby` so the message is
 * announced rather than merely coloured red.
 *
 * `forwardRef` because React Hook Form's `register()` needs the real element.
 */
export const AuthField = forwardRef(function AuthField(
  { id, label, error, hint, className, prefix, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id || generated;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
        {hint}
      </div>

      {prefix ? (
        /*
         * The country code sits in its own box rather than inside the input:
         * a `+91` rendered as placeholder text gets submitted with the value,
         * and one rendered as an overlay breaks when the field is autofilled.
         */
        <div className="flex">
          <span className="flex select-none items-center border border-r-0 border-beige bg-sand/60 px-3 text-sm text-charcoal-muted">
            {prefix}
          </span>
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={cn('field flex-1', error && 'border-sale')}
            {...rest}
          />
        </div>
      ) : (
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn('field', error && 'border-sale')}
          {...rest}
        />
      )}

      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-[11px] text-sale">
          {error}
        </p>
      ) : null}
    </div>
  );
});

/**
 * The form-level error banner (§27).
 *
 * Distinct from a field error: this is what the *server* said — bad
 * credentials, a throttle, an inactive account — none of which belongs under a
 * particular input.
 */
export function AuthError({ children, className }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className={cn(
        'border-l-2 border-sale bg-sale/5 px-3 py-2.5 text-[12px] leading-relaxed text-sale',
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Its counterpart for §28's confirmations. */
export function AuthNotice({ children, className }) {
  if (!children) return null;
  return (
    <p
      role="status"
      className={cn(
        'border-l-2 border-plum bg-plum-pale/50 px-3 py-2.5 text-[12px] leading-relaxed text-plum-deep',
        className,
      )}
    >
      {children}
    </p>
  );
}

/** A checkbox matching the field styling — terms, newsletter, remember me. */
export const AuthCheckbox = forwardRef(function AuthCheckbox(
  { id, label, error, className, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id || generated;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-2.5">
        {/*
          The tick is a sibling revealed by `peer-checked` rather than a
          background image on the input, so it appears only when checked — an
          inline background-image would be painted in both states.
        */}
        <span className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="peer h-4 w-4 cursor-pointer appearance-none border border-beige bg-cream transition-colors checked:border-plum checked:bg-plum focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-clay"
            {...rest}
          />
          <Check
            size={11}
            strokeWidth={3}
            aria-hidden="true"
            className="pointer-events-none absolute text-cream opacity-0 transition-opacity peer-checked:opacity-100"
          />
        </span>
        <span className="text-[12px] leading-relaxed text-charcoal-muted">{label}</span>
      </label>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1 text-[11px] text-sale">
          {error}
        </p>
      ) : null}
    </div>
  );
});
