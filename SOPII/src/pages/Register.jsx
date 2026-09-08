import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout';
import { RegisterForm } from '../components/auth/RegisterForm';
import {
  AuthDivider,
  GoogleLoginButton,
  useGoogleAvailable,
} from '../components/auth/GoogleLoginButton';
import { useToast } from '../context/ToastContext';

/** §3. The form itself is `components/auth/RegisterForm`, so it is reusable. */
export default function Register() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const google = useGoogleAvailable();

  return (
    <AuthLayout
      eyebrow="Account"
      title="Create an account"
      subtitle="Save your favourites, check out faster and follow every order."
      seed={802}
      wide
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-charcoal underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        {google.enabled ? (
          <>
            <GoogleLoginButton next="/account" label="Sign up with Google" />
            <AuthDivider />
          </>
        ) : null}

        <RegisterForm
          onSuccess={(result) => {
            toast('Account created successfully.');
            navigate(result.redirectTo || '/account', { replace: true });
          }}
        />
      </div>
    </AuthLayout>
  );
}
