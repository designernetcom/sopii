import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, KeyRound, LogIn, ShieldCheck, Smartphone, Sparkles, TrendingUp } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { useToast } from '@/components/common/Toast';
import { useAppDispatch } from '@/store/hooks';
import { credentialsReceived } from '@/store/slices/authSlice';
import { useDocumentTitle } from '@/hooks';
import { cn } from '@/utils/cn';
import {
  AuthApiError,
  fetchAuthConfig,
  googleAuthorizeUrl,
  loginWithPassword,
  requestAdminOtp,
  verifyAdminOtp,
  type AuthConfig,
  type AuthSession,
  type OtpRequestResult,
} from '@/store/api/authApi';
import { OtpFields } from './OtpFields';

/**
 * §11's admin sign-in.
 *
 * Its own screen and its own surface, but the *same* authentication module the
 * shop front uses — one identity model, one set of rules. What separates them
 * is the role check the server applies before opening an admin session: a
 * customer who finds this page and types correct customer credentials is
 * refused here, not merely redirected afterwards.
 *
 * Google and mobile OTP appear only when the operator has switched them on
 * (`ADMIN_GOOGLE_ENABLED`, `ADMIN_OTP_ENABLED`), which is why the form asks
 * the API what it offers before rendering the alternatives.
 */
const schema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

const HIGHLIGHTS = [
  {
    icon: TrendingUp,
    title: 'Live commerce analytics',
    body: 'Revenue, orders and AOV across every window.',
  },
  {
    icon: Sparkles,
    title: 'Catalogue built for fashion',
    body: 'Variants, fabrics, collections and merchandising.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based access',
    body: 'Five roles with a granular permission matrix.',
  },
];

export default function LoginPage() {
  useDocumentTitle('Sign in');

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [method, setMethod] = useState<'password' | 'otp'>('password');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [otpSent, setOtpSent] = useState<OtpRequestResult | null>(null);
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAuthConfig()
      .then(setConfig)
      // An unreachable API means no alternatives are offered, which is the
      // safe presentation — the password form still works once it recovers.
      .catch(() => setConfig(null));
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '' },
  });

  const adopt = useCallback(
    (session: AuthSession) => {
      dispatch(
        credentialsReceived({
          token: session.accessToken,
          user: session.user,
          csrfToken: session.csrfToken,
        }),
      );
      toast.success(`Welcome back, ${session.user.name.split(' ')[0]}`);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? session.redirectTo ?? '/admin/dashboard', { replace: true });
    },
    [dispatch, toast, location.state, navigate],
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      adopt(await loginWithPassword(values.identifier, values.password));
    } catch (error) {
      // §27: the server's message, verbatim. It reveals nothing about whether
      // the account exists, and rewording it here is how that gets lost.
      setFormError(
        error instanceof AuthApiError ? error.message : 'Unable to sign in. Please try again.',
      );
    }
  });

  const sendOtp = async (value: string) => {
    setFormError('');
    setBusy(true);
    try {
      const result = await requestAdminOtp(value);
      setMobile(value);
      setOtpSent(result);
      // Spread first: the API's own `ok` is about delivery, and the caller's
      // contract is that `ok` means the request itself succeeded.
      return { ...result, ok: true as const };
    } catch (error) {
      const message =
        error instanceof AuthApiError ? error.message : 'Unable to send an OTP right now.';
      setFormError(message);
      return { ok: false as const, message };
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (code: string) => {
    try {
      adopt(await verifyAdminOtp(mobile, code));
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        message:
          error instanceof AuthApiError ? error.message : 'OTP could not be verified.',
      };
    }
  };

  const otpEnabled = Boolean(config?.admin.otp);
  const googleEnabled = Boolean(config?.admin.google);

  return (
    <div className="flex min-h-screen bg-ink-50 dark:bg-ink-950">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-700 p-12 text-white lg:flex">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.22), transparent 40%)',
          }}
          aria-hidden
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg font-bold backdrop-blur">
              S
            </span>
            <div>
              <p className="text-lg font-semibold tracking-tight">SOPII</p>
              <p className="text-xs text-white/70">Admin Console</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Run the whole store from one place.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            Catalogue, inventory, orders, customers and storefront merchandising — built for the way
            a premium fashion label actually operates.
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
                  <item.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="block text-xs text-white/70">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-2xs text-white/60">
          © {new Date().getFullYear()} SOPII Handcrafted Retail Pvt. Ltd.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center px-4 py-10 sm:px-8 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
              S
            </span>
            <div>
              <p className="text-base font-semibold tracking-tight text-ink-900 dark:text-ink-50">
                SOPII
              </p>
              <p className="text-xs text-ink-500 dark:text-ink-400">Admin Console</p>
            </div>
          </div>

          <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
            SOPII Admin
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            Sign in
          </h1>
          <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
            Use your SOPII admin account to continue.
          </p>

          {googleEnabled ? (
            <>
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                className="mt-8"
                onClick={() => window.location.assign(googleAuthorizeUrl('/admin/dashboard'))}
              >
                <GoogleMark /> Continue with Google
              </Button>
              <Divider />
            </>
          ) : null}

          {/* Only rendered when the operator enabled admin OTP (§11). */}
          {otpEnabled ? (
            <div
              role="tablist"
              aria-label="Sign-in method"
              className={cn(
                'grid grid-cols-2 overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700',
                googleEnabled ? 'mt-6' : 'mt-8',
              )}
            >
              {(
                [
                  { id: 'password', label: 'Password', icon: KeyRound },
                  { id: 'otp', label: 'Mobile OTP', icon: Smartphone },
                ] as const
              ).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={method === entry.id}
                  onClick={() => {
                    setMethod(entry.id);
                    setFormError('');
                    setOtpSent(null);
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium transition-colors',
                    method === entry.id
                      ? 'bg-brand-600 text-white'
                      : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
                  )}
                >
                  <entry.icon className="h-3.5 w-3.5" />
                  {entry.label}
                </button>
              ))}
            </div>
          ) : null}

          {method === 'otp' && otpEnabled ? (
            <div className="mt-8">
              <OtpFields
                sent={otpSent}
                busy={busy}
                error={formError}
                onSend={sendOtp}
                onVerify={verifyOtp}
                onBack={() => setOtpSent(null)}
              />
            </div>
          ) : (
            <form onSubmit={onSubmit} className={cn('space-y-4', otpEnabled ? 'mt-6' : 'mt-8')} noValidate>
              <Field
                label="Email / Username"
                htmlFor="identifier"
                error={errors.identifier?.message}
                required
              >
                <Input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="you@sopii.in"
                  invalid={Boolean(errors.identifier)}
                  {...register('identifier')}
                />
              </Field>

              <Field label="Password" htmlFor="password" error={errors.password?.message} required>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pr-10"
                    invalid={Boolean(errors.password)}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              <div className="flex items-center justify-end">
                <Link
                  to="/admin/forgot-password"
                  className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Forgot password?
                </Link>
              </div>

              {formError ? (
                <p
                  role="alert"
                  className="rounded-lg border-l-2 border-danger-500 bg-danger-500/5 px-3 py-2.5 text-xs leading-relaxed text-danger-600 dark:text-danger-400"
                >
                  {formError}
                </p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={isSubmitting}
                icon={<LogIn className="h-4 w-4" />}
              >
                Login
              </Button>
            </form>
          )}

          <p className="mt-8 border-t border-ink-200 pt-6 text-center text-2xs leading-relaxed text-ink-500 dark:border-ink-800 dark:text-ink-400">
            This console is for SOPII staff. Customer accounts cannot sign in here — shop at{' '}
            <span className="font-medium text-ink-700 dark:text-ink-300">sopii.in</span> instead.
          </p>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div className="mt-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
      <span className="text-2xs uppercase tracking-widest text-ink-400">or</span>
      <span className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
    </div>
  );
}

/* Inlined so the button never depends on a third-party asset loading, and so
   the four brand colours are exactly what Google's guidelines require. */
function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}
