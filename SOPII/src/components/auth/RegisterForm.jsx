import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { AuthCheckbox, AuthError, AuthField } from './AuthField';
import { PasswordInput, PasswordStrength } from './PasswordInput';
import { Spinner } from '../ui/Spinner';
import { registerSchema } from '../../lib/authSchemas';
import { useAuth } from '../../context/AuthContext';

/**
 * §3's registration form.
 *
 * A component rather than page markup so the same form can be dropped into a
 * checkout step or a modal — the only thing that changes is what `onSuccess`
 * does with the session it is handed.
 *
 * There is no role field, and no way to add one: the API creates a `customer`
 * and ignores anything else the payload contains (§10).
 */
export function RegisterForm({ onSuccess }) {
  const { register: createAccount } = useAuth();
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    // On blur rather than on every keystroke: telling someone their email is
    // invalid while they are still typing the domain is noise.
    mode: 'onBlur',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      mobile: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
      acceptsMarketing: false,
    },
  });

  const password = watch('password');

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    const result = await createAccount(values);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    onSuccess?.(result);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField
          label="First Name *"
          autoComplete="given-name"
          placeholder="Asha"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <AuthField
          label="Last Name"
          autoComplete="family-name"
          placeholder="Menon"
          error={errors.lastName?.message}
          {...register('lastName')}
        />
      </div>

      <AuthField
        label="Email *"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register('email')}
      />

      <AuthField
        label="Mobile Number *"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="98765 43210"
        prefix="+91"
        maxLength={14}
        error={errors.mobile?.message}
        {...register('mobile')}
      />

      <div>
        <PasswordInput
          label="Password *"
          autoComplete="new-password"
          placeholder="Create a strong password"
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordStrength value={password} />
      </div>

      <PasswordInput
        label="Confirm Password *"
        autoComplete="new-password"
        placeholder="Type it once more"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <div className="space-y-3 border-t border-beige pt-5">
        <AuthCheckbox
          label={
            <>
              I accept the{' '}
              <Link to="/pages/terms" className="text-charcoal underline underline-offset-2">
                Terms &amp; Conditions
              </Link>{' '}
              and{' '}
              <Link
                to="/pages/privacy-policy"
                className="text-charcoal underline underline-offset-2"
              >
                Privacy Policy
              </Link>
            </>
          }
          error={errors.acceptTerms?.message}
          {...register('acceptTerms')}
        />
        <AuthCheckbox
          label="Send me new arrivals, offers and styling notes"
          {...register('acceptsMarketing')}
        />
      </div>

      <AuthError>{formError}</AuthError>

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? (
          <>
            <Spinner size={14} /> Creating account
          </>
        ) : (
          <>
            <UserPlus size={15} strokeWidth={1.6} /> Create Account
          </>
        )}
      </button>
    </form>
  );
}
