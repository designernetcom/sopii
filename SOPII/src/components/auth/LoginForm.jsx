import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { AuthCheckbox, AuthError, AuthField } from './AuthField';
import { PasswordInput } from './PasswordInput';
import { Spinner } from '../ui/Spinner';
import { loginSchema } from '../../lib/authSchemas';
import { useAuth } from '../../context/AuthContext';

/**
 * §2's password form.
 *
 * The single "Email / Username" field is why validation here is loose: the
 * server decides what the value matches (an address, a handle, a mobile
 * number), so the schema only checks that something was typed. Rejecting a
 * valid username in the browser because it is not an email address would be a
 * bug nobody could work around.
 */
export function LoginForm({ onSuccess, defaultIdentifier = '' }) {
  const { login } = useAuth();
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: defaultIdentifier, password: '', remember: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    const result = await login({ identifier: values.identifier, password: values.password });

    if (!result.ok) {
      // §27: whatever the server said, verbatim. It has been written to reveal
      // nothing about whether the account exists, and paraphrasing it here is
      // how that guarantee gets lost.
      setFormError(result.message);
      return;
    }
    onSuccess?.(result);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <AuthField
        label="Email / Username"
        type="text"
        autoComplete="username"
        placeholder="you@example.com"
        error={errors.identifier?.message}
        {...register('identifier')}
      />

      <PasswordInput
        label="Password"
        autoComplete="current-password"
        placeholder="••••••••"
        error={errors.password?.message}
        hint={
          <Link to="/forgot-password" className="text-[11px] text-clay underline underline-offset-4">
            Forgot Password?
          </Link>
        }
        {...register('password')}
      />

      <AuthCheckbox label="Keep me signed in on this device" {...register('remember')} />

      <AuthError>{formError}</AuthError>

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? (
          <>
            <Spinner size={14} /> Logging in
          </>
        ) : (
          <>
            <LogIn size={15} strokeWidth={1.6} /> Login
          </>
        )}
      </button>
    </form>
  );
}
