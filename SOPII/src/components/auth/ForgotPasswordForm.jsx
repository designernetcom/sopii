import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { AuthError, AuthField } from './AuthField';
import { Spinner } from '../ui/Spinner';
import { forgotPasswordSchema } from '../../lib/authSchemas';
import { useAuth } from '../../context/AuthContext';

/**
 * §4, first half.
 *
 * The confirmation below is shown for *any* accepted address, known or not,
 * and says exactly what §4 asks it to. That is the whole point of this form: a
 * password-reset flow that behaves differently for a registered address is a
 * free membership check for anyone holding a list of emails.
 *
 * There is deliberately no "we could not find that account" branch, and no way
 * to add one without breaking that guarantee.
 */
export function ForgotPasswordForm({ footer }) {
  const { requestPasswordReset } = useAuth();
  const [sentTo, setSentTo] = useState('');
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    const result = await requestPasswordReset(values.email);

    if (!result.ok) {
      // Only a malformed address or an unreachable API reaches here — never
      // "no such account", which the server answers as a success.
      setFormError(result.message);
      return;
    }
    setSentTo(values.email);
  });

  if (sentTo) {
    return (
      <div className="border border-beige bg-sand/50 p-6 text-center">
        <MailCheck size={26} className="mx-auto text-brand-soft" strokeWidth={1.4} aria-hidden="true" />
        <p role="status" className="mt-4 text-sm leading-relaxed text-charcoal-soft">
          If an account exists for <span className="font-medium text-charcoal">{sentTo}</span>,
          password reset instructions have been sent.
        </p>
        <p className="mt-3 text-[11px] text-charcoal-faint">
          The link is good for one hour. Check your spam folder if it has not arrived in a few
          minutes.
        </p>
        {footer}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <AuthField
        label="Email address"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register('email')}
      />

      <AuthError>{formError}</AuthError>

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? (
          <>
            <Spinner size={14} /> Sending
          </>
        ) : (
          'Send Reset Link'
        )}
      </button>
    </form>
  );
}
