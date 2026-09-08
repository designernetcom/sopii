import { useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/common/States';
import { Button } from '@/components/common/Button';
import { useDocumentTitle } from '@/hooks';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  const location = useLocation();

  return (
    <div className="card">
      <EmptyState
        icon={Compass}
        title="We could not find that page"
        description={`No admin screen matches “${location.pathname}”. It may have moved, or the link may be out of date.`}
        action={
          <>
            <Button variant="secondary" onClick={() => window.history.back()}>
              Go back
            </Button>
            <Button variant="primary" to="/admin/dashboard">
              Back to dashboard
            </Button>
          </>
        }
      />
    </div>
  );
}
