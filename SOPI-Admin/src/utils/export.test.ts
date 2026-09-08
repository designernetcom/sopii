import { describe, it, expect } from 'vitest';

import { toCsv, type ExportColumn } from './export';
import { errorMessage } from '../store/api/baseQuery';

/*
 * CSV export, and the one message a failed request shows.
 * ===========================================================================
 * CSV looks like "join the values with commas" until a value contains a comma,
 * a quote or a newline — and in this application they do: product names carry
 * commas, addresses carry newlines, and a customer note carries anything at
 * all. An unescaped one shifts every following column by one, which corrupts
 * the export *silently*: the file opens, and it is wrong.
 */

interface Row {
  name: string;
  price: number;
  note?: string | null;
}

const columns: ExportColumn<Row>[] = [
  { key: 'name', header: 'Product', value: (r) => r.name },
  { key: 'price', header: 'Price', value: (r) => r.price },
  { key: 'note', header: 'Note', value: (r) => r.note },
];

const lines = (csv: string) => csv.split('\n');

describe('toCsv', () => {
  it('writes the headers first', () => {
    expect(lines(toCsv([], columns))[0]).toBe('Product,Price,Note');
  });

  it('writes one line per row, in column order', () => {
    const csv = toCsv([{ name: 'Silk Saree', price: 4990, note: 'gift' }], columns);
    expect(lines(csv)[1]).toBe('Silk Saree,4990,gift');
  });

  it('quotes a value containing a comma, so columns do not shift', () => {
    const csv = toCsv([{ name: 'Saree, Silk', price: 4990, note: null }], columns);

    expect(lines(csv)[1]).toBe('"Saree, Silk",4990,');
    expect(lines(csv)[1].split(',')).toHaveLength(4); // the quoted comma is still one field
  });

  it('doubles an embedded quote, which is how CSV escapes one', () => {
    const csv = toCsv([{ name: 'The "Royal" Saree', price: 1, note: null }], columns);
    expect(lines(csv)[1]).toContain('"The ""Royal"" Saree"');
  });

  it('quotes a value containing a newline rather than splitting the row', () => {
    // An address with a line break must not become two rows.
    const csv = toCsv([{ name: 'A', price: 1, note: 'line one\nline two' }], columns);

    expect(csv).toContain('"line one\nline two"');
    expect(csv.split('\n')).toHaveLength(3); // header + a row that wraps onto two lines
  });

  it('writes an empty field for null and undefined, never "null"', () => {
    const csv = toCsv([{ name: 'A', price: 0, note: null }, { name: 'B', price: 0 }], columns);

    expect(lines(csv)[1]).toBe('A,0,');
    expect(lines(csv)[2]).toBe('B,0,');
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });

  it('writes zero as zero rather than as an empty field', () => {
    // `value || ''` is the bug this pins: a legitimate 0 must survive.
    const csv = toCsv([{ name: 'A', price: 0, note: null }], columns);
    expect(lines(csv)[1]).toBe('A,0,');
  });

  it('emits headers and nothing else for an empty export', () => {
    expect(toCsv([], columns)).toBe('Product,Price,Note\n');
  });
});

/* --------------------------------- errors ----------------------------------- */

describe('errorMessage', () => {
  it('prefers the message the API sent', () => {
    expect(errorMessage({ data: { message: 'Coupon has expired' } })).toBe('Coupon has expired');
  });

  it('falls back through the shapes a failure can arrive in', () => {
    expect(errorMessage({ message: 'Network request failed' })).toBe('Network request failed');
    expect(errorMessage({ error: 'TypeError: fetch failed' })).toBe('TypeError: fetch failed');
  });

  it('shows the fallback rather than "undefined" for an unrecognisable error', () => {
    expect(errorMessage({})).toMatch(/Something went wrong/);
    expect(errorMessage(null)).toMatch(/Something went wrong/);
    expect(errorMessage(undefined)).toMatch(/Something went wrong/);
  });

  it('lets the caller supply a fallback that fits the screen it is on', () => {
    expect(errorMessage(null, 'Could not save the product.')).toBe('Could not save the product.');
  });
});
