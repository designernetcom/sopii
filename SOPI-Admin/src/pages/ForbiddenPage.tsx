import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/States';
import { useAppSelector } from '@/store/hooks';
import { useDocumentTitle } from '@/hooks';

/**
 * §12's 403.
 *
 * A page rather than a redirect, so the URL stays shareable and the person can
 * see why they were refused — bouncing someone silently to the dashboard reads
 * as a broken link, and they will simply try again.
 *
 * This is presentation only. The API returns its own 403 for the same request
 * whatever this renders (§30), which is the half that actually enforces
 * anything.
 */
export default function ForbiddenPage({
  resource,
  action,
}: {
  resource?: string;
  action?: string;
}) {
  useDocumentTitle('Access denied');
  const user = useAppSelector((state) => state.auth.user);

  return (
    <div className="card">
      <div className="pt-6 text-center">
        <p className="text-6xl font-semibold tracking-tight text-ink-200 dark:text-ink-800">403</p>
      </div>

      <EmptyState
        icon={ShieldAlert}
        title="Access Denied"
        description={
          resource
            ? `Your role (${user?.roleName ?? 'unknown'}) is not permitted to ${action ?? 'view'} ${resource.replace('_', ' ')}. Ask a Super Admin to update your permissions.`
            : `Your role (${user?.roleName ?? 'unknown'}) does not have access to this section. Ask a Super Admin to update your permissions.`
        }
        action={
          <>
            <Button variant="secondary" to="/admin/dashboard">
              Back to dashboard
            </Button>
            <Button variant="primary" to="/admin/profile">
              View my role
            </Button>
          </>
        }
      />
    </div>
  );
}
