import { useRef, useState } from 'react';
import { GripVertical, ImagePlus, Link2, Loader2, Star, Trash2, Upload, ZoomIn } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button, IconButton } from '@/components/common/Button';
import { EmptyState } from '@/components/common/States';
import { AppImage } from '@/components/common/AppImage';
import { MediaPickerModal } from '@/components/modals/MediaPickerModal';
import { ImagePreviewModal } from '@/components/modals/ImagePreviewModal';
import { useDragReorder } from '@/hooks';
import { useToast } from '@/components/common/Toast';
import { useGetUploadStatusQuery, useUploadImagesMutation } from '@/store/api/marketingApi';
import { readImageFile } from '@/utils/image';
import { errorMessage } from '@/store/api/baseQuery';
import type { ProductImage } from '@/types';

export interface ImageManagerProps {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  /**
   * The product these images belong to, so uploads are filed under
   * `sopii/products/{productId}`. A product being created has no id yet and
   * its uploads land in `sopii/products/unassigned` — the asset is real and
   * the URL works either way; only the filing is provisional.
   */
  productId?: string;
}

/**
 * Product gallery editor: pick from the media library, drop local files, set the
 * main image, reorder by drag (or arrows on touch) and remove.
 *
 * Dropped files are read into base64 only to be POSTed to `/api/uploads/image`.
 * The server forwards the bytes to Cloudinary and answers with a `secure_url`
 * and a `public_id`, and that pair — two short strings — is what goes onto the
 * product. Base64 never reaches MongoDB.
 */
export function ImageManager({ images, onChange, productId }: ImageManagerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [uploadImages, { isLoading: uploading }] = useUploadImagesMutation();
  /* Answered from the server's own configuration, so a store with no
     Cloudinary credentials gets a disabled button with a reason rather than a
     failed upload after the wait. */
  const { data: uploadStatus } = useGetUploadStatusQuery();
  const uploadsReady = uploadStatus?.configured !== false;

  const { handlers, move, overIndex } = useDragReorder(images, (next) =>
    onChange(next.map((image, index) => ({ ...image, isMain: index === 0 }))),
  );

  const append = (incoming: ProductImage[]) => {
    const next = [...images, ...incoming];
    onChange(next.map((image, index) => ({ ...image, isMain: index === 0 })));
  };

  /*
   * Dropped files are uploaded before they join the gallery, and it is the CDN
   * URL that goes onto the product.
   *
   * This has to be a real upload, not a local preview. A product's images are
   * read back by the shop front from a different origin, so an in-memory
   * object URL would render here and nowhere else — the gallery would look
   * right in the panel while the storefront fell back to a placeholder.
   *
   * A failed upload adds nothing. It used to fall back to putting the data URI
   * straight on the product, which is precisely how the catalogue ended up
   * carrying ~19.6 MB of base64 into every storefront request; the honest
   * failure is better than the silent one.
   */
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!accepted.length) {
      toast.error('Unsupported file', 'Only image files can be added to the gallery.');
      return;
    }

    let parsed;
    try {
      parsed = await Promise.all(accepted.map(readImageFile));
    } catch (error) {
      toast.error('Could not read the files', errorMessage(error));
      return;
    }

    const alt = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

    try {
      const result = await uploadImages({
        scope: 'product',
        ownerId: productId,
        images: parsed.map((file) => ({ data: file.url, name: file.name, alt: alt(file.name) })),
      }).unwrap();

      append(
        result.images.map((image, index) => ({
          id: image.publicId || `img-${Date.now()}-${index}`,
          url: image.url,
          publicId: image.publicId,
          alt: image.alt ?? alt(image.name ?? 'Product image'),
        })),
      );

      if (result.failed.length) {
        toast.warning(
          `${result.images.length} of ${parsed.length} image(s) added`,
          result.failed.map((failure) => failure.message).join(' · '),
        );
      } else {
        toast.success(
          `${result.images.length} image(s) added`,
          'Uploaded to the CDN. Remember to save the product.',
        );
      }
    } catch (error) {
      toast.error('Could not upload the images', errorMessage(error));
    }
  };

  const remove = (id: string) => {
    const next = images.filter((image) => image.id !== id);
    onChange(next.map((image, index) => ({ ...image, isMain: index === 0 })));
  };

  const makeMain = (id: string) => {
    const target = images.find((image) => image.id === id);
    if (!target) return;
    const next = [target, ...images.filter((image) => image.id !== id)];
    onChange(next.map((image, index) => ({ ...image, isMain: index === 0 })));
    toast.success('Main image updated');
  };

  const addByUrl = () => {
    const url = window.prompt('Paste an image URL');
    if (!url?.trim()) return;
    append([{ id: `url-${Date.now()}`, url: url.trim(), alt: 'Product image' }]);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDropActive(false);
          void addFiles(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-xl border-2 border-dashed p-6 text-center transition-colors',
          dropActive
            ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-500/10'
            : 'border-ink-300 dark:border-ink-700',
        )}
      >
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
          <Upload className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-ink-800 dark:text-ink-200">
          Drop images here, or add them from the library
        </p>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
          PNG or JPG up to 10 MB. The first image is used as the main product image.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<ImagePlus className="h-3.5 w-3.5" />}
            onClick={() => setPickerOpen(true)}
          >
            Media Library
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={uploading || !uploadsReady}
            title={
              uploadsReady
                ? undefined
                : 'Image storage is not configured on the server — see CLOUDINARY_* in server/.env'
            }
            icon={
              uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )
            }
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Upload files'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Link2 className="h-3.5 w-3.5" />}
            onClick={addByUrl}
          >
            Add by URL
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {images.length === 0 ? (
        <EmptyState
          compact
          icon={ImagePlus}
          title="No images yet"
          description="Products with at least three images convert noticeably better."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <li
              key={image.id}
              {...handlers(index)}
              className={cn(
                'group relative overflow-hidden rounded-xl border bg-white transition-all dark:bg-ink-900',
                overIndex === index
                  ? 'border-brand-500 ring-2 ring-brand-500/30'
                  : 'border-ink-200 dark:border-ink-700',
              )}
            >
              <AppImage
                src={image.url}
                alt={image.alt ?? 'Product image'}
                seed={image.id}
                preset="tile"
                wrapperClassName="aspect-square w-full"
                rounded="md"
              />

              {index === 0 && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-2xs font-semibold text-white">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  Main
                </span>
              )}

              <span className="absolute right-1.5 top-1.5 cursor-grab rounded-md bg-white/85 p-1 text-ink-500 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 dark:bg-ink-900/85">
                <GripVertical className="h-3.5 w-3.5" />
              </span>

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-ink-950/85 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <IconButton
                  label="Preview image"
                  size="sm"
                  variant="secondary"
                  onClick={() => setPreviewIndex(index)}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </IconButton>
                {index !== 0 && (
                  <IconButton
                    label="Set as main image"
                    size="sm"
                    variant="secondary"
                    onClick={() => makeMain(image.id)}
                  >
                    <Star className="h-3.5 w-3.5" />
                  </IconButton>
                )}
                <IconButton
                  label="Remove image"
                  size="sm"
                  variant="danger"
                  onClick={() => remove(image.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>

              {/* Touch-friendly reordering — HTML5 drag does not fire on mobile. */}
              <div className="flex items-center justify-between gap-1 border-t border-ink-200 px-2 py-1.5 dark:border-ink-800 sm:hidden">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="rounded px-2 py-0.5 text-2xs text-ink-600 disabled:opacity-30 dark:text-ink-400"
                >
                  ← Move
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === images.length - 1}
                  className="rounded px-2 py-0.5 text-2xs text-ink-600 disabled:opacity-30 dark:text-ink-400"
                >
                  Move →
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        folder="products"
        onSelect={(assets) =>
          /* Picking from the library copies the CDN reference rather than
             re-uploading the bytes. The shared handle is why deleting a
             library row only destroys its asset once nothing points at it. */
          append(
            assets.map((asset) => ({
              id: asset.id,
              url: asset.url,
              publicId: asset.publicId,
              alt: asset.alt ?? asset.name,
            })),
          )
        }
      />

      <ImagePreviewModal
        open={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
        startIndex={previewIndex ?? 0}
        images={images.map((image) => ({
          id: image.id,
          url: image.url,
          name: image.alt ?? 'Product image',
        }))}
      />
    </div>
  );
}
