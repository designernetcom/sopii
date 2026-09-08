import { useMemo, useState } from 'react';
import { cn } from '@/utils/cn';
import {
  cdnUrl,
  isPlaceholderPath,
  placeholderBanner,
  resolveImageSrc,
  type CdnPreset,
} from '@/utils/image';
import { initials } from '@/utils/format';

export interface AppImageProps {
  src?: string | null;
  alt: string;
  /** Stable seed for the generated placeholder — usually the record id. */
  seed?: string;
  className?: string;
  wrapperClassName?: string;
  rounded?: 'md' | 'lg' | 'full';
  variant?: 'tile' | 'banner';
  /**
   * Which CDN size to request. Cloudinary-hosted images are rewritten to carry
   * it; everything else is untouched. Defaults to `thumb`, which is what most
   * of the panel renders — a table row, a picker tile — so a call site only
   * names one when it is showing the photograph larger than that.
   */
  preset?: CdnPreset;
}

/**
 * Image with a built-in skeleton and a deterministic generated placeholder for
 * assets the mock dataset references but does not ship.
 */
export function AppImage({
  src,
  alt,
  seed,
  className,
  wrapperClassName,
  rounded = 'md',
  variant = 'tile',
  preset,
}: AppImageProps) {
  const resolved = useMemo(() => {
    if (variant === 'banner' && isPlaceholderPath(src)) {
      return placeholderBanner(src || seed || alt, alt);
    }
    const size = preset ?? (variant === 'banner' ? 'banner' : 'thumb');
    return resolveImageSrc(cdnUrl(src, size), seed ?? alt, alt);
  }, [src, seed, alt, variant, preset]);

  const isGenerated = resolved.startsWith('data:');
  const [loaded, setLoaded] = useState(isGenerated);
  const [failed, setFailed] = useState(false);

  const radius =
    rounded === 'full' ? 'rounded-full' : rounded === 'lg' ? 'rounded-xl' : 'rounded-lg';

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-ink-100 dark:bg-ink-800',
        radius,
        wrapperClassName,
      )}
    >
      {!loaded && !failed && <div className={cn('absolute inset-0 skeleton', radius)} />}
      {failed ? (
        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-ink-400">
          {initials(alt)}
        </div>
      ) : (
        <img
          src={resolved}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            setLoaded(true);
          }}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
            className,
          )}
        />
      )}
    </div>
  );
}

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const AVATAR_SIZES = {
  xs: 'h-6 w-6 text-2xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
};

const AVATAR_TONES = [
  'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
];

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const tone = useMemo(() => {
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return AVATAR_TONES[hash % AVATAR_TONES.length];
  }, [name]);

  if (src) {
    return (
      <AppImage
        src={src}
        alt={name}
        rounded="full"
        wrapperClassName={cn(AVATAR_SIZES[size], 'shrink-0', className)}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        AVATAR_SIZES[size],
        tone,
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
