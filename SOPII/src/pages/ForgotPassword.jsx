import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout';
import { ForgotPasswordForm } from '../components/auth/ForgotPasswordForm';

/** §4, first half. The form is `components/auth/ForgotPasswordForm`. */
export default function ForgotPassword() {
  return (
    <AuthLayout
      eyebrow="Account"
      title="Reset your password"
      subtitle="Enter the email on your account and we will send you a reset link."
      seed={803}
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="text-charcoal underline underline-offset-4">
            Back to log in
          </Link>
        </>
      }
    >
      <ForgotPasswordForm
        footer={
          <Link to="/login" className="btn-outline mt-6">
            Back to Log In
          </Link>
        }
      />
    </AuthLayout>
  );
}
