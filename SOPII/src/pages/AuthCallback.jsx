import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { AuthLayout } from '../components/auth/AuthLayout';
import { AuthSkeleton } from '../components/ui/PageSkeletons';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/**
 * Where Google sends the browser back to (§7).
 *
 * There is no token in this URL, and that is the design. The API's callback
 * already set the HttpOnly refresh cookie; all this page does is trade it for
 * an access token and move on. A token in a query string would end up in
 * history, in the Referer header of the next request, and in any analytics
 * script watching the page.
 */
const REASONS = {
  cancelled: 'You cancelled the Google sign-in. Nothing has changed.',
  state_mismatch: 'That sign-in could not be verified. Please try again.',
  expired: 'That sign-in took too long. Please try again.',
  verification_failed: 'We could not verify your Google account. Please try again.',
  no_code: 'Google did not complete the sign-in. Please try again.',
  no_account: 'No SOPII account matches that Google address. Please register first.',
  no_admin_access: 'That account does not have access to the SOPII admin panel.',
  account_unavailable: 'This account is currently unavailable.',
  google_already_linked: 'That Google account is already connected to a different SOPII account.',
  account_missing: 'Unable to complete login. Please try again.',
};

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { completeGoogleLogin, refreshUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [error, setError] = useState('');

  const status = params.get('status');
  const next = params.get('next') || '/account';

  /*
   * React 18's StrictMode mounts effects twice in development. Without this
   * guard the second run fires a second `/auth/refresh` with a token the first
   * has already rotated away — which the server correctly reads as replay and
   * kills the session that was just created.
   */
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (status === 'error') {
      setError(REASONS[params.get('reason')] || 'Unable to complete login. Please try again.');
      return;
    }

    if (status === 'linked') {
      refreshUser().then(() => {
        toast('Google account connected successfully.');
        navigate(next, { replace: true });
      });
      return;
    }

    completeGoogleLogin().then((result) => {
      if (!result.ok) {
        setError(result.message || 'Unable to complete login. Please try again.');
        return;
      }
      toast('Welcome back to SOPII');
      navigate(next || result.redirectTo || '/account', { replace: true });
    });
  }, [status, next, params, completeGoogleLogin, refreshUser, navigate, toast]);

  if (error) {
    return (
      <AuthLayout eyebrow="Account" title="Sign-in unsuccessful" seed={801}>
        <div className="space-y-5">
          <p
            role="alert"
            className="flex gap-2.5 border-l-2 border-sale bg-sale/5 px-3 py-3 text-[12px] leading-relaxed text-sale"
          >
            <AlertCircle size={15} className="mt-px shrink-0" strokeWidth={1.6} />
            {error}
          </p>
          <Link to="/login" className="btn-primary w-full">
            Back to Log In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  /* Shaped like the screen Google just sent them away from, so the return
     trip lands somewhere familiar rather than on a bare spinner. */
  return <AuthSkeleton label="Finishing your sign-in" />;
}
