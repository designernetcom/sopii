import { useRef, useState } from 'react';
import {
  Copy,
  Grid2X2,
  HardDrive,
  ImageIcon,
  List,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, useListQuery, usePermissions } from '@/hooks';
import {
  useBulkDeleteMediaMutation,
  useDeleteMediaMutation,
  useGetMediaQuery,
  useGetMediaStatsQuery,
  useUpdateMediaMutation,
  useUploadMediaMutation,
} from '@/store/api/marketingApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/common/Card';
import { Button, IconButton } from '@/components/common/Button';
import { AppImage } from '@/components/common/AppImage';
import { Checkbox, Field, Input, Select } from '@/components/common/Field';
import { FilterChip, SearchInput } from '@/components/common/SearchInput';
import { EmptyState, ErrorState } from '@/components/common/States';
import { Pagination } from '@/components/tables/Pagination';
import { FormModal } from '@/components/modals/FormModal';
import { DeleteModal, ConfirmModal } from '@/components/modals/ConfirmModal';
import { ImagePreviewModal } from '@/components/modals/ImagePreviewModal';
import { useToast } from '@/components/common/Toast';
import { formatDate, formatFileSize, formatNumber } from '@/utils/format';
import { readImageFile } from '@/utils/image';
import type { MediaAsset, MediaFolder } from '@/types';

const FOLDERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All files' },
  { key: 'products', label: 'Products' },
  { key: 'banners', label: 'Banners' },
  { key: 'categories', label: 'Categories' },
  { key: 'collections', label: 'Collections' },
  { key: 'blog', label: 'Blog' },
  { key: 'other', label: 'Other' },
];

const FOLDER_OPTIONS = FOLDERS.filter((folder) => folder.key !== 'all').map((folder) => ({
  value: folder.key,
  label: folder.label,
}));

interface EditForm {
  id: string;
  name: string;
  alt: string;
  folder: MediaFolder;
}

export default function MediaPage() {
  useDocumentTitle('Media Library');

  const toast = useToast();
  const { can, user } = usePermissions();
  const fileInput = useRef<HTMLInputElement>(null);

  const query = useListQuery({ pageSize: 24, sortBy: 'createdAt', sortDir: 'desc' });
  const { data, isLoading, isError, refetch } = useGetMediaQuery(query.params);
  const { data: stats } = useGetMediaStatsQuery();

  const [uploadMedia, { isLoading: uploading }] = useUploadMediaMutation();
  const [updateMedia, { isLoading: saving }] = useUpdateMediaMutation();
  const [deleteMedia, { isLoading: deleting }] = useDeleteMediaMutation();
  const [bulkDelete, { isLoading: bulkDeleting }] = useBulkDeleteMediaMutation();

  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<string[]>([]);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [uploadFolder, setUploadFolder] = useState<MediaFolder>('products');
  const [dragging, setDragging] = useState(false);

  const assets = data?.items ?? [];
  const activeFolder = (query.state.folder as string) || 'all';

  /*
   * Files are read into base64 purely as a transport format: the API forwards
   * the bytes to Cloudinary and stores the `secure_url` and `public_id` that
   * come back. A library row is a couple of short strings, not a megabyte of
   * inline image — which is what it used to be, and why the storefront feed
   * grew to a size the shop timed out on.
   */
  const upload = async (files: FileList | File[]) => {
    const picked = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (picked.length === 0) {
      toast.warning('Only image files can be uploaded');
      return;
    }

    try {
      const parsed = await Promise.all(picked.map(readImageFile));
      await uploadMedia({
        files: parsed.map((file) => ({
          ...file,
          folder: uploadFolder,
          alt: file.name?.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          uploadedBy: user?.name ?? 'Admin',
        })),
      }).unwrap();
      toast.success(
        `${picked.length} file${picked.length > 1 ? 's' : ''} uploaded`,
        `Stored on the CDN and added to the ${uploadFolder} folder.`,
      );
    } catch (error) {
      toast.error('Could not upload the files', errorMessage(error));
    }
  };

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editForm) return;
    try {
      await updateMedia({
        id: editForm.id,
        body: {
          name: editForm.name.trim(),
          alt: editForm.alt.trim() || undefined,
          folder: editForm.folder,
        },
      }).unwrap();
      toast.success('Media details updated.', editForm.name);
      setEditForm(null);
    } catch (error) {
      toast.error('Could not update the file', errorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMedia(deleteTarget.id).unwrap();
      setSelected((current) => current.filter((id) => id !== deleteTarget.id));
      toast.success('File deleted successfully.', deleteTarget.name);
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Could not delete the file', errorMessage(error));
    }
  };

  const handleBulkDelete = async () => {
    try {
      const result = await bulkDelete(selected).unwrap();
      toast.success(`${result.affected} files deleted`);
      setSelected([]);
      setBulkOpen(false);
    } catch (error) {
      toast.error('Could not delete the selected files', errorMessage(error));
    }
  };

  const copyUrl = (asset: MediaAsset) => {
    navigator.clipboard
      ?.writeText(asset.url)
      .then(() => toast.success('Image URL copied'))
      .catch(() => toast.error('Could not copy the URL'));
  };

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Media library"
        description="Every image used across products, banners and collections."
        actions={
          can('media', 'create') && (
            <>
              <Select
                sizeVariant="sm"
                className="w-auto"
                value={uploadFolder}
                onChange={(event) => setUploadFolder(event.target.value as MediaFolder)}
                options={FOLDER_OPTIONS}
                aria-label="Upload destination folder"
              />
              <Button
                variant="primary"
                icon={<Upload className="h-4 w-4" />}
                loading={uploading}
                onClick={() => fileInput.current?.click()}
              >
                Upload
              </Button>
            </>
          )
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) upload(event.target.files);
          event.target.value = '';
        }}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-ink-500 dark:text-ink-400">Total files</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-ink-900 dark:text-ink-100">
            {formatNumber(stats?.total ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-ink-500 dark:text-ink-400">Storage used</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-ink-900 dark:text-ink-100">
            {formatFileSize(stats?.size ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-ink-500 dark:text-ink-400">Product images</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-ink-900 dark:text-ink-100">
            {formatNumber(stats?.byFolder.products ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-ink-500 dark:text-ink-400">Banner images</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-ink-900 dark:text-ink-100">
            {formatNumber(stats?.byFolder.banners ?? 0)}
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-ink-200 p-4 dark:border-ink-800">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={query.state.search}
              onChange={query.setSearch}
              placeholder="Search by file name or alt text…"
            />
            <Select
              sizeVariant="sm"
              className="w-auto"
              value={`${query.state.sortBy}:${query.state.sortDir}`}
              onChange={(event) => {
                const [by, dir] = event.target.value.split(':');
                query.setSort({ by, dir: dir as 'asc' | 'desc' });
              }}
              options={[
                { value: 'createdAt:desc', label: 'Newest first' },
                { value: 'createdAt:asc', label: 'Oldest first' },
                { value: 'name:asc', label: 'Name A–Z' },
                { value: 'size:desc', label: 'Largest first' },
              ]}
              aria-label="Sort media"
            />
            <div className="ml-auto flex items-center gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-800/70">
              <IconButton
                label="Grid view"
                size="sm"
                variant={view === 'grid' ? 'secondary' : 'ghost'}
                onClick={() => setView('grid')}
              >
                <Grid2X2 className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="List view"
                size="sm"
                variant={view === 'list' ? 'secondary' : 'ghost'}
                onClick={() => setView('list')}
              >
                <List className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {FOLDERS.map((folder) => (
              <FilterChip
                key={folder.key}
                label={folder.label}
                count={folder.key === 'all' ? stats?.total : stats?.byFolder[folder.key]}
                active={activeFolder === folder.key}
                onClick={() =>
                  query.setFilter('folder', folder.key === 'all' ? undefined : folder.key)
                }
              />
            ))}
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-brand-200 bg-brand-50 px-4 py-2.5 dark:border-brand-500/20 dark:bg-brand-500/10">
            <span className="text-xs font-medium text-brand-800 dark:text-brand-200">
              {selected.length} selected
            </span>
            {can('media', 'delete') && (
              <Button
                size="xs"
                variant="danger"
                icon={<Trash2 className="h-3 w-3" />}
                onClick={() => setBulkOpen(true)}
              >
                Delete
              </Button>
            )}
            <button
              type="button"
              onClick={() => setSelected([])}
              className="ml-auto text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              Clear
            </button>
          </div>
        )}

        {isError ? (
          <ErrorState onRetry={refetch} />
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index} className="skeleton aspect-square w-full rounded-lg" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="No files found."
            description="Upload artwork or try a different folder."
            action={
              can('media', 'create') && (
                <Button
                  variant="primary"
                  icon={<Upload className="h-4 w-4" />}
                  onClick={() => fileInput.current?.click()}
                >
                  Upload files
                </Button>
              )
            }
          />
        ) : view === 'grid' ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (can('media', 'create') && event.dataTransfer.files.length) {
                upload(event.dataTransfer.files);
              }
            }}
            className={cn(
              'grid grid-cols-2 gap-3 p-4 transition-colors sm:grid-cols-4 xl:grid-cols-6',
              dragging && 'bg-brand-50/60 dark:bg-brand-500/5',
            )}
          >
            {assets.map((asset, index) => {
              const isSelected = selected.includes(asset.id);
              return (
                <div
                  key={asset.id}
                  className={cn(
                    'group relative overflow-hidden rounded-lg ring-2 transition-all',
                    isSelected ? 'ring-brand-500' : 'ring-transparent hover:ring-ink-300',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(index)}
                    className="block w-full"
                    aria-label={`Preview ${asset.name}`}
                  >
                    <AppImage
                      src={asset.url}
                      alt={asset.alt ?? asset.name}
                      seed={asset.id}
                      preset="tile"
                      wrapperClassName="aspect-square w-full"
                    />
                  </button>

                  <span className="absolute left-1.5 top-1.5 rounded bg-white/85 p-0.5 backdrop-blur dark:bg-ink-900/85">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggle(asset.id)}
                      aria-label={`Select ${asset.name}`}
                    />
                  </span>

                  <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <IconButton
                      label={`Copy URL for ${asset.name}`}
                      size="sm"
                      variant="secondary"
                      onClick={() => copyUrl(asset)}
                    >
                      <Copy className="h-3 w-3" />
                    </IconButton>
                    {can('media', 'edit') && (
                      <IconButton
                        label={`Edit ${asset.name}`}
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setEditForm({
                            id: asset.id,
                            name: asset.name,
                            alt: asset.alt ?? '',
                            folder: asset.folder,
                          })
                        }
                      >
                        <Pencil className="h-3 w-3" />
                      </IconButton>
                    )}
                    {can('media', 'delete') && (
                      <IconButton
                        label={`Delete ${asset.name}`}
                        size="sm"
                        variant="secondary"
                        onClick={() => setDeleteTarget(asset)}
                      >
                        <Trash2 className="h-3 w-3 text-rose-500" />
                      </IconButton>
                    )}
                  </div>

                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/80 to-transparent p-1.5">
                    <span className="block truncate text-2xs font-medium text-white">
                      {asset.name}
                    </span>
                    <span className="block text-[10px] text-white/70">
                      {asset.width} × {asset.height} · {formatFileSize(asset.size)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <ul className="divide-y divide-ink-200 dark:divide-ink-800">
            {assets.map((asset, index) => (
              <li key={asset.id} className="flex items-center gap-3 p-3">
                <Checkbox
                  checked={selected.includes(asset.id)}
                  onChange={() => toggle(asset.id)}
                  aria-label={`Select ${asset.name}`}
                />
                <button
                  type="button"
                  onClick={() => setPreviewIndex(index)}
                  className="shrink-0"
                  aria-label={`Preview ${asset.name}`}
                >
                  <AppImage
                    src={asset.url}
                    alt={asset.alt ?? asset.name}
                    seed={asset.id}
                    wrapperClassName="h-11 w-11"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                    {asset.name}
                  </p>
                  <p className="truncate text-2xs text-ink-500 dark:text-ink-400">
                    {asset.folder} · {asset.width} × {asset.height} · {formatFileSize(asset.size)} ·{' '}
                    {formatDate(asset.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    label={`Copy URL for ${asset.name}`}
                    size="sm"
                    onClick={() => copyUrl(asset)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </IconButton>
                  {can('media', 'edit') && (
                    <IconButton
                      label={`Edit ${asset.name}`}
                      size="sm"
                      onClick={() =>
                        setEditForm({
                          id: asset.id,
                          name: asset.name,
                          alt: asset.alt ?? '',
                          folder: asset.folder,
                        })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                  )}
                  {can('media', 'delete') && (
                    <IconButton
                      label={`Delete ${asset.name}`}
                      size="sm"
                      onClick={() => setDeleteTarget(asset)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </IconButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!isLoading && !isError && assets.length > 0 && (
          <Pagination
            page={data?.page ?? 1}
            pageSize={data?.pageSize ?? 24}
            total={data?.total ?? 0}
            totalPages={data?.totalPages ?? 1}
            onPageChange={query.setPage}
            onPageSizeChange={query.setPageSize}
            label="files"
          />
        )}
      </Card>

      {can('media', 'create') && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-ink-400">
          <HardDrive className="h-3.5 w-3.5" />
          Drag images onto the grid to upload them into the {uploadFolder} folder.
        </p>
      )}

      <FormModal
        open={editForm !== null}
        onClose={() => setEditForm(null)}
        onSubmit={submitEdit}
        title="Edit file details"
        description="Alt text is read by screen readers and used by search engines."
        submitLabel="Save changes"
        loading={saving}
      >
        {editForm && (
          <>
            <Field label="File Name" required>
              <Input
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              />
            </Field>
            <Field label="Alt Text">
              <Input
                value={editForm.alt}
                onChange={(event) => setEditForm({ ...editForm, alt: event.target.value })}
                placeholder="Ivory Chanderi saree on a model"
              />
            </Field>
            <Field label="Folder">
              <Select
                value={editForm.folder}
                onChange={(event) =>
                  setEditForm({ ...editForm, folder: event.target.value as MediaFolder })
                }
                options={FOLDER_OPTIONS}
              />
            </Field>
          </>
        )}
      </FormModal>

      <ImagePreviewModal
        open={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
        startIndex={previewIndex ?? 0}
        images={assets.map((asset) => ({
          id: asset.id,
          url: asset.url,
          name: asset.name,
          size: asset.size,
          meta: [
            { label: 'Folder', value: asset.folder },
            { label: 'Dimensions', value: `${asset.width} × ${asset.height}` },
            { label: 'Type', value: asset.mimeType },
            { label: 'Uploaded by', value: asset.uploadedBy },
            { label: 'Uploaded', value: formatDate(asset.createdAt) },
            { label: 'Alt text', value: asset.alt ?? '—' },
          ],
        }))}
      />

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="file"
        name={deleteTarget?.name}
        loading={deleting}
      />

      <ConfirmModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onConfirm={handleBulkDelete}
        loading={bulkDeleting}
        tone="danger"
        confirmLabel="Delete files"
        title={`Delete ${selected.length} files?`}
        description="Products or banners still referencing these images will fall back to a placeholder. This cannot be undone."
      />
    </div>
  );
}
