import { forwardRef, useId, useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { PASSWORD_RULES, passwordScore } from '../../lib/authSchemas';

/**
 * A password field with a reveal toggle.
 *
 * `forwardRef` is not decoration: React Hook Form's `register()` returns a ref
 * it must be able to attach to the real input, and a component that swallows
 * it silently produces a field RHF cannot read or focus on error.
 */
export const PasswordInput = forwardRef(function PasswordInput(
  { id, label, error, hint, className, autoComplete = 'current-password', ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
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

      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn('field pr-11', error && 'border-sale')}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          // Announced, but skipped when tabbing between fields — a reveal
          // toggle between "Password" and "Confirm password" is a nuisance.
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-0 top-0 flex h-full w-11 items-center justify-center text-charcoal-faint transition-colors hover:text-charcoal"
        >
          {visible ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
        </button>
      </div>

      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-[11px] text-sale">
          {error}
        </p>
      ) : null}
    </div>
  );
});

/**
 * §4's rules, ticking off as they are met.
 *
 * Shown only once typing starts: a wall of red crosses is a poor greeting on a
 * field nobody has touched yet.
 */
export function PasswordStrength({ value = '', className }) {
  if (!value) return null;

  const score = passwordScore(value);
  const total = PASSWORD_RULES.length;

  return (
    <div className={cn('mt-3', className)}>
      <div className="flex gap-1" aria-hidden="true">
        {PASSWORD_RULES.map((rule, index) => (
          <span
            key={rule.id}
            className={cn(
              'h-0.5 flex-1 transition-colors duration-300',
              index < score
                ? score <= 2
                  ? 'bg-sale'
                  : score <= 4
                    ? 'bg-gold'
                    : 'bg-plum'
                : 'bg-beige',
            )}
          />
        ))}
      </div>

      <ul className="mt-2.5 grid gap-1 sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(value);
          return (
            <li
              key={rule.id}
              className={cn(
                'flex items-center gap-1.5 text-[11px] transition-colors',
                met ? 'text-charcoal-muted' : 'text-charcoal-faint',
              )}
            >
              {met ? (
                <Check size={11} className="shrink-0 text-plum" strokeWidth={2.5} />
              ) : (
                <X size={11} className="shrink-0 text-charcoal-faint" strokeWidth={2} />
              )}
              {rule.label}
            </li>
          );
        })}
      </ul>

      {/* The visual meter is decorative; this is what a screen reader hears. */}
      <p className="sr-only" aria-live="polite">
        Password meets {score} of {total} requirements.
      </p>
    </div>
  );
}
