import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { AuthError } from './AuthField';
import { PasswordInput, PasswordStrength } from './PasswordInput';
import { Spinner } from '../ui/Spinner';
import { resetPasswordSchema } from '../../lib/authSchemas';
import { useAuth } from '../../context/AuthContext';

/**
 * §4, second half.
 *
 * Takes the token as a prop rather than reading the URL itself, so the same
 * form works for a reset link, an admin-issued one, or a test.
 *
 * `onSuccess` is called rather than a session being adopted: §4's flow ends at
 * "Login", and signing in whoever holds the link would undo half the point of
 * the reset having revoked every existing session.
 */
export function ResetPasswordForm({ token, email = '', onSuccess }) {
  const { resetPassword } = useAuth();
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const password = watch('password');

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    const result = await resetPassword({
      token,
      password: values.password,
      confirmPassword: values.confirmPassword,
    });

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    onSuccess?.(result);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/*
        Hidden, and only for the browser's password manager: it needs to know
        which account is being updated to offer to save the new password.
      */}
      <input type="text" name="username" value={email} autoComplete="username" readOnly hidden />

      <div>
        <PasswordInput
          label="New Password"
          autoComplete="new-password"
          placeholder="Create a strong password"
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordStrength value={password} />
      </div>

      <PasswordInput
        label="Confirm Password"
        autoComplete="new-password"
        placeholder="Type it once more"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <AuthError>{formError}</AuthError>

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? (
          <>
            <Spinner size={14} /> Updating
          </>
        ) : (
          <>
            <KeyRound size={15} strokeWidth={1.6} /> Update Password
          </>
        )}
      </button>
    </form>
  );
}
