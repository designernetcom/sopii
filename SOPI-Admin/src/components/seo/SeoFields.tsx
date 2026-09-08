import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Image as ImageIcon } from 'lucide-react';
import { Field, Input, Switch, Textarea } from '@/components/common/Field';
import { Button } from '@/components/common/Button';
import { MediaPickerModal } from '@/components/modals/MediaPickerModal';
import { cn } from '@/utils/cn';
import type { SeoMeta } from '@/types';
import { SerpPreview } from './SerpPreview';

/**
 * The SEO field set.
 *
 * One component, used in three places — SEO Management, and the SEO tab on a
 * product, category or collection. That is deliberate: the fields, the
 * counters and the guidance must be identical everywhere metadata is edited,
 * or the advice starts contradicting itself between screens.
 *
 * Nothing here is required. A blank field means "inherit", and the preview
 * shows what the page will actually fall back to, so an admin can leave most
 * of this alone and still get a sensible result.
 */

/* Google's own guidance, in characters. Titles are measured in pixels, so
   treat these as a useful approximation rather than a rule. */
export const LIMITS = {
  title: { min: 30, good: 50, max: 60, hard: 70 },
  description: { min: 70, good: 150, max: 160, hard: 180 },
};

type Tone = 'empty' | 'short' | 'good' | 'long';

function tone(length: number, limit: { min: number; good: number; max: number }): Tone {
  if (length === 0) return 'empty';
  if (length < limit.min) return 'short';
  if (length > limit.max) return 'long';
  return 'good';
}

const TONE_CLASS: Record<Tone, string> = {
  empty: 'text-ink-400',
  short: 'text-amber-600 dark:text-amber-400',
  good: 'text-emerald-600 dark:text-emerald-400',
  long: 'text-rose-600 dark:text-rose-400',
};

/**
 * The counter shown beside a field's label. It states the recommended range
 * rather than just a number, because "62" only means something next to it.
 */
function Counter({
  value,
  limit,
  recommendation,
}: {
  value: string;
  limit: { min: number; good: number; max: number };
  recommendation: string;
}) {
  const length = value.length;
  const state = tone(length, limit);

  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', TONE_CLASS[state])}>
      {state === 'good' ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : state === 'long' ? (
        <AlertTriangle className="h-3 w-3" aria-hidden />
      ) : null}
      {length} / {recommendation}
    </span>
  );
}

/** A meter under the field, so the range is visible without reading the number. */
function Meter({ value, limit }: { value: string; limit: { min: number; good: number; max: number } }) {
  const length = value.length;
  const state = tone(length, limit);
  const percent = Math.min(100, (length / limit.max) * 100);

  return (
    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
      <div
        className={cn(
          'h-full rounded-full transition-all duration-300',
          state === 'good' && 'bg-emerald-500',
          state === 'short' && 'bg-amber-400',
          state === 'long' && 'bg-rose-500',
          state === 'empty' && 'bg-transparent',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/* -------------------------------- disclosure -------------------------------- */

function Section({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-ink-200 dark:border-ink-700">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-medium text-ink-900 dark:text-ink-100">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? <div className="space-y-4 border-t border-ink-200 p-4 dark:border-ink-700">{children}</div> : null}
    </div>
  );
}

/* ---------------------------------- fields ---------------------------------- */

export interface SeoFieldsProps {
  value: SeoMeta;
  onChange: (patch: Partial<SeoMeta>) => void;
  /** Absolute URL this page renders at — drives the preview and the canonical hint. */
  previewUrl: string;
  siteName?: string;
  /** What the page falls back to when title/description are blank. */
  fallbackTitle?: string;
  fallbackDescription?: string;
  /** Hidden for catalogue records, whose slug is edited on the main tab. */
  showSlug?: boolean;
  slugHint?: string;
  /** Invalid-JSON message for the structured data box. */
  jsonError?: string;
}

export function SeoFields({
  value,
  onChange,
  previewUrl,
  siteName,
  fallbackTitle = '',
  fallbackDescription = '',
  showSlug = true,
  slugHint,
  jsonError,
}: SeoFieldsProps) {
  const [pickerFor, setPickerFor] = useState<'ogImage' | 'twitterImage' | null>(null);

  const title = value.title ?? '';
  const description = value.metaDescription ?? '';

  const keywordsText = useMemo(
    () => (Array.isArray(value.keywords) ? value.keywords.join(', ') : ''),
    [value.keywords],
  );

  /* The preview shows what will actually render, which means falling back the
     same way the storefront does. Showing the empty field instead would make
     a blank title look like a broken page. */
  const previewTitle = title || fallbackTitle;
  const previewDescription = description || fallbackDescription;

  const set = (patch: Partial<SeoMeta>) => onChange(patch);

  return (
    <div className="space-y-5">
      <SerpPreview
        title={previewTitle}
        description={previewDescription}
        url={value.canonicalUrl || previewUrl}
        siteName={siteName}
        noindex={value.robotsIndex === false}
      />

      {/* ------------------------------- essentials ------------------------- */}
      <div className="space-y-4">
        <Field
          label="SEO Title"
          htmlFor="seo-title"
          hint={
            title
              ? undefined
              : `Leave blank to use “${fallbackTitle || 'the site default'}”.`
          }
          addon={
            <Counter value={title} limit={LIMITS.title} recommendation="50–60 recommended" />
          }
        >
          <Input
            id="seo-title"
            value={title}
            onChange={(event) => set({ title: event.target.value })}
            placeholder={fallbackTitle || 'Page title as it appears in search results'}
          />
          <Meter value={title} limit={LIMITS.title} />
        </Field>

        <Field
          label="Meta Description"
          htmlFor="seo-description"
          hint={
            description
              ? undefined
              : 'Leave blank and Google will choose a sentence from the page itself.'
          }
          addon={
            <Counter
              value={description}
              limit={LIMITS.description}
              recommendation="150–160 recommended"
            />
          }
        >
          <Textarea
            id="seo-description"
            rows={3}
            value={description}
            onChange={(event) => set({ metaDescription: event.target.value })}
            placeholder={fallbackDescription || 'One or two sentences describing this page.'}
          />
          <Meter value={description} limit={LIMITS.description} />
        </Field>

        <Field
          label="SEO Keywords"
          htmlFor="seo-keywords"
          hint="Comma-separated. Google ignores this tag — it is kept for other search engines and internal reporting, so a short, honest list is enough."
        >
          <Input
            id="seo-keywords"
            value={keywordsText}
            onChange={(event) =>
              set({
                keywords: event.target.value
                  .split(',')
                  .map((word) => word.trim())
                  .filter(Boolean),
              })
            }
            placeholder="handloom saree, cotton saree"
          />
        </Field>

        {showSlug ? (
          <Field
            label="URL Slug"
            htmlFor="seo-slug"
            hint={slugHint ?? 'The last part of the address. Short, lowercase, hyphenated.'}
          >
            <Input
              id="seo-slug"
              value={value.slug ?? ''}
              onChange={(event) => set({ slug: event.target.value })}
              placeholder="cotton-sarees"
            />
          </Field>
        ) : null}
      </div>

      {/* --------------------------------- social --------------------------- */}
      <Section
        title="Social sharing"
        description="How this page looks when someone posts the link. Blank fields fall back to the SEO title, description and site image."
      >
        <Field label="OG Title" htmlFor="og-title">
          <Input
            id="og-title"
            value={value.ogTitle ?? ''}
            onChange={(event) => set({ ogTitle: event.target.value })}
            placeholder={previewTitle}
          />
        </Field>

        <Field label="OG Description" htmlFor="og-description">
          <Textarea
            id="og-description"
            rows={2}
            value={value.ogDescription ?? ''}
            onChange={(event) => set({ ogDescription: event.target.value })}
            placeholder={previewDescription}
          />
        </Field>

        <Field
          label="OG Image"
          htmlFor="og-image"
          hint="1200 × 630 works everywhere. Anything much smaller is cropped or ignored."
        >
          <div className="flex gap-2">
            <Input
              id="og-image"
              value={value.ogImage ?? ''}
              onChange={(event) => set({ ogImage: event.target.value })}
              placeholder="/media/banners/share-card.jpg"
            />
            <Button type="button" variant="secondary" onClick={() => setPickerFor('ogImage')}>
              <ImageIcon className="h-4 w-4" aria-hidden />
              Browse
            </Button>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Twitter Title" htmlFor="tw-title">
            <Input
              id="tw-title"
              value={value.twitterTitle ?? ''}
              onChange={(event) => set({ twitterTitle: event.target.value })}
              placeholder={value.ogTitle || previewTitle}
            />
          </Field>
          <Field label="Twitter Description" htmlFor="tw-description">
            <Input
              id="tw-description"
              value={value.twitterDescription ?? ''}
              onChange={(event) => set({ twitterDescription: event.target.value })}
              placeholder={value.ogDescription || previewDescription}
            />
          </Field>
        </div>

        <Field label="Twitter Image" htmlFor="tw-image">
          <div className="flex gap-2">
            <Input
              id="tw-image"
              value={value.twitterImage ?? ''}
              onChange={(event) => set({ twitterImage: event.target.value })}
              placeholder={value.ogImage || 'Falls back to the OG image'}
            />
            <Button type="button" variant="secondary" onClick={() => setPickerFor('twitterImage')}>
              <ImageIcon className="h-4 w-4" aria-hidden />
              Browse
            </Button>
          </div>
        </Field>
      </Section>

      {/* -------------------------------- advanced -------------------------- */}
      <Section
        title="Indexing & advanced"
        description="Canonical URL, crawler directives and custom structured data."
      >
        <Field
          label="Canonical URL"
          htmlFor="seo-canonical"
          hint={`Leave blank to use ${previewUrl}. Only set this when this page duplicates another one, and point it at the original.`}
        >
          <Input
            id="seo-canonical"
            value={value.canonicalUrl ?? ''}
            onChange={(event) => set({ canonicalUrl: event.target.value })}
            placeholder={previewUrl}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Switch
            label="Allow indexing"
            description="Off adds noindex — the page stays reachable but is kept out of search results."
            checked={value.robotsIndex !== false}
            onChange={(checked) => set({ robotsIndex: checked })}
          />
          <Switch
            label="Follow links"
            description="Off adds nofollow, so crawlers do not follow links from this page."
            checked={value.robotsFollow !== false}
            onChange={(checked) => set({ robotsFollow: checked })}
          />
        </div>

        <Field
          label="Schema / JSON-LD"
          htmlFor="seo-schema"
          error={jsonError}
          hint="Added alongside the structured data the site already generates — it does not replace it. Must be valid JSON."
        >
          <Textarea
            id="seo-schema"
            rows={6}
            spellCheck={false}
            value={value.structuredData ?? ''}
            onChange={(event) => set({ structuredData: event.target.value })}
            placeholder='{ "@context": "https://schema.org", "@type": "FAQPage" }'
            className="font-mono text-xs"
          />
        </Field>
      </Section>

      {pickerFor ? (
        <MediaPickerModal
          open
          multiple={false}
          title="Choose a share image"
          onClose={() => setPickerFor(null)}
          onSelect={(assets) => {
            const [asset] = assets;
            if (asset) set({ [pickerFor]: asset.url } as Partial<SeoMeta>);
            setPickerFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Shared by every SEO form: the panel refuses to save invalid JSON-LD. */
export function validateJsonLd(raw: string | undefined): string | undefined {
  const text = (raw ?? '').trim();
  if (!text) return undefined;
  try {
    JSON.parse(text);
    return undefined;
  } catch (error) {
    return `Not valid JSON — ${(error as Error).message}`;
  }
}
