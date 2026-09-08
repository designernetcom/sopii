import { useState } from 'react';
import { Check, ImageIcon, Search } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from '@/components/common/Button';
import { AppImage } from '@/components/common/AppImage';
import { EmptyState } from '@/components/common/States';
import { useDebounce } from '@/hooks';
import { useGetMediaQuery } from '@/store/api/marketingApi';
import { cn } from '@/utils/cn';
import { formatFileSize } from '@/utils/format';
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

  const debounced = useDebounce(search, 300);
  const { data, isLoading } = useGetMediaQuery(
    { search: debounced || undefined, folder: activeFolder || undefined, pageSize: 48 },
    { skip: !open },
  );

  const toggle = (asset: MediaAsset) => {
    setPicked((current) => {
      const exists = current.some((item) => item.id === asset.id);
      if (multiple) {
        return exists ? current.filter((item) => item.id !== asset.id) : [...current, asset];
      }
      return exists ? [] : [asset];
    });
  };

  const confirm = () => {
    onSelect(picked);
    setPicked([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={multiple ? 'Select one or more images.' : 'Select an image.'}
      size="xl"
      footer={
        <>
          <span className="mr-auto text-xs text-ink-500 dark:text-ink-400">
            {picked.length} selected
          </span>
          <Button variant="secondary" onClick={onClose}>
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
      </div>

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
          description="Try a different search term or folder."
          compact
        />
      )}
    </Modal>
  );
}
