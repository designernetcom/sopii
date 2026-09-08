import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { AuthLayout } from '../components/auth/AuthLayout';
import { LoginForm } from '../components/auth/LoginForm';
import { OTPLoginForm } from '../components/auth/OTPLoginForm';
import { WhatsAppLogin, useWhatsAppAvailable } from '../components/auth/WhatsAppLogin';
import { WhatsAppMark } from '../components/auth/WhatsAppMark';
import { AuthMethodSelector } from '../components/auth/AuthMethodSelector';
import {
  AuthDivider,
  GoogleLoginButton,
  useGoogleAvailable,
} from '../components/auth/GoogleLoginButton';
import { useToast } from '../context/ToastContext';

/**
 * §1 and §12. One page, four ways in.
 *
 *   ┌──────────────────────────────┐
 *   │   [ Continue with Google ]   │
 *   │              OR              │
 *   │  Email / Username            │
 *   │  Password                    │
 *   │  [ Login ]   Forgot Password?│
 *   │              OR              │
 *   │  [ Login with WhatsApp OTP ] │
 *   │  [ Login with Mobile OTP ]   │
 *   └──────────────────────────────┘
 *
 * The method lives in the URL (`?method=whatsapp`) rather than in component
 * state, so "Login with WhatsApp OTP" is a link somebody can send, the back
 * button works between the forms, and a redirect that wants a particular
 * screen can simply ask for it.
 *
 * Both alternative methods are discovered rather than assumed: Google appears
 * only when the server has credentials, WhatsApp only when the store has a
 * provider configured (§9). A store with neither renders a plain password
 * form with no leftover dividers — which is why the availability hooks live
 * here rather than inside the buttons.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const google = useGoogleAvailable();
  const whatsapp = useWhatsAppAvailable();

  /* Where to return to after signing in — set by ProtectedRoute. */
  const from = location.state?.from || '/account';

  const requested = params.get('method');
  /*
   * An unavailable method in the URL falls back to the password form rather
   * than rendering an empty tab. Somebody following an old "?method=whatsapp"
   * link to a store that has since switched it off should land somewhere they
   * can actually sign in.
   */
  const method =
    requested === 'whatsapp' && whatsapp.enabled
      ? 'whatsapp'
      : requested === 'otp'
        ? 'otp'
        : 'password';

  const [greeting] = useState(() => location.state?.notice || '');

  const onSuccess = useCallback(
    (result) => {
      toast('Welcome back to SOPII');
      /*
       * The server decides the destination (§2: customers to /account, admins
       * to the panel), but a shopper interrupted mid-checkout should land back
       * where they were — so an explicit `from` wins over the default.
       */
      const target = location.state?.from || result.redirectTo || '/account';
      navigate(target, { replace: true });
    },
    [navigate, toast, location.state],
  );

  const switchTo = (next) => {
    const updated = new URLSearchParams(params);
    if (next === 'password') updated.delete('method');
    else updated.set('method', next);
    setParams(updated, { replace: true });
  };

  const methods = useMemo(
    () => ['password', 'otp', ...(whatsapp.enabled ? ['whatsapp'] : [])],
    [whatsapp.enabled],
  );

  const titles = {
    password: 'Welcome Back',
    otp: 'Login with Mobile',
    whatsapp: 'Login with WhatsApp',
  };

  const subtitles = {
    password: 'Log in to track orders, save addresses and keep your wishlist in sync.',
    otp: 'We will send a one-time code to your mobile number.',
    whatsapp: 'We will send a one-time code to your WhatsApp.',
  };

  return (
    <AuthLayout
      eyebrow="Welcome to SOPII"
      title={titles[method]}
      subtitle={subtitles[method]}
      seed={801}
      footer={
        <>
          New to SOPII?{' '}
          <Link to="/register" className="text-charcoal underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        {greeting ? (
          <p
            role="status"
            className="border-l-2 border-plum bg-plum-pale/50 px-3 py-2.5 text-[12px] text-plum-deep"
          >
            {greeting}
          </p>
        ) : null}

        {/* Google sits above the divider — §12's layout, and the order people expect. */}
        {google.enabled ? (
          <>
            <GoogleLoginButton next={from} />
            <AuthDivider />
          </>
        ) : null}

        {method === 'password' ? (
          <>
            <LoginForm onSuccess={onSuccess} />

            {/*
              §1's second "OR": the password form is the default, and the
              phone-based methods are offered beneath it rather than competing
              with it for the top of the page.
            */}
            <AuthDivider />

            <div className="space-y-3">
              {whatsapp.enabled ? (
                <button
                  type="button"
                  onClick={() => switchTo('whatsapp')}
                  className="btn-outline w-full border-beige text-charcoal hover:border-charcoal hover:bg-transparent hover:text-charcoal"
                >
                  <WhatsAppMark size={16} />
                  Login with WhatsApp OTP
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => switchTo('otp')}
                className="btn-outline w-full border-beige text-charcoal hover:border-charcoal hover:bg-transparent hover:text-charcoal"
              >
                <Smartphone size={15} strokeWidth={1.6} aria-hidden="true" />
                Login with Mobile OTP
              </button>
            </div>
          </>
        ) : (
          <>
            {/*
              Once off the password form, the switcher is the quickest way
              back — and the way between the two OTP channels, which is a
              choice somebody makes when one of them has not arrived.
            */}
            <AuthMethodSelector methods={methods} value={method} onChange={switchTo} />

            {method === 'whatsapp' ? (
              <WhatsAppLogin onSuccess={onSuccess} />
            ) : (
              <OTPLoginForm onSuccess={onSuccess} />
            )}
          </>
        )}
      </div>
    </AuthLayout>
  );
}
