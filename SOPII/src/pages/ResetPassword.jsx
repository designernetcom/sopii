import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '../components/auth/AuthLayout';
import { AuthError } from '../components/auth/AuthField';
import { ResetPasswordForm } from '../components/auth/ResetPasswordForm';
import { useToast } from '../context/ToastContext';

/**
 * §4, second half.
 *
 * The token arrives in the query string because it arrived in an email, which
 * is the one place a link can carry it. It is used once and the server retires
 * it; this page never stores it.
 *
 * On success the person is sent to `/login` rather than being signed in — the
 * reset also revoked every existing session, so proving the new password is
 * the honest next step.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const { toast } = useToast();
  const navigate = useNavigate();

  const token = params.get('token') || '';
  const email = params.get('email') || '';

  const [done, setDone] = useState(false);

  /* A link that has lost its token cannot be completed — say so plainly rather
     than showing a form that will always fail. */
  if (!token) {
    return (
      <AuthLayout eyebrow="Account" title="That link is incomplete" seed={803}>
        <div className="space-y-5">
          <AuthError>
            This password reset link is missing its token. Please request a new one.
          </AuthError>
          <Link to="/forgot-password" className="btn-primary w-full">
            Request a New Link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout eyebrow="Account" title="Password updated" seed={803}>
        <div className="border border-beige bg-sand/50 p-6 text-center">
          <CheckCircle2
            size={26}
            className="mx-auto text-plum"
            strokeWidth={1.4}
            aria-hidden="true"
          />
          <p role="status" className="mt-4 text-sm leading-relaxed text-charcoal-soft">
            Your password has been updated. For your security we also signed out every device
            that was using the old one.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="btn-primary mt-6 w-full"
          >
            Log In
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Account"
      title="Choose a new password"
      subtitle={
        email
          ? `Setting a new password for ${email}.`
          : 'Pick something you have not used on another site.'
      }
      seed={803}
      footer={
        <>
          Changed your mind?{' '}
          <Link to="/login" className="text-charcoal underline underline-offset-4">
            Back to log in
          </Link>
        </>
      }
    >
      <ResetPasswordForm
        token={token}
        email={email}
        onSuccess={() => {
          setDone(true);
          toast('Password updated successfully.');
        }}
      />
    </AuthLayout>
  );
}
