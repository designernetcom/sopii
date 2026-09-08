import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser, PermissionAction, ResourceKey } from '@/types';

/**
 * Admin session state.
 * ===========================================================================
 * The access token lives here, in Redux — which is to say in memory, and only
 * in memory. It used to be persisted to `localStorage` alongside the user;
 * §30 forbids that, and this file is where the rule is kept.
 *
 * The durable half of the session is an HttpOnly cookie the API sets on
 * `/api/auth/login` and rotates on `/api/auth/refresh`. Nothing in this
 * application can read it, which is the point: a script that manages to run on
 * an admin's browser can act as them while the tab is open, but cannot walk
 * away with a credential that still works tomorrow.
 *
 * The consequence is that a reload starts signed-out and has to call
 * `/auth/refresh` before deciding anything — see `useSessionBootstrap`.
 */

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** False until the refresh cookie has been checked, so guards can wait. */
  initialised: boolean;
  /** Echoed back in `X-CSRF-Token` on the cookie-authenticated endpoints. */
  csrfToken: string | null;
}

const initialState: AuthState = {
  token: null,
  user: null,
  initialised: false,
  csrfToken: null,
};

interface Credentials {
  token: string;
  user: AuthUser;
  csrfToken?: string | null;
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    credentialsReceived(state, action: PayloadAction<Credentials>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      if (action.payload.csrfToken !== undefined) {
        state.csrfToken = action.payload.csrfToken;
      }
      state.initialised = true;
    },
    userUpdated(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
    },
    /**
     * Marks the cold-load session check as finished.
     *
     * Separate from `credentialsReceived` because the common outcome is "there
     * was no session" — and the guards still need to know the question has
     * been asked, or they redirect on every reload.
     */
    sessionChecked(state) {
      state.initialised = true;
    },
    loggedOut(state) {
      state.token = null;
      state.user = null;
      state.csrfToken = null;
      state.initialised = true;
    },
  },
});

export const { credentialsReceived, userUpdated, sessionChecked, loggedOut } = authSlice.actions;
export default authSlice.reducer;

/* --------------------------------- selectors ------------------------------- */

export const selectAuthUser = (state: { auth: AuthState }) => state.auth.user;
export const selectIsAuthenticated = (state: { auth: AuthState }) => Boolean(state.auth.token);
export const selectAuthReady = (state: { auth: AuthState }) => state.auth.initialised;

/**
 * §12's client-side check.
 *
 * Mirrors `requirePermission` in `server/src/auth/middleware.ts` — and is
 * *only* a mirror. This decides what to render; the API decides what may
 * happen, and refuses the same request regardless of what this returns.
 */
export function hasPermission(
  user: AuthUser | null,
  resource: ResourceKey,
  action: PermissionAction = 'view',
) {
  if (!user) return false;
  if (user.roleKey === 'super_admin') return true;
  return Boolean(user.permissions?.[resource]?.[action]);
}
