import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RouteSkeleton } from '../ui/PageSkeletons';
import { EmptyState } from '../ui/EmptyState';

/**
 * Route guards (§12, §22).
 * ===========================================================================
 * These decide what gets *rendered*. They are not the authorization — the API
 * refuses the same requests regardless of what this file does, which is §30's
 * "do not allow frontend-only authorization". What they buy is a person not
 * being shown a screen that will only fill with permission errors.
 *
 * The `ready` gate matters more than it looks. On a cold load the session is
 * restored asynchronously (`/auth/refresh` against an HttpOnly cookie), so for
 * a moment a genuinely signed-in shopper looks signed out. Redirecting during
 * that window bounces people to `/login` on every reload.
 */

/** Signed in, or off to `/login` with a note about where they were heading. */
export function ProtectedRoute({ children, redirectTo = '/login' }) {
  const { isAuthenticated, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <RouteSkeleton />;

  if (!isAuthenticated) {
    return (
      <Navigate to={redirectTo} replace state={{ from: location.pathname + location.search }} />
    );
  }

  return children;
}

/**
 * The counterpart: keeps a signed-in shopper off `/login` and `/register`.
 *
 * Honours the `from` they arrived with, so signing in from a protected page
 * returns them to it rather than dropping them on `/account`.
 */
export function GuestRoute({ children, redirectTo = '/account' }) {
  const { isAuthenticated, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <RouteSkeleton />;
  if (isAuthenticated) return <Navigate to={location.state?.from || redirectTo} replace />;

  return children;
}

/**
 * §12's role gate.
 *
 * Renders a 403 rather than redirecting, so the URL stays shareable and the
 * person can see *why* they cannot get in — a silent bounce to the homepage
 * reads as a broken link.
 */
export function RoleGuard({ roles = [], children, fallback }) {
  const { user, isAuthenticated, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <RouteSkeleton />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const allowed = roles.length === 0 || roles.includes(user?.role);
  if (allowed) return children;

  return fallback ?? <AccessDenied role={user?.roleName || user?.role} />;
}

export function AccessDenied({ role }) {
  return (
    <div className="container-site py-16 lg:py-24">
      <div className="mx-auto max-w-md text-center">
        <p className="font-display text-6xl text-beige">403</p>
        <EmptyState
          icon={ShieldAlert}
          title="Access Denied"
          text={
            role
              ? `Your account (${role}) does not have permission to view this page.`
              : 'You do not have permission to view this page.'
          }
          action={{ label: 'Back to Shopping', to: '/' }}
        />
      </div>
    </div>
  );
}
