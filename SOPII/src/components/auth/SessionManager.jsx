import { useCallback, useEffect, useState } from 'react';
import { Laptop, LogOut, Monitor, Smartphone, Tablet } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import { SessionListSkeleton } from '../ui/PageSkeletons';
import { AuthError, AuthNotice } from './AuthField';
import { cn } from '../../utils/cn';
import { formatRelativeTime } from '../../utils/format';
import { fetchSessions, revokeOtherSessions, revokeSession } from '../../services/authApi';
import { useAuth } from '../../context/AuthContext';

/**
 * §16's "Active Sessions".
 *
 * The list is whatever the server says it is — it is refetched after every
 * revocation rather than spliced locally, because the server may have ended
 * more than was asked for (a device cap, an idle timeout) and a locally
 * patched list would quietly disagree with reality.
 */
const ICONS = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
  unknown: Laptop,
};

export function SessionManager() {
  const { logout } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (signal) => {
    try {
      const payload = await fetchSessions({ signal });
      setSessions(payload.items || []);
      setState('ready');
    } catch (loadError) {
      if (loadError?.name === 'AbortError') return;
      setState('error');
      setError(loadError.message || 'We could not load your devices.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const endOne = async (session) => {
    setBusyId(session.id);
    setError('');
    setNotice('');

    try {
      const payload = await revokeSession(session.id);

      /*
       * Revoking the device you are holding is a logout. Clearing local state
       * and sending them onward is the only coherent outcome — leaving them on
       * a page whose every request now 401s is not.
       */
      if (payload.selfRevoked) {
        await logout();
        return;
      }

      setSessions(payload.items || []);
      setNotice('That device has been signed out.');
    } catch (revokeError) {
      setError(revokeError.message || 'We could not sign that device out.');
    } finally {
      setBusyId(null);
    }
  };

  const endOthers = async () => {
    setBusyId('all');
    setError('');
    setNotice('');

    try {
      const payload = await revokeOtherSessions();
      setSessions(payload.items || []);
      setNotice(payload.message);
    } catch (revokeError) {
      setError(revokeError.message || 'We could not sign the other devices out.');
    } finally {
      setBusyId(null);
    }
  };

  if (state === 'loading') return <SessionListSkeleton />;

  const others = sessions.filter((session) => !session.current);

  return (
    <div className="space-y-5">
      <AuthError>{error}</AuthError>
      <AuthNotice>{notice}</AuthNotice>

      <ul className="space-y-3">
        {sessions.map((session) => {
          const Icon = ICONS[session.deviceType] || ICONS.unknown;
          return (
            <li
              key={session.id}
              className={cn(
                'flex flex-wrap items-start justify-between gap-4 border p-4 sm:p-5',
                session.current ? 'border-brand bg-brand-pale/30' : 'border-beige bg-cream',
              )}
            >
              <div className="flex min-w-0 gap-3.5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-beige bg-cream">
                  <Icon size={15} className="text-brand-soft" strokeWidth={1.5} aria-hidden="true" />
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-charcoal">
                    {session.browser} — {session.os}
                  </p>

                  <p className="mt-0.5 text-[11px] text-charcoal-muted">
                    {session.current ? (
                      <span className="font-medium text-brand">Current session</span>
                    ) : (
                      <>Last active: {formatRelativeTime(session.lastActiveAt)}</>
                    )}
                  </p>

                  <p className="mt-1 text-[11px] text-charcoal-faint">
                    {session.ip ? `${session.ip} · ` : ''}
                    Signed in with{' '}
                    {session.method === 'otp'
                      ? 'mobile OTP'
                      : session.method === 'google'
                        ? 'Google'
                        : 'a password'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => endOne(session)}
                disabled={busyId === session.id}
                className="shrink-0 text-[11px] uppercase tracking-widest2 text-charcoal-muted underline underline-offset-4 transition-colors hover:text-danger disabled:opacity-50"
              >
                {busyId === session.id
                  ? 'Signing out…'
                  : session.current
                    ? 'Log out this device'
                    : 'Log out'}
              </button>
            </li>
          );
        })}
      </ul>

      {others.length > 0 ? (
        <button
          type="button"
          onClick={endOthers}
          disabled={busyId === 'all'}
          className="btn-outline w-full sm:w-auto"
        >
          {busyId === 'all' ? (
            <>
              <Spinner size={13} /> Signing out
            </>
          ) : (
            <>
              <LogOut size={14} strokeWidth={1.6} /> Log out all other devices
            </>
          )}
        </button>
      ) : (
        <p className="text-[12px] text-charcoal-faint">
          This is the only device signed in to your account.
        </p>
      )}
    </div>
  );
}
