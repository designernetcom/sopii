import { useMemo, useState } from 'react';
import {
  ChevronDown,
  FolderTree,
  GripVertical,
  ImageIcon,
  Pencil,
  Plus,
  Tags,
  Trash2,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, useDragReorder, usePermissions } from '@/hooks';
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useGetCategoriesQuery,
  useGetCategoryTreeQuery,
  useReorderCategoriesMutation,
  useUpdateCategoryMutation,
} from '@/store/api/catalogApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/common/Card';
import { Button, IconButton } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { AppImage } from '@/components/common/AppImage';
import { Field, Input, Select, Switch, Textarea } from '@/components/common/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/States';
import { FormModal } from '@/components/modals/FormModal';
import { DeleteModal } from '@/components/modals/ConfirmModal';
import { MediaPickerModal } from '@/components/modals/MediaPickerModal';
import { useToast } from '@/components/common/Toast';
import { formatNumber, slugify } from '@/utils/format';
import type { Category, CategoryNode, SeoMeta } from '@/types';
import { SeoFields, validateJsonLd } from '@/components/seo/SeoFields';
import { useGetSeoSettingsQuery } from '@/store/api/seoApi';
import { Tabs } from '@/components/common/PageHeader';

interface FormState {
  id?: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  parentId: string;
  sortOrder: number;
  status: 'active' | 'inactive';
  /* The record's own metadata, edited on the SEO tab of this modal. */
  seo: SeoMeta;
}

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  description: '',
  image: '',
  parentId: '',
  sortOrder: 0,
  status: 'active',
  seo: {},
};

export default function CategoriesPage() {
  useDocumentTitle('Categories');

  const toast = useToast();
  const { can } = usePermissions();

  const { data: tree, isLoading, isError, refetch } = useGetCategoryTreeQuery();
  const { data: flat } = useGetCategoriesQuery();

  const [createCategory, { isLoading: creating }] = useCreateCategoryMutation();
  const [updateCategory, { isLoading: updating }] = useUpdateCategoryMutation();
  const [deleteCategory, { isLoading: deleting }] = useDeleteCategoryMutation();
  const [reorder] = useReorderCategoriesMutation();

  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /* The modal has two tabs; reset to Details whenever it reopens so an
     admin never lands on SEO for a record they meant to rename. */
  const [modalTab, setModalTab] = useState<'details' | 'seo'>('details');
  const { data: seoSettings } = useGetSeoSettingsQuery();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const roots = useMemo(() => tree ?? [], [tree]);

  const { handlers, move, overIndex } = useDragReorder(roots, async (next) => {
    try {
      await reorder(next.map((node) => node.id)).unwrap();
      toast.success('Category order updated');
    } catch (error) {
      toast.error('Could not reorder categories', errorMessage(error));
    }
  });

  const parentOptions = useMemo(
    () => [
      { value: '', label: 'None (top level)' },
      ...(flat ?? [])
        .filter((category) => category.parentId === null && category.id !== form?.id)
        .map((category) => ({ value: category.id, label: category.name })),
    ],
    [flat, form?.id],
  );

  const openCreate = (parentId = '') => {
    setErrors({});
    setModalTab('details');
    setForm({ ...EMPTY_FORM, parentId, sortOrder: flat?.length ?? 0 });
  };

  const openEdit = (category: Category) => {
    setErrors({});
    setModalTab('details');
    setForm({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      image: category.image ?? '',
      parentId: category.parentId ?? '',
      sortOrder: category.sortOrder,
      status: category.status,
      seo: category.seo ?? {},
    });
  };

  const validate = (values: FormState) => {
    const next: Record<string, string> = {};
    if (values.name.trim().length < 2) next.name = 'Category name must be at least 2 characters';
    if (!values.slug.trim()) next.slug = 'Slug is required';
    else if (
      (flat ?? []).some(
        (category) => category.slug === values.slug.trim() && category.id !== values.id,
      )
    ) {
      next.slug = 'That slug is already in use';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || !validate(form)) return;

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || undefined,
      image: form.image || undefined,
      parentId: form.parentId || null,
      sortOrder: form.sortOrder,
      status: form.status,
      seo: form.seo,
    };

    try {
      if (form.id) {
        await updateCategory({ id: form.id, body: payload }).unwrap();
        toast.success('Category updated successfully.', payload.name);
      } else {
        await createCategory(payload).unwrap();
        toast.success('Category created successfully.', payload.name);
      }
      setForm(null);
    } catch (error) {
      toast.error('Could not save the category', errorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCategory(deleteTarget.id).unwrap();
      toast.success('Category deleted successfully.', deleteTarget.name);
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Could not delete category', errorMessage(error));
      setDeleteTarget(null);
    }
  };

  const toggleStatus = async (category: Category) => {
    try {
      await updateCategory({
        id: category.id,
        body: { status: category.status === 'active' ? 'inactive' : 'active' },
      }).unwrap();
      toast.success(
        category.status === 'active' ? 'Category disabled' : 'Category enabled',
        category.name,
      );
    } catch (error) {
      toast.error('Could not update category', errorMessage(error));
    }
  };

  const CategoryRow = ({
    node,
    index,
    isChild,
  }: {
    node: CategoryNode | Category;
    index: number;
    isChild?: boolean;
  }) => {
    const children = 'children' in node ? node.children : [];
    const isCollapsed = collapsed.includes(node.id);

    return (
      <>
        <div
          {...(!isChild ? handlers(index) : {})}
          className={cn(
            'group flex items-center gap-3 border-b border-ink-200 px-4 py-3 transition-colors last:border-b-0 dark:border-ink-800',
            isChild && 'bg-ink-50/50 pl-12 dark:bg-ink-800/20',
            !isChild && overIndex === index && 'bg-brand-50 dark:bg-brand-500/10',
          )}
        >
          {!isChild && (
            <span className="hidden cursor-grab text-ink-300 transition-colors group-hover:text-ink-500 sm:block">
              <GripVertical className="h-4 w-4" />
            </span>
          )}

          {children.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setCollapsed((current) =>
                  current.includes(node.id)
                    ? current.filter((id) => id !== node.id)
                    : [...current, node.id],
                )
              }
              aria-label={isCollapsed ? 'Expand subcategories' : 'Collapse subcategories'}
              className="rounded p-0.5 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
            >
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', isCollapsed && '-rotate-90')}
              />
            </button>
          )}

          <AppImage
            src={node.image}
            alt={node.name}
            seed={node.id}
            wrapperClassName="h-10 w-10 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                {node.name}
              </p>
              {node.status === 'inactive' && <Badge>Disabled</Badge>}
            </div>
            <p className="truncate text-2xs text-ink-500 dark:text-ink-400">/{node.slug}</p>
          </div>

          <div className="hidden shrink-0 text-right sm:block">
            <p className="text-sm font-medium tabular-nums text-ink-900 dark:text-ink-100">
              {formatNumber(node.productCount)}
            </p>
            <p className="text-2xs text-ink-500 dark:text-ink-400">products</p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {can('categories', 'edit') && (
              <>
                <div className="hidden sm:block">
                  <Switch
                    size="sm"
                    checked={node.status === 'active'}
                    onChange={() => toggleStatus(node as Category)}
                  />
                </div>
                {!isChild && (
                  <IconButton
                    label={`Add subcategory to ${node.name}`}
                    size="sm"
                    onClick={() => openCreate(node.id)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </IconButton>
                )}
                <IconButton
                  label={`Edit ${node.name}`}
                  size="sm"
                  onClick={() => openEdit(node as Category)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </IconButton>
              </>
            )}
            {can('categories', 'delete') && (
              <IconButton
                label={`Delete ${node.name}`}
                size="sm"
                onClick={() => setDeleteTarget(node as Category)}
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              </IconButton>
            )}
            {!isChild && (
              <div className="flex flex-col sm:hidden">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move up"
                  className="px-1 text-2xs text-ink-500 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === roots.length - 1}
                  aria-label="Move down"
                  className="px-1 text-2xs text-ink-500 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
            )}
          </div>
        </div>

        {!isCollapsed &&
          children.map((child, childIndex) => (
            <CategoryRow key={child.id} node={child} index={childIndex} isChild />
          ))}
      </>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Categories"
        description="Organise the catalogue. Drag top-level categories to change their order on the storefront."
        actions={
          can('categories', 'create') && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openCreate()}>
              Add Category
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Category tree"
            description={`${roots.length} top-level categories`}
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCollapsed(collapsed.length ? [] : roots.map((node) => node.id))}
              >
                {collapsed.length ? 'Expand all' : 'Collapse all'}
              </Button>
            }
          />
          {isError ? (
            <ErrorState onRetry={refetch} />
          ) : isLoading ? (
            <div className="divide-y divide-ink-200 dark:divide-ink-800">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : roots.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="No categories yet"
              description="Categories group products on the storefront and in navigation."
              action={
                can('categories', 'create') && (
                  <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openCreate()}>
                    Add Category
                  </Button>
                )
              }
            />
          ) : (
            <div>
              {roots.map((node, index) => (
                <CategoryRow key={node.id} node={node} index={index} />
              ))}
            </div>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Overview" />
          <CardBody className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-500 dark:text-ink-400">Total categories</span>
              <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
                {formatNumber(flat?.length ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500 dark:text-ink-400">Top level</span>
              <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
                {formatNumber(roots.length)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500 dark:text-ink-400">Subcategories</span>
              <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
                {formatNumber((flat ?? []).filter((c) => c.parentId).length)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500 dark:text-ink-400">Disabled</span>
              <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
                {formatNumber((flat ?? []).filter((c) => c.status === 'inactive').length)}
              </span>
            </div>

            <div className="rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-600 dark:bg-ink-800/60 dark:text-ink-400">
              <FolderTree className="mb-1.5 h-4 w-4 text-brand-600 dark:text-brand-400" />
              Categories with products or subcategories cannot be deleted — reassign them first.
            </div>
          </CardBody>
        </Card>
      </div>

      <FormModal
        open={form !== null}
        onClose={() => setForm(null)}
        onSubmit={submit}
        title={form?.id ? 'Edit category' : 'Add category'}
        description="Categories drive storefront navigation and product filtering."
        submitLabel={form?.id ? 'Save changes' : 'Create category'}
        loading={creating || updating}
      >
        {form && (
          <>
            <Tabs
              items={[
                { key: 'details', label: 'Details' },
                { key: 'seo', label: 'SEO' },
              ]}
              active={modalTab}
              onChange={(key) => setModalTab(key as 'details' | 'seo')}
              variant="pill"
              className="mb-4"
            />

            <div className={modalTab === 'details' ? 'space-y-4' : 'hidden'}>
            <Field label="Category Name" required error={errors.name}>
              <Input
                value={form.name}
                invalid={Boolean(errors.name)}
                onChange={(event) => {
                  const name = event.target.value;
                  setForm({
                    ...form,
                    name,
                    slug: form.id ? form.slug : slugify(name),
                  });
                }}
                placeholder="Silk Sarees"
              />
            </Field>

            <Field label="Slug" required error={errors.slug} hint={`/collections/${form.slug || 'slug'}`}>
              <Input
                value={form.slug}
                invalid={Boolean(errors.slug)}
                onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })}
                placeholder="silk-sarees"
              />
            </Field>

            <Field label="Description">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Handwoven silk sarees sourced directly from weaver clusters."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Parent Category">
                <Select
                  value={form.parentId}
                  options={parentOptions}
                  onChange={(event) => setForm({ ...form, parentId: event.target.value })}
                />
              </Field>
              <Field label="Sort Order">
                <Input
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
                  className="tabular-nums"
                />
              </Field>
            </div>

            <Field label="Image">
              <div className="flex items-center gap-3">
                <AppImage
                  src={form.image}
                  alt={form.name || 'Category'}
                  seed={form.slug || 'category'}
                  wrapperClassName="h-16 w-16 shrink-0"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ImageIcon className="h-3.5 w-3.5" />}
                    onClick={() => setPickerOpen(true)}
                  >
                    Choose image
                  </Button>
                  {form.image && (
                    <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, image: '' })}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </Field>

            <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
              <Switch
                checked={form.status === 'active'}
                onChange={(checked) => setForm({ ...form, status: checked ? 'active' : 'inactive' })}
                label="Visible on storefront"
                description="Disabled categories are hidden from navigation and filters."
              />
            </div>
            </div>

            {/* Kept mounted rather than unmounted, so switching tabs mid-edit
                does not throw away what has been typed on the other one. */}
            <div className={modalTab === 'seo' ? '' : 'hidden'}>
              <SeoFields
                value={form.seo}
                onChange={(patch) => setForm({ ...form, seo: { ...form.seo, ...patch } })}
                previewUrl={`${seoSettings?.siteUrl ?? 'https://sopii.com'}/${
                  form.seo.slug || form.slug || 'category'
                }`}
                siteName={seoSettings?.siteName}
                fallbackTitle={form.name || 'Category'}
                fallbackDescription={form.description || seoSettings?.defaultMetaDescription || ''}
                showSlug={false}
                jsonError={validateJsonLd(form.seo.structuredData)}
              />
            </div>
          </>
        )}
      </FormModal>

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple={false}
        folder="categories"
        title="Select category image"
        onSelect={(assets) => {
          if (form && assets[0]) setForm({ ...form, image: assets[0].url });
        }}
      />

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="category"
        name={deleteTarget?.name}
        loading={deleting}
      />
    </div>
  );
}
