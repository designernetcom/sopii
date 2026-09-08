import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/cn';

/**
 * §15's logout, as one component so every place that offers it does the same
 * three things: invalidate the session on the server, clear local state, and
 * navigate away.
 *
 * The navigation is not optional. Signing out while standing on `/account`
 * leaves a page whose every request now 401s; the guard would redirect
 * eventually, but only after a render that looks broken.
 */
export function LogoutButton({
  redirectTo = '/',
  className,
  variant = 'link',
  label = 'Log out',
  children,
}) {
  const { logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);

    // `logout()` clears local state even if the network call failed, so this
    // needs no catch — there is no failure mode that should keep somebody
    // signed in.
    await logout();

    toast('You have been logged out successfully.');
    navigate(redirectTo, { replace: true });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        variant === 'button'
          ? 'btn-outline'
          : 'inline-flex items-center gap-2 text-[11px] uppercase tracking-widest2 text-charcoal-muted transition-colors hover:text-sale disabled:opacity-50',
        className,
      )}
    >
      {busy ? <Spinner size={13} /> : <LogOut size={14} aria-hidden="true" />}
      {children ?? (busy ? 'Signing out' : label)}
    </button>
  );
}
