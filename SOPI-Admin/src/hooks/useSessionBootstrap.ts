import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { credentialsReceived, loggedOut, sessionChecked } from '@/store/slices/authSlice';
import { refreshSession } from '@/store/api/authApi';

/**
 * Restores an admin session on a cold load, and keeps it alive.
 * ===========================================================================
 * The access token lives in memory only (§30), so a reload starts with
 * nothing. This trades the HttpOnly refresh cookie for a fresh one before any
 * guard gets to decide anything — without it, every reload of `/admin/orders`
 * would bounce to the login screen.
 *
 * `initialised` is what the guards wait on. It is set either way: a visitor
 * with no cookie needs the answer "there is no session" just as much as one
 * with a cookie needs "here it is".
 */
export function useSessionBootstrap() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const initialised = useAppSelector((state) => state.auth.initialised);

  /* --------------------------- the cold-load check -------------------------- */

  useEffect(() => {
    let cancelled = false;

    refreshSession()
      .then((session) => {
        if (cancelled) return;
        dispatch(
          credentialsReceived({
            token: session.accessToken,
            user: session.user,
            csrfToken: session.csrfToken,
          }),
        );
      })
      .catch(() => {
        // No cookie, an expired one, or a revoked session. All the same
        // outcome: signed out, and the app should say so rather than hang.
        if (!cancelled) dispatch(sessionChecked());
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  /* ------------------------------ keeping it alive -------------------------- */

  /**
   * The access token is short-lived by design. Refreshing on a timer means an
   * admin who leaves a dashboard open does not have their next click spend a
   * round trip discovering the token expired.
   *
   * Seven minutes against a fifteen-minute default: comfortably inside the
   * window, so one missed tick (a sleeping laptop, a throttled background tab)
   * is recoverable rather than fatal.
   */
  useEffect(() => {
    if (!token || !initialised) return undefined;

    const timer = setInterval(
      () => {
        refreshSession()
          .then((session) =>
            dispatch(
              credentialsReceived({
                token: session.accessToken,
                user: session.user,
                csrfToken: session.csrfToken,
              }),
            ),
          )
          .catch(() => dispatch(loggedOut()));
      },
      7 * 60 * 1000,
    );

    return () => clearInterval(timer);
  }, [token, initialised, dispatch]);

  return initialised;
}
