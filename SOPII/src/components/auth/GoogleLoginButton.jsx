import { useEffect, useState } from 'react';
import { Spinner } from '../ui/Spinner';
import { fetchGoogleStatus, googleAuthorizeUrl } from '../../services/authApi';

/**
 * Google's mark, inline.
 *
 * Inlined rather than fetched because §7's flow must not depend on a third-
 * party asset loading — and because Google's brand guidelines require these
 * exact four colours, which a recoloured icon font would not give.
 */
function GoogleMark({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/**
 * Whether the server has Google configured.
 *
 * A hook rather than state inside the button, so a page can collapse the "OR"
 * divider alongside it — a lone rule floating above a form is the tell that a
 * button used to be there.
 */
export function useGoogleAvailable() {
  const [status, setStatus] = useState({ checked: false, enabled: false });

  useEffect(() => {
    const controller = new AbortController();

    fetchGoogleStatus({ signal: controller.signal })
      .then((payload) => setStatus({ checked: true, enabled: Boolean(payload?.enabled) }))
      // Unreachable API: treat Google as unavailable rather than offering a
      // button that cannot work.
      .catch(() => setStatus({ checked: true, enabled: false }));

    return () => controller.abort();
  }, []);

  return status;
}

/**
 * "Continue with Google" (§7).
 *
 * A full-page navigation, not a fetch. The OAuth flow leaves this origin for
 * accounts.google.com and comes back to `/auth/callback`, and there is nothing
 * an XHR could do with a redirect chain that ends in a consent screen.
 *
 * Renders nothing when Google is not configured on the server — a button that
 * leads to a 503 is worse than no button.
 */
export function GoogleLoginButton({ next = '/account', label = 'Continue with Google', disabled }) {
  const { checked, enabled } = useGoogleAvailable();
  const [leaving, setLeaving] = useState(false);

  if (!checked || !enabled) return null;

  return (
    <button
      type="button"
      disabled={disabled || leaving}
      onClick={() => {
        setLeaving(true);
        window.location.assign(googleAuthorizeUrl(next));
      }}
      className="btn-outline w-full border-beige text-charcoal hover:border-charcoal hover:bg-transparent hover:text-charcoal"
    >
      {leaving ? <Spinner size={14} /> : <GoogleMark />}
      {leaving ? 'Taking you to Google' : label}
    </button>
  );
}

/** The "──── OR ────" rule between the Google button and the form. */
export function AuthDivider({ label = 'OR' }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-beige" />
      <span className="text-[10px] uppercase tracking-widest3 text-charcoal-faint">{label}</span>
      <span className="h-px flex-1 bg-beige" />
    </div>
  );
}
