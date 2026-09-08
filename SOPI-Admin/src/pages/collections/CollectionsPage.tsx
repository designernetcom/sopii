import { useMemo, useState } from 'react';
import {
  CalendarDays,
  GripVertical,
  ImageIcon,
  Package,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, useDragReorder, usePermissions } from '@/hooks';
import {
  useCreateCollectionMutation,
  useDeleteCollectionMutation,
  useGetCollectionsQuery,
  useGetProductsQuery,
  useReorderCollectionsMutation,
  useUpdateCollectionMutation,
} from '@/store/api/catalogApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardBody } from '@/components/common/Card';
import { Button, IconButton } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { AppImage } from '@/components/common/AppImage';
import { Field, Input, Switch, Textarea } from '@/components/common/Field';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/States';
import { Modal } from '@/components/modals/Modal';
import { DeleteModal } from '@/components/modals/ConfirmModal';
import { MediaPickerModal } from '@/components/modals/MediaPickerModal';
import { useToast } from '@/components/common/Toast';
import { formatDate, formatDateInput, formatNumber, slugify } from '@/utils/format';
import type { Collection, Product, SeoMeta } from '@/types';
import { SeoFields, validateJsonLd } from '@/components/seo/SeoFields';
import { useGetSeoSettingsQuery } from '@/store/api/seoApi';
import { Tabs } from '@/components/common/PageHeader';

interface FormState {
  id?: string;
  name: string;
  slug: string;
  description: string;
  banner: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'inactive';
  featured: boolean;
  productIds: string[];
  /** The record's own metadata, edited on the SEO tab of this modal. */
  seo: SeoMeta;
}

const EMPTY: FormState = {
  name: '',
  slug: '',
  description: '',
  banner: '',
  startDate: '',
  endDate: '',
  status: 'active',
  featured: false,
  productIds: [],
  seo: {},
};

/** Two-pane product picker used inside the collection editor. */
function ProductSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useGetProductsQuery({
    search: search || undefined,
    pageSize: 40,
    status: 'published',
  });

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const { handlers, move, overIndex } = useDragReorder(selected, onChange);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    data?.items.forEach((product) => map.set(product.id, product));
    return map;
  }, [data]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-medium text-ink-700 dark:text-ink-300">Add products</p>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search the catalogue…"
          className="mb-3 sm:max-w-none"
        />
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-ink-200 p-1.5 dark:border-ink-700">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))
          ) : data?.items.length ? (
            data.items.map((product) => {
              const isSelected = selectedSet.has(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() =>
                    onChange(
                      isSelected
                        ? selected.filter((id) => id !== product.id)
                        : [...selected, product.id],
                    )
                  }
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors',
                    isSelected
                      ? 'bg-brand-50 dark:bg-brand-500/10'
                      : 'hover:bg-ink-50 dark:hover:bg-ink-800/60',
                  )}
                >
                  <AppImage
                    src={product.images[0]?.url}
                    alt={product.name}
                    seed={product.id}
                    wrapperClassName="h-9 w-9 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink-900 dark:text-ink-100">
                      {product.name}
                    </span>
                    <span className="block truncate font-mono text-2xs text-ink-500 dark:text-ink-400">
                      {product.sku}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-2xs font-semibold',
                      isSelected
                        ? 'text-brand-600 dark:text-brand-400'
                        : 'text-ink-400',
                    )}
                  >
                    {isSelected ? 'Added' : 'Add'}
                  </span>
                </button>
              );
            })
          ) : (
            <EmptyState compact title="No products found" description="Try another search." />
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-ink-700 dark:text-ink-300">
          In this collection ({selected.length}) — drag to reorder
        </p>
        <div className="max-h-[21.5rem] space-y-1 overflow-y-auto rounded-lg border border-ink-200 p-1.5 dark:border-ink-700">
          {selected.length === 0 ? (
            <EmptyState
              compact
              icon={Package}
              title="No products added"
              description="Pick products from the left to build this collection."
            />
          ) : (
            selected.map((productId, index) => {
              const product = productMap.get(productId);
              return (
                <div
                  key={productId}
                  {...handlers(index)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg p-1.5 transition-colors',
                    overIndex === index
                      ? 'bg-brand-50 dark:bg-brand-500/10'
                      : 'hover:bg-ink-50 dark:hover:bg-ink-800/60',
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-ink-300" />
                  <span className="w-5 shrink-0 text-2xs tabular-nums text-ink-400">
                    {index + 1}
                  </span>
                  <AppImage
                    src={product?.images[0]?.url}
                    alt={product?.name ?? productId}
                    seed={productId}
                    wrapperClassName="h-8 w-8 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-800 dark:text-ink-200">
                    {product?.name ?? productId}
                  </span>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                      className="px-1 text-2xs text-ink-400 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === selected.length - 1}
                      aria-label="Move down"
                      className="px-1 text-2xs text-ink-400 disabled:opacity-30"
                    >
                      ▼
                    </button>
                    <IconButton
                      label="Remove from collection"
                      size="sm"
                      onClick={() => onChange(selected.filter((id) => id !== productId))}
                    >
                      <X className="h-3 w-3" />
                    </IconButton>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function CollectionsPage() {
  useDocumentTitle('Collections');

  const toast = useToast();
  const { can } = usePermissions();

  const { data: collections, isLoading, isError, refetch } = useGetCollectionsQuery();
  const [createCollection, { isLoading: creating }] = useCreateCollectionMutation();
  const [updateCollection, { isLoading: updating }] = useUpdateCollectionMutation();
  const [deleteCollection, { isLoading: deleting }] = useDeleteCollectionMutation();
  const [reorder] = useReorderCollectionsMutation();

  const [form, setForm] = useState<FormState | null>(null);
  const [modalTab, setModalTab] = useState<'details' | 'seo'>('details');
  const { data: seoSettings } = useGetSeoSettingsQuery();
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const list = collections ?? [];

  const { handlers, overIndex } = useDragReorder(list, async (next) => {
    try {
      await reorder(next.map((collection) => collection.id)).unwrap();
      toast.success('Collection order updated');
    } catch (error) {
      toast.error('Could not reorder collections', errorMessage(error));
    }
  });

  const openCreate = () => {
    setErrors({});
    setModalTab('details');
    setForm({ ...EMPTY });
  };

  const openEdit = (collection: Collection) => {
    setErrors({});
    setModalTab('details');
    setForm({
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      description: collection.description ?? '',
      banner: collection.banner ?? '',
      startDate: formatDateInput(collection.startDate),
      endDate: formatDateInput(collection.endDate),
      status: collection.status,
      featured: collection.featured,
      productIds: collection.productIds,
      seo: collection.seo ?? {},
    });
  };

  const submit = async () => {
    if (!form) return;

    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Collection name is required';
    if (!form.slug.trim()) next.slug = 'Slug is required';
    if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
      next.endDate = 'End date must be after the start date';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || undefined,
      banner: form.banner || undefined,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
      status: form.status,
      featured: form.featured,
      productIds: form.productIds,
      seo: form.seo,
    };

    try {
      if (form.id) {
        await updateCollection({ id: form.id, body: payload }).unwrap();
        toast.success('Collection updated successfully.', payload.name);
      } else {
        await createCollection(payload).unwrap();
        toast.success('Collection created successfully.', payload.name);
      }
      setForm(null);
    } catch (error) {
      toast.error('Could not save the collection', errorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCollection(deleteTarget.id).unwrap();
      toast.success('Collection deleted successfully.', deleteTarget.name);
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Could not delete collection', errorMessage(error));
    }
  };

  const toggleStatus = async (collection: Collection) => {
    try {
      await updateCollection({
        id: collection.id,
        body: { status: collection.status === 'active' ? 'inactive' : 'active' },
      }).unwrap();
      toast.success(
        collection.status === 'active' ? 'Collection disabled' : 'Collection enabled',
        collection.name,
      );
    } catch (error) {
      toast.error('Could not update collection', errorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Collections"
        description="Curated edits shown across the storefront. Drag cards to change their order."
        actions={
          can('collections', 'create') && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Create Collection
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
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <Skeleton className="h-32 w-full rounded-b-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </Card>
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={Sparkles}
            title="No collections yet"
            description="Collections group products into curated edits like New Arrivals or Festive."
            action={
              can('collections', 'create') && (
                <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                  Create Collection
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((collection, index) => {
            const scheduled = collection.startDate && new Date(collection.startDate) > new Date();
            const ended = collection.endDate && new Date(collection.endDate) < new Date();

            return (
              <Card
                key={collection.id}
                {...handlers(index)}
                className={cn(
                  'group overflow-hidden transition-shadow hover:shadow-pop',
                  overIndex === index && 'ring-2 ring-brand-500',
                )}
              >
                <div className="relative">
                  <AppImage
                    src={collection.banner}
                    alt={collection.name}
                    seed={collection.id}
                    variant="banner"
                    rounded="md"
                    wrapperClassName="h-32 w-full rounded-none"
                  />
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                    {collection.featured && (
                      <Badge className="bg-brand-600 text-white ring-brand-600/20">Featured</Badge>
                    )}
                    {collection.status === 'inactive' && (
                      <Badge className="bg-ink-900/80 text-white ring-white/20">Disabled</Badge>
                    )}
                    {scheduled && (
                      <Badge className="bg-sky-600 text-white ring-sky-600/20">Scheduled</Badge>
                    )}
                    {ended && (
                      <Badge className="bg-ink-700/90 text-white ring-white/20">Ended</Badge>
                    )}
                  </div>
                  <span className="absolute right-2 top-2 hidden cursor-grab rounded-md bg-white/85 p-1 text-ink-500 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 dark:bg-ink-900/85 sm:block">
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                </div>

                <CardBody className="space-y-3">
                  <div>
                    <h3 className="truncate text-sm font-semibold text-ink-900 dark:text-ink-100">
                      {collection.name}
                    </h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-500 dark:text-ink-400">
                      {collection.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-500 dark:text-ink-400">
                    <span className="inline-flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {formatNumber(collection.productIds.length)} products
                    </span>
                    {collection.startDate && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(collection.startDate)}
                        {collection.endDate ? ` – ${formatDate(collection.endDate)}` : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-ink-200 pt-3 dark:border-ink-800">
                    {can('collections', 'edit') ? (
                      <Switch
                        size="sm"
                        checked={collection.status === 'active'}
                        onChange={() => toggleStatus(collection)}
                      />
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center gap-1">
                      {can('collections', 'edit') && (
                        <IconButton
                          label={`Edit ${collection.name}`}
                          size="sm"
                          onClick={() => openEdit(collection)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                      )}
                      {can('collections', 'delete') && (
                        <IconButton
                          label={`Delete ${collection.name}`}
                          size="sm"
                          onClick={() => setDeleteTarget(collection)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        </IconButton>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit collection' : 'Create collection'}
        description="Curate products, schedule the edit and choose where it appears."
        size="xl"
        busy={creating || updating}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={creating || updating} onClick={submit}>
              {form?.id ? 'Save changes' : 'Create collection'}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-5">
            <Tabs
              items={[
                { key: 'details', label: 'Details' },
                { key: 'seo', label: 'SEO' },
              ]}
              active={modalTab}
              onChange={(key) => setModalTab(key as 'details' | 'seo')}
              variant="pill"
            />

            <div className={modalTab === 'details' ? 'space-y-5' : 'hidden'}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Collection Name" required error={errors.name}>
                <Input
                  value={form.name}
                  invalid={Boolean(errors.name)}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                      slug: form.id ? form.slug : slugify(event.target.value),
                    })
                  }
                  placeholder="Festive Edit"
                />
              </Field>
              <Field label="Slug" required error={errors.slug}>
                <Input
                  value={form.slug}
                  invalid={Boolean(errors.slug)}
                  onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })}
                  placeholder="festive-edit"
                />
              </Field>
            </div>

            <Field label="Description">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Zari, organza and silk for the celebration season."
              />
            </Field>

            <Field label="Banner">
              <div className="flex flex-wrap items-center gap-3">
                <AppImage
                  src={form.banner}
                  alt={form.name || 'Collection banner'}
                  seed={form.slug || 'collection'}
                  variant="banner"
                  wrapperClassName="h-20 w-40 shrink-0"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ImageIcon className="h-3.5 w-3.5" />}
                    onClick={() => setPickerOpen(true)}
                  >
                    Upload banner
                  </Button>
                  {form.banner && (
                    <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, banner: '' })}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start Date">
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                />
              </Field>
              <Field label="End Date" error={errors.endDate} hint="Leave blank to run indefinitely.">
                <Input
                  type="date"
                  value={form.endDate}
                  invalid={Boolean(errors.endDate)}
                  onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                />
              </Field>
            </div>

            <div className="space-y-3 rounded-lg border border-ink-200 p-4 dark:border-ink-700">
              <Switch
                checked={form.status === 'active'}
                onChange={(checked) => setForm({ ...form, status: checked ? 'active' : 'inactive' })}
                label="Enabled"
                description="Disabled collections are hidden from the storefront."
              />
              <div className="h-px bg-ink-200 dark:bg-ink-800" />
              <Switch
                checked={form.featured}
                onChange={(checked) => setForm({ ...form, featured: checked })}
                label="Featured"
                description="Show this collection in the homepage collections row."
              />
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-ink-800 dark:text-ink-200">Products</p>
              <ProductSelector
                selected={form.productIds}
                onChange={(productIds) => setForm({ ...form, productIds })}
              />
            </div>
            </div>

            {/* Kept mounted rather than unmounted, so switching tabs mid-edit
                does not throw away what has been typed on the other one. */}
            <div className={modalTab === 'seo' ? '' : 'hidden'}>
              <SeoFields
                value={form.seo}
                onChange={(patch) => setForm({ ...form, seo: { ...form.seo, ...patch } })}
                previewUrl={`${seoSettings?.siteUrl ?? 'https://sopii.com'}/collections/${
                  form.seo.slug || form.slug || 'collection'
                }`}
                siteName={seoSettings?.siteName}
                fallbackTitle={form.name || 'Collection'}
                fallbackDescription={form.description || seoSettings?.defaultMetaDescription || ''}
                showSlug={false}
                jsonError={validateJsonLd(form.seo.structuredData)}
              />
            </div>
          </div>
        )}
      </Modal>

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple={false}
        folder="collections"
        title="Select collection banner"
        onSelect={(assets) => {
          if (form && assets[0]) setForm({ ...form, banner: assets[0].url });
        }}
      />

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="collection"
        name={deleteTarget?.name}
        loading={deleting}
      />
    </div>
  );
}
