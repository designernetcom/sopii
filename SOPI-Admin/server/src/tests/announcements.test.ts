/*
 * Tests for the announcement rules (`lib/announcements.ts`).
 * ===========================================================================
 * Two contracts, both of which fail quietly when they break.
 *
 * The input parser is the only thing standing between the panel's form and a
 * public page. If it stops whitelisting, a crafted body can write fields the
 * panel never offers; if it stops validating, a blank or 5,000-character
 * message goes straight onto every page of the shop.
 *
 * The live filter decides what the storefront shows. An off-by-one on either
 * end of the window is an offer that runs an hour past its end — nothing
 * throws, the strip simply keeps saying it.
 *
 * Run with:  npm test        (in server/)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ANNOUNCEMENT_MESSAGE_MAX,
  liveAnnouncementFilter,
  parseAnnouncementInput,
} from '../lib/announcements.js';
import { HttpError } from '../lib/http.js';

/** Asserts the call is refused as a 400, and that the message mentions `match`. */
function rejects(fn: () => unknown, match: RegExp) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof HttpError, 'expected an HttpError');
    assert.equal(error.status, 400);
    assert.match(error.message, match);
    return true;
  });
}

describe('parseAnnouncementInput: creating', () => {
  it('accepts a complete announcement', () => {
    const out = parseAnnouncementInput({
      message: 'Free shipping on orders above ₹1999',
      isActive: true,
      priority: 1,
      startDate: null,
      endDate: null,
    });

    assert.deepEqual(out, {
      message: 'Free shipping on orders above ₹1999',
      isActive: true,
      priority: 1,
      startDate: null,
      endDate: null,
    });
  });

  it('requires a message', () => {
    rejects(() => parseAnnouncementInput({ isActive: true }), /message is required/);
    rejects(() => parseAnnouncementInput({ message: '   ' }), /message is required/);
    rejects(() => parseAnnouncementInput({ message: 42 }), /message is required/);
  });

  it('collapses whitespace so the strip never renders a gap or a line break', () => {
    const out = parseAnnouncementInput({ message: '  Festive\n\nsale   is  live ' });
    assert.equal(out.message, 'Festive sale is live');
  });

  it('caps the message length', () => {
    const atLimit = 'a'.repeat(ANNOUNCEMENT_MESSAGE_MAX);
    assert.equal(parseAnnouncementInput({ message: atLimit }).message, atLimit);
    rejects(
      () => parseAnnouncementInput({ message: `${atLimit}a` }),
      /characters or fewer/,
    );
  });

  it('ignores fields the panel does not edit', () => {
    const out = parseAnnouncementInput({
      message: 'Hello',
      id: 'ann_hijack',
      _id: 'ann_hijack',
      createdAt: '1999-01-01T00:00:00.000Z',
      $where: 'sleep(1000)',
    });
    assert.deepEqual(Object.keys(out), ['message']);
  });

  it('refuses a body that is not an object', () => {
    rejects(() => parseAnnouncementInput(null), /Invalid announcement payload/);
    rejects(() => parseAnnouncementInput(['message']), /Invalid announcement payload/);
    rejects(() => parseAnnouncementInput('message'), /Invalid announcement payload/);
  });

  it('only accepts a real boolean for isActive', () => {
    rejects(() => parseAnnouncementInput({ message: 'x', isActive: 'true' }), /isActive/);
  });

  it('only accepts a whole, non-negative priority', () => {
    rejects(() => parseAnnouncementInput({ message: 'x', priority: -1 }), /Priority/);
    rejects(() => parseAnnouncementInput({ message: 'x', priority: 1.5 }), /Priority/);
    rejects(() => parseAnnouncementInput({ message: 'x', priority: '2' }), /Priority/);
    rejects(() => parseAnnouncementInput({ message: 'x', priority: 1e9 }), /Priority/);
    assert.equal(parseAnnouncementInput({ message: 'x', priority: 0 }).priority, 0);
  });

  it('normalises dates to ISO and treats an empty string as no limit', () => {
    const out = parseAnnouncementInput({
      message: 'x',
      startDate: '2026-09-14T10:00:00+05:30',
      endDate: '',
    });
    assert.equal(out.startDate, '2026-09-14T04:30:00.000Z');
    assert.equal(out.endDate, null);
  });

  it('refuses an unparseable date', () => {
    rejects(() => parseAnnouncementInput({ message: 'x', startDate: 'soon' }), /not a valid date/);
    rejects(() => parseAnnouncementInput({ message: 'x', endDate: 12345 }), /date or null/);
  });

  it('refuses a window that ends before, or exactly when, it starts', () => {
    rejects(
      () =>
        parseAnnouncementInput({
          message: 'x',
          startDate: '2026-09-20T00:00:00.000Z',
          endDate: '2026-09-10T00:00:00.000Z',
        }),
      /End date must be after/,
    );
    rejects(
      () =>
        parseAnnouncementInput({
          message: 'x',
          startDate: '2026-09-20T00:00:00.000Z',
          endDate: '2026-09-20T00:00:00.000Z',
        }),
      /End date must be after/,
    );
  });
});

describe('parseAnnouncementInput: updating', () => {
  it('leaves absent fields out, so a toggle does not require the message', () => {
    assert.deepEqual(parseAnnouncementInput({ isActive: false }, { partial: true }), {
      isActive: false,
    });
  });

  it('still validates the fields that are present', () => {
    rejects(() => parseAnnouncementInput({ message: '' }, { partial: true }), /message is required/);
  });

  it('checks a changed end date against the saved start date', () => {
    const existing = { startDate: '2026-09-20T00:00:00.000Z', endDate: null };
    rejects(
      () =>
        parseAnnouncementInput(
          { endDate: '2026-09-01T00:00:00.000Z' },
          { partial: true, existing },
        ),
      /End date must be after/,
    );
  });

  it('allows clearing a date that the other end was validated against', () => {
    const existing = {
      startDate: '2026-09-20T00:00:00.000Z',
      endDate: '2026-09-30T00:00:00.000Z',
    };
    const out = parseAnnouncementInput({ startDate: null }, { partial: true, existing });
    assert.deepEqual(out, { startDate: null });
  });
});

describe('liveAnnouncementFilter', () => {
  /**
   * Evaluates the filter against a record the way MongoDB would, for the
   * operators it uses. `{ field: null }` matches null *and* missing.
   */
  function matches(record: Record<string, unknown>, now: string) {
    const filter = liveAnnouncementFilter(now);
    if (record.isActive !== filter.isActive) return false;

    return filter.$and.every(({ $or }) =>
      $or.some((clause) => {
        const [field, condition] = Object.entries(clause)[0];
        const value = record[field];
        if (condition === null) return value === null || value === undefined;
        const { $lte, $gt } = condition as { $lte?: string; $gt?: string };
        if (typeof value !== 'string') return false;
        if ($lte !== undefined) return value <= $lte;
        if ($gt !== undefined) return value > $gt;
        return false;
      }),
    );
  }

  const NOW = '2026-09-14T12:00:00.000Z';

  it('shows an active announcement with no window', () => {
    assert.equal(matches({ isActive: true, startDate: null, endDate: null }, NOW), true);
    assert.equal(matches({ isActive: true }, NOW), true);
  });

  it('hides a disabled announcement whatever its window says', () => {
    assert.equal(matches({ isActive: false, startDate: null, endDate: null }, NOW), false);
  });

  it('hides one that has not started, and shows it from the start instant', () => {
    assert.equal(
      matches({ isActive: true, startDate: '2026-09-14T12:00:00.001Z', endDate: null }, NOW),
      false,
    );
    assert.equal(matches({ isActive: true, startDate: NOW, endDate: null }, NOW), true);
  });

  it('hides one from its end instant onwards', () => {
    assert.equal(
      matches({ isActive: true, startDate: null, endDate: '2026-09-14T12:00:00.001Z' }, NOW),
      true,
    );
    assert.equal(matches({ isActive: true, startDate: null, endDate: NOW }, NOW), false);
  });
});
