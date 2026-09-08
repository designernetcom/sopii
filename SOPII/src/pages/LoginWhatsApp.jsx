import { useCallback } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout';
import { WhatsAppLogin, useWhatsAppAvailable } from '../components/auth/WhatsAppLogin';
import { AuthSkeleton } from '../components/ui/PageSkeletons';
import { useToast } from '../context/ToastContext';

/**
 * `/login/whatsapp`.
 *
 * The same form `/login?method=whatsapp` renders. This route exists because
 * "sign in with WhatsApp" deserves an address that can be sent on its own —
 * put in an order-status message, or in the WhatsApp thread the shopper is
 * already reading — rather than a query parameter people have to know about.
 *
 * A store with no WhatsApp provider redirects to the ordinary login page
 * instead of rendering a form whose submit button can only fail (§9's
 * enable/disable, honoured on the client as well as the server).
 */
export default function LoginWhatsApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const whatsapp = useWhatsAppAvailable();

  const onSuccess = useCallback(
    (result) => {
      toast('Welcome back to SOPII');
      navigate(location.state?.from || result.redirectTo || '/account', { replace: true });
    },
    [navigate, toast, location.state],
  );

  // Waiting rather than guessing: rendering the form and then yanking it away
  // a moment later is worse than a brief loader.
  if (!whatsapp.checked) return <AuthSkeleton label="Loading sign-in options" />;

  if (!whatsapp.enabled) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          ...location.state,
          notice: 'WhatsApp login is not available on this store. Please use another method.',
        }}
      />
    );
  }

  return (
    <AuthLayout
      eyebrow="Welcome to SOPII"
      title="Login with WhatsApp"
      subtitle="We will send a one-time code to your WhatsApp."
      seed={806}
      footer={
        <>
          Prefer a password?{' '}
          <Link to="/login" className="text-charcoal underline underline-offset-4">
            Log in with email
          </Link>
        </>
      }
    >
      <WhatsAppLogin onSuccess={onSuccess} />
    </AuthLayout>
  );
}
