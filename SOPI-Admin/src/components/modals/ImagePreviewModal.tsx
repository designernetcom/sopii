import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download } from 'lucide-react';
import { Modal } from './Modal';
import { Button, IconButton } from '@/components/common/Button';
import { AppImage } from '@/components/common/AppImage';
import { useToast } from '@/components/common/Toast';
import { formatFileSize } from '@/utils/format';

export interface PreviewImage {
  id: string;
  url: string;
  name: string;
  meta?: { label: string; value: string }[];
  size?: number;
}

export interface ImagePreviewModalProps {
  open: boolean;
  onClose: () => void;
  images: PreviewImage[];
  startIndex?: number;
}

export function ImagePreviewModal({
  open,
  onClose,
  images,
  startIndex = 0,
}: ImagePreviewModalProps) {
  const [index, setIndex] = useState(startIndex);
  const toast = useToast();

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  useEffect(() => {
    if (!open || images.length < 2) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') setIndex((i) => (i + 1) % images.length);
      if (event.key === 'ArrowLeft') setIndex((i) => (i - 1 + images.length) % images.length);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, images.length]);

  const current = images[index];
  if (!current) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={current.name}
      description={images.length > 1 ? `Image ${index + 1} of ${images.length}` : undefined}
      footer={
        <>
          <Button
            variant="secondary"
            icon={<Copy className="h-4 w-4" />}
            onClick={() => {
              navigator.clipboard
                ?.writeText(current.url)
                .then(() => toast.success('Image URL copied to clipboard'))
                .catch(() => toast.error('Could not copy the URL'));
            }}
          >
            Copy URL
          </Button>
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={() => toast.info('Download starts once media is served from the CDN')}
          >
            Download
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="relative">
        <AppImage
          src={current.url}
          alt={current.name}
          seed={current.id}
          rounded="lg"
          /* The one place in the panel someone is inspecting the photograph
             rather than glancing at it, so this asks for the large derivative. */
          preset="full"
          wrapperClassName="aspect-[4/3] w-full bg-ink-100 dark:bg-ink-800"
          className="object-contain"
        />

        {images.length > 1 && (
          <>
            <IconButton
              label="Previous image"
              variant="secondary"
              className="absolute left-2 top-1/2 -translate-y-1/2 shadow-sm"
              onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
            >
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <IconButton
              label="Next image"
              variant="secondary"
              className="absolute right-2 top-1/2 -translate-y-1/2 shadow-sm"
              onClick={() => setIndex((i) => (i + 1) % images.length)}
            >
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </>
        )}
      </div>

      {(current.meta?.length || current.size) && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-ink-200 pt-4 text-xs dark:border-ink-800 sm:grid-cols-3">
          {current.size !== undefined && (
            <div>
              <dt className="text-ink-500 dark:text-ink-400">Size</dt>
              <dd className="mt-0.5 font-medium text-ink-900 dark:text-ink-100">
                {formatFileSize(current.size)}
              </dd>
            </div>
          )}
          {current.meta?.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-ink-500 dark:text-ink-400">{item.label}</dt>
              <dd className="mt-0.5 truncate font-medium text-ink-900 dark:text-ink-100">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {images.length > 1 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition-all ${
                i === index ? 'ring-brand-500' : 'ring-transparent hover:ring-ink-300'
              }`}
            >
              <AppImage
                src={image.url}
                alt={image.name}
                seed={image.id}
                wrapperClassName="h-full w-full"
              />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
