import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '@/layouts/AdminLayout';
import { RedirectIfAuthenticated, RequireAuth, RequirePermission } from './guards';
import type { ResourceKey } from '@/types';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const AuthCallbackPage = lazy(() => import('@/pages/auth/AuthCallbackPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));

const ProductListPage = lazy(() => import('@/pages/products/ProductListPage'));
const ProductFormPage = lazy(() => import('@/pages/products/ProductFormPage'));
const ProductDetailPage = lazy(() => import('@/pages/products/ProductDetailPage'));

const CategoriesPage = lazy(() => import('@/pages/categories/CategoriesPage'));
const CollectionsPage = lazy(() => import('@/pages/collections/CollectionsPage'));

const InventoryPage = lazy(() => import('@/pages/inventory/InventoryPage'));
const InventoryHistoryPage = lazy(() => import('@/pages/inventory/InventoryHistoryPage'));

const OrderListPage = lazy(() => import('@/pages/orders/OrderListPage'));
const OrderDetailPage = lazy(() => import('@/pages/orders/OrderDetailPage'));

const CustomerListPage = lazy(() => import('@/pages/customers/CustomerListPage'));
const CustomerDetailPage = lazy(() => import('@/pages/customers/CustomerDetailPage'));

const CouponsPage = lazy(() => import('@/pages/coupons/CouponsPage'));
const ReviewsPage = lazy(() => import('@/pages/reviews/ReviewsPage'));
const HomepagePage = lazy(() => import('@/pages/homepage/HomepagePage'));
const MediaPage = lazy(() => import('@/pages/media/MediaPage'));
const SeoManagementPage = lazy(() => import('@/pages/seo/SeoManagementPage'));
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'));
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'));
const AdminUsersPage = lazy(() => import('@/pages/users/AdminUsersPage'));
const RolesPage = lazy(() => import('@/pages/users/RolesPage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const ProfilePage = lazy(() => import('@/pages/settings/ProfilePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function Guarded({
  resource,
  action = 'view',
  children,
}: {
  resource: ResourceKey;
  action?: 'view' | 'create' | 'edit' | 'delete';
  children: React.ReactNode;
}) {
  return (
    <RequirePermission resource={resource} action={action}>
      {children}
    </RequirePermission>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {/*
        §20's admin addresses. These sit under /admin/* alongside the panel
        itself so that one deployment owns one path prefix — a login page at
        the site root would collide with the shop front if the two are ever
        served from the same domain.
      */}
      <Route
        path="/admin/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route path="/admin/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/admin/reset-password" element={<ResetPasswordPage />} />
      {/* Ungarded on purpose: Google returns the browser here before a session
          exists. */}
      <Route path="/admin/auth/callback" element={<AuthCallbackPage />} />

      {/* The old address, kept so existing bookmarks and links still land. */}
      <Route path="/login" element={<Navigate to="/admin/login" replace />} />

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <Guarded resource="dashboard">
              <DashboardPage />
            </Guarded>
          }
        />

        <Route path="products">
          <Route
            index
            element={
              <Guarded resource="products">
                <ProductListPage />
              </Guarded>
            }
          />
          <Route
            path="create"
            element={
              <Guarded resource="products" action="create">
                <ProductFormPage mode="create" />
              </Guarded>
            }
          />
          <Route
            path=":id"
            element={
              <Guarded resource="products">
                <ProductDetailPage />
              </Guarded>
            }
          />
          <Route
            path=":id/edit"
            element={
              <Guarded resource="products" action="edit">
                <ProductFormPage mode="edit" />
              </Guarded>
            }
          />
        </Route>

        <Route
          path="categories"
          element={
            <Guarded resource="categories">
              <CategoriesPage />
            </Guarded>
          }
        />
        <Route
          path="collections"
          element={
            <Guarded resource="collections">
              <CollectionsPage />
            </Guarded>
          }
        />

        <Route path="inventory">
          <Route
            index
            element={
              <Guarded resource="inventory">
                <InventoryPage />
              </Guarded>
            }
          />
          <Route
            path="history"
            element={
              <Guarded resource="inventory">
                <InventoryHistoryPage />
              </Guarded>
            }
          />
        </Route>

        <Route path="orders">
          <Route
            index
            element={
              <Guarded resource="orders">
                <OrderListPage />
              </Guarded>
            }
          />
          <Route
            path=":id"
            element={
              <Guarded resource="orders">
                <OrderDetailPage />
              </Guarded>
            }
          />
        </Route>

        <Route path="customers">
          <Route
            index
            element={
              <Guarded resource="customers">
                <CustomerListPage />
              </Guarded>
            }
          />
          <Route
            path=":id"
            element={
              <Guarded resource="customers">
                <CustomerDetailPage />
              </Guarded>
            }
          />
        </Route>

        <Route
          path="coupons"
          element={
            <Guarded resource="coupons">
              <CouponsPage />
            </Guarded>
          }
        />
        <Route
          path="reviews"
          element={
            <Guarded resource="reviews">
              <ReviewsPage />
            </Guarded>
          }
        />
        <Route
          path="homepage"
          element={
            <Guarded resource="homepage">
              <HomepagePage />
            </Guarded>
          }
        />
        <Route
          path="media"
          element={
            <Guarded resource="media">
              <MediaPage />
            </Guarded>
          }
        />
        <Route
          path="reports"
          element={
            <Guarded resource="reports">
              <ReportsPage />
            </Guarded>
          }
        />
        <Route
          path="notifications"
          element={
            <Guarded resource="notifications">
              <NotificationsPage />
            </Guarded>
          }
        />
        <Route
          path="seo"
          element={
            <Guarded resource="seo">
              <SeoManagementPage />
            </Guarded>
          }
        />
        <Route
          path="admin-users"
          element={
            <Guarded resource="admin_users">
              <AdminUsersPage />
            </Guarded>
          }
        />
        <Route
          path="roles"
          element={
            <Guarded resource="roles">
              <RolesPage />
            </Guarded>
          }
        />
        <Route
          path="settings"
          element={
            <Guarded resource="settings">
              <SettingsPage />
            </Guarded>
          }
        />
        <Route path="profile" element={<ProfilePage />} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
