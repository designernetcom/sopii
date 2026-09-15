import type { FooterConfig, FooterItem, FooterSection, FooterSectionType } from '@/types';
import {
  DEFAULT_FOOTER_SECTIONS,
  FOOTER_LIMITS,
  FOOTER_SECTION_TYPES,
  FOOTER_TYPES,
  isSafeFooterUrl,
} from '@/data/footer';
import { nextId, nowIso } from '../db';
import { badRequest, notFound, route } from '../utils';

/*
 * A lighter mirror of `server/src/lib/footer.ts`: the same shared rules from
 * `@/data/footer`, enough that the panel's error paths can be exercised without
 * the API running. `null` means "never saved", which serves the defaults, as
 * the API does.
 */
let saved: { sections: FooterSection[]; updatedAt: string } | null = null;

const config = (): FooterConfig =>
  saved
    ? structuredClone(saved)
    : { sections: structuredClone(DEFAULT_FOOTER_SECTIONS), updatedAt: null };

function write(sections: FooterSection[]): FooterConfig {
  saved = { sections, updatedAt: nowIso() };
  return config();
}

function checkItems(type: FooterSectionType, items: FooterItem[] = []): FooterItem[] {
  const rule = FOOTER_TYPES[type];
  if (items.length > rule.maxItems) badRequest(`This section holds at most ${rule.maxItems} items`);
  return items.map((item, index) => {
    const label = item.label?.trim();
    if (!label) badRequest(`Item ${index + 1}: label is required`);
    if (rule.items !== 'badge' && !isSafeFooterUrl(item.url ?? '')) {
      badRequest(`Item ${index + 1}: link must be a site path (/…), an http(s) address, mailto: or tel:`);
    }
    return {
      id: item.id || nextId('fitm'),
      label,
      url: rule.items === 'badge' ? '' : item.url.trim(),
      icon: item.icon ?? '',
      color: item.color ?? '',
      enabled: item.enabled ?? true,
      openInNewTab: item.openInNewTab ?? false,
    };
  });
}

function checkSection(type: FooterSectionType, body: Partial<FooterSection>) {
  const rule = FOOTER_TYPES[type];
  if (body.title !== undefined && rule.showsTitle && !rule.defaultTitle && !body.title.trim()) {
    badRequest('Title is required');
  }
  if (body.title && body.title.length > FOOTER_LIMITS.title) badRequest('Title is too long');
  if (body.items !== undefined) body.items = checkItems(type, body.items);
}

export const footerRoutes = [
  route('GET', '/footer', () => config()),

  route('POST', '/footer/sections', ({ body }) => {
    const payload = body as Partial<FooterSection>;
    const type = payload.type as FooterSectionType;
    if (!FOOTER_SECTION_TYPES.includes(type)) badRequest('Choose a valid section type');

    const sections = config().sections;
    const rule = FOOTER_TYPES[type];
    if (rule.single && sections.some((section) => section.type === type)) {
      badRequest(`The footer already has a ${rule.label.toLowerCase()} section`);
    }
    checkSection(type, { ...payload, title: payload.title ?? '' });

    return write([
      ...sections,
      {
        id: nextId('fsec'),
        type,
        title: payload.title?.trim() || rule.defaultTitle,
        enabled: payload.enabled ?? true,
        content: payload.content ?? '',
        items: payload.items ?? [],
        ...(type === 'brand'
          ? { display: payload.display ?? { logo: true, address: true, email: true, phone: true } }
          : {}),
      },
    ]);
  }),

  route('PUT', '/footer/sections/reorder', ({ body }) => {
    const ids = (body as { ids?: string[] }).ids ?? [];
    const sections = config().sections;
    const byId = new Map(sections.map((section) => [section.id, section]));
    if (ids.length !== sections.length || ids.some((id) => !byId.has(id))) {
      badRequest('The footer has changed since it was loaded — refresh and try again');
    }
    return write(ids.map((id) => byId.get(id)!));
  }),

  route('PUT', '/footer/sections/:id', ({ params, body }) => {
    const sections = config().sections;
    const index = sections.findIndex((section) => section.id === params.id);
    if (index === -1) notFound('Footer section');

    const existing = sections[index];
    const patch = { ...(body as Partial<FooterSection>) };
    if (patch.type !== undefined && patch.type !== existing.type) {
      badRequest('A section cannot change type — add a new section instead');
    }
    checkSection(existing.type, patch);

    sections[index] = { ...existing, ...patch, id: existing.id, type: existing.type };
    return write(sections);
  }),

  route('DELETE', '/footer/sections/:id', ({ params }) => {
    const sections = config().sections;
    if (!sections.some((section) => section.id === params.id)) notFound('Footer section');
    return write(sections.filter((section) => section.id !== params.id));
  }),

  route('POST', '/footer/reset', () => {
    saved = null;
    return config();
  }),
];
