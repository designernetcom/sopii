import { Globe } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * A Google result, as this page would appear in one.
 *
 * The value of a preview is that it shows the *truncation*: a title that is
 * fine in the form is cut mid-word in a result, and there is no way to see
 * that from a character count alone. Google measures pixels rather than
 * characters, so this is an approximation — close enough to catch the obvious
 * problems, not a promise about the exact cut-off.
 */

const TITLE_CHARS = 60;
const DESCRIPTION_CHARS = 160;

function clip(value: string, max: number) {
  const text = value.trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** `https://sopii.com/sarees` → the crumb trail Google actually renders. */
function displayUrl(url: string) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return [parsed.host, ...segments].join(' › ');
  } catch {
    return url;
  }
}

export interface SerpPreviewProps {
  title: string;
  description: string;
  url: string;
  siteName?: string;
  /** Renders the "this page is hidden from search" state instead. */
  noindex?: boolean;
  className?: string;
}

export function SerpPreview({
  title,
  description,
  url,
  siteName,
  noindex = false,
  className,
}: SerpPreviewProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-ink-200 bg-white p-4 dark:border-ink-700 dark:bg-ink-900',
        className,
      )}
    >
      <p className="mb-3 text-2xs font-medium uppercase tracking-wider text-ink-400">
        Google preview
      </p>

      {noindex ? (
        <p className="rounded-md bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          This page is set to <strong>noindex</strong>, so it will not appear in search results at
          all. The preview below is what it <em>would</em> look like if indexing were switched on.
        </p>
      ) : null}

      <div className={cn('mt-3 max-w-xl font-sans', noindex && 'opacity-55')}>
        {/* Site name and URL sit above the title in current Google results. */}
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-ink-200 dark:border-ink-700">
            <Globe className="h-3 w-3 text-ink-400" aria-hidden />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs text-ink-800 dark:text-ink-200">{siteName || 'SOPII'}</p>
            <p className="truncate text-2xs text-ink-500 dark:text-ink-400">{displayUrl(url)}</p>
          </div>
        </div>

        <p className="mt-2 text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
          {clip(title, TITLE_CHARS) || <span className="text-ink-400">Untitled page</span>}
        </p>

        <p className="mt-1 text-sm leading-relaxed text-ink-600 dark:text-ink-400">
          {clip(description, DESCRIPTION_CHARS) || (
            <span className="italic text-ink-400">
              No meta description — Google will pick a sentence from the page instead.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
