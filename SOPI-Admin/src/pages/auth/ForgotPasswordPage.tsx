import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck, Send } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { useDocumentTitle } from '@/hooks';
import { AuthApiError, requestPasswordReset } from '@/store/api/authApi';

/**
 * §20's `/admin/forgot-password`.
 *
 * The same endpoint the shop front uses, and the same constant answer: the
 * response does not say whether the address belongs to an account (§4). For an
 * admin console that matters more than it does for a shop — the set of staff
 * addresses is a much smaller and more valuable list to confirm.
 */
const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  useDocumentTitle('Reset password');

  const [sentTo, setSentTo] = useState('');
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await requestPasswordReset(values.email);
      setSentTo(values.email);
    } catch (error) {
      // Only a malformed address or an unreachable API reaches here — never
      // "no such account", which the server answers as a success.
      setFormError(
        error instanceof AuthApiError ? error.message : 'Unable to send the email. Try again.',
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

        {sentTo ? (
          <div className="rounded-xl border border-ink-200 bg-white p-6 text-center dark:border-ink-800 dark:bg-ink-900">
            <MailCheck className="mx-auto h-7 w-7 text-brand-600 dark:text-brand-400" strokeWidth={1.5} />
            <p
              role="status"
              className="mt-4 text-sm leading-relaxed text-ink-700 dark:text-ink-300"
            >
              If an account exists for{' '}
              <span className="font-medium text-ink-900 dark:text-ink-50">{sentTo}</span>, password
              reset instructions have been sent.
            </p>
            <p className="mt-3 text-2xs text-ink-500 dark:text-ink-400">
              The link is valid for one hour.
            </p>
            <Button variant="secondary" fullWidth className="mt-6" to="/admin/login">
              Back to sign in
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              Reset your password
            </h1>
            <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
              Enter your admin email and we will send you a reset link.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
              <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@sopii.in"
                  invalid={Boolean(errors.email)}
                  {...register('email')}
                />
              </Field>

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
                icon={<Send className="h-4 w-4" />}
              >
                Send reset link
              </Button>
            </form>

            <p className="mt-8 text-center text-xs text-ink-500 dark:text-ink-400">
              Remembered it?{' '}
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
