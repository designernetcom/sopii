/* Client-side export helpers (CSV / Excel-compatible XML / print). */

export interface ExportColumn<T> {
  key: string;
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCsv(value: unknown) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/["\n,]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]) {
  const head = columns.map((c) => escapeCsv(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsv(c.value(row))).join(',')).join('\n');
  return `${head}\n${body}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv<T>(filename: string, rows: T[], columns: ExportColumn<T>[]) {
  const csv = toCsv(rows, columns);
  // BOM keeps Excel happy with UTF-8 (₹ symbol, names with diacritics).
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Excel opens an HTML table saved as .xls natively — avoids shipping a
 * spreadsheet library for what is a mock-data export.
 */
export function downloadExcel<T>(filename: string, rows: T[], columns: ExportColumn<T>[]) {
  const head = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(c.value(row))}</td>`).join('')}</tr>`)
    .join('');
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  const blob = new Blob([`﻿${html}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.xls') ? filename : `${filename}.xls`);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`);
}

export function printPage() {
  window.print();
}
