import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/common/Button';

import { useAppDispatch } from '@/store/hooks';
import { credentialsReceived } from '@/store/slices/authSlice';
import { useToast } from '@/components/common/Toast';
import { refreshSession } from '@/store/api/authApi';

/**
 * Where Google returns the browser after an admin sign-in (§7).
 *
 * The API's callback has already set the HttpOnly refresh cookie; this page
 * trades it for an access token and moves on. No token ever appears in the
 * URL — it would end up in browser history and in the Referer header of the
 * next request.
 */
const REASONS: Record<string, string> = {
  cancelled: 'You cancelled the Google sign-in.',
  state_mismatch: 'That sign-in could not be verified. Please try again.',
  expired: 'That sign-in took too long. Please try again.',
  verification_failed: 'We could not verify your Google account. Please try again.',
  no_code: 'Google did not complete the sign-in. Please try again.',
  no_account: 'No SOPII admin account matches that Google address.',
  no_admin_access: 'That account does not have access to the SOPII admin panel.',
  account_unavailable: 'This account is currently unavailable.',
};

export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const toast = useToast();

  const [error, setError] = useState('');

  const status = params.get('status');
  const next = params.get('next') ?? '/admin/dashboard';

  /*
   * StrictMode mounts effects twice in development. A second `/auth/refresh`
   * would present a token the first has already rotated away, which the server
   * correctly reads as replay — and kills the session that was just created.
   */
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (status === 'error') {
      setError(REASONS[params.get('reason') ?? ''] ?? 'Unable to complete sign-in.');
      return;
    }

    refreshSession()
      .then((session) => {
        dispatch(
          credentialsReceived({
            token: session.accessToken,
            user: session.user,
            csrfToken: session.csrfToken,
          }),
        );
        toast.success(`Welcome back, ${session.user.name.split(' ')[0]}`);
        navigate(next, { replace: true });
      })
      .catch(() => setError('Unable to complete sign-in. Please try again.'));
  }, [status, next, params, dispatch, navigate, toast]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 dark:bg-ink-950">
        <div className="w-full max-w-sm rounded-xl border border-ink-200 bg-white p-6 text-center dark:border-ink-800 dark:bg-ink-900">
          <AlertCircle
            className="mx-auto h-7 w-7 text-danger-500"
            strokeWidth={1.5}
            aria-hidden
          />
          <p role="alert" className="mt-4 text-sm leading-relaxed text-ink-700 dark:text-ink-300">
            {error}
          </p>
          <Button variant="primary" fullWidth className="mt-6" to="/admin/login">
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50 dark:bg-ink-950"
      aria-busy="true"
    >
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600 dark:border-ink-700 dark:border-t-brand-500" />
      <p className="text-xs uppercase tracking-widest text-ink-500 dark:text-ink-400">
        Finishing your sign-in
      </p>
    </div>
  );
}
