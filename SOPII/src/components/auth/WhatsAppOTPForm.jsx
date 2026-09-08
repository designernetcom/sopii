import { useCallback, useRef, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { OTPInput } from './OTPInput';
import { OTPExpiry, ResendOTP } from './ResendOTP';
import { AuthNotice } from './AuthField';
import { Spinner } from '../ui/Spinner';
import { WhatsAppMark } from './WhatsAppMark';

/**
 * §2's "Enter 6-digit OTP" step, for a code delivered over WhatsApp.
 *
 * Deliberately unaware of *why* the code was sent. It takes the metadata the
 * request endpoint answered with, an `onVerify` and an `onResend`, and is used
 * unchanged for signing in (`/login/whatsapp`) and for adding WhatsApp to an
 * account already signed in (`/account/security`).
 *
 * The countdowns live in `ResendOTP` / `OTPExpiry` rather than here so that the
 * SMS screen and this one cannot drift apart on how a timer behaves in a
 * backgrounded tab.
 */
export function WhatsAppOTPForm({
  /** Whatever `request-otp` returned: masked number, timings, limits. */
  sent,
  onVerify,
  onResend,
  onBack,
  length = 6,
  note,
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  /*
   * Held in refs, not state: they are read inside callbacks that `OTPInput`
   * fires from an effect, and a stale closure over `busy` is how the sixth
   * digit arriving by paste submits twice.
   */
  const verifying = useRef(false);

  /*
   * The deadlines the timers count to. Recomputed on every send rather than
   * derived from `sent` during render, so a resend that returns the same
   * "30 seconds" restarts the countdown instead of leaving it at zero.
   */
  const [deadlines, setDeadlines] = useState(() => fromPayload(sent));
  const [resendsLeft, setResendsLeft] = useState(
    typeof sent?.resendsLeft === 'number' ? sent.resendsLeft : null,
  );

  const submit = useCallback(
    async (value) => {
      if (verifying.current || value.length < length) return;
      verifying.current = true;
      setBusy(true);
      setError('');
      setStatus('');

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
      setDeadlines(fromPayload(result));
      setResendsLeft(typeof result.resendsLeft === 'number' ? result.resendsLeft : resendsLeft);
      setStatus('A new code is on its way to WhatsApp.');
    } else {
      setError(result?.message || 'We could not send a new OTP just now.');
    }

    return result;
  }, [onResend, resendsLeft]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <WhatsAppMark size={20} aria-hidden="true" />
          Enter OTP
        </h2>
        {/*
          §2's confirmation line. The number is the masked form the server sent
          back — the browser never re-derives it, so what is shown is what the
          message was addressed to.
        */}
        <p className="mt-2 text-sm text-charcoal-muted">
          OTP sent to WhatsApp on{' '}
          <span className="whitespace-nowrap font-medium text-charcoal">
            {sent?.mobileFormatted || sent?.mobileMasked}
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
        label="WhatsApp one-time password"
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
        <ResendOTP
          resendAt={deadlines.resendAt}
          resendsLeft={resendsLeft}
          onResend={resend}
          label="Resend on WhatsApp"
        />

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

      {status ? <AuthNotice>{status}</AuthNotice> : null}
      {note}
    </div>
  );
}

/** Turns the server's "in N seconds" into the wall-clock deadlines the timers use. */
function fromPayload(payload) {
  const now = Date.now();
  return {
    resendAt: now + (payload?.resendAfterSeconds ?? 30) * 1000,
    expiresAt: now + (payload?.expiresInSeconds ?? 300) * 1000,
  };
}
