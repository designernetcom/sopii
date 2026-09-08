import { useState } from 'react';
import { KeyRound, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, useListQuery, usePermissions } from '@/hooks';
import {
  useCreateAdminUserMutation,
  useDeleteAdminUserMutation,
  useGetAdminUsersQuery,
  useGetRolesQuery,
  useUpdateAdminUserMutation,
} from '@/store/api/platformApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Button, IconButton } from '@/components/common/Button';
import { Badge, StatusBadge } from '@/components/common/Badge';
import { Avatar } from '@/components/common/AppImage';
import { Field, Input, Select } from '@/components/common/Field';
import { FilterChip, SearchInput } from '@/components/common/SearchInput';
import { Dropdown, DropdownDivider, DropdownItem } from '@/components/common/Dropdown';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { FormModal } from '@/components/modals/FormModal';
import { DeleteModal } from '@/components/modals/ConfirmModal';
import { useToast } from '@/components/common/Toast';
import { formatDate, formatRelativeTime } from '@/utils/format';
import type { BadgeTone } from '@/utils/constants';
import type { AdminUser } from '@/types';

const USER_STATUS: Record<AdminUser['status'], BadgeTone> = {
  active: {
    label: 'Active',
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
  },
  invited: {
    label: 'Invited',
    className:
      'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-400/25',
    dot: 'bg-sky-500',
  },
  suspended: {
    label: 'Suspended',
    className:
      'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/25',
    dot: 'bg-rose-500',
  },
};

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'invited', label: 'Invited' },
  { key: 'suspended', label: 'Suspended' },
];

interface FormState {
  id?: string;
  name: string;
  email: string;
  phone: string;
  roleId: string;
  status: AdminUser['status'];
}

const EMPTY: FormState = {
  name: '',
  email: '',
  phone: '',
  roleId: '',
  status: 'invited',
};

export default function AdminUsersPage() {
  useDocumentTitle('Admin Users');

  const toast = useToast();
  const { can, user: currentUser } = usePermissions();

  const query = useListQuery({ sortBy: 'name', sortDir: 'asc' });
  const { data, isLoading, isError, refetch } = useGetAdminUsersQuery(query.params);
  const { data: roles } = useGetRolesQuery();

  const [createUser, { isLoading: creating }] = useCreateAdminUserMutation();
  const [updateUser, { isLoading: updating }] = useUpdateAdminUserMutation();
  const [deleteUser, { isLoading: deleting }] = useDeleteAdminUserMutation();

  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const users = data ?? [];
  const roleOptions = (roles ?? []).map((role) => ({ value: role.id, label: role.name }));
  const activeStatus = (query.state.status as string) || 'all';

  const openCreate = () => {
    setErrors({});
    setForm({ ...EMPTY, roleId: roles?.[0]?.id ?? '' });
  };

  const openEdit = (adminUser: AdminUser) => {
    setErrors({});
    setForm({
      id: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      phone: adminUser.phone ?? '',
      roleId: adminUser.roleId,
      status: adminUser.status,
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Full name is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address';
    if (form.phone.trim() && !/^[+\d][\d\s-]{7,15}$/.test(form.phone.trim())) {
      next.phone = 'Enter a valid phone number';
    }
    if (!form.roleId) next.roleId = 'Choose a role';
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || undefined,
      roleId: form.roleId,
      status: form.status,
    };

    try {
      if (form.id) {
        await updateUser({ id: form.id, body: payload }).unwrap();
        toast.success('Admin updated successfully.', payload.name);
      } else {
        await createUser(payload).unwrap();
        toast.success('Admin invited successfully.', `An invite was sent to ${payload.email}.`);
      }
      setForm(null);
    } catch (error) {
      toast.error('Could not save the admin user', errorMessage(error));
    }
  };

  const toggleSuspended = async (adminUser: AdminUser) => {
    const suspending = adminUser.status !== 'suspended';
    try {
      await updateUser({
        id: adminUser.id,
        body: { status: suspending ? 'suspended' : 'active' },
      }).unwrap();
      toast.success(suspending ? 'Admin suspended' : 'Admin reinstated', adminUser.name);
    } catch (error) {
      toast.error('Could not update the admin user', errorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id).unwrap();
      toast.success('Admin removed successfully.', deleteTarget.name);
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Could not remove the admin user', errorMessage(error));
    }
  };

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'Admin',
      sortable: true,
      hideable: false,
      render: (adminUser) => (
        <div className="flex items-center gap-3">
          <Avatar name={adminUser.name} src={adminUser.avatar} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="max-w-[12rem] truncate font-medium text-ink-900 dark:text-ink-100">
                {adminUser.name}
              </p>
              {adminUser.id === currentUser?.id && (
                <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/10 dark:text-brand-300">
                  You
                </Badge>
              )}
            </div>
            <p className="max-w-[14rem] truncate text-2xs text-ink-500 dark:text-ink-400">
              {adminUser.email}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'roleName',
      header: 'Role',
      sortable: true,
      render: (adminUser) => (
        <span className="inline-flex items-center gap-1.5 text-ink-700 dark:text-ink-300">
          <ShieldCheck className="h-3.5 w-3.5 text-ink-400" />
          {adminUser.roleName}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      defaultHidden: true,
      render: (adminUser) => (
        <span className="whitespace-nowrap text-ink-600 dark:text-ink-400">
          {adminUser.phone || '—'}
        </span>
      ),
    },
    {
      key: 'twoFactorEnabled',
      header: '2FA',
      align: 'center',
      render: (adminUser) => (
        <span
          className={cn(
            'text-2xs font-medium',
            adminUser.twoFactorEnabled
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-ink-400',
          )}
        >
          {adminUser.twoFactorEnabled ? 'On' : 'Off'}
        </span>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      sortable: true,
      render: (adminUser) => (
        <span className="whitespace-nowrap text-ink-600 dark:text-ink-400">
          {adminUser.lastLoginAt ? formatRelativeTime(adminUser.lastLoginAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Added',
      sortable: true,
      defaultHidden: true,
      render: (adminUser) => (
        <span className="whitespace-nowrap text-ink-600 dark:text-ink-400">
          {formatDate(adminUser.createdAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (adminUser) => <StatusBadge tone={USER_STATUS[adminUser.status]} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      hideable: false,
      align: 'right',
      width: '3rem',
      render: (adminUser) => {
        const isSelf = adminUser.id === currentUser?.id;
        return (
          <div onClick={(event) => event.stopPropagation()}>
            <Dropdown
              trigger={({ toggle }) => (
                <IconButton label={`Actions for ${adminUser.name}`} size="sm" onClick={toggle}>
                  <MoreHorizontal className="h-4 w-4" />
                </IconButton>
              )}
            >
              {can('admin_users', 'edit') && (
                <>
                  <DropdownItem icon={<Pencil />} onClick={() => openEdit(adminUser)}>
                    Edit admin
                  </DropdownItem>
                  <DropdownItem
                    icon={<KeyRound />}
                    disabled={isSelf}
                    onClick={() => toggleSuspended(adminUser)}
                  >
                    {adminUser.status === 'suspended' ? 'Reinstate access' : 'Suspend access'}
                  </DropdownItem>
                </>
              )}
              {isSelf && (
                <DropdownItem icon={<UserCog />} to="/admin/profile">
                  My profile
                </DropdownItem>
              )}
              {can('admin_users', 'delete') && !isSelf && (
                <>
                  <DropdownDivider />
                  <DropdownItem icon={<Trash2 />} danger onClick={() => setDeleteTarget(adminUser)}>
                    Remove admin
                  </DropdownItem>
                </>
              )}
            </Dropdown>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin users"
        description="People with access to this dashboard and the role that governs what they can do."
        actions={
          can('admin_users', 'create') && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Invite Admin
            </Button>
          )
        }
      />

      <DataTable
        storageKey="admin-users"
        columns={columns}
        rows={users}
        rowKey={(adminUser) => adminUser.id}
        loading={isLoading}
        error={isError || undefined}
        onRetry={refetch}
        sort={query.sort}
        onSortChange={query.setSort}
        emptyIcon={UserCog}
        emptyTitle="No admin users found."
        emptyDescription="Invite a teammate to give them access to this dashboard."
        emptyAction={
          can('admin_users', 'create') && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Invite Admin
            </Button>
          )
        }
        toolbar={
          <>
            <SearchInput
              value={query.state.search}
              onChange={query.setSearch}
              placeholder="Search name, email or role…"
            />
            <Select
              sizeVariant="sm"
              className="w-auto"
              value={(query.state.roleId as string) ?? ''}
              onChange={(event) => query.setFilter('roleId', event.target.value || undefined)}
              options={[{ value: '', label: 'All roles' }, ...roleOptions]}
              aria-label="Filter by role"
            />
          </>
        }
        filters={
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((filter) => (
              <FilterChip
                key={filter.key}
                label={filter.label}
                active={activeStatus === filter.key}
                onClick={() =>
                  query.setFilter('status', filter.key === 'all' ? undefined : filter.key)
                }
              />
            ))}
          </div>
        }
      />

      <FormModal
        open={form !== null}
        onClose={() => setForm(null)}
        onSubmit={submit}
        title={form?.id ? 'Edit admin' : 'Invite admin'}
        description={
          form?.id
            ? 'Update the details and role for this teammate.'
            : 'They receive an email invite and set their own password.'
        }
        submitLabel={form?.id ? 'Save changes' : 'Send invite'}
        loading={creating || updating}
      >
        {form && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full Name" required error={errors.name}>
                <Input
                  value={form.name}
                  invalid={Boolean(errors.name)}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Meera Nair"
                />
              </Field>
              <Field label="Email" required error={errors.email}>
                <Input
                  type="email"
                  value={form.email}
                  invalid={Boolean(errors.email)}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="meera@sopii.in"
                />
              </Field>
            </div>

            <Field label="Phone" error={errors.phone}>
              <Input
                value={form.phone}
                invalid={Boolean(errors.phone)}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="+91 98200 12345"
              />
            </Field>

            <Field
              label="Role"
              required
              error={errors.roleId}
              hint="Roles decide which sections this admin can open and change."
            >
              <Select
                value={form.roleId}
                invalid={Boolean(errors.roleId)}
                onChange={(event) => setForm({ ...form, roleId: event.target.value })}
                placeholder="Select a role"
                options={roleOptions}
              />
            </Field>

            <Field label="Status">
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as AdminUser['status'] })
                }
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'invited', label: 'Invited' },
                  { value: 'suspended', label: 'Suspended' },
                ]}
                disabled={form.id === currentUser?.id}
              />
            </Field>
          </>
        )}
      </FormModal>

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="admin user"
        name={deleteTarget?.name}
        loading={deleting}
      />
    </div>
  );
}
