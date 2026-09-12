import { useRef, useState } from 'react';
import { Check, ImageIcon, Search, Upload } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from '@/components/common/Button';
import { AppImage } from '@/components/common/AppImage';
import { EmptyState } from '@/components/common/States';
import { useToast } from '@/components/common/Toast';
import { useDebounce, usePermissions } from '@/hooks';
import { useGetMediaQuery, useUploadMediaMutation } from '@/store/api/marketingApi';
import { errorMessage } from '@/store/api/baseQuery';
import { cn } from '@/utils/cn';
import { formatFileSize } from '@/utils/format';
import { readImageFile } from '@/utils/image';
import type { MediaAsset, MediaFolder } from '@/types';

const FOLDERS: { value: MediaFolder | ''; label: string }[] = [
  { value: '', label: 'All folders' },
  { value: 'products', label: 'Products' },
  { value: 'banners', label: 'Banners' },
  { value: 'categories', label: 'Categories' },
  { value: 'collections', label: 'Collections' },
  { value: 'blog', label: 'Blog' },
  { value: 'other', label: 'Other' },
];

export interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (assets: MediaAsset[]) => void;
  multiple?: boolean;
  folder?: MediaFolder;
  title?: string;
}

/** Shared asset browser used by product images, banners and collection art. */
export function MediaPickerModal({
  open,
  onClose,
  onSelect,
  multiple = true,
  folder,
  title = 'Select from Media Library',
}: MediaPickerModalProps) {
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState<string>(folder ?? '');
  const [picked, setPicked] = useState<MediaAsset[]>([]);
  const [dragging, setDragging] = useState(false);

  const toast = useToast();
  const { can, user } = usePermissions();
  const fileInput = useRef<HTMLInputElement>(null);
  const canUpload = can('media', 'create');

  const debounced = useDebounce(search, 300);
  const { data, isLoading } = useGetMediaQuery(
    { search: debounced || undefined, folder: activeFolder || undefined, pageSize: 48 },
    { skip: !open },
  );
  const [uploadMedia, { isLoading: uploading }] = useUploadMediaMutation();

  /*
   * An empty folder filter means "all folders", which is not somewhere a file
   * can be put — fall back to the folder this picker was opened for, so a
   * banner picker still files banners while browsing everything.
   */
  const destination = (activeFolder || folder || 'other') as MediaFolder;

  const toggle = (asset: MediaAsset) => {
    setPicked((current) => {
      const exists = current.some((item) => item.id === asset.id);
      if (multiple) {
        return exists ? current.filter((item) => item.id !== asset.id) : [...current, asset];
      }
      return exists ? [] : [asset];
    });
  };

  /*
   * Files are read into base64 purely as transport: the API forwards the bytes
   * to Cloudinary and the library row keeps the URL that comes back.
   *
   * What lands is selected immediately, because uploading from inside the
   * picker is a way of filling the field that opened it rather than a detour
   * into filing assets away. The mutation invalidates the media list, so the
   * grid catches up on its own and the new asset sorts to the front.
   */
  const upload = async (files: FileList | File[]) => {
    let images = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) {
      toast.warning('Only image files can be uploaded');
      return;
    }
    if (!multiple && images.length > 1) {
      toast.warning('Only one image can be used here', 'Uploading the first file.');
      images = images.slice(0, 1);
    }

    try {
      const parsed = await Promise.all(images.map(readImageFile));
      const created = await uploadMedia({
        files: parsed.map((file) => ({
          ...file,
          folder: destination,
          alt: file.name?.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          uploadedBy: user?.name ?? 'Admin',
        })),
      }).unwrap();

      const assets = Array.isArray(created) ? created : [created];
      setPicked((current) => (multiple ? [...current, ...assets] : assets.slice(-1)));
      // A stale search term would hide the file that was just uploaded.
      setSearch('');
      toast.success(
        `${assets.length} file${assets.length > 1 ? 's' : ''} uploaded`,
        `Stored on the CDN and added to the ${destination} folder.`,
      );
    } catch (error) {
      toast.error('Could not upload the files', errorMessage(error));
    }
  };

  /** Selections belong to one visit — reopening should not resurrect them. */
  const close = () => {
    setPicked([]);
    onClose();
  };

  const confirm = () => {
    onSelect(picked);
    setPicked([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={multiple ? 'Select one or more images.' : 'Select an image.'}
      size="xl"
      busy={uploading}
      footer={
        <>
          <span className="mr-auto text-xs text-ink-500 dark:text-ink-400">
            {picked.length} selected
          </span>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} disabled={picked.length === 0}>
            Add {picked.length > 0 ? `(${picked.length})` : ''}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search media…"
            className="h-8 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 dark:border-ink-700 dark:bg-ink-900"
          />
        </div>
        <select
          value={activeFolder}
          onChange={(event) => setActiveFolder(event.target.value)}
          className="h-8 cursor-pointer rounded-lg border border-ink-200 bg-white px-2 text-sm focus:border-brand-500 focus:outline-none dark:border-ink-700 dark:bg-ink-900"
        >
          {FOLDERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {canUpload && (
          <Button
            size="sm"
            variant="primary"
            icon={<Upload className="h-3.5 w-3.5" />}
            loading={uploading}
            onClick={() => fileInput.current?.click()}
          >
            Upload
          </Button>
        )}
      </div>

      {canUpload && (
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) upload(event.target.files);
            event.target.value = '';
          }}
        />
      )}

      <div
        onDragOver={(event) => {
          if (!canUpload) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (!canUpload) return;
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length) upload(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-lg transition-colors',
          dragging && 'bg-brand-50/60 ring-2 ring-brand-400 dark:bg-brand-500/5',
        )}
      >
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index} className="skeleton aspect-square w-full rounded-lg" />
            ))}
          </div>
        ) : data?.items.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {data.items.map((asset) => {
              const isPicked = picked.some((item) => item.id === asset.id);
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => toggle(asset)}
                  className={cn(
                    'group relative overflow-hidden rounded-lg ring-2 transition-all',
                    isPicked ? 'ring-brand-500' : 'ring-transparent hover:ring-ink-300',
                  )}
                >
                  <AppImage
                    src={asset.url}
                    alt={asset.alt ?? asset.name}
                    seed={asset.id}
                    wrapperClassName="aspect-square w-full"
                  />
                  {isPicked && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/80 to-transparent p-1.5 text-left">
                    <span className="block truncate text-2xs font-medium text-white">
                      {asset.name}
                    </span>
                    <span className="block text-[10px] text-white/70">
                      {formatFileSize(asset.size)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={ImageIcon}
            title="No media found"
            description={
              canUpload
                ? 'Upload an image, or try a different search term or folder.'
                : 'Try a different search term or folder.'
            }
            compact
            action={
              canUpload && (
                <Button
                  variant="primary"
                  icon={<Upload className="h-4 w-4" />}
                  loading={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  Upload image
                </Button>
              )
            }
          />
        )}
      </div>

      {canUpload && (
        <p className="mt-3 text-center text-xs text-ink-400">
          Drag images here to upload them into the {destination} folder.
        </p>
      )}
    </Modal>
  );
}
