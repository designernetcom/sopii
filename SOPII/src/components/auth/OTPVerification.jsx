import { useCallback, useRef, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { OTPInput } from './OTPInput';
import { OTPExpiry, ResendOTP } from './ResendOTP';
import { Spinner } from '../ui/Spinner';

/**
 * §5's "Enter OTP" screen for a code sent over SMS: the boxes, the countdown,
 * the resend.
 *
 * Deliberately unaware of *why* a code was sent. It takes a number to show
 * back, an `onVerify` and an `onResend`, and is used unchanged for signing in
 * (`/login/otp`) and for verifying a number on an account already signed in
 * (`/account/security`).
 *
 * The two timers live in `ResendOTP` and `OTPExpiry`, shared with the WhatsApp
 * screen. Two implementations of "count down to a deadline" is two places for
 * a backgrounded tab to drift, and the SMS and WhatsApp screens would sooner
 * or later disagree about what a resend cooldown does.
 */
export function OTPVerification({
  mobileMasked,
  mobileFormatted,
  onVerify,
  onResend,
  onBack,
  resendAfterSeconds = 30,
  expiresInSeconds = 300,
  length = 6,
  note,
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  /*
   * Wall-clock deadlines rather than a pair of counters. Recomputed on every
   * send, so a resend that comes back with the same "30 seconds" restarts the
   * countdown instead of leaving it where it was.
   */
  const [deadlines, setDeadlines] = useState(() => ({
    resendAt: Date.now() + resendAfterSeconds * 1000,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  }));

  /*
   * `onVerify` is called from `onComplete`, which fires inside OTPInput's
   * effect. Guarding on a ref rather than on `busy` avoids a stale-closure
   * read of that state when the sixth digit arrives by paste.
   */
  const verifying = useRef(false);

  const submit = useCallback(
    async (value) => {
      if (verifying.current || value.length < length) return;
      verifying.current = true;
      setBusy(true);
      setError('');

      const result = await onVerify(value);

      verifying.current = false;
      setBusy(false);

      if (!result?.ok) {
        setError(result?.message || 'OTP could not be verified.');
        // Clearing lets them retype without deleting six boxes by hand.
        setCode('');
      }
    },
    [onVerify, length],
  );

  const resend = useCallback(async () => {
    setError('');
    setStatus('');

    const result = await onResend();

    if (result?.ok) {
      setCode('');
      setDeadlines({
        resendAt: Date.now() + (result.resendAfterSeconds ?? resendAfterSeconds) * 1000,
        expiresAt: Date.now() + (result.expiresInSeconds ?? expiresInSeconds) * 1000,
      });
      setStatus('A new OTP is on its way.');
    } else {
      setError(result?.message || 'We could not send a new OTP just now.');
    }

    return result;
  }, [onResend, resendAfterSeconds, expiresInSeconds]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Enter OTP</h2>
        <p className="mt-2 text-sm text-charcoal-muted">
          We sent a verification code to{' '}
          <span className="whitespace-nowrap font-medium text-charcoal">
            {mobileMasked || mobileFormatted}
          </span>
        </p>
      </div>

      <OTPInput
        length={length}
        value={code}
        onChange={(value) => {
          setCode(value);
          if (error) setError('');
        }}
        onComplete={submit}
        disabled={busy}
        error={error}
      />

      {/* Announced without stealing focus from the boxes. */}
      <p aria-live="polite" className="sr-only">
        {status || error}
      </p>

      <OTPExpiry expiresAt={deadlines.expiresAt} />

      <button
        type="button"
        onClick={() => submit(code)}
        disabled={busy || code.length < length}
        className="btn-primary w-full"
      >
        {busy ? (
          <>
            <Spinner size={14} /> Verifying
          </>
        ) : (
          <>
            <ShieldCheck size={15} strokeWidth={1.6} /> Verify OTP
          </>
        )}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-beige pt-5">
        <ResendOTP resendAt={deadlines.resendAt} onResend={resend} />

        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest2 text-charcoal-muted transition-colors hover:text-charcoal"
          >
            <ArrowLeft size={13} aria-hidden="true" /> Change number
          </button>
        ) : null}
      </div>

      {note}
    </div>
  );
}
