import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, KeyRound, Smartphone } from 'lucide-react';
import { AuthError, AuthField, AuthNotice } from './AuthField';
import { PasswordInput, PasswordStrength } from './PasswordInput';
import { OTPVerification } from './OTPVerification';
import { WhatsAppVerification } from './WhatsAppVerification';
import { WhatsAppMark } from './WhatsAppMark';
import { useWhatsAppAvailable } from './WhatsAppLogin';
import { Spinner } from '../ui/Spinner';
import { useGoogleAvailable } from './GoogleLoginButton';
import { changePasswordSchema, mobileSchema, setPasswordSchema } from '../../lib/authSchemas';
import {
  disconnectGoogle,
  fetchLoginMethods,
  removeMobile,
  removeWhatsAppLink,
  requestMobileVerification,
  startGoogleLink,
  verifyMobile,
} from '../../services/authApi';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';

/**
 * §26's "Login Methods" panel.
 *
 * `canRemove` comes from the server on every method, and the buttons below
 * simply honour it. The rule — never remove the last way in — is enforced by
 * the API whatever this component renders; computing it here as well would be
 * two implementations of one invariant waiting to disagree.
 */
export function LoginMethods() {
  const { refreshUser } = useAuth();
  const google = useGoogleAvailable();
  const whatsapp = useWhatsAppAvailable();

  const [methods, setMethods] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async (signal) => {
    try {
      setMethods(await fetchLoginMethods({ signal }));
    } catch (loadError) {
      if (loadError?.name === 'AbortError') return;
      setError(loadError.message || 'We could not load your login methods.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const connectGoogle = async () => {
    setBusy('google');
    setError('');
    try {
      // The server answers with the URL, because starting the flow needs a
      // bearer token that a plain link could not carry.
      const { url } = await startGoogleLink('/account/security');
      window.location.assign(url);
    } catch (linkError) {
      setError(linkError.message || 'We could not start the Google connection.');
      setBusy('');
    }
  };

  const removeGoogle = async () => {
    setBusy('google');
    setError('');
    setNotice('');
    try {
      const payload = await disconnectGoogle();
      setNotice(payload.message);
      await Promise.all([load(), refreshUser()]);
    } catch (unlinkError) {
      setError(unlinkError.message || 'We could not disconnect Google.');
    } finally {
      setBusy('');
    }
  };

  const dropWhatsApp = async () => {
    setBusy('whatsapp');
    setError('');
    setNotice('');
    try {
      const payload = await removeWhatsAppLink();
      setNotice(payload.message);
      await Promise.all([load(), refreshUser()]);
    } catch (removeError) {
      setError(removeError.message || 'We could not remove WhatsApp.');
    } finally {
      setBusy('');
    }
  };

  const dropMobile = async () => {
    setBusy('otp');
    setError('');
    setNotice('');
    try {
      const payload = await removeMobile();
      setNotice(payload.message);
      await Promise.all([load(), refreshUser()]);
    } catch (removeError) {
      setError(removeError.message || 'We could not remove your mobile number.');
    } finally {
      setBusy('');
    }
  };

  if (!methods) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size={18} className="text-clay" />
      </div>
    );
  }

  const by = (provider) => methods.methods.find((entry) => entry.provider === provider);

  return (
    <div className="space-y-6">
      <AuthError>{error}</AuthError>
      <AuthNotice>{notice}</AuthNotice>

      <ul className="divide-y divide-beige border border-beige bg-cream">
        {methods.methods.map((method) => (
          <li
            key={method.provider}
            className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full border',
                  method.connected
                    ? 'border-plum bg-plum text-cream'
                    : 'border-beige bg-sand text-charcoal-faint',
                )}
                aria-hidden="true"
              >
                {method.connected ? <Check size={13} strokeWidth={3} /> : null}
              </span>

              <div className="min-w-0">
                <p className="text-sm font-medium text-charcoal">{method.label}</p>
                <p className="truncate text-[11px] text-charcoal-muted">
                  {method.connected ? method.detail || 'Connected' : 'Not set up'}
                </p>
              </div>
            </div>

            <MethodAction
              method={method}
              google={google}
              busy={busy}
              onConnectGoogle={connectGoogle}
              onRemoveGoogle={removeGoogle}
              onRemoveMobile={dropMobile}
              onRemoveWhatsApp={dropWhatsApp}
            />
          </li>
        ))}
      </ul>

      {methods.total <= 1 ? (
        <p className="text-[11px] leading-relaxed text-charcoal-faint">
          You currently have one way to sign in. Adding a second means you will not be locked out
          if you lose access to it.
        </p>
      ) : null}

      <PasswordSection hasPassword={Boolean(by('password')?.connected)} onDone={load} />
      <MobileSection connected={Boolean(by('otp')?.connected)} onDone={load} />
      {/*
        Hidden entirely when the store has no WhatsApp provider. An account
        that already has WhatsApp linked still sees its row above — the method
        exists, it simply cannot be used until the store turns it back on —
        but there is no point offering to set up something that cannot send.
      */}
      {whatsapp.enabled ? (
        <WhatsAppSection connected={Boolean(by('whatsapp')?.connected)} onDone={load} />
      ) : null}
    </div>
  );
}

/** The button on the right of each row, which differs per provider. */
function MethodAction({
  method,
  google,
  busy,
  onConnectGoogle,
  onRemoveGoogle,
  onRemoveMobile,
  onRemoveWhatsApp,
}) {
  const working = busy === method.provider;

  /*
   * `available: false` comes from the server for a method the store has
   * switched off (§9). A row that is neither connected nor available offers
   * nothing to do — saying so is more use than a button that 400s.
   */
  if (method.available === false && !method.connected) {
    return <span className="text-[11px] text-charcoal-faint">Unavailable</span>;
  }

  if (method.provider === 'google') {
    if (!google.enabled) {
      return <span className="text-[11px] text-charcoal-faint">Unavailable</span>;
    }
    if (!method.connected) {
      return (
        <button
          type="button"
          onClick={onConnectGoogle}
          disabled={working}
          className="btn-outline btn-sm"
        >
          {working ? <Spinner size={12} /> : null} Connect Google
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onRemoveGoogle}
        disabled={working || !method.canRemove}
        title={method.canRemove ? undefined : 'Set another sign-in method first'}
        className="text-[11px] uppercase tracking-widest2 text-charcoal-muted underline underline-offset-4 transition-colors hover:text-sale disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-charcoal-muted"
      >
        {working ? 'Disconnecting…' : 'Disconnect'}
      </button>
    );
  }

  if (method.provider === 'whatsapp' && method.connected) {
    return (
      <button
        type="button"
        onClick={onRemoveWhatsApp}
        disabled={working || !method.canRemove}
        title={method.canRemove ? undefined : 'Set another sign-in method first'}
        className="text-[11px] uppercase tracking-widest2 text-charcoal-muted underline underline-offset-4 transition-colors hover:text-sale disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-charcoal-muted"
      >
        {working ? 'Removing…' : 'Remove'}
      </button>
    );
  }

  if (method.provider === 'otp' && method.connected) {
    return (
      <button
        type="button"
        onClick={onRemoveMobile}
        disabled={working || !method.canRemove}
        title={method.canRemove ? undefined : 'Set another sign-in method first'}
        className="text-[11px] uppercase tracking-widest2 text-charcoal-muted underline underline-offset-4 transition-colors hover:text-sale disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-charcoal-muted"
      >
        {working ? 'Removing…' : 'Remove'}
      </button>
    );
  }

  /* Password and mobile are set up in the forms below rather than inline. */
  return (
    <span className="text-[11px] uppercase tracking-widest2 text-charcoal-faint">
      {method.connected ? 'Active' : 'Set up below'}
    </span>
  );
}

/* -------------------------------- password --------------------------------- */

/**
 * §26's "Set Password" and the ordinary change.
 *
 * The current-password field is present only when there is one to confirm — a
 * Google-only identity adding a password has nothing to prove beyond already
 * being signed in.
 */
function PasswordSection({ hasPassword, onDone }) {
  const { changePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(hasPassword ? changePasswordSchema : setPasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const next = watch('newPassword');

  const onSubmit = handleSubmit(async (values) => {
    setError('');
    setNotice('');

    const result = await changePassword(values);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    reset();
    setOpen(false);
    setNotice(
      result.signedOutDevices
        ? `Password updated successfully. We also signed out ${result.signedOutDevices} other device${result.signedOutDevices === 1 ? '' : 's'}.`
        : 'Password updated successfully.',
    );
    onDone?.();
  });

  return (
    <section className="border border-beige bg-cream p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <KeyRound size={15} className="text-clay" strokeWidth={1.6} aria-hidden="true" />
          <h3 className="text-sm font-medium text-charcoal">
            {hasPassword ? 'Change your password' : 'Set a password'}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="text-[11px] uppercase tracking-widest2 text-charcoal-muted underline underline-offset-4 hover:text-charcoal"
        >
          {open ? 'Cancel' : hasPassword ? 'Change' : 'Set password'}
        </button>
      </div>

      <AuthNotice className="mt-4">{notice}</AuthNotice>

      {open ? (
        <form onSubmit={onSubmit} noValidate className="mt-5 space-y-5">
          {hasPassword ? (
            <PasswordInput
              label="Current Password"
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              {...register('currentPassword')}
            />
          ) : null}

          <div>
            <PasswordInput
              label="New Password"
              autoComplete="new-password"
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />
            <PasswordStrength value={next} />
          </div>

          <PasswordInput
            label="Confirm Password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <AuthError>{error}</AuthError>

          <p className="text-[11px] leading-relaxed text-charcoal-faint">
            Changing your password signs out every other device, so anyone using the old one has
            to sign in again.
          </p>

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full sm:w-auto">
            {isSubmitting ? (
              <>
                <Spinner size={13} /> Saving
              </>
            ) : hasPassword ? (
              'Update Password'
            ) : (
              'Set Password'
            )}
          </button>
        </form>
      ) : null}
    </section>
  );
}

/* --------------------------------- mobile ---------------------------------- */

/** §26's "Verify Mobile" — the same OTP screen the login flow uses. */
function MobileSection({ connected, onDone }) {
  const { refreshUser } = useAuth();

  const [sent, setSent] = useState(null);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(mobileSchema), defaultValues: { mobile: '' } });

  const send = handleSubmit(async (values) => {
    setError('');
    try {
      const payload = await requestMobileVerification(values.mobile);
      setMobile(values.mobile);
      setSent(payload);
    } catch (requestError) {
      setError(requestError.message || 'We could not send an OTP just now.');
    }
  });

  const verify = useCallback(
    async (code) => {
      try {
        const payload = await verifyMobile(mobile, code);
        setSent(null);
        setOpen(false);
        reset();
        setNotice(payload.message);
        await Promise.all([refreshUser(), onDone?.()]);
        return { ok: true };
      } catch (verifyError) {
        return { ok: false, message: verifyError.message };
      }
    },
    [mobile, refreshUser, onDone, reset],
  );

  const resend = useCallback(async () => {
    try {
      const payload = await requestMobileVerification(mobile);
      setSent(payload);
      return { ok: true, ...payload };
    } catch (resendError) {
      return { ok: false, message: resendError.message };
    }
  }, [mobile]);

  return (
    <section className="border border-beige bg-cream p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Smartphone size={15} className="text-clay" strokeWidth={1.6} aria-hidden="true" />
          <h3 className="text-sm font-medium text-charcoal">
            {connected ? 'Change your mobile number' : 'Verify a mobile number'}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
            setSent(null);
          }}
          className="text-[11px] uppercase tracking-widest2 text-charcoal-muted underline underline-offset-4 hover:text-charcoal"
        >
          {open ? 'Cancel' : connected ? 'Change' : 'Verify mobile'}
        </button>
      </div>

      <AuthNotice className="mt-4">{notice}</AuthNotice>

      {open ? (
        <div className="mt-5">
          {sent ? (
            <OTPVerification
              mobileMasked={sent.mobileFormatted || sent.mobileMasked}
              onVerify={verify}
              onResend={resend}
              onBack={() => setSent(null)}
              resendAfterSeconds={sent.resendAfterSeconds}
              expiresInSeconds={sent.expiresInSeconds}
              note={
                sent.delivered === false ? (
                  <AuthNotice>
                    No SMS provider is configured, so the code was written to the API server log
                    instead of being sent.
                  </AuthNotice>
                ) : null
              }
            />
          ) : (
            <form onSubmit={send} noValidate className="space-y-5">
              <AuthField
                label="Mobile Number"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                prefix="+91"
                maxLength={14}
                error={errors.mobile?.message}
                {...register('mobile')}
              />

              <AuthError>{error}</AuthError>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Spinner size={13} /> Sending
                  </>
                ) : (
                  'Send OTP'
                )}
              </button>
            </form>
          )}
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------- whatsapp --------------------------------- */

/**
 * §7's "link WhatsApp to the account you already have".
 *
 * Collapsed by default, like the sections above it: somebody visiting this
 * page to check their recent activity should not have to scroll past three
 * open forms. The verification itself is `WhatsAppVerification`, unchanged
 * from the one the login page uses — the only difference is which endpoints it
 * calls, and that difference lives inside the component rather than here.
 */
function WhatsAppSection({ connected, onDone }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');

  return (
    <section className="border border-beige bg-cream p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <WhatsAppMark size={16} aria-hidden="true" />
          <h3 className="text-sm font-medium text-charcoal">
            {connected ? 'Change your WhatsApp number' : 'Sign in with WhatsApp'}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="text-[11px] uppercase tracking-widest2 text-charcoal-muted underline underline-offset-4 hover:text-charcoal"
        >
          {open ? 'Cancel' : connected ? 'Change' : 'Set up WhatsApp'}
        </button>
      </div>

      <AuthNotice className="mt-4">{notice}</AuthNotice>

      {open ? (
        <div className="mt-5">
          <WhatsAppVerification
            /* Pre-filled with the number already on the account: for most
               people it is the same one, and retyping it is friction for
               nothing. It stays editable. */
            defaultMobile={user?.mobile ? user.mobile.replace(/^\+91/, '') : ''}
            onCancel={() => setOpen(false)}
            onDone={(payload) => {
              setOpen(false);
              setNotice(payload?.message || 'WhatsApp linked to your SOPII account.');
              onDone?.();
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
