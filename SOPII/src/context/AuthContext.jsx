import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { STORAGE_KEYS } from '../utils/storage';
import {
  ApiError,
  createAddress,
  deleteAddress,
  fetchAddresses,
  fetchMyOrders,
  fetchOrder,
  updateAddress,
} from '../services/api';
import * as auth from '../services/authApi';
import { adaptAddresses, adaptOrder, adaptOrders } from '../services/adapters';

/**
 * The authentication context (§13).
 * ===========================================================================
 * One session, three ways in — password, mobile OTP, Google — all resolving to
 * the same identity on the server (§9). This provider owns the client half of
 * that: it holds the user, exposes the three login calls, and keeps the access
 * token alive.
 *
 * What is *not* here is as deliberate as what is. There is no token in state,
 * no token in localStorage, and no token in the value this context publishes
 * (§30). `services/authApi.js` keeps it in a module variable, and the durable
 * half of the session is an HttpOnly cookie neither this file nor an injected
 * script can read.
 *
 * The one thing still written to storage is a *cached profile* — the name the
 * header renders on first paint, so a reload does not flash "Sign in" before
 * the session is restored. It is a convenience, and it is discarded the moment
 * the server disagrees with it.
 *
 * Guests remain first-class throughout: they check out without an account, and
 * the `{ code, email }` handles of what they ordered stay in this browser.
 */
const AuthContext = createContext(null);

/** How many guest order handles to remember in this browser. */
const MAX_GUEST_ORDERS = 20;

/** Turns any thrown API error into the `{ ok, message }` the forms render. */
function failure(error) {
  if (error instanceof ApiError) {
    return { ok: false, message: error.message, status: error.status, retryAfter: error.retryAfter };
  }
  console.warn('[auth] request failed:', error);
  return {
    ok: false,
    message: 'We could not reach the store just now. Please try again in a moment.',
  };
}

/**
 * The server's identity (§9) in the shape the shop's screens already read.
 *
 * `name`, `phone` and `joinedAt` are what Header, Checkout and Account use;
 * the first/last split, role and verification flags are the new fields the
 * security screens need. Keeping both means nothing downstream had to change.
 */
function adaptUser(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    firstName: raw.firstName || '',
    lastName: raw.lastName || '',
    name: raw.name || [raw.firstName, raw.lastName].filter(Boolean).join(' '),
    email: raw.email || '',
    emailMasked: raw.emailMasked || '',
    phone: raw.mobile || '',
    mobile: raw.mobile || '',
    avatar: raw.profileImage || '',
    role: raw.role || 'customer',
    roleName: raw.roleName || 'Customer',
    isAdmin: Boolean(raw.isAdmin),
    status: raw.status || 'active',
    emailVerified: Boolean(raw.emailVerified),
    mobileVerified: Boolean(raw.mobileVerified),
    whatsappVerified: Boolean(raw.whatsappVerified),
    hasPassword: Boolean(raw.hasPassword),
    identities: raw.identities || [],
    permissions: raw.permissions || null,
    acceptsMarketing: Boolean(raw.acceptsMarketing),
    joinedAt: raw.createdAt || new Date().toISOString(),
    lastLoginAt: raw.lastLoginAt || null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useLocalStorage(STORAGE_KEYS.user, null);
  /* Handles only — `{ code, email }` — never the orders themselves. */
  const [guestOrders, setGuestOrders] = useLocalStorage(STORAGE_KEYS.guestOrders, []);

  const [addresses, setAddresses] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersStatus, setOrdersStatus] = useState('idle'); // idle | loading | ready | error
  /** False until the held cookie has been checked, so guards can wait. */
  const [ready, setReady] = useState(false);

  const isAuthenticated = Boolean(user);

  const clearSession = useCallback(() => {
    auth.clearSession();
    setUser(null);
    setAddresses([]);
    setOrders([]);
    setOrdersStatus('idle');
  }, [setUser]);

  /** Adopts the `{ user, accessToken, expiresIn, csrfToken }` a login returns. */
  const adoptSession = useCallback(
    (payload) => {
      auth.setSession(payload);
      const adapted = adaptUser(payload.user);
      setUser(adapted);
      return { ok: true, user: adapted, redirectTo: payload.redirectTo };
    },
    [setUser],
  );

  /* ---------------------------- session restore ---------------------------- */

  /**
   * On a cold load the access token is gone (it only ever lived in memory), so
   * the session is restored by asking the API to trade the refresh cookie for
   * a new one. A failure is the ordinary signed-out case, not an error.
   */
  useEffect(() => {
    let cancelled = false;

    auth
      .bootstrapSession()
      .then((restored) => {
        if (cancelled) return;
        // A cached profile with no live session is stale — drop it, or the
        // header shows a name for someone who is not signed in.
        if (restored) setUser(adaptUser(restored));
        else setUser(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
    // Runs once: every later change goes through login / logout, which set the
    // state directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Keeps the access token fresh while a tab sits open.
   *
   * Without this, a shopper who leaves the page open for twenty minutes finds
   * their next click spending a round trip on a 401-then-refresh. The timer
   * runs at half the token's life so a missed tick is not fatal.
   */
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    /*
     * Skipped while the tab is hidden.
     *
     * A refresh is not a free timer tick: it rotates the refresh token, writes
     * a new row and touches the session on the server. A background tab left
     * open overnight used to perform ~200 of those, none of which any person
     * was waiting for, and a browser with six shop tabs open multiplied that by
     * six. Multiply again by the number of people who leave tabs open and it is
     * a meaningful share of the write load on the auth collections.
     *
     * A hidden tab does not need a live token — nothing is being clicked. The
     * `visibilitychange` handler below refreshes on the way back if the held
     * token went stale meanwhile, so returning to the tab is still instant.
     */
    const tick = () => {
      if (document.hidden) return;
      auth.refresh().catch(() => clearSession());
    };

    const timer = setInterval(
      tick,
      // Half of the 15-minute default. The server is the authority on the
      // actual lifetime; this only has to be comfortably shorter than it.
      7 * 60 * 1000,
    );

    /* Catches up a tab that was hidden through one or more missed ticks. */
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, clearSession]);

  /* -------------------------------- orders --------------------------------- */

  const rememberGuestOrder = useCallback(
    (code, email) => {
      setGuestOrders((current) =>
        [{ code, email }, ...current.filter((entry) => entry.code !== code)].slice(
          0,
          MAX_GUEST_ORDERS,
        ),
      );
    },
    [setGuestOrders],
  );

  /*
   * Guest handles are read through a ref inside `loadOrders` so that adding one
   * at checkout does not re-run the effect that loads the list.
   */
  const guestOrdersRef = useRef(guestOrders);
  guestOrdersRef.current = guestOrders;

  const loadOrders = useCallback(
    async ({ signal } = {}) => {
      setOrdersStatus('loading');
      try {
        if (isAuthenticated) {
          const payload = await fetchMyOrders({ signal });
          setOrders(adaptOrders(payload.items));
        } else {
          /* A guest's orders are fetched one handle at a time — the API will
             not list orders for an address nobody has proved they own. */
          const results = await Promise.all(
            guestOrdersRef.current.map((entry) =>
              fetchOrder(entry.code, { email: entry.email, signal })
                .then((payload) => adaptOrder(payload.order))
                .catch(() => null),
            ),
          );
          setOrders(results.filter(Boolean));
        }
        setOrdersStatus('ready');
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.warn('[auth] could not load orders:', error);
        setOrdersStatus('error');
      }
    },
    [isAuthenticated],
  );

  /*
   * Orders are fetched **on demand**, not on every page load.
   *
   * This effect used to run as soon as the session was restored, on every cold
   * load of every page — so opening the home page fetched the shopper's whole
   * order history, and a guest with saved order handles fetched one request per
   * handle, up to twenty. None of it is rendered until somebody opens
   * /orders or /account.
   *
   * `refreshOrders` is already on the context and already called by the screens
   * that show orders; the effect below simply resets the list when the session
   * changes, so a sign-out cannot leave the previous person's orders in memory.
   */
  useEffect(() => {
    if (!ready) return;
    setOrders([]);
    setOrdersStatus('idle');
  }, [ready, isAuthenticated]);

  const placeOrder = useCallback(
    (order) => {
      setOrders((current) => [order, ...current.filter((entry) => entry.id !== order.id)]);
      if (!isAuthenticated) rememberGuestOrder(order.id, order.email);
      return order;
    },
    [isAuthenticated, rememberGuestOrder],
  );

  const getOrder = useCallback((code) => orders.find((order) => order.id === code), [orders]);

  /**
   * The email a guest order was placed with, from the handles this browser
   * kept.
   *
   * The API will not hand over an order to somebody who only knows its code —
   * that is the guard that stops an order code being a lookup key for anyone
   * who guesses one. A guest therefore has to present the email as well, and
   * this is where the browser remembers it, so reloading the receipt page
   * does not turn into a form.
   *
   * Exposed because orders are no longer loaded eagerly: `OrderSuccess` used
   * to find a guest's order in a list that had been fetched on every page of
   * the shop, which is a lot of requests to make one screen work.
   */
  const guestOrderEmail = useCallback(
    (code) => guestOrdersRef.current.find((entry) => entry.code === code)?.email ?? null,
    [],
  );

  const lookupOrder = useCallback(
    async (code, email) => {
      try {
        const payload = await fetchOrder(code, { email });
        const order = adaptOrder(payload.order);
        setOrders((current) =>
          current.some((entry) => entry.id === order.id) ? current : [order, ...current],
        );
        if (!isAuthenticated && email) rememberGuestOrder(order.id, order.email);
        return { ok: true, order };
      } catch (error) {
        return failure(error);
      }
    },
    [isAuthenticated, rememberGuestOrder],
  );

  /* ------------------------------ the three ways --------------------------- */

  /** §2. Accepts an email, a username or a mobile number as `identifier`. */
  const login = useCallback(
    async ({ identifier, email, password }) => {
      try {
        return adoptSession(
          await auth.loginWithPassword({ identifier: identifier ?? email, password }),
        );
      } catch (error) {
        return failure(error);
      }
    },
    [adoptSession],
  );

  /** §3. */
  const register = useCallback(
    async (values) => {
      try {
        return adoptSession(await auth.registerAccount(values));
      } catch (error) {
        return failure(error);
      }
    },
    [adoptSession],
  );

  /** §5, first half: ask for a code. Answers the metadata the OTP screen needs. */
  const requestOtp = useCallback(async (mobile) => {
    try {
      const payload = await auth.requestOtp(mobile);
      return { ok: true, ...payload };
    } catch (error) {
      return failure(error);
    }
  }, []);

  /** §5, second half. */
  const loginWithOTP = useCallback(
    async (mobile, otp) => {
      try {
        return adoptSession(await auth.verifyOtp(mobile, otp));
      } catch (error) {
        return failure(error);
      }
    },
    [adoptSession],
  );

  /* ------------------------------ whatsapp otp ----------------------------- */

  /*
   * The WhatsApp flow is the mobile flow with a different transport, and it is
   * exposed as three separate calls rather than one because the OTP screen has
   * three distinct moments: ask, re-ask, and prove. `resend` is its own call so
   * the server can tell a first send from a re-send in the audit trail, and so
   * pressing "Resend" cannot accidentally start a fresh verification attempt
   * with its own allowance of guesses.
   */

  const requestWhatsAppOtp = useCallback(async (mobile) => {
    try {
      const payload = await auth.requestWhatsAppOtp(mobile);
      return { ok: true, ...payload };
    } catch (error) {
      return failure(error);
    }
  }, []);

  const resendWhatsAppOtp = useCallback(async (mobile) => {
    try {
      const payload = await auth.resendWhatsAppOtp(mobile);
      return { ok: true, ...payload };
    } catch (error) {
      return failure(error);
    }
  }, []);

  /**
   * Verifies the code and signs in.
   *
   * The server decides what that means: an existing account with this number
   * is logged into and gains WhatsApp as a login method, a number nobody holds
   * becomes a new `customer`. Neither outcome is decided here, and the role is
   * never sent from the browser.
   */
  const loginWithWhatsApp = useCallback(
    async (mobile, otp) => {
      try {
        return adoptSession(await auth.verifyWhatsAppOtp(mobile, otp));
      } catch (error) {
        return failure(error);
      }
    },
    [adoptSession],
  );

  /**
   * §7. A full-page navigation rather than a promise: the browser leaves for
   * Google and comes back to `/auth/callback`, which finishes the session.
   */
  const loginWithGoogle = useCallback((next = '/account') => {
    window.location.assign(auth.googleAuthorizeUrl(next));
  }, []);

  /**
   * Called by `/auth/callback` once Google has sent the browser back. The
   * refresh cookie is already set; this trades it for an access token.
   */
  const completeGoogleLogin = useCallback(async () => {
    try {
      const payload = await auth.refresh();
      return adoptSession(payload);
    } catch (error) {
      return failure(error);
    }
  }, [adoptSession]);

  /** §15. */
  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      clearSession();
    }
    return { ok: true };
  }, [clearSession]);

  /* ------------------------------ password reset --------------------------- */

  const requestPasswordReset = useCallback(async (email) => {
    try {
      const payload = await auth.requestPasswordReset(email);
      return { ok: true, message: payload.message };
    } catch (error) {
      return failure(error);
    }
  }, []);

  const resetPassword = useCallback(async (values) => {
    try {
      const payload = await auth.resetPassword(values);
      return { ok: true, message: payload.message };
    } catch (error) {
      return failure(error);
    }
  }, []);

  /* --------------------------------- profile ------------------------------- */

  const updateProfile = useCallback(
    async (patch) => {
      try {
        /*
         * The shop's Account form still sends `{ name, phone }`. The identity
         * model stores the name in two parts and treats the mobile as a
         * verified credential rather than a field, so a single `name` is split
         * here and a `phone` is ignored — changing a number goes through the
         * OTP flow on /account/security.
         */
        const body = { ...patch };
        if (body.name !== undefined) {
          const parts = body.name.trim().split(/\s+/).filter(Boolean);
          body.firstName = parts[0] ?? '';
          body.lastName = parts.slice(1).join(' ');
          delete body.name;
        }
        delete body.phone;

        const payload = await auth.updateAuthProfile(body);
        setUser(adaptUser(payload.user));
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },
    [setUser],
  );

  /** §26. Sets a first password, or changes an existing one. */
  const changePassword = useCallback(
    async (values) => {
      try {
        const payload = await auth.changePassword(values);
        if (payload.user) setUser(adaptUser(payload.user));
        return { ok: true, message: payload.message, signedOutDevices: payload.otherDevicesSignedOut };
      } catch (error) {
        return failure(error);
      }
    },
    [setUser],
  );

  /** Re-reads the identity — after linking Google, verifying a mobile, and so on. */
  const refreshUser = useCallback(async () => {
    try {
      const payload = await auth.fetchMe();
      setUser(adaptUser(payload.user));
      return { ok: true, user: payload.user };
    } catch (error) {
      return failure(error);
    }
  }, [setUser]);

  /* ------------------------------- addresses ------------------------------- */

  const toApiAddress = (address) => ({
    id: address.id,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    isDefault: Boolean(address.isDefault),
  });

  const saveAddress = useCallback(async (address) => {
    try {
      const payload = address.id
        ? await updateAddress(address.id, toApiAddress(address))
        : await createAddress(toApiAddress(address));
      setAddresses(adaptAddresses(payload.items));
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  }, []);

  const removeAddress = useCallback(async (id) => {
    try {
      const payload = await deleteAddress(id);
      setAddresses(adaptAddresses(payload.items));
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  }, []);

  /*
   * Addresses live on the commerce record rather than the identity, so they
   * are fetched once a session exists rather than arriving with it.
   *
   * Deliberately left eager, unlike orders above: it is one small request for
   * signed-in shoppers only, and the checkout — reachable in one click from any
   * page — renders the saved address list immediately. Deferring it would trade
   * a request nobody notices for a spinner on the highest-value screen in the
   * shop.
   */
  useEffect(() => {
    if (!ready || !isAuthenticated) return undefined;
    const controller = new AbortController();

    fetchAddresses({ signal: controller.signal })
      .then((payload) => setAddresses(adaptAddresses(payload.items)))
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[auth] could not load addresses:', error);
      });

    return () => controller.abort();
  }, [ready, isAuthenticated]);

  const value = useMemo(
    () => ({
      /* §13's shape */
      user,
      isAuthenticated,
      role: user?.role ?? null,
      permissions: user?.permissions ?? null,
      /** False until the held session has been checked, so guards can wait. */
      ready,

      login,
      loginWithOTP,
      loginWithGoogle,
      completeGoogleLogin,
      requestOtp,
      register,
      logout,

      /* §5, over WhatsApp */
      requestWhatsAppOtp,
      resendWhatsAppOtp,
      loginWithWhatsApp,

      requestPasswordReset,
      resetPassword,
      changePassword,
      updateProfile,
      refreshUser,

      orders,
      ordersStatus,
      refreshOrders: loadOrders,
      placeOrder,
      getOrder,
      guestOrderEmail,
      lookupOrder,

      addresses,
      saveAddress,
      removeAddress,
    }),
    [
      user,
      isAuthenticated,
      ready,
      login,
      loginWithOTP,
      loginWithGoogle,
      completeGoogleLogin,
      requestOtp,
      register,
      logout,
      requestWhatsAppOtp,
      resendWhatsAppOtp,
      loginWithWhatsApp,
      requestPasswordReset,
      resetPassword,
      changePassword,
      updateProfile,
      refreshUser,
      orders,
      ordersStatus,
      loadOrders,
      placeOrder,
      getOrder,
      guestOrderEmail,
      lookupOrder,
      addresses,
      saveAddress,
      removeAddress,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Orders, fetched the first time a screen that shows them is mounted.
 *
 * The provider no longer loads orders eagerly — see the note on the effect that
 * used to. This hook is the replacement, and it is a hook rather than a call so
 * that "this screen needs orders" is one line at the top of the screen and the
 * fetch is cancelled if the shopper navigates away mid-request.
 *
 * Re-fetches when the session changes, so signing in on the orders page shows
 * the newly reachable history without a reload.
 */
export function useOrders() {
  const { orders, ordersStatus, refreshOrders, isAuthenticated, ready } = useAuth();

  useEffect(() => {
    if (!ready) return undefined;
    const controller = new AbortController();
    refreshOrders({ signal: controller.signal });
    return () => controller.abort();
  }, [ready, isAuthenticated, refreshOrders]);

  return { orders, ordersStatus, refreshOrders };
}
