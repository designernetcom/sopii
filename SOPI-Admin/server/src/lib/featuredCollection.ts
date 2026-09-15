/*
 * Featured Collection — the rules shared by the admin routes and the storefront feed.
 * ===========================================================================
 * The home page's split image/copy section ("SOPII Signature"). One document,
 * because the store has one of these; where it sits on the page is decided by
 * the `collections` home section, not here.
 *
 * Kept out of the route files for the same reasons as `announcements.ts`: the
 * input rules are the only thing between a form and a public page, and as pure
 * functions they can be tested without a database.
 */

import type { FeaturedCollectionPillar, FeaturedCollectionSection } from '@/types';
import { featuredCollectionDefaults } from '@/data/featuredCollection';
import { badRequest } from './http.js';

/** The settings-style singleton id. The collection only ever holds this document. */
export const FEATURED_COLLECTION_ID = 'featured_collection';

/**
 * Uploads for this section are filed under `sopii/banners/{this}`, through the
 * existing `banner` upload scope. Only assets under that folder belong to the
 * section — anything picked from the library or shared with a banner does not,
 * and is never deleted on its behalf.
 */
export const FEATURED_COLLECTION_UPLOAD_OWNER = 'featured-collection';

/**
 * Sized to the layout: the heading is set at 46px in half the page, the pillars
 * are one short line each. Generous enough for real copy, tight enough that a
 * paste of the wrong thing is refused rather than breaking the section.
 */
export const FEATURED_COLLECTION_LIMITS = {
  eyebrow: 60,
  heading: 160,
  headingLines: 3,
  description: 1000,
  image: 2048,
  imagePublicId: 255,
  imageAlt: 200,
  pillars: 8,
  pillarTitle: 80,
  pillarText: 240,
  ctaText: 40,
  ctaLink: 500,
} as const;

const L = FEATURED_COLLECTION_LIMITS;

export type FeaturedCollectionInput = Partial<Omit<FeaturedCollectionSection, 'updatedAt'>>;

/* --------------------------------- helpers ---------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** One line of copy: whitespace runs collapse, so a pasted newline cannot become a gap. */
function line(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') badRequest(`${field} must be text`);
  const out = value.replace(/\s+/g, ' ').trim();
  if (out.length > max) badRequest(`${field} must be ${max} characters or fewer`);
  return out;
}

/**
 * The heading keeps its line breaks — the design sets it on two lines — but
 * each line is tidied and blank lines are dropped, so the storefront never
 * renders an empty line.
 */
function heading(value: unknown): string {
  if (typeof value !== 'string') badRequest('Heading must be text');
  const lines = value
    .split(/\r?\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (lines.length > L.headingLines) {
    badRequest(`Heading can have at most ${L.headingLines} lines`);
  }
  const out = lines.join('\n');
  if (out.length > L.heading) badRequest(`Heading must be ${L.heading} characters or fewer`);
  return out;
}

function flag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') badRequest(`${field} must be true or false`);
  return value;
}

/**
 * A link the storefront can follow safely: a path on the shop (`/collections/x`)
 * or an absolute http(s) URL. Protocol-relative `//host` is refused along with
 * `javascript:` and friends — a CTA is rendered as a real link on every visit.
 */
export function isSafeLink(value: string): boolean {
  return /^\/(?![/\\])/.test(value) || /^https?:\/\/[^\s/]+/i.test(value);
}

/** An image the storefront can load: an http(s) URL or a media path. Never inline bytes. */
function imageUrl(value: unknown): string {
  const out = line(value, 'Image', L.image);
  if (!out) return '';
  if (/^data:/i.test(out)) badRequest('Upload the image first — inline image data is not stored');
  if (!/^https?:\/\//i.test(out) && !out.startsWith('/')) {
    badRequest('Image must be an http(s) URL or a media path');
  }
  return out;
}

const PILLAR_ID = /^[A-Za-z0-9_-]{1,64}$/;

function pillars(value: unknown, makeId: () => string): FeaturedCollectionPillar[] {
  if (!Array.isArray(value)) badRequest('Pillars must be a list');
  if (value.length > L.pillars) badRequest(`At most ${L.pillars} pillars`);

  const seen = new Set<string>();

  return value.map((raw, index) => {
    const position = index + 1;
    if (!isRecord(raw)) badRequest(`Pillar ${position} is invalid`);

    const title = line(raw.title ?? '', `Pillar ${position} title`, L.pillarTitle);
    if (!title) badRequest(`Pillar ${position} needs a title`);

    /* The panel mints ids for new rows; a missing, malformed or repeated one is
       replaced rather than refused, so React keys stay unique downstream. */
    let id = typeof raw.id === 'string' && PILLAR_ID.test(raw.id) ? raw.id : '';
    if (!id || seen.has(id)) id = makeId();
    seen.add(id);

    return {
      id,
      title,
      text: line(raw.text ?? '', `Pillar ${position} text`, L.pillarText),
      enabled: raw.enabled === undefined ? true : flag(raw.enabled, `Pillar ${position} enabled`),
    };
  });
}

/* ---------------------------------- input ----------------------------------- */

/**
 * Whitelists and validates a save.
 *
 * Every field is optional — a quick toggle sends `{ enabled }` alone — and only
 * the fields present are written. The rules that span fields (a shown section
 * needs a heading, a shown button needs its text and link) are checked against
 * `existing` merged with the input, so a partial save cannot leave the saved
 * document in a state a full save would have been refused.
 */
export function parseFeaturedCollectionInput(
  body: unknown,
  existing: FeaturedCollectionSection,
  { makeId }: { makeId: () => string },
): FeaturedCollectionInput {
  if (!isRecord(body)) badRequest('Invalid featured collection payload');
  const out: FeaturedCollectionInput = {};

  if (body.enabled !== undefined) out.enabled = flag(body.enabled, 'enabled');
  if (body.eyebrow !== undefined) out.eyebrow = line(body.eyebrow, 'Eyebrow', L.eyebrow);
  if (body.heading !== undefined) out.heading = heading(body.heading);
  if (body.description !== undefined) {
    out.description = line(body.description, 'Description', L.description);
  }

  if (body.image !== undefined) {
    out.image = imageUrl(body.image);
    /* A new image without its handle must not inherit the old one's, or a later
       replacement would delete an asset this section no longer shows. */
    out.imagePublicId = '';
  }
  if (body.imagePublicId !== undefined) {
    out.imagePublicId = out.image === ''
      ? ''
      : line(body.imagePublicId, 'Image handle', L.imagePublicId);
  }
  if (body.imageAlt !== undefined) out.imageAlt = line(body.imageAlt, 'Alt text', L.imageAlt);

  if (body.pillars !== undefined) out.pillars = pillars(body.pillars, makeId);

  if (body.ctaEnabled !== undefined) out.ctaEnabled = flag(body.ctaEnabled, 'ctaEnabled');
  if (body.ctaText !== undefined) out.ctaText = line(body.ctaText, 'Button text', L.ctaText);
  if (body.ctaLink !== undefined) {
    out.ctaLink = line(body.ctaLink, 'Button link', L.ctaLink);
    if (out.ctaLink && !isSafeLink(out.ctaLink)) {
      badRequest('Button link must start with / or http(s)://');
    }
  }

  const merged = { ...existing, ...out };

  if (merged.enabled && !merged.heading) {
    badRequest('Add a heading, or hide the section');
  }
  if (merged.enabled && merged.image && !merged.imageAlt) {
    badRequest('Describe the image in the alt text — screen readers announce it');
  }
  if (merged.ctaEnabled && (!merged.ctaText || !merged.ctaLink)) {
    badRequest('A visible button needs both its text and its link');
  }

  return out;
}

/* --------------------------------- reading ---------------------------------- */

/**
 * The saved section, completed with the defaults.
 *
 * A store that has never saved this section has no document, and it gets the
 * copy the shop front used to hard-code — so the panel opens on what shoppers
 * are actually seeing, and the first save writes it down.
 */
export function resolveFeaturedCollection(
  doc: Partial<FeaturedCollectionSection> | null | undefined,
): FeaturedCollectionSection {
  if (!doc) return structuredClone(featuredCollectionDefaults);

  const out: FeaturedCollectionSection = structuredClone(featuredCollectionDefaults);
  for (const key of Object.keys(out) as (keyof FeaturedCollectionSection)[]) {
    const value = doc[key];
    if (value !== undefined && value !== null) (out as unknown as Record<string, unknown>)[key] = value;
  }
  if (doc.updatedAt) out.updatedAt = doc.updatedAt;
  return out;
}

export interface PublicFeaturedCollection {
  enabled: boolean;
  eyebrow?: string;
  heading?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  pillars?: { id: string; title: string; text: string }[];
  cta?: { text: string; link: string } | null;
}

/**
 * What the storefront is sent. A hidden section is just `{ enabled: false }`;
 * disabled pillars, a switched-off button and the Cloudinary write handle never
 * leave the server. `transformImage` sizes the photograph for its slot.
 */
export function publicFeaturedCollection(
  section: FeaturedCollectionSection,
  transformImage: (url: string) => string = (url) => url,
): PublicFeaturedCollection {
  if (!section.enabled) return { enabled: false };

  return {
    enabled: true,
    eyebrow: section.eyebrow,
    heading: section.heading,
    description: section.description,
    image: section.image && !/^data:/i.test(section.image) ? transformImage(section.image) : '',
    imageAlt: section.imageAlt,
    pillars: section.pillars
      .filter((pillar) => pillar.enabled && pillar.title)
      .map(({ id, title, text }) => ({ id, title, text })),
    cta:
      section.ctaEnabled && section.ctaText && section.ctaLink
        ? { text: section.ctaText, link: section.ctaLink }
        : null,
  };
}

/** Whether a Cloudinary handle lives in this section's own upload folder. */
export function ownsFeaturedAsset(publicId: string | undefined | null, folder: string): boolean {
  return Boolean(publicId) && String(publicId).startsWith(`${folder}/`);
}
