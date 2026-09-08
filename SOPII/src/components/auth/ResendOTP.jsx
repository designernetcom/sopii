import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';

/**
 * "Didn't receive the OTP? Resend in 24s".
 *
 * The countdown is driven by a *deadline* rather than by a number of seconds,
 * for two reasons that both bite in practice:
 *
 *   - a `seconds` prop cannot restart a timer when the new value equals the
 *     old one, and two consecutive sends both cool down for 30 seconds;
 *   - a tab that is backgrounded stops receiving intervals, so a counter that
 *     decrements its own state drifts. Reading the clock each tick does not.
 *
 * The server is the authority on whether a resend is allowed — it answers 400
 * with the remaining wait if this component is wrong — so the countdown here is
 * courtesy, not enforcement.
 */
export function ResendOTP({
  /** Epoch milliseconds at which Resend becomes clickable. */
  resendAt,
  onResend,
  /** Resends left on this verification attempt; `null` when unknown. */
  resendsLeft = null,
  label = 'Resend OTP',
  className,
}) {
  const [remaining, setRemaining] = useState(() => secondsUntil(resendAt));
  const [busy, setBusy] = useState(false);

  /*
   * Ticks while there is something to count down to, and stops when there is
   * not — an interval that runs forever behind a button nobody is waiting on
   * is a wakeup a phone does not need.
   */
  useEffect(() => {
    setRemaining(secondsUntil(resendAt));
    if (secondsUntil(resendAt) <= 0) return undefined;

    const timer = setInterval(() => {
      const left = secondsUntil(resendAt);
      setRemaining(left);
      if (left <= 0) clearInterval(timer);
    }, 500);

    return () => clearInterval(timer);
  }, [resendAt]);

  /* Guards a double-click, which would spend two of a small resend allowance. */
  const sending = useRef(false);

  const resend = useCallback(async () => {
    if (sending.current || remaining > 0) return;
    sending.current = true;
    setBusy(true);
    try {
      await onResend?.();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }, [onResend, remaining]);

  const exhausted = resendsLeft !== null && resendsLeft <= 0;

  return (
    <span className={className}>
      <span className="text-[12px] text-charcoal-muted">Didn&apos;t receive the OTP? </span>

      {exhausted ? (
        <span className="text-[12px] text-charcoal-faint">
          Resend limit reached — start again with your number.
        </span>
      ) : remaining > 0 ? (
        <span className="tabular-nums text-[12px] text-charcoal-faint">
          Resend in {remaining}s
        </span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[12px] text-charcoal underline underline-offset-4 transition-opacity disabled:opacity-50"
        >
          <RotateCw
            size={12}
            aria-hidden="true"
            className={busy ? 'animate-spin' : undefined}
            strokeWidth={1.8}
          />
          {busy ? 'Sending…' : label}
        </button>
      )}

      {/*
        Only shown once it starts to matter. "3 resends left" on the first
        screen reads as a warning about something nobody was going to do.
      */}
      {!exhausted && resendsLeft !== null && resendsLeft <= 1 ? (
        <span className="ml-1 text-[11px] text-charcoal-faint">
          ({resendsLeft} resend left)
        </span>
      ) : null}
    </span>
  );
}

function secondsUntil(deadline) {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/**
 * The countdown on the code itself, as `4:59`.
 *
 * Shares `ResendOTP`'s deadline approach for the same reasons, and renders the
 * expiry as plainly as possible: somebody watching this number is somebody who
 * has not received a message and is deciding whether to wait.
 */
export function OTPExpiry({ expiresAt, className }) {
  const [remaining, setRemaining] = useState(() => secondsUntil(expiresAt));

  useEffect(() => {
    setRemaining(secondsUntil(expiresAt));
    const timer = setInterval(() => setRemaining(secondsUntil(expiresAt)), 500);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (remaining <= 0) {
    return (
      <p className={className}>
        <span className="text-[11px] text-sale">
          This code has expired. Request a new one to continue.
        </span>
      </p>
    );
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, '0');

  return (
    <p className={className}>
      <span className="text-[11px] text-charcoal-faint">
        This code expires in{' '}
        <span className="tabular-nums text-charcoal-muted">
          {minutes}:{seconds}
        </span>
      </span>
    </p>
  );
}
