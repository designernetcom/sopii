import { useState } from 'react';
import { Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, usePermissions } from '@/hooks';
import {
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useGetRolesQuery,
  useUpdateRoleMutation,
} from '@/store/api/platformApi';
import { errorMessage } from '@/store/api/baseQuery';
import { ACTIONS, RESOURCES } from '@/data/admin';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardBody } from '@/components/common/Card';
import { Button, IconButton } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Checkbox, Field, Input, Textarea } from '@/components/common/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/States';
import { FormModal } from '@/components/modals/FormModal';
import { DeleteModal } from '@/components/modals/ConfirmModal';
import { useToast } from '@/components/common/Toast';
import { formatDate, formatNumber, titleCase } from '@/utils/format';
import type { PermissionAction, PermissionMatrix, Role } from '@/types';

function emptyMatrix(): PermissionMatrix {
  const matrix = {} as PermissionMatrix;
  RESOURCES.forEach(({ key }) => {
    matrix[key] = { view: false, create: false, edit: false, delete: false };
  });
  return matrix;
}

function countAllowed(permissions: PermissionMatrix) {
  return RESOURCES.reduce(
    (total, { key }) => total + ACTIONS.filter((action) => permissions[key]?.[action]).length,
    0,
  );
}

const TOTAL_PERMISSIONS = RESOURCES.length * ACTIONS.length;

interface FormState {
  id?: string;
  name: string;
  description: string;
  system: boolean;
  permissions: PermissionMatrix;
}

/** Resource × action grid used to compose a role. */
function PermissionEditor({
  value,
  onChange,
  readOnly,
}: {
  value: PermissionMatrix;
  onChange: (next: PermissionMatrix) => void;
  readOnly?: boolean;
}) {
  const toggle = (resource: (typeof RESOURCES)[number]['key'], action: PermissionAction) => {
    const current = value[resource] ?? { view: false, create: false, edit: false, delete: false };
    const nextAllowed = !current[action];

    onChange({
      ...value,
      [resource]: {
        ...current,
        [action]: nextAllowed,
        // Create/edit/delete are meaningless without view, so keep them coherent.
        ...(nextAllowed && action !== 'view' ? { view: true } : {}),
        ...(!nextAllowed && action === 'view'
          ? { create: false, edit: false, delete: false }
          : {}),
      },
    });
  };

  const toggleRow = (resource: (typeof RESOURCES)[number]['key']) => {
    const current = value[resource];
    const allOn = ACTIONS.every((action) => current?.[action]);
    onChange({
      ...value,
      [resource]: {
        view: !allOn,
        create: !allOn,
        edit: !allOn,
        delete: !allOn,
      },
    });
  };

  const toggleColumn = (action: PermissionAction) => {
    const allOn = RESOURCES.every(({ key }) => value[key]?.[action]);
    const next = { ...value };
    RESOURCES.forEach(({ key }) => {
      const current = next[key];
      next[key] = {
        ...current,
        [action]: !allOn,
        ...(!allOn && action !== 'view' ? { view: true } : {}),
        ...(allOn && action === 'view' ? { create: false, edit: false, delete: false } : {}),
      };
    });
    onChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-700">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/60">
            <th scope="col" className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
              Module
            </th>
            {ACTIONS.map((action) => (
              <th
                key={action}
                scope="col"
                className="px-3 py-2.5 text-center text-2xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400"
              >
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggleColumn(action)}
                  className="transition-colors hover:text-ink-900 disabled:cursor-not-allowed disabled:hover:text-ink-500 dark:hover:text-ink-100"
                  title={readOnly ? undefined : `Toggle ${action} for every module`}
                >
                  {titleCase(action)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
          {RESOURCES.map((resource) => {
            const row = value[resource.key];
            return (
              <tr key={resource.key} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                <td className="px-4 py-2">
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggleRow(resource.key)}
                    className="text-left text-sm font-medium text-ink-800 transition-colors hover:text-brand-600 disabled:cursor-not-allowed disabled:hover:text-ink-800 dark:text-ink-200 dark:hover:text-brand-400 dark:disabled:hover:text-ink-200"
                    title={readOnly ? undefined : `Toggle every permission for ${resource.label}`}
                  >
                    {resource.label}
                  </button>
                </td>
                {ACTIONS.map((action) => (
                  <td key={action} className="px-3 py-2 text-center">
                    <Checkbox
                      checked={Boolean(row?.[action])}
                      disabled={readOnly}
                      onChange={() => toggle(resource.key, action)}
                      aria-label={`${titleCase(action)} ${resource.label}`}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function RolesPage() {
  useDocumentTitle('Roles & Permissions');

  const toast = useToast();
  const { can } = usePermissions();

  const { data: roles, isLoading, isError, refetch } = useGetRolesQuery();
  const [createRole, { isLoading: creating }] = useCreateRoleMutation();
  const [updateRole, { isLoading: updating }] = useUpdateRoleMutation();
  const [deleteRole, { isLoading: deleting }] = useDeleteRoleMutation();

  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const list = roles ?? [];
  // Super Admin bypasses every check in `hasPermission`, so its matrix is fixed.
  const isLocked = (role: Role | FormState | null) =>
    Boolean(role && 'id' in role && list.find((item) => item.id === role.id)?.key === 'super_admin');

  const openCreate = () => {
    setErrors({});
    setForm({ name: '', description: '', system: false, permissions: emptyMatrix() });
  };

  const openEdit = (role: Role) => {
    setErrors({});
    setForm({
      id: role.id,
      name: role.name,
      description: role.description,
      system: role.system,
      permissions: structuredClone(role.permissions),
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Role name is required';
    if (countAllowed(form.permissions) === 0) {
      next.permissions = 'Grant at least one permission';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      permissions: form.permissions,
    };

    try {
      if (form.id) {
        await updateRole({ id: form.id, body: payload }).unwrap();
        toast.success('Role updated successfully.', payload.name);
      } else {
        await createRole(payload).unwrap();
        toast.success('Role created successfully.', payload.name);
      }
      setForm(null);
    } catch (error) {
      toast.error('Could not save the role', errorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRole(deleteTarget.id).unwrap();
      toast.success('Role deleted successfully.', deleteTarget.name);
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Could not delete the role', errorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roles & permissions"
        description="Every admin belongs to a role. Roles decide which modules they can open and change."
        actions={
          can('roles', 'create') && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Create Role
            </Button>
          )
        }
      />

      {isError ? (
        <Card>
          <ErrorState onRetry={refetch} />
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index} padded>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-2/3" />
              <Skeleton className="mt-4 h-2 w-full" />
            </Card>
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="No roles yet"
            description="Create a role to control what a group of admins can see and do."
            action={
              can('roles', 'create') && (
                <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                  Create Role
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((role) => {
            const allowed = role.key === 'super_admin' ? TOTAL_PERMISSIONS : countAllowed(role.permissions);
            const pct = Math.round((allowed / TOTAL_PERMISSIONS) * 100);

            return (
              <Card key={role.id} className="flex flex-col">
                <CardBody className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate text-sm font-semibold text-ink-900 dark:text-ink-100">
                          {role.name}
                        </h3>
                        {role.system && (
                          <Badge dot="bg-ink-400">
                            <Lock className="h-2.5 w-2.5" />
                            System
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-ink-500 dark:text-ink-400">
                        {role.description}
                      </p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between text-2xs text-ink-500 dark:text-ink-400">
                      <span>Permissions granted</span>
                      <span className="tabular-nums">
                        {allowed} / {TOTAL_PERMISSIONS}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          pct >= 80 ? 'bg-brand-500' : pct >= 40 ? 'bg-sky-500' : 'bg-emerald-500',
                        )}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-500 dark:text-ink-400">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {formatNumber(role.userCount)} {role.userCount === 1 ? 'admin' : 'admins'}
                    </span>
                    <span>Created {formatDate(role.createdAt)}</span>
                  </div>
                </CardBody>

                <div className="flex items-center justify-between border-t border-ink-200 px-5 py-3 dark:border-ink-800">
                  <Button size="xs" variant="ghost" onClick={() => openEdit(role)}>
                    View permissions
                  </Button>
                  <div className="flex items-center gap-1">
                    {can('roles', 'edit') && (
                      <IconButton
                        label={`Edit ${role.name}`}
                        size="sm"
                        onClick={() => openEdit(role)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                    {can('roles', 'delete') && (
                      <IconButton
                        label={
                          role.system
                            ? `${role.name} is a system role and cannot be deleted`
                            : role.userCount > 0
                              ? `Reassign the ${role.userCount} admins on ${role.name} first`
                              : `Delete ${role.name}`
                        }
                        size="sm"
                        disabled={role.system || role.userCount > 0}
                        onClick={() => setDeleteTarget(role)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </IconButton>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <FormModal
        open={form !== null}
        onClose={() => setForm(null)}
        onSubmit={submit}
        title={form?.id ? `Edit ${form.name}` : 'Create role'}
        description={
          isLocked(form)
            ? 'Super Admin always has unrestricted access — this matrix cannot be changed.'
            : 'Name the role, then tick the modules and actions it may use.'
        }
        submitLabel={form?.id ? 'Save changes' : 'Create role'}
        loading={creating || updating}
        size="xl"
      >
        {form && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role Name" required error={errors.name}>
                <Input
                  value={form.name}
                  invalid={Boolean(errors.name)}
                  disabled={form.system}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Catalogue Manager"
                />
              </Field>
              <Field label="Admins on this role">
                <Input
                  value={String(list.find((role) => role.id === form.id)?.userCount ?? 0)}
                  disabled
                  className="tabular-nums"
                />
              </Field>
            </div>

            <Field label="Description">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Manages products, categories and collections but cannot touch orders."
              />
            </Field>

            <Field
              label="Permissions"
              required
              error={errors.permissions}
              hint="Click a module name or a column heading to toggle a whole row or column."
              addon={`${countAllowed(form.permissions)} of ${TOTAL_PERMISSIONS} granted`}
            >
              <PermissionEditor
                value={form.permissions}
                readOnly={isLocked(form)}
                onChange={(permissions) => setForm({ ...form, permissions })}
              />
            </Field>
          </>
        )}
      </FormModal>

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="role"
        name={deleteTarget?.name}
        loading={deleting}
      />
    </div>
  );
}
