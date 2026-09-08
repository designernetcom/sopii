import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { RouteSkeleton } from './components/ui/PageSkeletons';
import {
  AccessDenied,
  GuestRoute,
  ProtectedRoute,
} from './components/auth/ProtectedRoute';

import { ToastProvider } from './context/ToastContext';
import { CatalogGate, CatalogProvider } from './context/CatalogContext';
import { UIProvider } from './context/UIContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { AuthProvider } from './context/AuthContext';
import { RecentlyViewedProvider } from './context/RecentlyViewedContext';
import { SeoProvider } from './context/SeoContext';

/**
 * A category page is the Shop scoped to one category, keyed on the slug so
 * moving between categories remounts rather than reusing the previous scope.
 */
function CategoryRoute() {
  const { categorySlug } = useParams();
  return <Shop key={categorySlug} categorySlug={categorySlug} />;
}

/* Home ships in the initial bundle; everything else is split per route. */
import Home from './pages/Home';

const Shop = lazy(() => import('./pages/Shop'));
const ProductDetails = lazy(() => import('./pages/ProductDetails'));
const Collections = lazy(() => import('./pages/Collections'));
const CollectionDetail = lazy(() => import('./pages/CollectionDetail'));
const SearchResults = lazy(() => import('./pages/SearchResults'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const OrderSuccess = lazy(() => import('./pages/OrderSuccess'));
const Login = lazy(() => import('./pages/Login'));
const LoginOtp = lazy(() => import('./pages/LoginOtp'));
const LoginWhatsApp = lazy(() => import('./pages/LoginWhatsApp'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const Account = lazy(() => import('./pages/Account'));
const AccountSecurity = lazy(() => import('./pages/AccountSecurity'));
const AccountSessions = lazy(() => import('./pages/AccountSessions'));
const Orders = lazy(() => import('./pages/Orders'));
const StaticPage = lazy(() => import('./pages/StaticPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

/**
 * Provider order matters:
 *   Toast   -> Cart, Wishlist and Catalog raise toasts
 *   Catalog -> everything below reads the live catalogue and store settings
 *   Cart    -> Wishlist moves items into the bag
 *   Auth    -> independent, but Header reads it
 *   Seo     -> wraps the routes, so every page can read the site's SEO
 *              settings; sits inside Catalog because a product page resolves
 *              its metadata against both
 */
export default function App() {
  return (
    <ToastProvider>
      <CatalogProvider>
        <SeoProvider>
          <AuthProvider>
            <CartProvider>
              <WishlistProvider>
                <RecentlyViewedProvider>
                  <UIProvider>
                    <CatalogGate>
                      <Suspense fallback={<RouteSkeleton chrome />}>
                        <Routes>
                          <Route element={<Layout />}>
                            <Route index element={<Home />} />

                            {/* Catalogue */}
                            <Route path="shop" element={<Shop />} />
                            <Route path="new-arrivals" element={<Shop key="new" preset="new-arrivals" />} />
                            <Route path="bestsellers" element={<Shop key="best" preset="bestsellers" />} />
                            <Route path="sale" element={<Shop key="sale" preset="sale" />} />
                            <Route path="sarees" element={<Shop key="sarees" preset="sarees" />} />
                            <Route path="blouses" element={<Shop key="blouses" preset="blouses" />} />
                            <Route path="women" element={<Shop key="women" preset="women" />} />

                            <Route path="collections" element={<Collections />} />
                            <Route path="collections/:slug" element={<CollectionDetail />} />

                            <Route path="product/:id" element={<ProductDetails />} />
                            <Route path="search" element={<SearchResults />} />

                            {/* Shopping flow */}
                            <Route path="wishlist" element={<Wishlist />} />
                            <Route path="cart" element={<Cart />} />
                            <Route path="checkout" element={<Checkout />} />
                            <Route path="order-success" element={<OrderSuccess />} />
                            <Route path="order-success/:id" element={<OrderSuccess />} />

                            {/*
                              Authentication (§20).

                              `GuestRoute` keeps a signed-in shopper off the login
                              and register screens; `ProtectedRoute` does the
                              reverse for the account screens. Both wait for the
                              session to be restored before deciding — see
                              components/auth/ProtectedRoute.jsx.

                              /auth/callback is deliberately ungarded: it is where
                              Google returns the browser, and it has to run for
                              somebody who is not signed in yet.
                            */}
                            <Route
                              path="login"
                              element={
                                <GuestRoute>
                                  <Login />
                                </GuestRoute>
                              }
                            />
                            <Route
                              path="login/otp"
                              element={
                                <GuestRoute>
                                  <LoginOtp />
                                </GuestRoute>
                              }
                            />
                            {/*
                              §2's WhatsApp flow, at an address of its own so a
                              link to it can be sent in the WhatsApp thread the
                              shopper is already reading. Redirects to /login
                              when the store has no provider configured.
                            */}
                            <Route
                              path="login/whatsapp"
                              element={
                                <GuestRoute>
                                  <LoginWhatsApp />
                                </GuestRoute>
                              }
                            />
                            <Route
                              path="register"
                              element={
                                <GuestRoute>
                                  <Register />
                                </GuestRoute>
                              }
                            />
                            <Route path="forgot-password" element={<ForgotPassword />} />
                            <Route path="reset-password" element={<ResetPassword />} />
                            <Route path="auth/callback" element={<AuthCallback />} />

                            <Route
                              path="account"
                              element={
                                <ProtectedRoute>
                                  <Account />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="account/security"
                              element={
                                <ProtectedRoute>
                                  <AccountSecurity />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="account/sessions"
                              element={
                                <ProtectedRoute>
                                  <AccountSessions />
                                </ProtectedRoute>
                              }
                            />
                            <Route path="orders" element={<Orders />} />

                            {/*
                              §32's Flow 6, from the shop's side: a customer who
                              types /admin/* is told plainly rather than shown a
                              404. The panel is a separate application; the API
                              refuses them either way.
                            */}
                            <Route path="admin/*" element={<AccessDenied />} />

                            {/* Content */}
                            <Route path="pages/:slug" element={<StaticPage />} />

                            {/*
                              Every other category, by slug. Declared last so
                              the static routes above always win; an unknown
                              slug renders the 404 from inside Shop. Matches a
                              single segment only, so /pages/faq is unaffected.
                            */}
                            <Route path=":categorySlug" element={<CategoryRoute />} />

                            <Route path="index.html" element={<Navigate to="/" replace />} />
                            <Route path="*" element={<NotFound />} />
                          </Route>
                        </Routes>
                      </Suspense>
                    </CatalogGate>
                  </UIProvider>
                </RecentlyViewedProvider>
              </WishlistProvider>
            </CartProvider>
          </AuthProvider>
        </SeoProvider>
      </CatalogProvider>
    </ToastProvider>
  );
}
