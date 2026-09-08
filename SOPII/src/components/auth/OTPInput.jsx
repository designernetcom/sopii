import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { cn } from '../../utils/cn';

/**
 * The six-box OTP field (§5).
 *
 * The behaviour people expect from one of these, each costing a line or two to
 * get right:
 *
 *   - typing a digit advances; Backspace on an empty box retreats;
 *   - pasting a whole code fills every box, from wherever the cursor is;
 *   - arrow keys move without editing;
 *   - the boxes are `inputMode="numeric"` and `autoComplete="one-time-code"`,
 *     so iOS and Android offer the code straight from the SMS.
 *
 * The value is controlled by the parent as one string; the boxes are a
 * presentation of it, which is what makes paste and autofill work without six
 * pieces of state disagreeing.
 */
export function OTPInput({
  length = 6,
  value = '',
  onChange,
  onComplete,
  disabled = false,
  error,
  autoFocus = true,
  label = 'One-time password',
}) {
  const inputs = useRef([]);
  const generated = useId();
  const digits = useMemo(
    () => Array.from({ length }, (_, index) => value[index] ?? ''),
    [value, length],
  );

  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus();
  }, [autoFocus]);

  /*
   * Fired from an effect rather than inside the change handler: calling back
   * during the parent's own render pass is what produces "cannot update a
   * component while rendering a different component".
   */
  const completed = useRef(false);
  useEffect(() => {
    if (value.length === length && !completed.current) {
      completed.current = true;
      onComplete?.(value);
    }
    if (value.length < length) completed.current = false;
  }, [value, length, onComplete]);

  const write = useCallback((next) => onChange?.(next.slice(0, length)), [onChange, length]);

  const handleChange = (index, raw) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;

    // More than one digit means a paste (or a keyboard suggestion) landed in
    // this box — spread it across the remaining boxes rather than truncating.
    const next = digits.slice();
    typed.split('').forEach((digit, offset) => {
      if (index + offset < length) next[index + offset] = digit;
    });

    write(next.join(''));
    inputs.current[Math.min(index + typed.length, length - 1)]?.focus();
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = digits.slice();

      if (next[index]) {
        next[index] = '';
        write(next.join(''));
        return;
      }
      // Empty box: clear the one before and move there.
      if (index > 0) {
        next[index - 1] = '';
        write(next.join(''));
        inputs.current[index - 1]?.focus();
      }
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    write(pasted);
    inputs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div>
      {/* One group label, rather than six inputs each announcing themselves. */}
      <div
        role="group"
        aria-label={label}
        aria-describedby={error ? `${generated}-error` : undefined}
        className="flex justify-between gap-2 sm:gap-3"
        onPaste={handlePaste}
      >
        {digits.map((digit, index) => (
          <input
             
            key={index}
            ref={(node) => {
              inputs.current[index] = node;
            }}
            type="text"
            inputMode="numeric"
            // Only the first box carries it, or every box asks to be autofilled
            // with the whole code.
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            value={digit}
            disabled={disabled}
            aria-label={`Digit ${index + 1} of ${length}`}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onFocus={(event) => event.target.select()}
            className={cn(
              'h-13 w-full min-w-0 border bg-cream text-center font-display text-xl text-charcoal',
              'transition-colors duration-200 focus:border-clay focus:outline-none focus:ring-0',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error ? 'border-sale' : digit ? 'border-clay' : 'border-beige',
            )}
            style={{ height: '3.25rem' }}
          />
        ))}
      </div>

      {error ? (
        <p id={`${generated}-error`} role="alert" className="mt-2 text-[11px] text-sale">
          {error}
        </p>
      ) : null}
    </div>
  );
}
