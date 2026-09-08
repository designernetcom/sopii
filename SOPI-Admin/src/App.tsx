import { Suspense } from 'react';
import { AppRoutes } from '@/routes';
import { PageLoader } from '@/components/common/States';
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap';

export default function App() {
  /*
   * Restores the session from the HttpOnly refresh cookie before anything
   * renders a decision. The access token is held in memory only (§30), so
   * without this every reload would look like a fresh sign-out and the guards
   * would bounce an admin to the login screen.
   *
   * The guards also read `initialised` themselves — this only decides whether
   * to paint the shell at all, which keeps the login form from flashing on top
   * of a session that turns out to be perfectly good.
   */
  const ready = useSessionBootstrap();

  if (!ready) return <PageLoader />;

  return (
    <Suspense fallback={<PageLoader />}>
      <AppRoutes />
    </Suspense>
  );
}
