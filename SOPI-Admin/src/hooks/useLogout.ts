import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/store/hooks';
import { loggedOut } from '@/store/slices/authSlice';
import { baseApi } from '@/store/api/baseApi';
import { logoutSession } from '@/store/api/authApi';

/**
 * §15's logout, in one place.
 *
 * Four things have to happen, and dropping any one of them leaves a bug that
 * only shows up later:
 *
 *   1. **Tell the server.** The session and its refresh tokens are revoked
 *      there. Clearing local state alone would leave a live refresh cookie in
 *      the browser — a "logout" that the next reload undoes.
 *   2. **Clear the Redux session.** The access token lives only here.
 *   3. **Reset the RTK Query cache.** Otherwise the next person to sign in on
 *      this machine sees the previous admin's orders and customers rendered
 *      from cache before their own data arrives.
 *   4. **Navigate.** Staying put leaves a page whose every request now 401s.
 *
 * The server call is best-effort: a network failure must not leave someone
 * signed in on the device in front of them.
 */
export function useLogout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  return useCallback(async () => {
    try {
      await logoutSession();
    } catch {
      /* Already expired, or the API is unreachable. Sign out locally anyway. */
    }

    dispatch(loggedOut());
    dispatch(baseApi.util.resetApiState());
    navigate('/admin/login', { replace: true });
  }, [dispatch, navigate]);
}
