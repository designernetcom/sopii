import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthError, AuthField, AuthNotice } from './AuthField';
import { WhatsAppOTPForm } from './WhatsAppOTPForm';
import { WhatsAppMark } from './WhatsAppMark';
import { Spinner } from '../ui/Spinner';
import { mobileSchema } from '../../lib/authSchemas';
import { useAuth } from '../../context/AuthContext';
import { fetchWhatsAppStatus } from '../../services/authApi';

/**
 * §2's WhatsApp login, both steps.
 *
 *   Enter Mobile Number → Send OTP via WhatsApp → Enter 6-digit OTP
 *   → Verify → Login / Create Account → Redirect to Account
 *
 * The two steps live in one component because they share the number. Hoisting
 * that into the page would mean every caller reimplements the same handoff,
 * and this flow is rendered on `/login`, on `/login/whatsapp`, and inside a
 * modal on checkout without any of them wanting to own it.
 *
 * What is *not* here: any knowledge of the provider. The browser never learns
 * the access token, the phone number ID or the template — those are the
 * server's (§4), and the only thing this component can discover is whether the
 * store has WhatsApp switched on at all.
 */
export function WhatsAppLogin({ onSuccess, autoFocus = true }) {
  const { requestWhatsAppOtp, resendWhatsAppOtp, loginWithWhatsApp } = useAuth();

  const [sent, setSent] = useState(null); // the metadata the OTP screen renders
  const [mobile, setMobile] = useState('');
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(mobileSchema), defaultValues: { mobile: '' } });

  const send = handleSubmit(async (values) => {
    setFormError('');
    const result = await requestWhatsAppOtp(values.mobile);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setMobile(values.mobile);
    setSent(result);
  });

  /*
   * Stable across renders: `WhatsAppOTPForm` calls these from inside effects
   * and callbacks that watch the completed code, and a new function identity
   * each render would re-fire them.
   */
  const verify = useCallback(
    async (code) => {
      const result = await loginWithWhatsApp(mobile, code);
      if (result.ok) onSuccess?.(result);
      return result;
    },
    [loginWithWhatsApp, mobile, onSuccess],
  );

  const resend = useCallback(() => resendWhatsAppOtp(mobile), [resendWhatsAppOtp, mobile]);

  if (sent) {
    return (
      <WhatsAppOTPForm
        sent={sent}
        onVerify={verify}
        onResend={resend}
        onBack={() => {
          setSent(null);
          setFormError('');
        }}
        length={sent.otpLength || 6}
        note={
          /*
           * Rendered only when the API reports that nothing accepted the
           * message — the development case, where no provider is configured.
           * It says where to look for the code, never what the code is.
           */
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
        label="Mobile Number"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="98765 43210"
        prefix="+91"
        maxLength={14}
        autoFocus={autoFocus}
        error={errors.mobile?.message}
        {...register('mobile')}
      />

      <AuthError>{formError}</AuthError>

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? (
          <>
            <Spinner size={14} /> Sending OTP
          </>
        ) : (
          <>
            <WhatsAppMark size={16} tone="inherit" /> Send OTP on WhatsApp
          </>
        )}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-charcoal-faint">
        We will send a 6-digit code to this number on WhatsApp. Make sure it is the number your
        WhatsApp account uses.
      </p>
    </form>
  );
}

/* -------------------------------- discovery -------------------------------- */

/**
 * Whether the store has WhatsApp login configured.
 *
 * A hook rather than state inside a button, so a page can collapse the whole
 * option — tab, divider and all — when it is off. A store that has not set up
 * a provider should show no trace of the method rather than a button that
 * leads to "not available right now".
 *
 * An unreachable API counts as unavailable: offering a route that cannot work
 * is worse than offering one fewer.
 */
export function useWhatsAppAvailable() {
  const [status, setStatus] = useState({ checked: false, enabled: false, otpLength: 6 });

  useEffect(() => {
    const controller = new AbortController();

    fetchWhatsAppStatus(null, { signal: controller.signal })
      .then((payload) =>
        setStatus({
          checked: true,
          enabled: Boolean(payload?.enabled),
          otpLength: payload?.otpLength || 6,
        }),
      )
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setStatus({ checked: true, enabled: false, otpLength: 6 });
      });

    return () => controller.abort();
  }, []);

  return status;
}
