import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImageIcon,
  ListOrdered,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDragReorder, usePermissions } from '@/hooks';
import {
  useGetFeaturedCollectionQuery,
  useGetHomeSectionsQuery,
  useGetUploadStatusQuery,
  useUpdateFeaturedCollectionMutation,
  useUploadImagesMutation,
} from '@/store/api/marketingApi';
import { errorMessage } from '@/store/api/baseQuery';
import { Card, CardBody, CardHeader } from '@/components/common/Card';
import { Button, IconButton } from '@/components/common/Button';
import { AppImage } from '@/components/common/AppImage';
import { Field, Input, Switch, Textarea } from '@/components/common/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/States';
import { MediaPickerModal } from '@/components/modals/MediaPickerModal';
import { useToast } from '@/components/common/Toast';
import { readImageFile } from '@/utils/image';
import type { FeaturedCollectionPillar, FeaturedCollectionSection } from '@/types';

/* Mirrors `server/src/lib/featuredCollection.ts`. The server is the authority;
   these only let the form say so before a round trip. */
const LIMITS = {
  eyebrow: 60,
  heading: 160,
  headingLines: 3,
  description: 1000,
  imageAlt: 200,
  pillars: 8,
  pillarTitle: 80,
  pillarText: 240,
  ctaText: 40,
  ctaLink: 500,
} as const;

/** Uploads are filed under `sopii/banners/featured-collection` — the folder the server owns. */
const UPLOAD_OWNER = 'featured-collection';

type Section = FeaturedCollectionSection;
type Errors = Record<string, string>;

const isSafeLink = (value: string) =>
  /^\/(?![/\\])/.test(value) || /^https?:\/\/[^\s/]+/i.test(value);

const newPillarId = () =>
  `pil_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const headingLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

/** Everything the admin can change — `updatedAt` belongs to the server. */
function editable(section: Section) {
  const { updatedAt: _updatedAt, ...rest } = section;
  return rest;
}

const sameContent = (a: Section, b: Section) =>
  JSON.stringify(editable(a)) === JSON.stringify(editable(b));

/** The same rules the API applies, so most mistakes are caught before saving. */
function validate(section: Section): Errors {
  const errors: Errors = {};
  const heading = headingLines(section.heading);

  if (section.eyebrow.trim().length > LIMITS.eyebrow) {
    errors.eyebrow = `Keep it to ${LIMITS.eyebrow} characters`;
  }
  if (section.enabled && !heading.length) errors.heading = 'Add a heading, or hide the section';
  else if (heading.length > LIMITS.headingLines) {
    errors.heading = `At most ${LIMITS.headingLines} lines`;
  } else if (heading.join('\n').length > LIMITS.heading) {
    errors.heading = `Keep it to ${LIMITS.heading} characters`;
  }
  if (section.enabled && section.image && !section.imageAlt.trim()) {
    errors.imageAlt = 'Describe the image for shoppers using a screen reader';
  }

  section.pillars.forEach((pillar) => {
    if (!pillar.title.trim()) errors[`pillar:${pillar.id}`] = 'A pillar needs a title';
  });

  if (section.ctaEnabled && !section.ctaText.trim()) errors.ctaText = 'Add the button text';
  const link = section.ctaLink.trim();
  if (section.ctaEnabled && !link) errors.ctaLink = 'Add the link the button opens';
  else if (link && !isSafeLink(link)) {
    errors.ctaLink = 'Start with / for a page on the shop, or https:// for another site';
  }

  return errors;
}

/** What is sent: the whole section, tidied the way the server stores it. */
function payloadOf(section: Section): Partial<Section> {
  return {
    ...editable(section),
    eyebrow: section.eyebrow.trim(),
    heading: headingLines(section.heading).join('\n'),
    description: section.description.trim(),
    imageAlt: section.imageAlt.trim(),
    pillars: section.pillars.map((pillar) => ({
      ...pillar,
      title: pillar.title.trim(),
      text: pillar.text.trim(),
    })),
    ctaText: section.ctaText.trim(),
    ctaLink: section.ctaLink.trim(),
  };
}

/**
 * The home page's split image/copy section ("SOPII Signature").
 *
 * One form for one document: every change is a draft until Save, and Discard
 * puts back what is live. Pillar edits — adding, removing, reordering,
 * switching one off — are part of the same draft, so nothing half-arranged
 * ever reaches the shop.
 */
export function FeaturedCollectionTab() {
  const toast = useToast();
  const { can } = usePermissions();
  const readOnly = !can('homepage', 'edit');

  const { data, isLoading, isError, refetch } = useGetFeaturedCollectionQuery();
  const { data: sections } = useGetHomeSectionsQuery();
  const [save, { isLoading: saving }] = useUpdateFeaturedCollectionMutation();

  const [uploadImages] = useUploadImagesMutation();
  const { data: uploadStatus } = useGetUploadStatusQuery();
  const uploadsReady = uploadStatus?.configured !== false;

  const [baseline, setBaseline] = useState<Section | null>(null);
  const [draft, setDraft] = useState<Section | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [picker, setPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragArmed, setDragArmed] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /* `Field` only ties its label to a control given matching ids. */
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  const dirty = Boolean(draft && baseline && !sameContent(draft, baseline));

  /* Take the server's copy when it arrives — but never over unsaved edits, or
     a background refetch would wipe what the admin is typing. */
  useEffect(() => {
    if (!data) return;
    setBaseline(data);
    setDraft((current) =>
      !current || !baseline || sameContent(current, baseline) ? structuredClone(data) : current,
    );
    // `baseline` is read as it was before this update, deliberately.
  }, [data]);

  const pillars = draft?.pillars ?? [];

  const update = (patch: Partial<Section>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  const setPillars = (next: FeaturedCollectionPillar[]) => update({ pillars: next });

  const updatePillar = (id: string, patch: Partial<FeaturedCollectionPillar>) =>
    setPillars(pillars.map((pillar) => (pillar.id === id ? { ...pillar, ...patch } : pillar)));

  const { handlers, move, overIndex } = useDragReorder(pillars, setPillars);

  const addPillar = () => {
    if (pillars.length >= LIMITS.pillars) return;
    setPillars([...pillars, { id: newPillarId(), title: '', text: '', enabled: true }]);
  };

  const removePillar = (id: string) => setPillars(pillars.filter((pillar) => pillar.id !== id));

  /** Posts the file to `/api/uploads/image`; the section stores only the URL and handle. */
  const upload = async (file: File | undefined) => {
    if (!draft || !file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Unsupported file', 'Use a PNG, JPG or WebP image.');
      return;
    }

    setUploading(true);
    try {
      const parsed = await readImageFile(file);
      const result = await uploadImages({
        scope: 'banner',
        ownerId: UPLOAD_OWNER,
        images: [{ data: parsed.url, name: parsed.name, alt: draft.imageAlt || draft.eyebrow }],
      }).unwrap();

      const uploaded = result.images[0];
      if (!uploaded) throw new Error(result.failed[0]?.message ?? 'Upload failed');

      update({ image: uploaded.url, imagePublicId: uploaded.publicId });
      toast.success('Image uploaded', 'Remember to save the section.');
    } catch (error) {
      toast.error('Could not upload the image', errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const discard = () => {
    if (!baseline) return;
    setDraft(structuredClone(baseline));
    setErrors({});
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || readOnly) return;

    const next = validate(draft);
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error('Check the highlighted fields', Object.values(next)[0]);
      return;
    }

    try {
      const saved = await save(payloadOf(draft)).unwrap();
      setBaseline(saved);
      setDraft(structuredClone(saved));
      toast.success('Featured collection saved', 'The storefront picks it up on its next refresh.');
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

  if (isLoading || !draft) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index}>
              <div className="space-y-3 p-5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </Card>
          ))}
        </div>
        <Card>
          <div className="space-y-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="aspect-[4/5] w-full" />
          </div>
        </Card>
      </div>
    );
  }

  /* Where the section sits is the Page Sections tab's job. Say so when that
     block is switched off, or "saved and enabled" would still show nothing. */
  const placement = sections?.find((section) => section.key === 'collections');
  const placementOff = placement ? !placement.enabled : false;
  const headingCount = headingLines(draft.heading).length;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-xs text-ink-500 dark:text-ink-400">
        The split image and copy block on the storefront home page. Its position is set by{' '}
        <span className="font-medium text-ink-700 dark:text-ink-300">
          {placement?.title ?? 'Curated Collections'}
        </span>{' '}
        in Page Sections.
      </p>

      {placementOff && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {placement?.title ?? 'Curated Collections'} is switched off in Page Sections, so this
            block is not on the home page right now, whatever is saved here.
          </span>
        </div>
      )}

      <fieldset disabled={readOnly || saving} className="grid min-w-0 gap-4 lg:grid-cols-3">
        {/* ------------------------------ main column ------------------------------ */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Content" description="The copy beside the image." />
            <CardBody className="space-y-4">
              <Field
                label="Eyebrow"
                htmlFor={fieldId('eyebrow')}
                error={errors.eyebrow}
                hint="The small label above the heading."
                addon={`${draft.eyebrow.length}/${LIMITS.eyebrow}`}
              >
                <Input
                  id={fieldId('eyebrow')}
                  value={draft.eyebrow}
                  maxLength={LIMITS.eyebrow}
                  invalid={Boolean(errors.eyebrow)}
                  onChange={(event) => update({ eyebrow: event.target.value })}
                  placeholder="SOPII Signature"
                />
              </Field>

              <Field
                label="Heading"
                htmlFor={fieldId('heading')}
                required={draft.enabled}
                error={errors.heading}
                hint={`Each line shows as its own line on the storefront (up to ${LIMITS.headingLines}).`}
                addon={`${headingCount} ${headingCount === 1 ? 'line' : 'lines'}`}
              >
                <Textarea
                  id={fieldId('heading')}
                  rows={2}
                  maxLength={LIMITS.heading + LIMITS.headingLines}
                  value={draft.heading}
                  invalid={Boolean(errors.heading)}
                  onChange={(event) => update({ heading: event.target.value })}
                  placeholder={'Timeless silhouettes.\nContemporary craftsmanship.'}
                />
              </Field>

              <Field
                label="Description"
                htmlFor={fieldId('description')}
                addon={`${draft.description.length}/${LIMITS.description}`}
              >
                <Textarea
                  id={fieldId('description')}
                  rows={4}
                  maxLength={LIMITS.description}
                  value={draft.description}
                  onChange={(event) => update({ description: event.target.value })}
                  placeholder="What makes this collection worth a look."
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Pillars"
              description={`Numbered points under the description, in this order. Drag to reorder. ${pillars.length}/${LIMITS.pillars}.`}
              action={
                !readOnly && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={addPillar}
                    disabled={pillars.length >= LIMITS.pillars}
                  >
                    Add pillar
                  </Button>
                )
              }
            />

            {pillars.length === 0 ? (
              <EmptyState
                icon={ListOrdered}
                title="No pillars"
                description="The section still shows without them. Add up to eight short points."
              />
            ) : (
              <ul className="divide-y divide-ink-200 dark:divide-ink-800">
                {pillars.map((pillar, index) => {
                  const error = errors[`pillar:${pillar.id}`];
                  const number = pillar.enabled
                    ? String(pillars.slice(0, index + 1).filter((p) => p.enabled).length).padStart(2, '0')
                    : '—';

                  const drag = handlers(index);

                  return (
                    <li
                      key={pillar.id}
                      {...(readOnly ? {} : drag)}
                      /* Draggable only while the grip is held: a draggable row
                         would swallow text selection in its own inputs. */
                      draggable={!readOnly && dragArmed === pillar.id}
                      onDragEnd={() => {
                        drag.onDragEnd();
                        setDragArmed(null);
                      }}
                      className={cn(
                        'flex gap-3 p-4 transition-colors',
                        overIndex === index && 'bg-brand-50 dark:bg-brand-500/10',
                        !pillar.enabled && 'bg-ink-50/60 dark:bg-ink-800/30',
                      )}
                    >
                      <div className="flex shrink-0 flex-col items-center gap-1 pt-2">
                        {!readOnly && (
                          <span
                            className="hidden cursor-grab text-ink-300 active:cursor-grabbing sm:block"
                            title="Drag to reorder"
                            onPointerDown={() => setDragArmed(pillar.id)}
                            onPointerUp={() => setDragArmed(null)}
                          >
                            <GripVertical className="h-4 w-4" aria-hidden />
                          </span>
                        )}
                        <span
                          className="w-6 text-center text-xs tabular-nums text-ink-400"
                          title="Number shown on the storefront"
                        >
                          {number}
                        </span>
                      </div>

                      <div className={cn('min-w-0 flex-1 space-y-2', !pillar.enabled && 'opacity-60')}>
                        <Field error={error}>
                          <Input
                            aria-label={`Pillar ${index + 1} title`}
                            value={pillar.title}
                            maxLength={LIMITS.pillarTitle}
                            invalid={Boolean(error)}
                            onChange={(event) => updatePillar(pillar.id, { title: event.target.value })}
                            placeholder="Woven by hand"
                          />
                        </Field>
                        <Textarea
                          aria-label={`Pillar ${index + 1} text`}
                          rows={2}
                          value={pillar.text}
                          maxLength={LIMITS.pillarText}
                          onChange={(event) => updatePillar(pillar.id, { text: event.target.value })}
                          placeholder="Eleven weaving clusters across five states."
                        />
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start sm:pt-2">
                        <Switch
                          size="sm"
                          checked={pillar.enabled}
                          onChange={(checked) => updatePillar(pillar.id, { enabled: checked })}
                          label={pillar.enabled ? 'Shown' : 'Hidden'}
                        />
                        {!readOnly && (
                          <div className="flex items-center">
                            <IconButton
                              label={`Move pillar ${index + 1} up`}
                              size="sm"
                              disabled={index === 0}
                              onClick={() => move(index, -1)}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton
                              label={`Move pillar ${index + 1} down`}
                              size="sm"
                              disabled={index === pillars.length - 1}
                              onClick={() => move(index, 1)}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton
                              label={`Delete pillar ${index + 1}`}
                              size="sm"
                              onClick={() => removePillar(pillar.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                            </IconButton>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Call to action"
              description="The button under the pillars."
              action={
                <Switch
                  size="sm"
                  checked={draft.ctaEnabled}
                  onChange={(checked) => update({ ctaEnabled: checked })}
                  label={draft.ctaEnabled ? 'Shown' : 'Hidden'}
                />
              }
            />
            <CardBody className={cn('grid gap-4 sm:grid-cols-2', !draft.ctaEnabled && 'opacity-60')}>
              <Field
                label="Button text"
                htmlFor={fieldId('cta-text')}
                required={draft.ctaEnabled}
                error={errors.ctaText}
              >
                <Input
                  id={fieldId('cta-text')}
                  value={draft.ctaText}
                  maxLength={LIMITS.ctaText}
                  invalid={Boolean(errors.ctaText)}
                  onChange={(event) => update({ ctaText: event.target.value })}
                  placeholder="Explore Signature"
                />
              </Field>
              <Field
                label="Button link"
                htmlFor={fieldId('cta-link')}
                required={draft.ctaEnabled}
                error={errors.ctaLink}
                hint="/collections/… for a page on the shop, or a full https:// URL."
              >
                <Input
                  id={fieldId('cta-link')}
                  value={draft.ctaLink}
                  maxLength={LIMITS.ctaLink}
                  invalid={Boolean(errors.ctaLink)}
                  onChange={(event) => update({ ctaLink: event.target.value })}
                  placeholder="/collections/sopii-signature"
                />
              </Field>
            </CardBody>
          </Card>
        </div>

        {/* ------------------------------ side column ------------------------------ */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardBody>
              <Switch
                checked={draft.enabled}
                onChange={(checked) => update({ enabled: checked })}
                label="Show on the storefront"
                description="Hidden, the block is left out of the home page and its copy is kept here."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Image" description="Portrait, 4:5 — shown at half the page on desktop." />
            <CardBody className="space-y-3">
              <AppImage
                src={draft.image}
                alt={draft.imageAlt || 'Featured collection image'}
                seed="featured-collection"
                preset="tile"
                wrapperClassName="aspect-[4/5] w-full max-w-xs mx-auto"
              />
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ImageIcon className="h-3.5 w-3.5" />}
                    onClick={() => setPicker(true)}
                  >
                    Choose image
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
                    icon={<Upload className="h-3.5 w-3.5" />}
                    onClick={() => fileInput.current?.click()}
                  >
                    {uploading ? 'Uploading…' : 'Upload'}
                  </Button>
                  {draft.image && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => update({ image: '', imagePublicId: '' })}
                    >
                      Remove
                    </Button>
                  )}
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      void upload(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </div>
              )}
              {!draft.image && (
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  With no image the storefront shows a generated placeholder.
                </p>
              )}

              <Field
                label="Alt text"
                htmlFor={fieldId('image-alt')}
                required={draft.enabled && Boolean(draft.image)}
                error={errors.imageAlt}
                hint="What the image shows, for screen readers and search."
              >
                <Input
                  id={fieldId('image-alt')}
                  value={draft.imageAlt}
                  maxLength={LIMITS.imageAlt}
                  invalid={Boolean(errors.imageAlt)}
                  onChange={(event) => update({ imageAlt: event.target.value })}
                  placeholder="A model wearing a piece from the collection"
                />
              </Field>
            </CardBody>
          </Card>
        </div>
      </fieldset>

      {!readOnly && (
        <div
          className={cn(
            'sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-pop backdrop-blur transition-colors',
            dirty
              ? 'border-amber-200 bg-amber-50/95 dark:border-amber-500/30 dark:bg-ink-900/95'
              : 'border-ink-200 bg-white/95 dark:border-ink-800 dark:bg-ink-900/95',
          )}
        >
          <p className="text-xs text-ink-600 dark:text-ink-300">
            {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={discard} disabled={!dirty || saving}>
              Discard
            </Button>
            <Button size="sm" variant="primary" type="submit" loading={saving} disabled={!dirty}>
              Save changes
            </Button>
          </div>
        </div>
      )}

      <MediaPickerModal
        open={picker}
        onClose={() => setPicker(false)}
        multiple={false}
        folder="banners"
        title="Select featured collection image"
        onSelect={(assets) => {
          const asset = assets[0];
          if (!asset) return;
          update({
            image: asset.url,
            imagePublicId: asset.publicId ?? '',
            imageAlt: draft.imageAlt || asset.alt || '',
          });
        }}
      />
    </form>
  );
}
