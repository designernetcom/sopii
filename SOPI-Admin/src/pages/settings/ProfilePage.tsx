import { useState } from 'react';
import {
  Check,
  ImageIcon,
  KeyRound,
  Laptop,
  LogOut,
  Minus,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { userUpdated } from '@/store/slices/authSlice';
import { useLogout } from '@/hooks/useLogout';
import {
  useChangePasswordMutation,
  useRevokeSessionMutation,
  useSetTwoFactorMutation,
  useUpdateProfileMutation,
} from '@/store/api/platformApi';
import { errorMessage } from '@/store/api/baseQuery';
import { fetchMe } from '@/store/api/authApi';
import { ACTIONS, RESOURCES } from '@/data/admin';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Avatar } from '@/components/common/AppImage';
import { Field, Input, Switch } from '@/components/common/Field';
import { EmptyState } from '@/components/common/States';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { MediaPickerModal } from '@/components/modals/MediaPickerModal';
import { useToast } from '@/components/common/Toast';
import { formatDate, formatRelativeTime, titleCase } from '@/utils/format';
import type { LoginActivity } from '@/types';

export default function ProfilePage() {
  useDocumentTitle('My Profile');

  const toast = useToast();
  const dispatch = useAppDispatch();
  const logout = useLogout();
  const user = useAppSelector((state) => state.auth.user);
  const token = useAppSelector((state) => state.auth.token);

  const [updateProfile, { isLoading: savingProfile }] = useUpdateProfileMutation();
  const [changePassword, { isLoading: savingPassword }] = useChangePasswordMutation();
  const [setTwoFactor, { isLoading: savingTwoFactor }] = useSetTwoFactorMutation();
  const [revokeSession, { isLoading: revoking }] = useRevokeSessionMutation();

  const [details, setDetails] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    avatar: user?.avatar ?? '',
  });
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  const [revokeTarget, setRevokeTarget] = useState<LoginActivity | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);

  if (!user) {
    return (
      <Card>
        <EmptyState
          title="No active session"
          description="Sign in again to view your profile."
          action={
            <Button variant="primary" to="/admin/login">
              Go to sign in
            </Button>
          }
        />
      </Card>
    );
  }

  const saveDetails = async () => {
    const next: Record<string, string> = {};
    if (details.name.trim().length < 2) next.name = 'Full name is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) {
      next.email = 'Enter a valid email address';
    }
    if (details.phone.trim() && !/^[+\d][\d\s-]{7,15}$/.test(details.phone.trim())) {
      next.phone = 'Enter a valid phone number';
    }
    setDetailErrors(next);
    if (Object.keys(next).length) return;

    try {
      await updateProfile({
        id: user.id,
        name: details.name.trim(),
        email: details.email.trim().toLowerCase(),
        phone: details.phone.trim() || undefined,
        avatar: details.avatar || undefined,
      }).unwrap();
      dispatch(userUpdated((await fetchMe(token)).user));
      toast.success('Profile updated successfully.');
    } catch (error) {
      toast.error('Could not update your profile', errorMessage(error));
    }
  };

  const savePassword = async () => {
    const next: Record<string, string> = {};
    if (!passwords.current) next.current = 'Enter your current password';
    if (passwords.next.length < 8) next.next = 'Use at least 8 characters';
    if (passwords.next !== passwords.confirm) next.confirm = 'Passwords do not match';
    setPasswordErrors(next);
    if (Object.keys(next).length) return;

    try {
      const result = await changePassword({
        currentPassword: passwords.current,
        newPassword: passwords.next,
        confirmPassword: passwords.confirm,
      }).unwrap();
      setPasswords({ current: '', next: '', confirm: '' });
      dispatch(userUpdated((await fetchMe(token)).user));
      toast.success(
        'Password changed successfully.',
        result.otherDevicesSignedOut
          ? `We also signed out ${result.otherDevicesSignedOut} other device(s).`
          : 'Use it the next time you sign in.',
      );
    } catch (error) {
      toast.error('Could not change your password', errorMessage(error));
    }
  };

  const toggleTwoFactor = async (enabled: boolean) => {
    try {
      await setTwoFactor({ id: user.id, enabled }).unwrap();
      dispatch(userUpdated((await fetchMe(token)).user));
      toast.success(
        enabled ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled',
      );
    } catch (error) {
      toast.error('Could not update two-factor authentication', errorMessage(error));
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      const result = await revokeSession({ id: revokeTarget.id }).unwrap();
      setRevokeTarget(null);

      // Revoking the device you are holding is a logout; staying put would
      // leave a page whose every request now 401s.
      if (result.selfRevoked) {
        void logout();
        return;
      }

      dispatch(userUpdated((await fetchMe(token)).user));
      toast.success('Session revoked', `${revokeTarget.browser} on ${revokeTarget.device}`);
    } catch (error) {
      toast.error('Could not revoke the session', errorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="My profile"
        description="Your details, password and the devices signed in to this account."
        meta={<Badge dot="bg-brand-500">{user.roleName}</Badge>}
        actions={
          <Button
            variant="secondary"
            icon={<LogOut className="h-4 w-4" />}
            onClick={() => setSignOutOpen(true)}
          >
            Sign out
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Details */}
          <Card>
            <CardHeader title="Personal details" description="Shown to teammates across the admin." />
            <CardBody className="space-y-5">
              <div className="flex flex-wrap items-center gap-4">
                <Avatar name={details.name || user.name} src={details.avatar} size="lg" />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ImageIcon className="h-3.5 w-3.5" />}
                    onClick={() => setPickerOpen(true)}
                  >
                    Change photo
                  </Button>
                  {details.avatar && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDetails({ ...details, avatar: '' })}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full Name" required error={detailErrors.name}>
                  <Input
                    value={details.name}
                    invalid={Boolean(detailErrors.name)}
                    onChange={(event) => setDetails({ ...details, name: event.target.value })}
                  />
                </Field>
                <Field label="Email" required error={detailErrors.email}>
                  <Input
                    type="email"
                    value={details.email}
                    invalid={Boolean(detailErrors.email)}
                    onChange={(event) => setDetails({ ...details, email: event.target.value })}
                  />
                </Field>
                <Field label="Phone" error={detailErrors.phone}>
                  <Input
                    value={details.phone}
                    invalid={Boolean(detailErrors.phone)}
                    onChange={(event) => setDetails({ ...details, phone: event.target.value })}
                    placeholder="+91 98200 12345"
                  />
                </Field>
                <Field label="Role" hint="Only a Super Admin can change your role.">
                  <Input value={user.roleName} disabled />
                </Field>
              </div>
            </CardBody>
            <CardFooter>
              <Button variant="primary" loading={savingProfile} onClick={saveDetails}>
                Save changes
              </Button>
            </CardFooter>
          </Card>

          {/* Password */}
          <Card>
            <CardHeader
              title="Password"
              description="Use at least 8 characters, including a number or symbol."
            />
            <CardBody className="space-y-4">
              <Field label="Current Password" required error={passwordErrors.current}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={passwords.current}
                  invalid={Boolean(passwordErrors.current)}
                  onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="New Password" required error={passwordErrors.next}>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={passwords.next}
                    invalid={Boolean(passwordErrors.next)}
                    onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
                  />
                </Field>
                <Field label="Confirm New Password" required error={passwordErrors.confirm}>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={passwords.confirm}
                    invalid={Boolean(passwordErrors.confirm)}
                    onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
                  />
                </Field>
              </div>
            </CardBody>
            <CardFooter>
              <Button
                variant="primary"
                icon={<KeyRound className="h-4 w-4" />}
                loading={savingPassword}
                onClick={savePassword}
              >
                Change password
              </Button>
            </CardFooter>
          </Card>

          {/* Sessions */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Signed-in devices"
              description="Revoke anything you do not recognise."
            />
            {user.loginActivity.length === 0 ? (
              <EmptyState
                compact
                icon={Laptop}
                title="No other sessions"
                description="This is the only device signed in to your account."
              />
            ) : (
              <ul className="divide-y divide-ink-200 dark:divide-ink-800">
                {user.loginActivity.map((session) => (
                  <li key={session.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                      {/mobile|android|iphone/i.test(session.device) ? (
                        <Smartphone className="h-4 w-4" />
                      ) : (
                        <Laptop className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                          {session.browser} · {session.device}
                        </p>
                        {session.current && (
                          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                            This device
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-2xs text-ink-500 dark:text-ink-400">
                        {session.location} · {session.ip} · {formatRelativeTime(session.at)}
                      </p>
                    </div>
                    {!session.current && (
                      <Button size="xs" variant="secondary" onClick={() => setRevokeTarget(session)}>
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Two-factor authentication" />
            <CardBody className="space-y-4">
              <Switch
                checked={user.twoFactorEnabled}
                disabled={savingTwoFactor}
                onChange={toggleTwoFactor}
                label={user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                description="Require a one-time code from your authenticator app at every sign-in."
              />
              <p className="rounded-lg bg-ink-50 p-3 text-2xs leading-relaxed text-ink-500 dark:bg-ink-800/60 dark:text-ink-400">
                Strongly recommended for accounts that can edit orders, refunds or admin users.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Account" />
            <CardBody>
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-ink-500 dark:text-ink-400">Role</dt>
                  <dd className="text-right font-medium text-ink-900 dark:text-ink-100">
                    {user.roleName}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-ink-500 dark:text-ink-400">Status</dt>
                  <dd className="text-right font-medium capitalize text-ink-900 dark:text-ink-100">
                    {user.status}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-ink-500 dark:text-ink-400">Last login</dt>
                  <dd className="text-right font-medium text-ink-900 dark:text-ink-100">
                    {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : '—'}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-ink-500 dark:text-ink-400">Member since</dt>
                  <dd className="text-right font-medium text-ink-900 dark:text-ink-100">
                    {formatDate(user.createdAt)}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="My permissions"
              description={
                user.roleKey === 'super_admin'
                  ? 'Super Admin has unrestricted access.'
                  : `Granted by the ${user.roleName} role.`
              }
              action={<ShieldCheck className="h-4 w-4 text-ink-400" />}
            />
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ink-50/95 backdrop-blur dark:bg-ink-900/95">
                  <tr className="border-b border-ink-200 dark:border-ink-800">
                    <th
                      scope="col"
                      className="px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                    >
                      Module
                    </th>
                    {ACTIONS.map((action) => (
                      <th
                        key={action}
                        scope="col"
                        className="px-1.5 py-2 text-center text-2xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                      >
                        {titleCase(action).slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                  {RESOURCES.map((resource) => (
                    <tr key={resource.key}>
                      <td className="px-4 py-1.5 text-xs text-ink-700 dark:text-ink-300">
                        {resource.label}
                      </td>
                      {ACTIONS.map((action) => {
                        const allowed =
                          user.roleKey === 'super_admin' ||
                          Boolean(user.permissions?.[resource.key]?.[action]);
                        return (
                          <td key={action} className="px-1.5 py-1.5 text-center">
                            {allowed ? (
                              <Check
                                className="mx-auto h-3.5 w-3.5 text-emerald-500"
                                aria-label="Allowed"
                              />
                            ) : (
                              <Minus
                                className="mx-auto h-3.5 w-3.5 text-ink-300 dark:text-ink-700"
                                aria-label="Not allowed"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple={false}
        folder="other"
        title="Select profile photo"
        onSelect={(assets) => {
          if (assets[0]) setDetails({ ...details, avatar: assets[0].url });
        }}
      />

      <ConfirmModal
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        loading={revoking}
        tone="warning"
        confirmLabel="Revoke session"
        title="Revoke this session?"
        description={
          revokeTarget
            ? `${revokeTarget.browser} on ${revokeTarget.device} (${revokeTarget.location}) will be signed out immediately.`
            : undefined
        }
      />

      <ConfirmModal
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => void logout()}
        tone="info"
        confirmLabel="Sign out"
        title="Sign out of SOPII Admin?"
        description="You will need to sign in again to get back into the dashboard."
      />
    </div>
  );
}
