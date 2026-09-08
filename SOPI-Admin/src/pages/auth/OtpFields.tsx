import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { cn } from '@/utils/cn';
import type { OtpRequestResult } from '@/store/api/authApi';

/**
 * §5's OTP flow, for the admin console.
 *
 * Kept separate from the shop's `OTPInput` because the two applications have
 * different design systems and no shared component library — extracting one
 * would mean a package, which is more machinery than two screens justify. The
 * *behaviour* is deliberately identical: six boxes, paste support, a resend
 * countdown, and no code ever in an HTTP response.
 */
interface Props {
  sent: OtpRequestResult | null;
  busy: boolean;
  error: string;
  onSend: (mobile: string) => Promise<{ ok: boolean; message?: string } & Partial<OtpRequestResult>>;
  onVerify: (code: string) => Promise<{ ok: boolean; message?: string }>;
  onBack: () => void;
}

export function OtpFields({ sent, busy, error, onSend, onVerify, onBack }: Props) {
  const [mobile, setMobile] = useState('');
  const [mobileError, setMobileError] = useState('');

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = mobile.replace(/\D/g, '').replace(/^(?:0|91)/, '');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setMobileError('Enter a valid 10-digit mobile number');
      return;
    }
    setMobileError('');
    await onSend(digits);
  };

  if (!sent) {
    return (
      <form onSubmit={send} className="space-y-4" noValidate>
        <Field label="Mobile number" htmlFor="mobile" error={mobileError} required>
          <div className="flex">
            <span className="flex select-none items-center rounded-l-lg border border-r-0 border-ink-200 bg-ink-100 px-3 text-sm text-ink-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-400">
              +91
            </span>
            <Input
              id="mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              className="rounded-l-none"
              maxLength={14}
              value={mobile}
              invalid={Boolean(mobileError)}
              onChange={(event) => setMobile(event.target.value)}
            />
          </div>
        </Field>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border-l-2 border-danger-500 bg-danger-500/5 px-3 py-2.5 text-xs leading-relaxed text-danger-600 dark:text-danger-400"
          >
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={busy}
          icon={<Send className="h-4 w-4" />}
        >
          Send OTP
        </Button>
      </form>
    );
  }

  return <VerifyStep sent={sent} onVerify={onVerify} onResend={() => onSend(mobile)} onBack={onBack} />;
}

/* --------------------------------- verify ---------------------------------- */

function VerifyStep({
  sent,
  onVerify,
  onResend,
  onBack,
}: {
  sent: OtpRequestResult;
  onVerify: Props['onVerify'];
  onResend: () => Promise<{ ok: boolean; message?: string } & Partial<OtpRequestResult>>;
  onBack: () => void;
}) {
  const length = sent.otpLength || 6;

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(sent.resendAfterSeconds);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCountdown((value) => (value > 0 ? value - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  /*
   * Guarded by a ref rather than by `busy`, because the submit fires from the
   * change handler when the last digit lands — reading state there would see
   * the value from before this render.
   */
  const verifying = useRef(false);

  const submit = useCallback(
    async (value: string) => {
      if (verifying.current || value.length < length) return;
      verifying.current = true;
      setBusy(true);
      setError('');

      const result = await onVerify(value);

      verifying.current = false;
      setBusy(false);

      if (!result.ok) {
        setError(result.message ?? 'OTP could not be verified.');
        setCode('');
        inputs.current[0]?.focus();
      }
    },
    [onVerify, length],
  );

  const write = (next: string) => {
    const trimmed = next.slice(0, length);
    setCode(trimmed);
    if (error) setError('');
    if (trimmed.length === length) void submit(trimmed);
  };

  const handleChange = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;

    const digits = Array.from({ length }, (_, i) => code[i] ?? '');
    // More than one digit means a paste landed here; spread it forward.
    typed.split('').forEach((digit, offset) => {
      if (index + offset < length) digits[index + offset] = digit;
    });

    write(digits.join(''));
    inputs.current[Math.min(index + typed.length, length - 1)]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Backspace') return;
    event.preventDefault();

    const digits = Array.from({ length }, (_, i) => code[i] ?? '');
    if (digits[index]) {
      digits[index] = '';
      write(digits.join(''));
      return;
    }
    if (index > 0) {
      digits[index - 1] = '';
      write(digits.join(''));
      inputs.current[index - 1]?.focus();
    }
  };

  const resend = async () => {
    if (countdown > 0) return;
    setResending(true);
    setError('');

    const result = await onResend();
    setResending(false);

    if (result.ok) {
      setCode('');
      setCountdown(result.resendAfterSeconds ?? sent.resendAfterSeconds);
      inputs.current[0]?.focus();
    } else {
      setError(result.message ?? 'We could not send a new OTP.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Enter OTP</h2>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
          We sent a verification code to{' '}
          <span className="font-medium text-ink-700 dark:text-ink-200">{sent.mobileFormatted}</span>
        </p>
      </div>

      <div
        role="group"
        aria-label="One-time password"
        className="flex gap-2"
        onPaste={(event) => {
          event.preventDefault();
          const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
          if (pasted) {
            write(pasted);
            inputs.current[Math.min(pasted.length, length - 1)]?.focus();
          }
        }}
      >
        {Array.from({ length }, (_, index) => (
          <input
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            ref={(node) => {
              inputs.current[index] = node;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            value={code[index] ?? ''}
            disabled={busy}
            aria-label={`Digit ${index + 1} of ${length}`}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onFocus={(event) => event.target.select()}
            className={cn(
              'h-12 w-full min-w-0 rounded-lg border bg-white text-center text-lg font-semibold text-ink-900 transition-colors',
              'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
              'disabled:opacity-50 dark:bg-ink-900 dark:text-ink-50',
              error
                ? 'border-danger-500'
                : code[index]
                  ? 'border-brand-400 dark:border-brand-600'
                  : 'border-ink-200 dark:border-ink-700',
            )}
          />
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border-l-2 border-danger-500 bg-danger-500/5 px-3 py-2.5 text-xs leading-relaxed text-danger-600 dark:text-danger-400"
        >
          {error}
        </p>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={busy}
        disabled={code.length < length}
        icon={<ShieldCheck className="h-4 w-4" />}
        onClick={() => void submit(code)}
      >
        Verify OTP
      </Button>

      <div className="flex items-center justify-between gap-3 border-t border-ink-200 pt-4 dark:border-ink-800">
        <span className="text-xs text-ink-500 dark:text-ink-400">
          {countdown > 0 ? (
            <>Resend OTP in {countdown}s</>
          ) : (
            <button
              type="button"
              onClick={resend}
              disabled={resending}
              className="font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
            >
              {resending ? 'Sending…' : 'Resend OTP'}
            </button>
          )}
        </span>

        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-ink-500 transition-colors hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Change number
        </button>
      </div>
    </div>
  );
}
