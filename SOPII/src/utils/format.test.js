import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  compactCount,
  discountPercent,
  formatDate,
  formatPrice,
  formatRelativeTime,
  slugify,
} from './format';
import { cn } from './cn';

/*
 * Display formatting.
 * ===========================================================================
 * Small functions, but every one of them renders on a product card, which is
 * the surface a shopper scans fastest. The cases worth pinning are the ones
 * that produce something *plausible but wrong* — a negative discount, "NaN" in
 * a price, "-4 seconds ago" — because those ship without anyone noticing.
 */

afterEach(() => {
  vi.useRealTimers();
});

/* --------------------------------- money ----------------------------------- */

describe('formatPrice', () => {
  it('formats rupees in the Indian grouping', () => {
    // 3,990 — and 1,00,000 rather than 100,000, which is the whole reason for
    // the en-IN locale.
    expect(formatPrice(3990)).toContain('3,990');
    expect(formatPrice(100000)).toContain('1,00,000');
  });

  it('shows no paise', () => {
    expect(formatPrice(3990.49)).toBe(formatPrice(3990));
    expect(formatPrice(3989.5)).toBe(formatPrice(3990));
  });

  it('renders zero as a price, not as an empty string', () => {
    expect(formatPrice(0)).toContain('0');
  });

  it('never renders NaN into the page', () => {
    // A price arriving as undefined from a half-loaded record must not print
    // "₹NaN" on the card.
    for (const bad of [undefined, null, NaN, 'abc', {}]) {
      expect(formatPrice(bad)).not.toContain('NaN');
      expect(formatPrice(bad)).toContain('0');
    }
  });
});

describe('discountPercent', () => {
  it('computes the saving against the MRP', () => {
    expect(discountPercent(3990, 4990)).toBe(20);
    expect(discountPercent(500, 1000)).toBe(50);
  });

  it('rounds to a whole percent', () => {
    expect(discountPercent(3333, 4999)).toBe(33);
  });

  it('is zero when there is no saving to show', () => {
    // A negative discount would render as "-12% off", which reads as a bug and
    // is one.
    expect(discountPercent(4990, 4990)).toBe(0);
    expect(discountPercent(4990, 3990)).toBe(0);
    expect(discountPercent(4990, 0)).toBe(0);
    expect(discountPercent(4990, undefined)).toBe(0);
  });
});

/* --------------------------------- counts ---------------------------------- */

describe('compactCount', () => {
  it('leaves a small count alone', () => {
    expect(compactCount(0)).toBe('0');
    expect(compactCount(999)).toBe('999');
  });

  it('abbreviates a thousand and up', () => {
    expect(compactCount(1000)).toBe('1k');
    expect(compactCount(1234)).toBe('1.2k');
    expect(compactCount(15600)).toBe('15.6k');
  });

  it('drops a trailing .0, so it reads as "2k" not "2.0k"', () => {
    expect(compactCount(2000)).toBe('2k');
  });
});

/* ---------------------------------- dates ---------------------------------- */

describe('formatDate', () => {
  it('formats an ISO date the way an order list shows it', () => {
    expect(formatDate('2026-08-18')).toMatch(/18 Aug 2026/);
  });

  it('accepts a Date as readily as a string', () => {
    expect(formatDate(new Date('2026-08-18T00:00:00Z'))).toMatch(/Aug 2026/);
  });

  it('returns an empty string for an unparseable date rather than "Invalid Date"', () => {
    expect(formatDate('not a date')).toBe('');
    expect(formatDate(undefined)).toBe('');
  });
});

describe('formatRelativeTime', () => {
  it('says "just now" under a minute, never "-4 seconds ago"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00Z'));

    expect(formatRelativeTime('2026-08-28T11:59:40Z')).toBe('just now');
    // Clock skew can put a server timestamp slightly in the future.
    expect(formatRelativeTime('2026-08-28T12:00:20Z')).toBe('just now');
  });

  it('picks the largest sensible unit, so 90 minutes is an hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00Z'));

    expect(formatRelativeTime('2026-08-28T10:30:00Z')).toMatch(/hour/);
    expect(formatRelativeTime('2026-08-27T12:00:00Z')).toMatch(/yesterday|day/i);
  });

  it('falls back to an absolute date once relative stops being useful', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00Z'));

    expect(formatRelativeTime('2019-01-01T12:00:00Z')).toMatch(/year|2019/);
  });

  it('returns an empty string for an unparseable input', () => {
    expect(formatRelativeTime('not a date')).toBe('');
  });
});

/* --------------------------------- slugs ----------------------------------- */

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Cotton Sarees')).toBe('cotton-sarees');
  });

  it('collapses runs of punctuation into one hyphen', () => {
    expect(slugify('Silk  &  Zari — Sarees')).toBe('silk-zari-sarees');
  });

  it('leaves no leading or trailing hyphen', () => {
    expect(slugify('  Sarees!  ')).toBe('sarees');
    expect(slugify('---Sarees---')).toBe('sarees');
  });

  it('produces a URL-safe string for anything it is given', () => {
    expect(slugify('Kanjivaram / Banarasi (New)')).toMatch(/^[a-z0-9-]*$/);
    expect(slugify('')).toBe('');
  });
});

/* ------------------------------- class names -------------------------------- */

describe('cn', () => {
  it('joins the class names it is given', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops everything falsy, which is the whole point of it', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('supports the conditional pattern every call site uses', () => {
    // `cn('base', isActive && 'active')` — the reason it filters at all.
    const render = (isActive) => cn('base', isActive && 'active');

    expect(render(true)).toBe('base active');
    expect(render(false)).toBe('base');
  });

  it('returns an empty string when nothing survives', () => {
    expect(cn(false, null, undefined)).toBe('');
    expect(cn()).toBe('');
  });
});
