/*
 * Announcements — the rules shared by the admin routes and the storefront feed.
 * ===========================================================================
 * Kept out of the route files for two reasons. The same "is this live?" filter
 * backs `/bootstrap`, `/version` and `/announcements`, and a copy that drifts in
 * one of them is an announcement that shows on first paint but never triggers
 * a refresh. And the input rules are pure functions, so they can be tested
 * without a database.
 */

import type { Announcement } from '@/types';
import { badRequest } from './http.js';

/** One line in a 36px strip. Long enough for a real offer, short enough to read while it moves. */
export const ANNOUNCEMENT_MESSAGE_MAX = 200;

/** Upper bound on `priority`, so a typo cannot produce a number nobody can sort past. */
export const ANNOUNCEMENT_PRIORITY_MAX = 9999;

/**
 * How many live announcements the storefront is sent.
 *
 * The strip loops its whole sequence, so every extra message makes each one
 * come round less often. Twenty is far past useful and still bounds the feed.
 */
export const ANNOUNCEMENT_PUBLIC_LIMIT = 20;

/** Display order: lowest priority first, then oldest first so ties are stable. */
export const ANNOUNCEMENT_SORT = { priority: 1, createdAt: 1 } as const;

export type AnnouncementInput = Partial<
  Pick<Announcement, 'message' | 'isActive' | 'priority' | 'startDate' | 'endDate'>
>;

type Window = { startDate?: string | null; endDate?: string | null };

/** `null`, `''` → no limit; anything else must parse as a date. Stored as ISO. */
function parseDate(value: unknown, field: string): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') badRequest(`${field} must be a date or null`);
  const time = Date.parse(value);
  if (Number.isNaN(time)) badRequest(`${field} is not a valid date`);
  return new Date(time).toISOString();
}

/**
 * Whitelists and validates a create or update body.
 *
 * Only the five editable fields are read — `id`, `createdAt` and anything else
 * a caller sends are ignored rather than written. With `partial` (an update),
 * absent fields are left untouched and only the ones present are checked;
 * `existing` is the saved record, so a window where only one end changed is
 * still validated against the other.
 */
export function parseAnnouncementInput(
  body: unknown,
  { partial = false, existing }: { partial?: boolean; existing?: Window } = {},
): AnnouncementInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    badRequest('Invalid announcement payload');
  }
  const raw = body as Record<string, unknown>;
  const out: AnnouncementInput = {};

  if (!partial || raw.message !== undefined) {
    if (typeof raw.message !== 'string') badRequest('Announcement message is required');
    /* One line on the storefront, so newlines and runs of spaces collapse
       here rather than rendering as a gap in the strip. */
    const message = raw.message.replace(/\s+/g, ' ').trim();
    if (!message) badRequest('Announcement message is required');
    if (message.length > ANNOUNCEMENT_MESSAGE_MAX) {
      badRequest(`Announcement message must be ${ANNOUNCEMENT_MESSAGE_MAX} characters or fewer`);
    }
    out.message = message;
  }

  if (raw.isActive !== undefined) {
    if (typeof raw.isActive !== 'boolean') badRequest('isActive must be true or false');
    out.isActive = raw.isActive;
  }

  if (raw.priority !== undefined) {
    const priority = raw.priority;
    if (
      typeof priority !== 'number' ||
      !Number.isInteger(priority) ||
      priority < 0 ||
      priority > ANNOUNCEMENT_PRIORITY_MAX
    ) {
      badRequest(`Priority must be a whole number between 0 and ${ANNOUNCEMENT_PRIORITY_MAX}`);
    }
    out.priority = priority;
  }

  if (raw.startDate !== undefined) out.startDate = parseDate(raw.startDate, 'startDate');
  if (raw.endDate !== undefined) out.endDate = parseDate(raw.endDate, 'endDate');

  const start = out.startDate !== undefined ? out.startDate : (existing?.startDate ?? null);
  const end = out.endDate !== undefined ? out.endDate : (existing?.endDate ?? null);
  if (start && end && end <= start) badRequest('End date must be after the start date');

  return out;
}

/**
 * The announcements the storefront should show right now: switched on, and
 * inside their window. ISO strings sort lexicographically, so string
 * comparison is date comparison. `{ field: null }` matches both an explicit
 * null and a missing field.
 *
 * The end is exclusive — an announcement ending at 18:00 is gone at 18:00.
 */
export function liveAnnouncementFilter(now = new Date().toISOString()) {
  return {
    isActive: true,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gt: now } }] },
    ],
  };
}
