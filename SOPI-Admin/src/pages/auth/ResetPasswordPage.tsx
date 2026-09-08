import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { useDocumentTitle } from '@/hooks';
import { AuthApiError, resetPassword } from '@/store/api/authApi';

/**
 * §4's second half, for the admin console.
 *
 * The policy below mirrors `checkPasswordStrength` on the server exactly. It
 * is a courtesy — the server enforces the same five rules and rejects anything
 * that slips past — but a form that lets someone submit a password the API
 * will refuse is a form that wastes their time.
 */
const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[A-Z]/, 'Add an uppercase letter')
      .regex(/[a-z]/, 'Add a lowercase letter')
      .regex(/\d/, 'Add a number')
      .regex(/[^A-Za-z0-9]/, 'Add a special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Both passwords must match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  useDocumentTitle('Set a new password');

  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';

  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await resetPassword(token, values.password, values.confirmPassword);
      setDone(true);
    } catch (error) {
      setFormError(
        error instanceof AuthApiError ? error.message : 'Unable to update the password.',
      );
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10 dark:bg-ink-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
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

        {!token ? (
          <div className="rounded-xl border border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
            <p className="text-sm text-ink-700 dark:text-ink-300">
              This password reset link is missing its token. Please request a new one.
            </p>
            <Button variant="primary" fullWidth className="mt-6" to="/admin/forgot-password">
              Request a new link
            </Button>
          </div>
        ) : done ? (
          <div className="rounded-xl border border-ink-200 bg-white p-6 text-center dark:border-ink-800 dark:bg-ink-900">
            <CheckCircle2
              className="mx-auto h-7 w-7 text-brand-600 dark:text-brand-400"
              strokeWidth={1.5}
            />
            <p role="status" className="mt-4 text-sm leading-relaxed text-ink-700 dark:text-ink-300">
              Password updated successfully. Every device that was using the old password has
              been signed out.
            </p>
            <Button
              variant="primary"
              fullWidth
              className="mt-6"
              onClick={() => navigate('/admin/login', { replace: true })}
            >
              Sign in
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              Choose a new password
            </h1>
            {email ? (
              <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
                Setting a new password for {email}.
              </p>
            ) : null}

            <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
              {/* For the browser's password manager, which needs to know which
                  account is being updated to offer to save the new password. */}
              <input type="text" name="username" value={email} autoComplete="username" readOnly hidden />

              <Field
                label="New password"
                htmlFor="password"
                error={errors.password?.message}
                required
              >
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  invalid={Boolean(errors.password)}
                  {...register('password')}
                />
              </Field>

              <Field
                label="Confirm password"
                htmlFor="confirmPassword"
                error={errors.confirmPassword?.message}
                required
              >
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  invalid={Boolean(errors.confirmPassword)}
                  {...register('confirmPassword')}
                />
              </Field>

              <p className="text-2xs leading-relaxed text-ink-500 dark:text-ink-400">
                At least 8 characters, with an uppercase letter, a lowercase letter, a number and
                a special character.
              </p>

              {formError ? (
                <p
                  role="alert"
                  className="rounded-lg border-l-2 border-danger-500 bg-danger-500/5 px-3 py-2.5 text-xs text-danger-600 dark:text-danger-400"
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
                icon={<KeyRound className="h-4 w-4" />}
              >
                Update password
              </Button>
            </form>

            <p className="mt-8 text-center text-xs text-ink-500 dark:text-ink-400">
              <Link
                to="/admin/login"
                className="font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
