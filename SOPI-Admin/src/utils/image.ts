/*
 * Image resolution.
 *
 * Uploads live on Cloudinary and a record keeps its `secure_url` — those are
 * absolute URLs and pass straight through, resized on the way to the browser
 * by `cdnUrl` below.
 *
 * Older records store realistic asset paths (`/media/...`). Product
 * photography is shipped in `public/media/products/`, so those paths are real
 * requests and pass straight through too. The rest of `/media/` (banners,
 * avatars, library uploads) has no files behind it and is rendered as a
 * deterministic generated placeholder instead of firing a request that would
 * 404. Data URIs also pass through, so a record that predates the migration
 * still previews while it waits for one.
 */

const PALETTES: [string, string][] = [
  ['#efe6dd', '#cbb7a4'],
  ['#e7ecf3', '#b6c4d8'],
  ['#f3e6ea', '#d9b3c1'],
  ['#e6efe9', '#aecabb'],
  ['#f5ece0', '#dcc39b'],
  ['#eae7f4', '#bdb4dd'],
  ['#f4e9e4', '#d7b3a4'],
  ['#e4eef0', '#a9c9cf'],
];

export function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Served for real out of `public/`, so never stand in a placeholder for these. */
const REAL_ASSET_PREFIXES = ['/media/products/', 'media/products/'];

export function isPlaceholderPath(src?: string | null) {
  if (!src) return true;
  if (REAL_ASSET_PREFIXES.some((prefix) => src.startsWith(prefix))) return false;
  return src.startsWith('/media/') || src.startsWith('media/');
}

/** Deterministic soft-gradient tile with a monogram — no network required. */
export function placeholderDataUri(seed: string, label?: string) {
  const [from, to] = PALETTES[hashString(seed) % PALETTES.length];
  const text = (label ?? seed)
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const angle = hashString(seed) % 90;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<defs><linearGradient id="g" gradientTransform="rotate(${angle})"><stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#g)"/>
<circle cx="330" cy="72" r="120" fill="#ffffff" opacity="0.16"/>
<circle cx="70" cy="340" r="90" fill="#ffffff" opacity="0.12"/>
<text x="50%" y="50%" dy="0.36em" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="112" font-weight="600" fill="#24201d" opacity="0.32">${text}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function resolveImageSrc(src: string | undefined | null, seed: string, label?: string) {
  if (!src || isPlaceholderPath(src)) return placeholderDataUri(src || seed, label ?? seed);
  return src;
}

/** Wide banner variant for hero/collection imagery. */
export function placeholderBanner(seed: string, label: string) {
  const [from, to] = PALETTES[hashString(seed) % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs>
<rect width="1200" height="420" fill="url(#g)"/>
<circle cx="1020" cy="90" r="200" fill="#ffffff" opacity="0.16"/>
<circle cx="180" cy="380" r="150" fill="#ffffff" opacity="0.10"/>
<text x="60" y="220" font-family="Inter, system-ui, sans-serif" font-size="52" font-weight="600" fill="#24201d" opacity="0.45">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ------------------------------ CDN delivery ------------------------------- */

/**
 * The delivery presets, mirroring the ones the storefront API applies. The
 * panel renders the same photographs in far smaller boxes than the shop does —
 * a 48 px table thumbnail should not be a 4000 px phone photograph.
 */
const CDN_PRESETS = {
  /** Table rows, picker tiles, the order line items. */
  thumb: 'f_auto,q_auto,c_fill,g_auto,w_200,h_250,dpr_auto',
  /** Gallery tiles in the product form and the media grid. */
  tile: 'f_auto,q_auto,c_fill,g_auto,w_400,h_500,dpr_auto',
  /** Banner previews in the homepage editor. */
  banner: 'f_auto,q_auto,c_fill,g_auto,w_960,h_540,dpr_auto',
  /** The lightbox, where someone is actually inspecting the photograph. */
  full: 'f_auto,q_auto,c_limit,w_1600,h_1600',
  /** Format and quality only — no resize. */
  auto: 'f_auto,q_auto',
} as const;

export type CdnPreset = keyof typeof CDN_PRESETS;

const isCloudinary = (url: string) => /^https?:\/\/res\.cloudinary\.com\//i.test(url);

/**
 * Rewrites a Cloudinary URL to carry a transformation, and leaves everything
 * else alone — a `/media/...` path, a pasted URL, a generated placeholder, a
 * data URI from a record that has not been migrated yet.
 *
 * `f_auto` picks AVIF or WebP per browser and `q_auto` picks the lowest
 * quality that survives a visual-difference check; between them they are worth
 * most of the transfer before the resize does anything. Replacing rather than
 * stacking an existing transformation makes this safe to call twice.
 */
export function cdnUrl(url: string | null | undefined, preset: CdnPreset = 'auto'): string {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value || !isCloudinary(value)) return value;

  const marker = '/image/upload/';
  const at = value.indexOf(marker);
  if (at === -1) return value;

  const head = value.slice(0, at + marker.length);
  let tail = value.slice(at + marker.length);

  const firstSlash = tail.indexOf('/');
  if (firstSlash > 0) {
    const segment = tail.slice(0, firstSlash);
    // A version segment (`v1712…`) and the public id are not transformations.
    if (!/^v\d+$/.test(segment) && /^[a-z]{1,3}_[^/]+(,[a-z]{1,3}_[^/]+)*$/.test(segment)) {
      tail = tail.slice(firstSlash + 1);
    }
  }

  return `${head}${CDN_PRESETS[preset]}/${tail}`;
}

/* -------------------------------- uploads ---------------------------------- */

/**
 * The largest file the gallery and the media library will take.
 *
 * Files are posted to the API as base64 data URIs, which inflate by roughly a
 * third, so this has to stay comfortably under the API's 25 MB JSON body
 * limit — and under whatever `CLOUDINARY_MAX_UPLOAD_BYTES` allows on the
 * server, which is the limit that actually rejects the upload.
 *
 * The bytes are a transport format only. They go browser → API → Cloudinary
 * and what comes back is a URL: nothing base64 is stored on a record.
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface ReadImageResult {
  name: string;
  /** A data URI — survives a reload, a different tab and a different origin. */
  url: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
}

/**
 * Reads a picked file into a data URI, with its natural dimensions.
 *
 * Deliberately *not* `URL.createObjectURL`: an object URL is a pointer into the
 * memory of the tab that created it. It previews fine while that tab is open
 * and is dead everywhere else — after a reload, and on the shop front, which is
 * a different origin entirely. Anything destined for a saved record has to be
 * bytes the server can forward.
 *
 * The data URI this produces is the *request body* for `/api/uploads/image`,
 * and it stops there. The server uploads the bytes to Cloudinary and answers
 * with `{ url, publicId }`; that pair is what reaches a record. Base64 never
 * gets as far as MongoDB.
 */
export function readImageFile(file: File): Promise<ReadImageResult> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_BYTES) {
      reject(
        new Error(
          `${file.name} is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${(
            MAX_IMAGE_BYTES / 1048576
          ).toFixed(0)} MB`,
        ),
      );
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const url = String(reader.result);
      const base = {
        name: file.name,
        url,
        mimeType: file.type || 'image/jpeg',
        size: file.size,
      };
      const image = new Image();
      // Dimensions are a nicety; a file we cannot decode still uploads.
      image.onload = () =>
        resolve({ ...base, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ ...base, width: 1200, height: 1600 });
      image.src = url;
    };
    reader.readAsDataURL(file);
  });
}
