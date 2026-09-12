import { Link } from 'react-router-dom';
import { MonitorSmartphone } from 'lucide-react';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { SessionManager } from '../components/auth/SessionManager';
import { usePageSeo } from '../components/SEO/SEOHead';

/**
 * §16's `/account/sessions`.
 *
 * Its own route rather than a tab inside `/account/security`, because "sign
 * out of that device I left at the hotel" is a thing somebody wants to reach
 * directly — from an email, from a bookmark — without walking a settings tree.
 */
export default function AccountSessions() {
  /* Personal and transactional — nothing here belongs in an index.
     Called as a hook so it runs before this component's early returns. */
  usePageSeo({ path: '/account/sessions', title: 'Active Sessions', noindex: true });

  return (
    <div className="container-site py-6 lg:py-10">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'My Account', to: '/account' },
          { label: 'Security', to: '/account/security' },
          { label: 'Active Sessions' },
        ]}
      />

      <header className="mt-5 border-b border-beige pb-6">
        <p className="eyebrow">Security</p>
        <div className="mt-2 flex items-center gap-3">
          <MonitorSmartphone
            size={22}
            className="text-brand-soft"
            strokeWidth={1.4}
            aria-hidden="true"
          />
          <h1 className="font-display text-3xl sm:text-4xl">Active Sessions</h1>
        </div>
        <p className="mt-3 max-w-xl text-sm text-charcoal-muted">
          Every device currently signed in to your SOPII account. Sign out anything you do not
          recognise, then change your password.
        </p>
      </header>

      <div className="max-w-2xl py-8">
        <SessionManager />

        <p className="mt-8 border-t border-beige pt-6 text-[12px] text-charcoal-muted">
          Looking for your login methods?{' '}
          <Link to="/account/security" className="text-charcoal underline underline-offset-4">
            Back to Security
          </Link>
        </p>
      </div>
    </div>
  );
}
