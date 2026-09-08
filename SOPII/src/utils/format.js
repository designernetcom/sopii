/** Currency, dates and other display formatting helpers. */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** 3990 -> "₹3,990" */
export const formatPrice = (value) => INR.format(Math.round(Number(value) || 0));

/** 3990, 4990 -> 20 */
export function discountPercent(price, originalPrice) {
  if (!originalPrice || originalPrice <= price) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

/** 1234 -> "1.2k" — keeps review counts compact on cards. */
export function compactCount(n) {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

/** "2026-08-18" -> "18 Aug 2026" */
export function formatDate(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const RELATIVE = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });

/*
 * Largest unit first, so 90 minutes reads as "1 hour ago" rather than
 * "90 minutes ago". `Infinity` terminates the walk at years.
 */
const RELATIVE_UNITS = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
];

/**
 * "2 hours ago", "yesterday" — the vocabulary §16's device list uses.
 *
 * `Intl.RelativeTimeFormat` rather than a hand-rolled table, so "yesterday"
 * and "last week" come out as idiomatic English instead of "1 day ago".
 */
export function formatRelativeTime(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  let delta = (date.getTime() - Date.now()) / 1000;
  // Under a minute is "just now"; "-4 seconds ago" reads as a bug.
  if (Math.abs(delta) < 45) return 'just now';

  for (const [unit, limit] of RELATIVE_UNITS) {
    if (Math.abs(delta) < limit) return RELATIVE.format(Math.round(delta), unit);
    delta /= limit;
  }
  return formatDate(date);
}

/** "Cotton Sarees" -> "cotton-sarees" */
export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
