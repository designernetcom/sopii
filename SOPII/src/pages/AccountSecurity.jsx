import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { ActivityListSkeleton } from '../components/ui/PageSkeletons';
import { LoginMethods } from '../components/auth/LoginMethods';
import { useAuth } from '../context/AuthContext';
import { fetchAuthActivity } from '../services/authApi';
import { formatRelativeTime } from '../utils/format';
import { usePageSeo } from '../components/SEO/SEOHead';

/**
 * §26's `/account/security`.
 *
 * Three things belong on one page: how you can sign in, what has happened on
 * the account lately, and a way through to the device list. Splitting them
 * further would mean somebody checking on a suspicious login has to visit
 * three screens to see the whole picture.
 */
export default function AccountSecurity() {
  /* Personal and transactional — nothing here belongs in an index.
     Called as a hook so it runs before this component's early returns. */
  usePageSeo({ path: '/account/security', title: 'Security', noindex: true });

  const { user } = useAuth();

  return (
    <div className="container-site py-6 lg:py-10">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'My Account', to: '/account' },
          { label: 'Security' },
        ]}
      />

      <header className="mt-5 border-b border-beige pb-6">
        <p className="eyebrow">Account</p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl">Security</h1>
        <p className="mt-2 max-w-xl text-sm text-charcoal-muted">
          Manage how you sign in to SOPII, and review recent activity on your account.
        </p>
      </header>

      <div className="grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
        <div className="space-y-10">
          <section aria-labelledby="methods-heading">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={17} className="text-clay" strokeWidth={1.5} aria-hidden="true" />
              <h2 id="methods-heading" className="font-display text-2xl">
                Login Methods
              </h2>
            </div>
            <p className="mt-2 max-w-lg text-sm text-charcoal-muted">
              You can sign in with any of these. Keep at least two set up so losing one does
              not lock you out.
            </p>

            <div className="mt-6">
              <LoginMethods />
            </div>
          </section>

          <RecentActivity />
        </div>

        <aside className="space-y-5">
          <div className="border border-beige bg-cream p-5">
            <div className="flex items-center gap-2.5">
              <MonitorSmartphone
                size={16}
                className="text-clay"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <h2 className="text-sm font-medium text-charcoal">Active Sessions</h2>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-charcoal-muted">
              See every device signed in to your account, and sign out any you do not
              recognise.
            </p>
            <Link to="/account/sessions" className="btn-outline btn-sm mt-4 w-full">
              Manage Devices
            </Link>
          </div>

          <div className="border border-beige bg-sand/40 p-5">
            <h2 className="text-sm font-medium text-charcoal">Account details</h2>
            <dl className="mt-3 space-y-2.5 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-charcoal-muted">Email</dt>
                <dd className="truncate text-charcoal">{user?.email || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-charcoal-muted">Mobile</dt>
                <dd className="text-charcoal">{user?.mobile || 'Not verified'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-charcoal-muted">Member since</dt>
                <dd className="text-charcoal">
                  {user?.joinedAt ? new Date(user.joinedAt).getFullYear() : '—'}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------- activity --------------------------------- */

/** §19's trail, scoped to the person reading it. */
const LABELS = {
  login: 'Signed in',
  logout: 'Signed out',
  failed_login: 'Failed sign-in attempt',
  otp_requested: 'OTP requested',
  otp_verified: 'Mobile verified with OTP',
  otp_failed: 'Incorrect OTP entered',
  password_changed: 'Password changed',
  password_reset_requested: 'Password reset requested',
  password_reset: 'Password reset',
  google_login: 'Signed in with Google',
  google_linked: 'Google account connected',
  google_unlinked: 'Google account disconnected',
  account_locked: 'Account temporarily locked',
  account_unlocked: 'Account unlocked',
  account_created: 'Account created',
  mobile_verified: 'Mobile number verified',
  session_revoked: 'Device signed out',
  token_reuse_detected: 'Session ended for security reasons',
  access_denied: 'Access denied',
};

function RecentActivity() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    fetchAuthActivity({ signal: controller.signal, params: { limit: 12 } })
      .then((payload) => setItems(payload.items || []))
      .catch((activityError) => {
        if (activityError?.name === 'AbortError') return;
        setError('We could not load your recent activity.');
      });

    return () => controller.abort();
  }, []);

  return (
    <section aria-labelledby="activity-heading">
      <div className="flex items-center gap-2.5">
        <Activity size={17} className="text-clay" strokeWidth={1.5} aria-hidden="true" />
        <h2 id="activity-heading" className="font-display text-2xl">
          Recent Activity
        </h2>
      </div>
      <p className="mt-2 max-w-lg text-sm text-charcoal-muted">
        Anything here you do not recognise is worth changing your password over.
      </p>

      {error ? <p className="mt-6 text-[12px] text-sale">{error}</p> : null}

      {!items && !error ? <ActivityListSkeleton className="mt-6" /> : null}

      {items?.length === 0 ? (
        <p className="mt-6 text-[12px] text-charcoal-faint">No activity recorded yet.</p>
      ) : null}

      {items?.length ? (
        <ul className="mt-6 divide-y divide-beige border border-beige bg-cream">
          {items.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
              <div className="min-w-0">
                <p className="text-[13px] text-charcoal">
                  {LABELS[entry.action] || entry.action}
                  {entry.status === 'failure' ? (
                    <span className="ml-2 text-[11px] uppercase tracking-widest2 text-sale">
                      Failed
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[11px] text-charcoal-faint">
                  {[entry.browser, entry.os, entry.ip].filter(Boolean).join(' · ') ||
                    'Unknown device'}
                </p>
              </div>
              <time
                dateTime={entry.at}
                className="shrink-0 text-[11px] text-charcoal-muted"
              >
                {formatRelativeTime(entry.at)}
              </time>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
