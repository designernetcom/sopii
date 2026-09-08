import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout';
import { OTPLoginForm } from '../components/auth/OTPLoginForm';
import { useToast } from '../context/ToastContext';

/**
 * §20's `/login/otp`.
 *
 * The same form `/login?method=otp` renders — this route exists because §20
 * asks for the address, and because "sign in with your phone" deserves a link
 * that can be sent on its own rather than a query parameter people have to
 * know about.
 */
export default function LoginOtp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const onSuccess = useCallback(
    (result) => {
      toast('Welcome back to SOPII');
      navigate(location.state?.from || result.redirectTo || '/account', { replace: true });
    },
    [navigate, toast, location.state],
  );

  return (
    <AuthLayout
      eyebrow="Welcome to SOPII"
      title="Login with Mobile"
      subtitle="We will send a one-time code to your mobile number."
      seed={804}
      footer={
        <>
          Prefer a password?{' '}
          <Link to="/login" className="text-charcoal underline underline-offset-4">
            Log in with email
          </Link>
        </>
      }
    >
      <OTPLoginForm onSuccess={onSuccess} />
    </AuthLayout>
  );
}
