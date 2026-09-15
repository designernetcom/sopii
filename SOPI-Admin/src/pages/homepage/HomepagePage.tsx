import { useRef, useState } from 'react';
import {
  CalendarDays,
  ExternalLink,
  GripVertical,
  ImageIcon,
  LayoutTemplate,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, useDragReorder, usePermissions } from '@/hooks';
import {
  useCreateBannerMutation,
  useDeleteBannerMutation,
  useGetAnnouncementsQuery,
  useGetBannersQuery,
  useGetHomeSectionsQuery,
  useReorderBannersMutation,
  useReorderHomeSectionsMutation,
  useUpdateBannerMutation,
  useUpdateHomeSectionMutation,
  useGetUploadStatusQuery,
  useUploadImagesMutation,
} from '@/store/api/marketingApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader, Tabs } from '@/components/common/PageHeader';
import { Card, CardBody } from '@/components/common/Card';
import { Button, IconButton } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { AppImage } from '@/components/common/AppImage';
import { Field, Input, Switch } from '@/components/common/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/States';
import { FormModal } from '@/components/modals/FormModal';
import { DeleteModal } from '@/components/modals/ConfirmModal';
import { MediaPickerModal } from '@/components/modals/MediaPickerModal';
import { useToast } from '@/components/common/Toast';
import { formatDate, formatDateInput } from '@/utils/format';
import { readImageFile } from '@/utils/image';
import type { Banner, HomeSection } from '@/types';
import { AnnouncementsTab } from './AnnouncementsTab';
import { FeaturedCollectionTab } from './FeaturedCollectionTab';

interface BannerForm {
  id?: string;
  title: string;
  heading: string;
  subheading: string;
  desktopImage: string;
  /* Carried through the form so a replaced image can take its stored asset
     with it. The server does the reaping — it is the only side that knows
     what the *saved* banner still points at. */
  desktopImagePublicId?: string;
  mobileImage: string;
  mobileImagePublicId?: string;
  buttonText: string;
  buttonLink: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'inactive';
}

const EMPTY_BANNER: BannerForm = {
  title: '',
  heading: '',
  subheading: '',
  desktopImage: '',
  desktopImagePublicId: undefined,
  mobileImage: '',
  mobileImagePublicId: undefined,
  buttonText: 'Shop Now',
  buttonLink: '/collections/new-arrivals',
  startDate: '',
  endDate: '',
  status: 'active',
};

/* --------------------------------- banners --------------------------------- */

function BannersTab() {
  const toast = useToast();
  const { can } = usePermissions();

  const { data: banners, isLoading, isError, refetch } = useGetBannersQuery();
  const [createBanner, { isLoading: creating }] = useCreateBannerMutation();
  const [updateBanner, { isLoading: updating }] = useUpdateBannerMutation();
  const [deleteBanner, { isLoading: deleting }] = useDeleteBannerMutation();
  const [reorder] = useReorderBannersMutation();

  const [form, setForm] = useState<BannerForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null);
  const [picker, setPicker] = useState<'desktop' | 'mobile' | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<'desktop' | 'mobile' | null>(null);
  const desktopInput = useRef<HTMLInputElement>(null);
  const mobileInput = useRef<HTMLInputElement>(null);

  const [uploadImages] = useUploadImagesMutation();
  const { data: uploadStatus } = useGetUploadStatusQuery();
  const uploadsReady = uploadStatus?.configured !== false;

  /**
   * Reads a picked file and posts the bytes to `/api/uploads/image`, which
   * forwards them to Cloudinary and answers with the URL and handle the banner
   * stores. Nothing base64 reaches the banner document — a hero image is the
   * largest single asset the storefront loads, and inlining one used to put a
   * couple of megabytes into every cold page load.
   */
  const uploadBannerImage = async (slot: 'desktop' | 'mobile', file: File | undefined) => {
    if (!form || !file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Unsupported file', 'Banner images must be PNG, JPG or WebP.');
      return;
    }

    setUploadingSlot(slot);
    try {
      const parsed = await readImageFile(file);
      const result = await uploadImages({
        scope: 'banner',
        ownerId: form.id,
        images: [{ data: parsed.url, name: parsed.name, alt: form.heading }],
      }).unwrap();

      const uploaded = result.images[0];
      if (!uploaded) throw new Error(result.failed[0]?.message ?? 'Upload failed');

      setForm((current) =>
        current
          ? slot === 'mobile'
            ? { ...current, mobileImage: uploaded.url, mobileImagePublicId: uploaded.publicId }
            : { ...current, desktopImage: uploaded.url, desktopImagePublicId: uploaded.publicId }
          : current,
      );
      toast.success('Image uploaded', 'Remember to save the banner.');
    } catch (error) {
      toast.error('Could not upload the image', errorMessage(error));
    } finally {
      setUploadingSlot(null);
    }
  };

  const list = banners ?? [];

  const { handlers, overIndex } = useDragReorder(list, async (next) => {
    try {
      await reorder(next.map((banner) => banner.id)).unwrap();
      toast.success('Banner order updated');
    } catch (error) {
      toast.error('Could not reorder banners', errorMessage(error));
    }
  });

  const openCreate = () => {
    setErrors({});
    setForm({ ...EMPTY_BANNER });
  };

  const openEdit = (banner: Banner) => {
    setErrors({});
    setForm({
      id: banner.id,
      title: banner.title,
      heading: banner.heading,
      subheading: banner.subheading ?? '',
      desktopImage: banner.desktopImage,
      desktopImagePublicId: banner.desktopImagePublicId,
      mobileImage: banner.mobileImage ?? '',
      mobileImagePublicId: banner.mobileImagePublicId,
      buttonText: banner.buttonText ?? '',
      buttonLink: banner.buttonLink ?? '',
      startDate: formatDateInput(banner.startDate),
      endDate: formatDateInput(banner.endDate),
      status: banner.status,
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const next: Record<string, string> = {};
    if (form.heading.trim().length < 2) next.heading = 'Heading is required';
    if (form.buttonText.trim() && !form.buttonLink.trim()) {
      next.buttonLink = 'Add the link the button should open';
    }
    if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
      next.endDate = 'End date must be after the start date';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      title: form.title.trim() || form.heading.trim(),
      heading: form.heading.trim(),
      subheading: form.subheading.trim() || undefined,
      /*
       * Empty strings, not `undefined`. The API strips undefined fields from a
       * patch, so sending `undefined` for a cleared image left the old one in
       * the database — the Remove button appeared to work and the banner still
       * carried the picture on the next load. An empty string is a value, so
       * it clears the field, and clearing the handle alongside it is what lets
       * the server release the stored asset.
       */
      desktopImage: form.desktopImage,
      desktopImagePublicId: form.desktopImagePublicId ?? '',
      mobileImage: form.mobileImage,
      mobileImagePublicId: form.mobileImagePublicId ?? '',
      buttonText: form.buttonText.trim() || undefined,
      buttonLink: form.buttonLink.trim() || undefined,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
      status: form.status,
    };

    try {
      if (form.id) {
        await updateBanner({ id: form.id, body: payload }).unwrap();
        toast.success('Banner updated successfully.', payload.heading);
      } else {
        await createBanner(payload).unwrap();
        toast.success('Banner created successfully.', payload.heading);
      }
      setForm(null);
    } catch (error) {
      toast.error('Could not save the banner', errorMessage(error));
    }
  };

  const toggleStatus = async (banner: Banner) => {
    try {
      await updateBanner({
        id: banner.id,
        body: { status: banner.status === 'active' ? 'inactive' : 'active' },
      }).unwrap();
      toast.success(
        banner.status === 'active' ? 'Banner hidden' : 'Banner published',
        banner.heading,
      );
    } catch (error) {
      toast.error('Could not update the banner', errorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBanner(deleteTarget.id).unwrap();
      toast.success('Banner deleted successfully.', deleteTarget.heading);
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Could not delete the banner', errorMessage(error));
    }
  };

  if (isError) {
    return (
      <Card>
        <ErrorState onRetry={refetch} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Hero slides rotate in this order. Drag a card to move it.
        </p>
        {can('homepage', 'create') && (
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={openCreate}
          >
            Add Banner
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <Skeleton className="h-36 w-full rounded-b-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={ImageIcon}
            title="No banners yet"
            description="Hero banners are the first thing customers see on the storefront."
            action={
              can('homepage', 'create') && (
                <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                  Add Banner
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((banner, index) => {
            const scheduled = banner.startDate && new Date(banner.startDate) > new Date();
            const ended = banner.endDate && new Date(banner.endDate) < new Date();

            return (
              <Card
                key={banner.id}
                {...handlers(index)}
                className={cn(
                  'group overflow-hidden transition-shadow hover:shadow-pop',
                  overIndex === index && 'ring-2 ring-brand-500',
                )}
              >
                <div className="relative">
                  <AppImage
                    src={banner.desktopImage}
                    alt={banner.heading}
                    seed={banner.id}
                    variant="banner"
                    wrapperClassName="h-36 w-full rounded-none"
                  />
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                    <Badge className="bg-ink-900/80 text-white ring-white/20">#{index + 1}</Badge>
                    {banner.status === 'inactive' && (
                      <Badge className="bg-ink-700/90 text-white ring-white/20">Hidden</Badge>
                    )}
                    {scheduled && (
                      <Badge className="bg-sky-600 text-white ring-sky-600/20">Scheduled</Badge>
                    )}
                    {ended && (
                      <Badge className="bg-rose-600 text-white ring-rose-600/20">Ended</Badge>
                    )}
                  </div>
                  <span className="absolute right-2 top-2 hidden cursor-grab rounded-md bg-white/85 p-1 text-ink-500 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 dark:bg-ink-900/85 sm:block">
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                </div>

                <CardBody className="space-y-3">
                  <div>
                    <h3 className="truncate text-sm font-semibold text-ink-900 dark:text-ink-100">
                      {banner.heading}
                    </h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-500 dark:text-ink-400">
                      {banner.subheading || banner.title}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-500 dark:text-ink-400">
                    {banner.buttonText && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {banner.buttonText} · {banner.buttonLink}
                        </span>
                      </span>
                    )}
                    {banner.startDate && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(banner.startDate)}
                        {banner.endDate ? ` – ${formatDate(banner.endDate)}` : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-ink-200 pt-3 dark:border-ink-800">
                    {can('homepage', 'edit') ? (
                      <Switch
                        size="sm"
                        checked={banner.status === 'active'}
                        onChange={() => toggleStatus(banner)}
                      />
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center gap-1">
                      {can('homepage', 'edit') && (
                        <IconButton
                          label={`Edit ${banner.heading}`}
                          size="sm"
                          onClick={() => openEdit(banner)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                      )}
                      {can('homepage', 'delete') && (
                        <IconButton
                          label={`Delete ${banner.heading}`}
                          size="sm"
                          onClick={() => setDeleteTarget(banner)}
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

      <FormModal
        open={form !== null}
        onClose={() => setForm(null)}
        onSubmit={submit}
        title={form?.id ? 'Edit banner' : 'Add banner'}
        description="Artwork, copy and the window during which this slide runs."
        submitLabel={form?.id ? 'Save changes' : 'Add banner'}
        loading={creating || updating}
        size="lg"
      >
        {form && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Internal Title" hint="Only shown inside the admin.">
                <Input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Festive campaign — slide 1"
                />
              </Field>
              <Field label="Status">
                <div className="pt-1.5">
                  <Switch
                    checked={form.status === 'active'}
                    onChange={(checked) =>
                      setForm({ ...form, status: checked ? 'active' : 'inactive' })
                    }
                    label="Visible on the storefront"
                  />
                </div>
              </Field>
            </div>

            <Field label="Heading" required error={errors.heading}>
              <Input
                value={form.heading}
                invalid={Boolean(errors.heading)}
                onChange={(event) => setForm({ ...form, heading: event.target.value })}
                placeholder="The Festive Edit"
              />
            </Field>

            <Field label="Subheading">
              <Input
                value={form.subheading}
                onChange={(event) => setForm({ ...form, subheading: event.target.value })}
                placeholder="Handwoven silk, ready for the season"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Desktop Image" hint="1920 × 720 works best.">
                <div className="space-y-2">
                  <AppImage
                    src={form.desktopImage}
                    alt={form.heading || 'Desktop banner'}
                    seed={form.id ?? 'banner-desktop'}
                    variant="banner"
                    wrapperClassName="h-24 w-full"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ImageIcon className="h-3.5 w-3.5" />}
                      onClick={() => setPicker('desktop')}
                    >
                      Choose image
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={uploadingSlot !== null || !uploadsReady}
                      title={
                        uploadsReady
                          ? undefined
                          : 'Image storage is not configured on the server — see CLOUDINARY_* in server/.env'
                      }
                      icon={<Upload className="h-3.5 w-3.5" />}
                      onClick={() => desktopInput.current?.click()}
                    >
                      {uploadingSlot === 'desktop' ? 'Uploading…' : 'Upload'}
                    </Button>
                    {form.desktopImage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setForm({ ...form, desktopImage: '', desktopImagePublicId: undefined })
                        }
                      >
                        Remove
                      </Button>
                    )}
                    <input
                      ref={desktopInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        void uploadBannerImage('desktop', event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </div>
                </div>
              </Field>

              <Field label="Mobile Image" hint="Optional portrait crop.">
                <div className="space-y-2">
                  <AppImage
                    src={form.mobileImage}
                    alt={form.heading || 'Mobile banner'}
                    seed={form.id ? `${form.id}-mobile` : 'banner-mobile'}
                    variant="banner"
                    wrapperClassName="h-24 w-full"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ImageIcon className="h-3.5 w-3.5" />}
                      onClick={() => setPicker('mobile')}
                    >
                      Choose image
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={uploadingSlot !== null || !uploadsReady}
                      title={
                        uploadsReady
                          ? undefined
                          : 'Image storage is not configured on the server — see CLOUDINARY_* in server/.env'
                      }
                      icon={<Upload className="h-3.5 w-3.5" />}
                      onClick={() => mobileInput.current?.click()}
                    >
                      {uploadingSlot === 'mobile' ? 'Uploading…' : 'Upload'}
                    </Button>
                    {form.mobileImage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setForm({ ...form, mobileImage: '', mobileImagePublicId: undefined })
                        }
                      >
                        Remove
                      </Button>
                    )}
                    <input
                      ref={mobileInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        void uploadBannerImage('mobile', event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </div>
                </div>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Button Text">
                <Input
                  value={form.buttonText}
                  onChange={(event) => setForm({ ...form, buttonText: event.target.value })}
                  placeholder="Shop Now"
                />
              </Field>
              <Field label="Button Link" error={errors.buttonLink}>
                <Input
                  value={form.buttonLink}
                  invalid={Boolean(errors.buttonLink)}
                  onChange={(event) => setForm({ ...form, buttonLink: event.target.value })}
                  placeholder="/collections/festive"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start Date" hint="Leave blank to publish immediately.">
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
          </>
        )}
      </FormModal>

      <MediaPickerModal
        open={picker !== null}
        onClose={() => setPicker(null)}
        multiple={false}
        folder="banners"
        title={picker === 'mobile' ? 'Select mobile banner' : 'Select desktop banner'}
        onSelect={(assets) => {
          if (!form || !assets[0]) return;
          // The handle travels with the URL, or a later replacement would have
          // no way to release the asset it stopped pointing at.
          setForm(
            picker === 'mobile'
              ? { ...form, mobileImage: assets[0].url, mobileImagePublicId: assets[0].publicId }
              : { ...form, desktopImage: assets[0].url, desktopImagePublicId: assets[0].publicId },
          );
        }}
      />

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="banner"
        name={deleteTarget?.heading}
        loading={deleting}
      />
    </div>
  );
}

/* -------------------------------- sections --------------------------------- */

function SectionsTab() {
  const toast = useToast();
  const { can } = usePermissions();

  const { data: sections, isLoading, isError, refetch } = useGetHomeSectionsQuery();
  const [updateSection, { isLoading: saving }] = useUpdateHomeSectionMutation();
  const [reorder] = useReorderHomeSectionsMutation();

  const [editing, setEditing] = useState<HomeSection | null>(null);
  const [draft, setDraft] = useState({ title: '', subtitle: '', itemLimit: '' });

  const list = sections ?? [];

  const { handlers, move, overIndex } = useDragReorder(list, async (next) => {
    try {
      await reorder(next.map((section) => section.id)).unwrap();
      toast.success('Section order updated');
    } catch (error) {
      toast.error('Could not reorder sections', errorMessage(error));
    }
  });

  const toggle = async (section: HomeSection) => {
    try {
      await updateSection({ id: section.id, body: { enabled: !section.enabled } }).unwrap();
      toast.success(section.enabled ? 'Section hidden' : 'Section enabled', section.title);
    } catch (error) {
      toast.error('Could not update the section', errorMessage(error));
    }
  };

  const openEdit = (section: HomeSection) => {
    setEditing(section);
    setDraft({
      title: section.title,
      subtitle: section.subtitle ?? '',
      itemLimit: section.itemLimit ? String(section.itemLimit) : '',
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    try {
      await updateSection({
        id: editing.id,
        body: {
          title: draft.title.trim() || editing.title,
          subtitle: draft.subtitle.trim() || undefined,
          itemLimit: draft.itemLimit ? Number(draft.itemLimit) : undefined,
        },
      }).unwrap();
      toast.success('Section updated successfully.', draft.title);
      setEditing(null);
    } catch (error) {
      toast.error('Could not save the section', errorMessage(error));
    }
  };

  if (isError) {
    return (
      <Card>
        <ErrorState onRetry={refetch} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-500 dark:text-ink-400">
        Sections render top to bottom in this order. Disabled sections are skipped entirely.
      </p>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-ink-200 dark:divide-ink-800">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 p-4">
                <Skeleton className="h-4 w-4 shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-9 shrink-0" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-ink-200 dark:divide-ink-800">
            {list.map((section, index) => (
              <li
                key={section.id}
                {...handlers(index)}
                className={cn(
                  'flex items-center gap-3 p-4 transition-colors',
                  overIndex === index
                    ? 'bg-brand-50 dark:bg-brand-500/10'
                    : 'hover:bg-ink-50 dark:hover:bg-ink-800/40',
                  !section.enabled && 'opacity-60',
                )}
              >
                <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-ink-300 sm:block" />
                <span className="w-5 shrink-0 text-2xs tabular-nums text-ink-400">{index + 1}</span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                    {section.title}
                  </p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                    {section.subtitle}
                    {section.itemLimit ? ` · ${section.itemLimit} items` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <div className="flex flex-col sm:hidden">
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
                      disabled={index === list.length - 1}
                      aria-label="Move down"
                      className="px-1 text-2xs text-ink-400 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  {can('homepage', 'edit') && (
                    <>
                      <IconButton
                        label={`Edit ${section.title}`}
                        size="sm"
                        onClick={() => openEdit(section)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <Switch
                        size="sm"
                        checked={section.enabled}
                        onChange={() => toggle(section)}
                        label={`Toggle ${section.title}`}
                      />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        title="Edit section"
        description="Copy shown above this block on the storefront."
        submitLabel="Save changes"
        loading={saving}
      >
        <Field label="Title" required>
          <Input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </Field>
        <Field label="Subtitle">
          <Input
            value={draft.subtitle}
            onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}
          />
        </Field>
        {editing?.itemLimit !== undefined && (
          <Field label="Items Shown" hint="How many products or tiles this block renders.">
            <Input
              type="number"
              min={1}
              max={24}
              value={draft.itemLimit}
              onChange={(event) => setDraft({ ...draft, itemLimit: event.target.value })}
              className="tabular-nums"
            />
          </Field>
        )}
      </FormModal>
    </div>
  );
}

/* ---------------------------------- page ----------------------------------- */

export default function HomepagePage() {
  useDocumentTitle('Homepage');

  const [tab, setTab] = useState('banners');
  const { data: banners } = useGetBannersQuery();
  const { data: sections } = useGetHomeSectionsQuery();
  const { data: announcements } = useGetAnnouncementsQuery();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Homepage"
        description="Control the hero carousel, the announcement strip, the featured collection and the order of every block on the storefront home page."
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={<LayoutTemplate className="h-3.5 w-3.5" />}
            onClick={() => window.open('/', '_blank', 'noopener')}
          >
            <span className="hidden sm:inline">Preview store</span>
          </Button>
        }
      />

      <Tabs
        items={[
          { key: 'banners', label: 'Hero Banners', count: banners?.length },
          { key: 'announcements', label: 'Announcements', count: announcements?.length },
          { key: 'featured', label: 'Featured Collection' },
          { key: 'sections', label: 'Page Sections', count: sections?.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'banners' && <BannersTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
      {tab === 'featured' && <FeaturedCollectionTab />}
      {tab === 'sections' && <SectionsTab />}
    </div>
  );
}
