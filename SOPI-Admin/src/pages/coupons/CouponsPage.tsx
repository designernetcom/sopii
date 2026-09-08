import { useState } from 'react';
import { BadgePercent, Copy, MoreHorizontal, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, useListQuery, usePermissions } from '@/hooks';
import {
  useCreateCouponMutation,
  useDeleteCouponMutation,
  useGetCouponsQuery,
  useUpdateCouponMutation,
} from '@/store/api/marketingApi';
import { useGetCategoriesQuery } from '@/store/api/catalogApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Button, IconButton } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/Badge';
import { SearchInput, FilterChip } from '@/components/common/SearchInput';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/common/Field';
import { Dropdown, DropdownDivider, DropdownItem } from '@/components/common/Dropdown';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { FormModal } from '@/components/modals/FormModal';
import { DeleteModal } from '@/components/modals/ConfirmModal';
import { useToast } from '@/components/common/Toast';
import { COUPON_STATUS } from '@/utils/constants';
import { formatCurrency, formatDate, formatDateInput, formatNumber } from '@/utils/format';
import type { Coupon, DiscountType } from '@/types';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'expired', label: 'Expired' },
  { key: 'disabled', label: 'Disabled' },
];

interface FormState {
  id?: string;
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  minOrderValue: string;
  maxDiscount: string;
  usageLimit: string;
  perCustomerLimit: string;
  startDate: string;
  endDate: string;
  categoryIds: string[];
  status: 'active' | 'disabled';
}

const EMPTY: FormState = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: '',
  minOrderValue: '0',
  maxDiscount: '',
  usageLimit: '100',
  perCustomerLimit: '1',
  startDate: formatDateInput(new Date()),
  endDate: '',
  categoryIds: [],
  status: 'active',
};

function discountLabel(coupon: Coupon) {
  if (coupon.discountType === 'percentage') return `${coupon.discountValue}% off`;
  if (coupon.discountType === 'fixed') return `${formatCurrency(coupon.discountValue)} off`;
  return 'Free shipping';
}

export default function CouponsPage() {
  useDocumentTitle('Coupons');

  const toast = useToast();
  const { can } = usePermissions();

  const query = useListQuery({ pageSize: 10, sortBy: 'createdAt', sortDir: 'desc' });
  const { data, isLoading, isError, refetch } = useGetCouponsQuery(query.params);
  const { data: categories } = useGetCategoriesQuery();

  const [createCoupon, { isLoading: creating }] = useCreateCouponMutation();
  const [updateCoupon, { isLoading: updating }] = useUpdateCouponMutation();
  const [deleteCoupon, { isLoading: deleting }] = useDeleteCouponMutation();

  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);

  const openCreate = () => {
    setErrors({});
    setForm({ ...EMPTY });
  };

  const openEdit = (coupon: Coupon) => {
    setErrors({});
    setForm({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description ?? '',
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      minOrderValue: String(coupon.minOrderValue),
      maxDiscount: coupon.maxDiscount ? String(coupon.maxDiscount) : '',
      usageLimit: String(coupon.usageLimit),
      perCustomerLimit: String(coupon.perCustomerLimit),
      startDate: formatDateInput(coupon.startDate),
      endDate: formatDateInput(coupon.endDate),
      categoryIds: coupon.categoryIds,
      status: coupon.status === 'disabled' ? 'disabled' : 'active',
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const next: Record<string, string> = {};
    if (!/^[A-Z0-9_-]{3,20}$/i.test(form.code.trim())) {
      next.code = 'Use 3–20 letters, numbers, hyphens or underscores';
    }
    const value = Number(form.discountValue);
    if (form.discountType !== 'free_shipping') {
      if (!Number.isFinite(value) || value <= 0) next.discountValue = 'Enter a discount value';
      else if (form.discountType === 'percentage' && value > 90) {
        next.discountValue = 'Percentage discounts are capped at 90%';
      }
    }
    if (!form.endDate) next.endDate = 'Choose an end date';
    else if (form.startDate && new Date(form.endDate) < new Date(form.startDate)) {
      next.endDate = 'End date must be after the start date';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || undefined,
      discountType: form.discountType,
      discountValue: form.discountType === 'free_shipping' ? 0 : value,
      minOrderValue: Number(form.minOrderValue) || 0,
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
      usageLimit: Number(form.usageLimit) || 0,
      perCustomerLimit: Number(form.perCustomerLimit) || 1,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      categoryIds: form.categoryIds,
      status: form.status,
    };

    try {
      if (form.id) {
        await updateCoupon({ id: form.id, body: payload }).unwrap();
        toast.success('Coupon updated successfully.', payload.code);
      } else {
        await createCoupon(payload).unwrap();
        toast.success('Coupon created successfully.', payload.code);
      }
      setForm(null);
    } catch (error) {
      toast.error('Could not save the coupon', errorMessage(error));
    }
  };

  const toggleStatus = async (coupon: Coupon) => {
    try {
      await updateCoupon({
        id: coupon.id,
        body: { status: coupon.status === 'disabled' ? 'active' : 'disabled' },
      }).unwrap();
      toast.success(coupon.status === 'disabled' ? 'Coupon enabled' : 'Coupon disabled', coupon.code);
    } catch (error) {
      toast.error('Could not update the coupon', errorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCoupon(deleteTarget.id).unwrap();
      toast.success('Coupon deleted successfully.', deleteTarget.code);
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Could not delete the coupon', errorMessage(error));
    }
  };

  const columns: Column<Coupon>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      hideable: false,
      render: (coupon) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-ink-900 dark:bg-ink-800 dark:text-ink-100">
              {coupon.code}
            </span>
            <IconButton
              label={`Copy ${coupon.code}`}
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                navigator.clipboard
                  ?.writeText(coupon.code)
                  .then(() => toast.success('Coupon code copied'))
                  .catch(() => toast.error('Could not copy the code'));
              }}
            >
              <Copy className="h-3 w-3" />
            </IconButton>
          </div>
          <p className="mt-0.5 max-w-[18rem] truncate text-2xs text-ink-500 dark:text-ink-400">
            {coupon.description}
          </p>
        </div>
      ),
    },
    {
      key: 'discountValue',
      header: 'Discount',
      sortable: true,
      render: (coupon) => (
        <div>
          <p className="font-medium text-ink-900 dark:text-ink-100">{discountLabel(coupon)}</p>
          {coupon.minOrderValue > 0 && (
            <p className="text-2xs text-ink-500 dark:text-ink-400">
              Min. {formatCurrency(coupon.minOrderValue)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'usedCount',
      header: 'Usage',
      sortable: true,
      align: 'right',
      render: (coupon) => {
        const pct = coupon.usageLimit
          ? Math.min(100, Math.round((coupon.usedCount / coupon.usageLimit) * 100))
          : 0;
        return (
          <div className="min-w-[6rem]">
            <p className="tabular-nums text-ink-700 dark:text-ink-300">
              {formatNumber(coupon.usedCount)}
              {coupon.usageLimit ? ` / ${formatNumber(coupon.usageLimit)}` : ''}
            </p>
            {coupon.usageLimit > 0 && (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                <div
                  className={cn(
                    'h-full rounded-full',
                    pct >= 90 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-brand-500',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'startDate',
      header: 'Valid From',
      sortable: true,
      render: (coupon) => (
        <span className="whitespace-nowrap text-ink-600 dark:text-ink-400">
          {formatDate(coupon.startDate)}
        </span>
      ),
    },
    {
      key: 'endDate',
      header: 'Valid Until',
      sortable: true,
      render: (coupon) => (
        <span className="whitespace-nowrap text-ink-600 dark:text-ink-400">
          {formatDate(coupon.endDate)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (coupon) => <StatusBadge tone={COUPON_STATUS[coupon.status]} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      hideable: false,
      align: 'right',
      width: '3rem',
      render: (coupon) => (
        <div onClick={(event) => event.stopPropagation()}>
          <Dropdown
            trigger={({ toggle }) => (
              <IconButton label={`Actions for ${coupon.code}`} size="sm" onClick={toggle}>
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            )}
          >
            {can('coupons', 'edit') && (
              <>
                <DropdownItem icon={<Pencil />} onClick={() => openEdit(coupon)}>
                  Edit coupon
                </DropdownItem>
                <DropdownItem icon={<Power />} onClick={() => toggleStatus(coupon)}>
                  {coupon.status === 'disabled' ? 'Enable' : 'Disable'}
                </DropdownItem>
              </>
            )}
            <DropdownItem
              icon={<Copy />}
              onClick={() => {
                navigator.clipboard?.writeText(coupon.code);
                toast.success('Coupon code copied');
              }}
            >
              Copy code
            </DropdownItem>
            {can('coupons', 'delete') && (
              <>
                <DropdownDivider />
                <DropdownItem icon={<Trash2 />} danger onClick={() => setDeleteTarget(coupon)}>
                  Delete
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      ),
    },
  ];

  const activeStatus = (query.state.status as string) || 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Coupons & discounts"
        description="Promotional codes, their limits and how often they have been redeemed."
        actions={
          can('coupons', 'create') && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Create Coupon
            </Button>
          )
        }
      />

      <DataTable
        storageKey="coupons"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(coupon) => coupon.id}
        loading={isLoading}
        error={isError || undefined}
        onRetry={refetch}
        sort={query.sort}
        onSortChange={query.setSort}
        emptyIcon={BadgePercent}
        emptyTitle="No coupons found."
        emptyDescription="Create a coupon to run a promotion on the storefront."
        emptyAction={
          can('coupons', 'create') && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Create Coupon
            </Button>
          )
        }
        toolbar={
          <>
            <SearchInput
              value={query.state.search}
              onChange={query.setSearch}
              placeholder="Search code or description…"
            />
            <Select
              sizeVariant="sm"
              className="w-auto"
              value={(query.state.discountType as string) ?? ''}
              onChange={(event) => query.setFilter('discountType', event.target.value || undefined)}
              options={[
                { value: '', label: 'All types' },
                { value: 'percentage', label: 'Percentage' },
                { value: 'fixed', label: 'Fixed amount' },
                { value: 'free_shipping', label: 'Free shipping' },
              ]}
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
        pagination={{
          page: data?.page ?? 1,
          pageSize: data?.pageSize ?? 10,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
          onPageChange: query.setPage,
          onPageSizeChange: query.setPageSize,
          label: 'coupons',
        }}
      />

      <FormModal
        open={form !== null}
        onClose={() => setForm(null)}
        onSubmit={submit}
        title={form?.id ? 'Edit coupon' : 'Create coupon'}
        description="Set the discount, the limits and when the code is valid."
        submitLabel={form?.id ? 'Save changes' : 'Create coupon'}
        loading={creating || updating}
        size="lg"
      >
        {form && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Coupon Code" required error={errors.code}>
                <Input
                  value={form.code}
                  invalid={Boolean(errors.code)}
                  onChange={(event) =>
                    setForm({ ...form, code: event.target.value.toUpperCase().replace(/\s/g, '') })
                  }
                  placeholder="FESTIVE15"
                  className="font-mono uppercase"
                />
              </Field>
              <Field label="Discount Type" required>
                <Select
                  value={form.discountType}
                  onChange={(event) =>
                    setForm({ ...form, discountType: event.target.value as DiscountType })
                  }
                  options={[
                    { value: 'percentage', label: 'Percentage' },
                    { value: 'fixed', label: 'Fixed Amount' },
                    { value: 'free_shipping', label: 'Free Shipping' },
                  ]}
                />
              </Field>
            </div>

            <Field label="Description">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Festive season 15% off on sarees"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Discount Value"
                required={form.discountType !== 'free_shipping'}
                error={errors.discountValue}
              >
                <Input
                  type="number"
                  min={0}
                  value={form.discountValue}
                  disabled={form.discountType === 'free_shipping'}
                  invalid={Boolean(errors.discountValue)}
                  onChange={(event) => setForm({ ...form, discountValue: event.target.value })}
                  prefix={form.discountType === 'fixed' ? '₹' : undefined}
                  suffix={form.discountType === 'percentage' ? '%' : undefined}
                  className="tabular-nums"
                />
              </Field>
              <Field label="Minimum Order">
                <Input
                  type="number"
                  min={0}
                  value={form.minOrderValue}
                  onChange={(event) => setForm({ ...form, minOrderValue: event.target.value })}
                  prefix="₹"
                  className="tabular-nums"
                />
              </Field>
              <Field
                label="Maximum Discount"
                hint={form.discountType === 'percentage' ? 'Caps percentage discounts' : undefined}
              >
                <Input
                  type="number"
                  min={0}
                  value={form.maxDiscount}
                  disabled={form.discountType !== 'percentage'}
                  onChange={(event) => setForm({ ...form, maxDiscount: event.target.value })}
                  prefix="₹"
                  className="tabular-nums"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Usage Limit" hint="Total redemptions allowed. 0 = unlimited.">
                <Input
                  type="number"
                  min={0}
                  value={form.usageLimit}
                  onChange={(event) => setForm({ ...form, usageLimit: event.target.value })}
                  className="tabular-nums"
                />
              </Field>
              <Field label="Per Customer Limit">
                <Input
                  type="number"
                  min={1}
                  value={form.perCustomerLimit}
                  onChange={(event) => setForm({ ...form, perCustomerLimit: event.target.value })}
                  className="tabular-nums"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start Date" required>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                />
              </Field>
              <Field label="End Date" required error={errors.endDate}>
                <Input
                  type="date"
                  value={form.endDate}
                  invalid={Boolean(errors.endDate)}
                  onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                />
              </Field>
            </div>

            <Field
              label="Applicable Categories"
              hint="Leave all unchecked to apply the coupon across the whole catalogue."
            >
              <div className="grid max-h-40 gap-1.5 overflow-y-auto rounded-lg border border-ink-200 p-3 dark:border-ink-700 sm:grid-cols-2">
                {(categories ?? [])
                  .filter((category) => category.parentId === null)
                  .map((category) => (
                    <Checkbox
                      key={category.id}
                      label={category.name}
                      checked={form.categoryIds.includes(category.id)}
                      onChange={() =>
                        setForm({
                          ...form,
                          categoryIds: form.categoryIds.includes(category.id)
                            ? form.categoryIds.filter((value) => value !== category.id)
                            : [...form.categoryIds, category.id],
                        })
                      }
                    />
                  ))}
              </div>
            </Field>

            <Field label="Status">
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as 'active' | 'disabled' })
                }
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'disabled', label: 'Disabled' },
                ]}
              />
            </Field>
          </>
        )}
      </FormModal>

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="coupon"
        name={deleteTarget?.code}
        loading={deleting}
      />
    </div>
  );
}
