import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthError, AuthField, AuthNotice } from './AuthField';
import { WhatsAppOTPForm } from './WhatsAppOTPForm';
import { WhatsAppMark } from './WhatsAppMark';
import { Spinner } from '../ui/Spinner';
import { mobileSchema } from '../../lib/authSchemas';
import { useAuth } from '../../context/AuthContext';
import { requestWhatsAppLink, verifyWhatsAppLink } from '../../services/authApi';

/**
 * §7's account linking, from inside an account that already exists.
 *
 * The same two steps as `WhatsAppLogin`, against the *link* endpoints rather
 * than the login ones. That distinction matters more than it looks: a code
 * minted here carries the `verify_mobile` purpose, so it cannot be replayed
 * against `/whatsapp/verify-otp` to open a session on somebody else's account.
 * Two flows that look identical on screen, deliberately not interchangeable
 * underneath.
 *
 * Used by the "Login Methods" panel on `/account/security`. Nothing about the
 * provider reaches this component, and nothing about the account reaches the
 * request — the server knows who is asking from the session.
 */
export function WhatsAppVerification({ onDone, onCancel, defaultMobile = '' }) {
  const { refreshUser } = useAuth();

  const [sent, setSent] = useState(null);
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(mobileSchema),
    defaultValues: { mobile: defaultMobile },
  });

  const send = handleSubmit(async (values) => {
    setError('');
    try {
      const payload = await requestWhatsAppLink(values.mobile);
      setMobile(values.mobile);
      setSent(payload);
    } catch (requestError) {
      setError(requestError.message || 'We could not send an OTP on WhatsApp just now.');
    }
  });

  const verify = useCallback(
    async (code) => {
      try {
        const payload = await verifyWhatsAppLink(mobile, code);
        // The identity has a new login method, so the cached profile is stale.
        await refreshUser();
        onDone?.(payload);
        return { ok: true };
      } catch (verifyError) {
        return { ok: false, message: verifyError.message };
      }
    },
    [mobile, refreshUser, onDone],
  );

  const resend = useCallback(async () => {
    try {
      const payload = await requestWhatsAppLink(mobile);
      return { ok: true, ...payload };
    } catch (resendError) {
      return { ok: false, message: resendError.message };
    }
  }, [mobile]);

  if (sent) {
    return (
      <WhatsAppOTPForm
        sent={sent}
        onVerify={verify}
        onResend={resend}
        onBack={() => setSent(null)}
        length={sent.otpLength || 6}
        note={
          sent.delivered === false ? (
            <AuthNotice>
              No WhatsApp provider is configured on this store, so the code was written to the API
              server log instead of being sent.
            </AuthNotice>
          ) : null
        }
      />
    );
  }

  return (
    <form onSubmit={send} noValidate className="space-y-5">
      <AuthField
        label="WhatsApp Number"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="98765 43210"
        prefix="+91"
        maxLength={14}
        error={errors.mobile?.message}
        {...register('mobile')}
      />

      <AuthError>{error}</AuthError>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={isSubmitting} className="btn-primary w-full sm:w-auto">
          {isSubmitting ? (
            <>
              <Spinner size={13} /> Sending
            </>
          ) : (
            <>
              <WhatsAppMark size={15} tone="inherit" /> Send OTP on WhatsApp
            </>
          )}
        </button>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] uppercase tracking-widest2 text-charcoal-muted underline underline-offset-4 hover:text-charcoal"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <p className="text-[11px] leading-relaxed text-charcoal-faint">
        Verifying a number here adds WhatsApp to the ways you can sign in. It does not replace any
        method you already have.
      </p>
    </form>
  );
}
