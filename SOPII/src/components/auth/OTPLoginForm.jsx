import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send } from 'lucide-react';
import { AuthError, AuthField, AuthNotice } from './AuthField';
import { OTPVerification } from './OTPVerification';
import { Spinner } from '../ui/Spinner';
import { mobileSchema } from '../../lib/authSchemas';
import { useAuth } from '../../context/AuthContext';

/**
 * §5's two-step mobile login: number, then code.
 *
 * Both steps live in one component because they share the number — hoisting
 * that into the page would mean every caller reimplements the same handoff,
 * and this form is used on `/login` and `/login/otp` alike.
 */
export function OTPLoginForm({ onSuccess }) {
  const { requestOtp, loginWithOTP } = useAuth();

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
    const result = await requestOtp(values.mobile);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setMobile(values.mobile);
    setSent(result);
  });

  /*
   * Stable across renders: `OTPVerification` calls this from inside an effect
   * that watches the completed code, and a new function identity each render
   * would re-fire it.
   */
  const verify = useCallback(
    async (code) => {
      const result = await loginWithOTP(mobile, code);
      if (result.ok) onSuccess?.(result);
      return result;
    },
    [loginWithOTP, mobile, onSuccess],
  );

  const resend = useCallback(async () => {
    const result = await requestOtp(mobile);
    if (result.ok) setSent(result);
    return result;
  }, [requestOtp, mobile]);

  if (sent) {
    return (
      <OTPVerification
        mobileMasked={sent.mobileFormatted || sent.mobileMasked}
        onVerify={verify}
        onResend={resend}
        onBack={() => {
          setSent(null);
          setFormError('');
        }}
        resendAfterSeconds={sent.resendAfterSeconds}
        expiresInSeconds={sent.expiresInSeconds}
        length={sent.otpLength || 6}
        note={
          /*
           * Only rendered when the API reports no SMS provider — the dev case.
           * It says where to look for the code, never what the code is.
           */
          sent.delivered === false ? (
            <AuthNotice>
              No SMS provider is configured on this store, so the code was written to the API
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
            <Send size={15} strokeWidth={1.6} /> Send OTP
          </>
        )}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-charcoal-faint">
        We will text you a 6-digit code. Standard message rates may apply.
      </p>
    </form>
  );
}
