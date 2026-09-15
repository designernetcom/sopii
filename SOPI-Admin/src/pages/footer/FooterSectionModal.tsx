import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button, IconButton } from '@/components/common/Button';
import { Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/common/Field';
import { FormModal } from '@/components/modals/FormModal';
import {
  FOOTER_COLOR_PATTERN,
  FOOTER_LIMITS,
  FOOTER_SECTION_TYPES,
  FOOTER_SOCIAL_ICONS,
  FOOTER_TYPES,
  FOOTER_UTILITY_ICONS,
  isSafeFooterUrl,
} from '@/data/footer';
import type { FooterBrandDisplay, FooterItem, FooterSection, FooterSectionType } from '@/types';
import { SECTION_ICONS } from './sectionIcons';

export type FooterSectionBody = Omit<FooterSection, 'id'>;

interface Draft {
  type: FooterSectionType;
  title: string;
  enabled: boolean;
  content: string;
  items: FooterItem[];
  display: FooterBrandDisplay;
}

const DEFAULT_DISPLAY: FooterBrandDisplay = { logo: true, address: true, email: true, phone: true };

const ITEM_NOUN: Record<string, [string, string]> = {
  link: ['link', 'links'],
  social: ['channel', 'channels'],
  badge: ['badge', 'badges'],
};

/** A client-side id in the API's own shape; the server keeps well-formed ids. */
const tempId = () => `fitm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function draftFor(type: FooterSectionType, section?: FooterSection | null): Draft {
  const rule = FOOTER_TYPES[type];
  if (section) {
    return {
      type,
      title: section.title,
      enabled: section.enabled,
      content: section.content ?? '',
      items: structuredClone(section.items ?? []),
      display: { ...DEFAULT_DISPLAY, ...(section.display ?? {}) },
    };
  }
  return {
    type,
    title: rule.defaultTitle,
    enabled: true,
    content: type === 'copyright' ? '© {year} {store}. All Rights Reserved.' : '',
    items: [],
    display: { ...DEFAULT_DISPLAY },
  };
}

function blankItem(type: FooterSectionType): FooterItem {
  return {
    id: tempId(),
    label: '',
    url: '',
    icon: type === 'social' ? 'Instagram' : '',
    color: '',
    enabled: true,
    openInNewTab: type === 'social',
  };
}

/** Mirrors `server/src/lib/footer.ts`, so the form says so before a round trip. */
function validate(draft: Draft): Record<string, string> {
  const rule = FOOTER_TYPES[draft.type];
  const errors: Record<string, string> = {};

  const title = draft.title.trim();
  if (rule.showsTitle && !rule.defaultTitle && !title) errors.title = 'A heading is required';
  else if (title.length > FOOTER_LIMITS.title) {
    errors.title = `Keep it to ${FOOTER_LIMITS.title} characters or fewer`;
  }

  const content = draft.content.trim();
  const max = FOOTER_LIMITS.content[draft.type];
  if (max && content.length > max) errors.content = `Keep it to ${max} characters or fewer`;
  if (draft.type === 'text' && !content) errors.content = 'Text is required';
  if (draft.type === 'copyright' && !content) errors.content = 'The copyright line is required';
  if (draft.type === 'credit' && !content && draft.items.length === 0) {
    errors.content = 'Add some text, a link, or both';
  }

  const labelMax = rule.items === 'badge' ? 30 : FOOTER_LIMITS.label;
  draft.items.forEach((item, index) => {
    const label = item.label.trim();
    if (!label) errors[`items.${index}.label`] = 'Required';
    else if (label.length > labelMax) errors[`items.${index}.label`] = `${labelMax} characters max`;

    if (rule.items !== 'badge') {
      if (!item.url.trim()) errors[`items.${index}.url`] = 'Required';
      else if (!isSafeFooterUrl(item.url)) {
        errors[`items.${index}.url`] = 'Use a site path (/pages/faq), https://…, mailto: or tel:';
      }
    }
    if (rule.items === 'social' && item.color && !FOOTER_COLOR_PATTERN.test(item.color)) {
      errors[`items.${index}.color`] = 'A hex colour like #E1306C';
    }
  });

  return errors;
}

function toBody(draft: Draft): FooterSectionBody {
  const rule = FOOTER_TYPES[draft.type];
  return {
    type: draft.type,
    title: draft.title.trim(),
    enabled: draft.enabled,
    content: FOOTER_LIMITS.content[draft.type] ? draft.content.trim() : '',
    items:
      rule.items === 'none'
        ? []
        : draft.items.map((item) => ({
            ...item,
            label: item.label.trim(),
            url: rule.items === 'badge' ? '' : item.url.trim(),
            icon: rule.items === 'social' || rule.itemIcons ? item.icon : '',
            color: rule.items === 'social' ? item.color.trim() : '',
            openInNewTab: rule.items === 'badge' ? false : item.openInNewTab,
          })),
    ...(draft.type === 'brand' ? { display: draft.display } : {}),
  };
}

export interface FooterSectionModalProps {
  open: boolean;
  /** The section being edited; `null` to add one. */
  section: FooterSection | null;
  /** Types already on the footer, so one-per-footer types can be refused up front. */
  existingTypes: FooterSectionType[];
  saving: boolean;
  onClose: () => void;
  /** Resolves `true` once saved, which closes the modal. */
  onSubmit: (body: FooterSectionBody) => Promise<boolean>;
}

export function FooterSectionModal({
  open,
  section,
  existingTypes,
  saving,
  onClose,
  onSubmit,
}: FooterSectionModalProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /*
   * Keyed on the id, not the object: the cached footer is replaced after every
   * write and on refetch, and a new reference for the same section must not
   * wipe an edit that is still in progress (a refused save refetches, too).
   */
  const sectionId = section?.id;
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setDraft(section ? draftFor(section.type, section) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sectionId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const next = validate(draft);
    setErrors(next);
    if (Object.keys(next).length) return;
    await onSubmit(toBody(draft));
  };

  const rule = draft ? FOOTER_TYPES[draft.type] : null;

  return (
    <FormModal
      open={open}
      onClose={onClose}
      onSubmit={submit}
      size="lg"
      title={section ? `Edit ${rule?.label.toLowerCase() ?? 'section'}` : 'Add footer section'}
      description={rule?.description ?? 'Choose what kind of block to add to the storefront footer.'}
      submitLabel={section ? 'Save changes' : 'Add section'}
      loading={saving}
      extraActions={
        !section && draft ? (
          <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving} className="mr-auto">
            Change type
          </Button>
        ) : undefined
      }
    >
      {!draft ? (
        <TypePicker existingTypes={existingTypes} onPick={(type) => setDraft(draftFor(type))} />
      ) : (
        <SectionFields draft={draft} errors={errors} onChange={setDraft} />
      )}
    </FormModal>
  );
}

/* ------------------------------- type picker ------------------------------- */

function TypePicker({
  existingTypes,
  onPick,
}: {
  existingTypes: FooterSectionType[];
  onPick: (type: FooterSectionType) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {FOOTER_SECTION_TYPES.map((type) => {
        const rule = FOOTER_TYPES[type];
        const Icon = SECTION_ICONS[type];
        const taken = rule.single && existingTypes.includes(type);

        return (
          <button
            key={type}
            type="button"
            disabled={taken}
            onClick={() => onPick(type)}
            className={cn(
              'flex items-start gap-3 rounded-lg border border-ink-200 p-3 text-left transition-colors dark:border-ink-700',
              taken
                ? 'cursor-not-allowed opacity-50'
                : 'hover:border-brand-400 hover:bg-brand-50/50 dark:hover:border-brand-500 dark:hover:bg-brand-500/10',
            )}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink-900 dark:text-ink-100">
                {rule.label}
                <span className="ml-1.5 text-2xs font-normal text-ink-400">
                  {rule.area === 'columns' ? 'Columns' : 'Bottom bar'}
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">
                {taken ? 'Already on the footer — edit that one instead.' : rule.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------- fields --------------------------------- */

function SectionFields({
  draft,
  errors,
  onChange,
}: {
  draft: Draft;
  errors: Record<string, string>;
  onChange: (draft: Draft) => void;
}) {
  const rule = FOOTER_TYPES[draft.type];
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const contentMax = FOOTER_LIMITS.content[draft.type] ?? 0;

  const titleCopy = rule.showsTitle
    ? { label: draft.type === 'payments' ? 'Label' : 'Heading', hint: undefined }
    : {
        label: 'Name',
        hint:
          draft.type === 'legal'
            ? 'Not shown — read out by screen readers to name this group of links.'
            : 'Only shown in this panel, to tell sections apart.',
      };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <Field
          label={titleCopy.label}
          required={rule.showsTitle && !rule.defaultTitle}
          error={errors.title}
          hint={titleCopy.hint}
        >
          <Input
            value={draft.title}
            maxLength={FOOTER_LIMITS.title}
            invalid={Boolean(errors.title)}
            placeholder={rule.defaultTitle || 'e.g. Customer Care'}
            onChange={(event) => set({ title: event.target.value })}
          />
        </Field>
        <Field label="Status">
          <div className="flex h-9 items-center gap-2">
            <Switch
              checked={draft.enabled}
              onChange={(enabled) => set({ enabled })}
              label="Visible on the storefront"
            />
          </div>
        </Field>
      </div>

      {draft.type === 'brand' && (
        <>
          <Field
            label="Blurb"
            error={errors.content}
            addon={`${draft.content.length}/${contentMax}`}
            hint="A line or two under the logo."
          >
            <Textarea
              rows={3}
              maxLength={contentMax}
              value={draft.content}
              invalid={Boolean(errors.content)}
              onChange={(event) => set({ content: event.target.value })}
            />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-ink-700 dark:text-ink-300">Show</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['logo', 'Logo'],
                  ['address', 'Store address'],
                  ['email', 'Support email'],
                  ['phone', 'Phone number'],
                ] as const
              ).map(([key, label]) => (
                <Checkbox
                  key={key}
                  label={label}
                  checked={draft.display[key]}
                  onChange={(event) =>
                    set({ display: { ...draft.display, [key]: event.target.checked } })
                  }
                />
              ))}
            </div>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              The address, email and phone number themselves are edited in Settings → Store.
            </p>
          </fieldset>
        </>
      )}

      {draft.type === 'text' && (
        <Field
          label="Text"
          required
          error={errors.content}
          addon={`${draft.content.length}/${contentMax}`}
          hint="Line breaks are kept."
        >
          <Textarea
            rows={5}
            maxLength={contentMax}
            value={draft.content}
            invalid={Boolean(errors.content)}
            onChange={(event) => set({ content: event.target.value })}
          />
        </Field>
      )}

      {draft.type === 'copyright' && (
        <Field
          label="Copyright line"
          required
          error={errors.content}
          hint="{year} becomes the current year and {store} the store name from Settings."
        >
          <Input
            value={draft.content}
            maxLength={contentMax}
            invalid={Boolean(errors.content)}
            onChange={(event) => set({ content: event.target.value })}
          />
        </Field>
      )}

      {draft.type === 'credit' && (
        <Field
          label="Text before the link"
          error={errors.content}
          hint="e.g. “Designed and Developed by”. Add the company as the link below."
        >
          <Input
            value={draft.content}
            maxLength={contentMax}
            invalid={Boolean(errors.content)}
            onChange={(event) => set({ content: event.target.value })}
          />
        </Field>
      )}

      {rule.items !== 'none' && (
        <ItemsEditor
          type={draft.type}
          items={draft.items}
          errors={errors}
          onChange={(items) => set({ items })}
        />
      )}
    </>
  );
}

/* ---------------------------------- items ---------------------------------- */

function ItemsEditor({
  type,
  items,
  errors,
  onChange,
}: {
  type: FooterSectionType;
  items: FooterItem[];
  errors: Record<string, string>;
  onChange: (items: FooterItem[]) => void;
}) {
  const rule = FOOTER_TYPES[type];
  const [singular, plural] = ITEM_NOUN[rule.items] ?? ITEM_NOUN.link;
  const full = items.length >= rule.maxItems;

  const update = (index: number, patch: Partial<FooterItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium capitalize text-ink-700 dark:text-ink-300">{plural}</p>
        <span className="text-2xs tabular-nums text-ink-400">
          {items.length}/{rule.maxItems}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-500 dark:border-ink-700 dark:text-ink-400">
          No {plural} yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const err = (field: string) => errors[`items.${index}.${field}`];
            return (
              <li
                key={item.id}
                className={cn(
                  'space-y-2 rounded-lg border border-ink-200 p-3 dark:border-ink-700',
                  !item.enabled && 'bg-ink-50/70 dark:bg-ink-800/30',
                )}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={cn(
                      'grid min-w-0 flex-1 gap-2',
                      rule.items !== 'badge' && 'sm:grid-cols-2',
                    )}
                  >
                    {rule.items === 'social' && (
                      <Select
                        aria-label="Platform"
                        sizeVariant="sm"
                        value={item.icon || 'Globe'}
                        options={FOOTER_SOCIAL_ICONS.map((icon) => ({
                          value: icon,
                          label: icon === 'Globe' ? 'Other / website' : icon,
                        }))}
                        onChange={(event) => update(index, { icon: event.target.value })}
                      />
                    )}
                    {rule.itemIcons && (
                      <Select
                        aria-label="Icon"
                        sizeVariant="sm"
                        value={item.icon}
                        placeholder="No icon"
                        options={FOOTER_UTILITY_ICONS.map((icon) => ({ value: icon, label: icon }))}
                        onChange={(event) => update(index, { icon: event.target.value })}
                      />
                    )}
                    <ItemInput
                      label="Label"
                      value={item.label}
                      error={err('label')}
                      placeholder={rule.items === 'badge' ? 'UPI' : 'Contact Us'}
                      onChange={(label) => update(index, { label })}
                    />
                    {rule.items !== 'badge' && (
                      <ItemInput
                        label="Link"
                        value={item.url}
                        error={err('url')}
                        placeholder={rule.items === 'social' ? 'https://instagram.com/…' : '/pages/contact'}
                        className={rule.items === 'social' || rule.itemIcons ? 'sm:col-span-2' : undefined}
                        onChange={(url) => update(index, { url })}
                      />
                    )}
                  </div>

                  <div className="flex shrink-0 items-center">
                    <IconButton
                      label={`Move ${item.label || singular} up`}
                      size="sm"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label={`Move ${item.label || singular} down`}
                      size="sm"
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label={`Remove ${item.label || singular}`}
                      size="sm"
                      onClick={() => onChange(items.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </IconButton>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <label className="inline-flex items-center gap-2 text-xs text-ink-600 dark:text-ink-400">
                    <Switch
                      size="sm"
                      checked={item.enabled}
                      onChange={(enabled) => update(index, { enabled })}
                    />
                    Shown
                  </label>
                  {rule.items !== 'badge' && (
                    <Checkbox
                      label={<span className="text-xs font-normal">Open in a new tab</span>}
                      checked={item.openInNewTab}
                      onChange={(event) => update(index, { openInNewTab: event.target.checked })}
                    />
                  )}
                  {rule.items === 'social' && (
                    <div className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-400">
                      <input
                        type="color"
                        aria-label="Brand colour"
                        value={FOOTER_COLOR_PATTERN.test(item.color) ? item.color : '#540000'}
                        onChange={(event) => update(index, { color: event.target.value.toUpperCase() })}
                        className="h-6 w-8 cursor-pointer rounded border border-ink-200 bg-transparent dark:border-ink-700"
                      />
                      <span>
                        Rail colour{' '}
                        {item.color ? (
                          <button
                            type="button"
                            className="text-brand-600 hover:underline dark:text-brand-400"
                            onClick={() => update(index, { color: '' })}
                          >
                            (reset)
                          </button>
                        ) : (
                          <span className="text-ink-400">(default)</span>
                        )}
                      </span>
                      {err('color') && <span className="text-rose-600">{err('color')}</span>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button
        size="sm"
        variant="secondary"
        icon={<Plus className="h-3.5 w-3.5" />}
        disabled={full}
        onClick={() => onChange([...items, blankItem(type)])}
      >
        {full ? `${plural[0].toUpperCase()}${plural.slice(1)} full` : `Add ${singular}`}
      </Button>
    </div>
  );
}

function ItemInput({
  label,
  value,
  error,
  placeholder,
  className,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <Input
        aria-label={label}
        sizeVariant="sm"
        value={value}
        placeholder={placeholder}
        invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <p className="mt-1 text-2xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
