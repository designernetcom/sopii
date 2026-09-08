import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/store/hooks';
import { usePermissions } from '@/hooks';
import { PageLoader } from '@/components/common/States';
import ForbiddenPage from '@/pages/ForbiddenPage';
import type { PermissionAction, ResourceKey } from '@/types';

/**
 * Route guards (§12).
 * ===========================================================================
 * These decide what to *render*. They are not the authorization — every API
 * call is checked again by `requirePermission` on the server, and §30 is
 * explicit that frontend-only authorization does not count. What they buy is
 * an admin not being shown a screen that will only fill with 403s.
 *
 * `initialised` is what every guard waits on. The access token now lives in
 * memory only, so a reload starts signed-out until `/auth/refresh` answers;
 * deciding before that would bounce an admin to the login page on every
 * refresh of every page.
 */

/** Blocks unauthenticated access and remembers where the user was heading. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAppSelector((state) => state.auth.token);
  const initialised = useAppSelector((state) => state.auth.initialised);
  const location = useLocation();

  if (!initialised) return <PageLoader />;

  if (!token) {
    return (
      <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />
    );
  }
  return <>{children}</>;
}

/** Renders a 403 rather than a redirect, so the URL stays shareable. */
export function RequirePermission({
  resource,
  action = 'view',
  children,
}: {
  resource: ResourceKey;
  action?: PermissionAction;
  children: ReactNode;
}) {
  const { can } = usePermissions();

  if (!can(resource, action)) {
    return <ForbiddenPage resource={resource} action={action} />;
  }

  return <>{children}</>;
}

/**
 * Coarse role gate, for sections that are not modelled in the permission
 * matrix. `super_admin` passes everything by definition (§12).
 */
export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const user = useAppSelector((state) => state.auth.user);
  const initialised = useAppSelector((state) => state.auth.initialised);

  if (!initialised) return <PageLoader />;
  if (!user) return <Navigate to="/admin/login" replace />;

  const allowed = user.roleKey === 'super_admin' || roles.includes(user.roleKey);
  return allowed ? <>{children}</> : <ForbiddenPage />;
}

/** Keeps signed-in users out of the login screen. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const token = useAppSelector((state) => state.auth.token);
  const initialised = useAppSelector((state) => state.auth.initialised);
  const location = useLocation();

  if (!initialised) return <PageLoader />;
  if (token) {
    return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/admin/dashboard'} replace />;
  }
  return <>{children}</>;
}
