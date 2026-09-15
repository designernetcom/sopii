/* Formatting helpers — Indian locale/currency conventions used across SOPII. */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFmt = new Intl.NumberFormat('en-IN');

export function formatCurrency(value: number, precise = false) {
  if (!Number.isFinite(value)) return '₹0';
  return precise ? inrPrecise.format(value) : inr.format(value);
}

/** Compact Indian notation — 1.2L, 45.6K, 2.4Cr. */
export function formatCompactCurrency(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${Math.round(value)}`;
}

export function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return numberFmt.format(value);
}

export function formatCompactNumber(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${(value / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return numberFmt.format(value);
}

export function formatPercent(value: number, digits = 1) {
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function formatDate(value?: string | Date | null, withTime = false) {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  const base = date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  if (!withTime) return base;
  const time = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${base}, ${time}`;
}

export function formatDateInput(value?: string | Date | null) {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `<input type="datetime-local">` value, in the admin's own timezone. */
export function formatDateTimeInput(value?: string | Date | null) {
  const day = formatDateInput(value);
  if (!day) return '';
  const date = typeof value === 'string' ? new Date(value) : (value as Date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatRelativeTime(value?: string | Date | null) {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function titleCase(value: string) {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function discountPercent(mrp: number, price: number) {
  if (!mrp || mrp <= 0 || price >= mrp) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

export function truncate(value: string, max = 60) {
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}
