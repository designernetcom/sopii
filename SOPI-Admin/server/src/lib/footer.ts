/*
 * The storefront footer — the rules shared by the admin routes and the feed.
 * ===========================================================================
 * Pure functions over a list of sections: parse a request body, apply a
 * create/update/delete/reorder, and project what the shop may see. No database
 * access here, so every rule is testable without one — the routes load the
 * document, hand the sections through these, and write the result back.
 *
 * The limits and vocabularies (icon names, section types) come from
 * `@/data/footer`, which the panel imports too, so the form and the API refuse
 * the same things.
 */

import type { FooterBrandDisplay, FooterItem, FooterSection, FooterSectionType } from '@/types';
import {
  DEFAULT_FOOTER_SECTIONS,
  FOOTER_COLOR_PATTERN,
  FOOTER_LIMITS,
  FOOTER_SECTION_TYPES,
  FOOTER_SOCIAL_ICONS,
  FOOTER_TYPES,
  FOOTER_UTILITY_ICONS,
  isSafeFooterUrl,
} from '@/data/footer';
import { badRequest, nextId, notFound } from './http.js';

export { DEFAULT_FOOTER_SECTIONS };

/** What a create or update body may set. `id` and `type` are never taken from an update. */
export type FooterSectionInput = Partial<Omit<FooterSection, 'id'>>;

const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** One line: newlines and runs of spaces collapse. */
const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Paragraphs survive; trailing spaces and runs of blank lines do not. */
const multiLine = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

function readString(raw: unknown, field: string, max: number, { required = false } = {}) {
  if (raw === undefined || raw === null) {
    if (required) badRequest(`${field} is required`);
    return '';
  }
  if (typeof raw !== 'string') badRequest(`${field} must be text`);
  const value = oneLine(raw);
  if (required && !value) badRequest(`${field} is required`);
  if (value.length > max) badRequest(`${field} must be ${max} characters or fewer`);
  return value;
}

function readBoolean(raw: unknown, field: string, fallback: boolean) {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'boolean') badRequest(`${field} must be true or false`);
  return raw;
}

/* ---------------------------------- items ---------------------------------- */

/**
 * Validates one section's item list for its type.
 *
 * Ids the panel sent back are kept when they are well-formed and unique, so an
 * edit does not churn every React key; anything else gets a fresh id.
 */
export function parseFooterItems(raw: unknown, type: FooterSectionType): FooterItem[] {
  const rule = FOOTER_TYPES[type];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) badRequest('items must be a list');

  if (rule.items === 'none') {
    if (raw.length) badRequest(`A ${rule.label.toLowerCase()} section has no items`);
    return [];
  }
  if (raw.length > rule.maxItems) {
    badRequest(`A ${rule.label.toLowerCase()} section holds at most ${rule.maxItems} item${rule.maxItems === 1 ? '' : 's'}`);
  }

  const seen = new Set<string>();

  return raw.map((entry, index) => {
    if (!isObject(entry)) badRequest(`Item ${index + 1} is not valid`);
    const where = `Item ${index + 1}`;

    const label = readString(
      entry.label,
      `${where}: label`,
      rule.items === 'badge' ? 30 : FOOTER_LIMITS.label,
      { required: true },
    );

    let url = '';
    if (rule.items !== 'badge') {
      url = readString(entry.url, `${where}: link`, FOOTER_LIMITS.url, { required: true });
      if (!isSafeFooterUrl(url)) {
        badRequest(`${where}: link must be a site path (/…), an http(s) address, mailto: or tel:`);
      }
    }

    let icon = '';
    if (rule.items === 'social') {
      icon = typeof entry.icon === 'string' && entry.icon ? entry.icon : 'Globe';
      if (!(FOOTER_SOCIAL_ICONS as readonly string[]).includes(icon)) {
        badRequest(`${where}: unknown platform icon "${icon}"`);
      }
    } else if (rule.itemIcons && entry.icon !== undefined && entry.icon !== '') {
      if (typeof entry.icon !== 'string' || !(FOOTER_UTILITY_ICONS as readonly string[]).includes(entry.icon)) {
        badRequest(`${where}: unknown icon "${String(entry.icon)}"`);
      }
      icon = entry.icon;
    }

    let color = '';
    if (rule.items === 'social' && entry.color !== undefined && entry.color !== '') {
      if (typeof entry.color !== 'string' || !FOOTER_COLOR_PATTERN.test(entry.color)) {
        badRequest(`${where}: colour must be a hex value like #E1306C`);
      }
      color = entry.color.toUpperCase();
    }

    let id = typeof entry.id === 'string' && ITEM_ID.test(entry.id) ? entry.id : '';
    if (!id || seen.has(id)) id = nextId('fitm');
    seen.add(id);

    return {
      id,
      label,
      url,
      icon,
      color,
      enabled: readBoolean(entry.enabled, `${where}: enabled`, true),
      openInNewTab:
        rule.items === 'badge' ? false : readBoolean(entry.openInNewTab, `${where}: openInNewTab`, false),
    };
  });
}

/* --------------------------------- sections -------------------------------- */

/**
 * Whitelists and validates a section body.
 *
 * `type` is required on a create and must be one of the known types. On an
 * update (`existingType` given) the body's `type` is ignored unless it tries to
 * change it, which is refused: a link column turned into a copyright line would
 * carry items the new type has no place for.
 */
export function parseFooterSectionInput(
  body: unknown,
  { existingType }: { existingType?: FooterSectionType } = {},
): FooterSectionInput & { type: FooterSectionType } {
  if (!isObject(body)) badRequest('Invalid footer section payload');

  const partial = existingType !== undefined;
  let type: FooterSectionType;
  if (partial) {
    if (body.type !== undefined && body.type !== existingType) {
      badRequest('A section cannot change type — add a new section instead');
    }
    type = existingType;
  } else {
    if (typeof body.type !== 'string' || !(FOOTER_SECTION_TYPES as string[]).includes(body.type)) {
      badRequest('Choose a valid section type');
    }
    type = body.type as FooterSectionType;
  }

  const rule = FOOTER_TYPES[type];
  const out: FooterSectionInput & { type: FooterSectionType } = { type };

  if (!partial || body.title !== undefined) {
    const title = readString(body.title, 'Title', FOOTER_LIMITS.title, {
      // A column heading is also the tap target of its accordion on a phone.
      required: rule.showsTitle && !rule.defaultTitle,
    });
    out.title = title || rule.defaultTitle;
  }

  if (!partial || body.enabled !== undefined) {
    out.enabled = readBoolean(body.enabled, 'enabled', true);
  }

  if (!partial || body.content !== undefined) {
    const max = FOOTER_LIMITS.content[type];
    if (!max) {
      if (typeof body.content === 'string' && body.content.trim()) {
        badRequest(`A ${rule.label.toLowerCase()} section has no text`);
      }
      out.content = '';
    } else {
      if (body.content !== undefined && body.content !== null && typeof body.content !== 'string') {
        badRequest('Text must be text');
      }
      const raw = typeof body.content === 'string' ? body.content : '';
      const content = type === 'text' || type === 'brand' ? multiLine(raw) : oneLine(raw);
      if (type === 'text' && !content) badRequest('Text is required');
      if (type === 'copyright' && !content) badRequest('Copyright text is required');
      if (content.length > max) badRequest(`Text must be ${max} characters or fewer`);
      out.content = content;
    }
  }

  if (!partial || body.items !== undefined) {
    out.items = parseFooterItems(body.items, type);
    if (type === 'credit' && !partial && out.items.length === 0 && !out.content) {
      badRequest('A credit line needs text or a link');
    }
  }

  if (type === 'brand' && (!partial || body.display !== undefined)) {
    const raw = body.display === undefined ? {} : body.display;
    if (!isObject(raw)) badRequest('display must be an object');
    const display: FooterBrandDisplay = {
      logo: readBoolean(raw.logo, 'display.logo', true),
      address: readBoolean(raw.address, 'display.address', true),
      email: readBoolean(raw.email, 'display.email', true),
      phone: readBoolean(raw.phone, 'display.phone', true),
    };
    out.display = display;
  }

  return out;
}

/* -------------------------------- operations ------------------------------- */

/** Appends a section, refusing a second copy of a one-per-footer type. */
export function addFooterSection(sections: FooterSection[], body: unknown): FooterSection[] {
  const input = parseFooterSectionInput(body);
  const rule = FOOTER_TYPES[input.type];

  if (sections.length >= FOOTER_LIMITS.sections) {
    badRequest(`The footer holds at most ${FOOTER_LIMITS.sections} sections`);
  }
  if (rule.single && sections.some((section) => section.type === input.type)) {
    badRequest(`The footer already has a ${rule.label.toLowerCase()} section`);
  }

  const section: FooterSection = {
    id: nextId('fsec'),
    type: input.type,
    title: input.title ?? rule.defaultTitle,
    enabled: input.enabled ?? true,
    content: input.content ?? '',
    items: input.items ?? [],
    ...(input.display ? { display: input.display } : {}),
  };
  return [...sections, section];
}

export function updateFooterSection(
  sections: FooterSection[],
  id: string,
  body: unknown,
): FooterSection[] {
  const index = sections.findIndex((section) => section.id === id);
  if (index === -1) notFound('Footer section');

  const existing = sections[index];
  const input = parseFooterSectionInput(body, { existingType: existing.type });
  const next = [...sections];
  next[index] = { ...existing, ...input, id: existing.id, type: existing.type };
  return next;
}

export function removeFooterSection(sections: FooterSection[], id: string): FooterSection[] {
  if (!sections.some((section) => section.id === id)) notFound('Footer section');
  return sections.filter((section) => section.id !== id);
}

/**
 * Puts the sections in the order of `ids`.
 *
 * The list must name every section exactly once. A partial list is refused
 * rather than guessed at: it almost always means the panel was looking at a
 * stale copy, and appending the missing ones would silently move them.
 */
export function reorderFooterSections(sections: FooterSection[], ids: unknown): FooterSection[] {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    badRequest('ids must be a list of section ids');
  }
  const byId = new Map(sections.map((section) => [section.id, section]));
  if (ids.length !== sections.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
    badRequest('The footer has changed since it was loaded — refresh and try again');
  }
  return ids.map((id) => byId.get(id)!);
}

/* ------------------------------ public projection -------------------------- */

export type PublicFooterItem = Omit<FooterItem, 'enabled'>;
export type PublicFooterSection = Omit<FooterSection, 'enabled' | 'items'> & {
  items: PublicFooterItem[];
};

export interface PublicFooter {
  sections: PublicFooterSection[];
  /** The social channels, for the desktop rail — shown even while the footer column is hidden. */
  socialLinks: PublicFooterItem[];
}

const publicItems = (items: FooterItem[] = []): PublicFooterItem[] =>
  items
    .filter((item) => item.enabled !== false)
    /* Defence in depth: the parser already refuses an unsafe link, but a
       document edited by hand should not be able to put one on the shop. */
    .filter((item) => !item.url || isSafeFooterUrl(item.url))
    .map(({ id, label, url, icon, color, openInNewTab }) => ({
      id,
      label,
      url: url ?? '',
      icon: icon ?? '',
      color: color ?? '',
      openInNewTab: Boolean(openInNewTab),
    }));

/**
 * What the storefront is sent: switched-on sections with their switched-on
 * items, in order, and nothing an admin uses only to manage them.
 */
export function publicFooter(sections: FooterSection[]): PublicFooter {
  const social = sections.find((section) => section.type === 'social');

  return {
    sections: sections
      .filter((section) => section.enabled !== false)
      .map((section) => ({
        id: section.id,
        type: section.type,
        title: section.title ?? '',
        content: section.content ?? '',
        items: publicItems(section.items),
        ...(section.type === 'brand' && section.display ? { display: section.display } : {}),
      })),
    socialLinks: social ? publicItems(social.items) : [],
  };
}
