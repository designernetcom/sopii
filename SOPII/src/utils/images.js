/**
 * Central image resolver.
 * ===========================================================================
 * Every image URL in SOPII flows through this one file.
 *
 * There are two sources, in this order:
 *
 * 1. **The admin panel's media library.** Whatever a product, category,
 *    collection or banner actually points at — an uploaded photograph, a
 *    pasted URL — is resolved by `mediaUrl` and shown as-is.
 * 2. **Designed textile placeholders**, for anything with no photography yet:
 *    a deterministic SVG built from the product's own colourway and fabric, so
 *    a half-filled catalogue still reads as one coherent brand rather than a
 *    grid of broken-image icons. They are inline data URIs — no network
 *    request, nothing to fail, instant paint.
 *
 * ---------------------------------------------------------------------------
 * WHERE PHOTOGRAPHY COMES FROM
 * ---------------------------------------------------------------------------
 * Uploads live on Cloudinary. The API returns absolute `res.cloudinary.com`
 * URLs already carrying `f_auto,q_auto` and a width matched to the role the
 * image plays, so those pass through `mediaUrl` untouched and `cdn` below only
 * re-sizes them when a call site wants a different crop from the one the feed
 * chose.
 *
 * Older records store site-relative paths (`/media/products/saree-01.jpg`) for
 * files still on the API's disk. The API serves that directory at `/media`, so
 * a path means the same thing to the panel and to the shop.
 *
 *   VITE_MEDIA_URL=                          dev — Vite proxies /media to the API
 *   VITE_MEDIA_URL=https://cdn.sopii.in      production, or a CDN in front of it
 *
 * With nothing set it is derived from `VITE_API_URL`, so pointing the shop at
 * a deployed API brings its imagery along without a second variable.
 *
 * Base64 data URIs used to arrive here too — that is what made the catalogue
 * feed ~19.6 MB and pushed it past the shop's request timeout. The API strips
 * them now; a record that has not been migrated shows a generated swatch.
 */

/**
 * Where `/media/...` paths resolve. Derived from the API base with its `/api`
 * suffix removed, since the media mount is a sibling of the API, not part of it.
 */
const MEDIA_BASE = (
  import.meta.env.VITE_MEDIA_URL ??
  (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '')
).replace(/\/$/, '');

/**
 * A URL the browser can actually fetch, or `null` when there is nothing to
 * show and the caller should fall back to a generated placeholder.
 *
 * Absolute URLs and data URIs are already fetchable and pass through untouched.
 * Everything else is a path into the panel's media library and is resolved
 * against `MEDIA_BASE`. A path that resolves but 404s is not a problem:
 * `<Image>` swaps in the on-brand fallback when a load fails.
 *
 * `blob:` is the one form treated as nothing at all. Those URLs point into the
 * memory of a single admin browser tab, so one that reached a record is already
 * dead by the time the shop reads it — returning null paints the placeholder
 * straight away rather than waiting on a request that cannot succeed.
 */
export function mediaUrl(url) {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value || /^blob:/i.test(value)) return null;
  if (/^(https?:)?\/\//i.test(value) || /^data:/i.test(value)) return value;

  return `${MEDIA_BASE}${value.startsWith('/') ? '' : '/'}${value}`;
}

/* ------------------------------ CDN delivery ------------------------------- */

/**
 * Cloudinary delivery presets.
 *
 * `f_auto` picks AVIF or WebP per browser and `q_auto` picks the lowest
 * quality that survives a visual-difference check; together they are most of
 * the saving before the resize does anything. The widths are the boxes the
 * shop actually renders these in — a card is ~300 CSS px, so 600 covers a 2×
 * screen, and `dpr_auto` lets Cloudinary decide the rest from the client hint.
 *
 * The API already applies an equivalent transformation on the way out, so most
 * URLs arrive sized. This exists for the call sites that want a *different*
 * size from the one the feed chose — a gallery thumbnail off a detail image —
 * and because replacing rather than stacking a transformation makes doing both
 * harmless.
 */
const CDN_PRESETS = {
  thumb: 'f_auto,q_auto,c_fill,g_auto,w_200,h_250,dpr_auto',
  card: 'f_auto,q_auto,c_fill,g_auto,w_600,h_750,dpr_auto',
  detail: 'f_auto,q_auto,c_limit,w_1200,h_1500,dpr_auto',
  gallery: 'f_auto,q_auto,c_fill,g_auto,w_160,h_200,dpr_auto',
  bannerDesktop: 'f_auto,q_auto,c_fill,g_auto,w_1920,h_1080',
  bannerMobile: 'f_auto,q_auto,c_fill,g_auto,w_900,h_1200',
  tile: 'f_auto,q_auto,c_fill,g_auto,w_800,h_800,dpr_auto',
  auto: 'f_auto,q_auto',
};

const isCloudinary = (url) => /^https?:\/\/res\.cloudinary\.com\//i.test(url);

/**
 * Rewrites a Cloudinary URL to carry a transformation.
 *
 * Everything else passes through untouched — a `/media/...` path still served
 * off the API's disk, a pasted absolute URL, one of the generated SVG swatches
 * below. That is what makes it safe to wrap every image the shop renders,
 * whether or not the record behind it has been migrated yet.
 *
 * An existing transformation segment is replaced rather than appended, so this
 * is idempotent and composes with the sizing the API already applied.
 */
export function cdn(url, preset = 'auto') {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value || !isCloudinary(value)) return value || null;

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

  return `${head}${CDN_PRESETS[preset] ?? CDN_PRESETS.auto}/${tail}`;
}

/** `mediaUrl` and `cdn` in one call — the form nearly every adapter wants. */
export const cdnMedia = (url, preset = 'auto') => cdn(mediaUrl(url), preset);

/* ----------------------------- responsive sets ------------------------------ */

/**
 * The widths each kind of image is offered at.
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * A product card is about 300 CSS pixels on a phone and about 380 on a desktop
 * grid. Serving one 600-pixel-wide file to both means the phone — which is on
 * the slower connection, with the smaller screen and the tighter data budget —
 * downloads roughly four times the pixels it can display. Across a listing
 * page of twenty-four cards that is the single largest transfer the shop makes.
 *
 * `dpr_auto` in the presets was the previous answer, and it only works when
 * the browser sends client hints — which Safari does not, and which Chrome
 * only sends on opt-in. `srcset` works everywhere and lets the *browser*
 * choose, knowing its own viewport and pixel density, which is the one place
 * that decision can be made correctly.
 */
const SRCSET_WIDTHS = {
  card: [300, 450, 600, 900],
  detail: [600, 900, 1200, 1600],
  tile: [400, 600, 800],
  bannerDesktop: [960, 1440, 1920],
  bannerMobile: [450, 675, 900],
};

/** Aspect ratios, so a resized crop keeps the shape the preset intended. */
const SRCSET_RATIO = {
  card: 750 / 600,
  detail: null, // c_limit — height follows the original
  tile: 1,
  bannerDesktop: 1080 / 1920,
  bannerMobile: 1200 / 900,
};

/**
 * A `srcset` for one Cloudinary image, or null when there is nothing to build
 * one from.
 *
 * Returns null for a non-Cloudinary URL — a `/media/...` path off the API's
 * disk, or a generated SVG swatch — because there is no resizing service
 * behind those, and a srcset of four identical URLs makes the markup larger
 * and the page no faster.
 */
export function cdnSrcSet(url, preset = 'card') {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value || !isCloudinary(value)) return null;

  const widths = SRCSET_WIDTHS[preset];
  if (!widths) return null;

  const ratio = SRCSET_RATIO[preset];

  return widths
    .map((width) => {
      const crop = ratio
        ? `c_fill,g_auto,w_${width},h_${Math.round(width * ratio)}`
        : `c_limit,w_${width}`;
      return `${cdnWith(value, `f_auto,q_auto,${crop}`)} ${width}w`;
    })
    .join(', ');
}

/**
 * `sizes` values matched to how the shop actually lays each image out.
 *
 * `sizes` is not decoration: without it the browser assumes an image fills the
 * viewport and picks the largest candidate in the srcset, which makes the
 * srcset actively harmful on a phone. These describe the real CSS widths at
 * the real breakpoints.
 */
export const IMAGE_SIZES = {
  /** Listing grids: 2-up on a phone, 3-up on a tablet, 4-up on a desktop. */
  card: '(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 45vw',
  /** The product gallery: full width on a phone, half the page on a desktop. */
  detail: '(min-width: 1024px) 50vw, 100vw',
  /** Category tiles. */
  tile: '(min-width: 1024px) 33vw, 50vw',
  /** Full-bleed heroes. */
  banner: '100vw',
};

/** The transformation swap `cdn` performs, exposed for `cdnSrcSet`. */
function cdnWith(value, transformation) {
  const marker = '/image/upload/';
  const at = value.indexOf(marker);
  if (at === -1) return value;

  const head = value.slice(0, at + marker.length);
  let tail = value.slice(at + marker.length);

  const firstSlash = tail.indexOf('/');
  if (firstSlash > 0) {
    const segment = tail.slice(0, firstSlash);
    if (!/^v\d+$/.test(segment) && /^[a-z]{1,3}_[^/]+(,[a-z]{1,3}_[^/]+)*$/.test(segment)) {
      tail = tail.slice(firstSlash + 1);
    }
  }

  return `${head}${transformation}/${tail}`;
}

const USE_REMOTE_PHOTOS = false;
const REMOTE_BASE = 'https://cdn.sopii.com/products';

/* ------------------------------- Palette ---------------------------------- */

/** Warm paper tones for the studio backdrop behind each swatch. */
const BASE_TONES = ['#F2EADF', '#EDE4D6', '#F5EFE6', '#E9DFD0', '#F0E8DB'];

/** Pattern families, chosen by fabric. */
const PATTERNS = {
  weave: ['Cotton', 'Handloom', 'Khadi', 'Linen'],
  lustre: ['Silk', 'Chanderi', 'Organza', 'Georgette', 'Rayon'],
  motif: ['Brocade', 'Tussar'],
  metal: ['Metal'],
  grain: ['Jute', 'Leather'],
};

function patternFor(fabric) {
  const found = Object.entries(PATTERNS).find(([, list]) => list.includes(fabric));
  return found ? found[0] : 'weave';
}

/* ----------------------------- Colour maths ------------------------------- */

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const hex = (r, g, b) =>
  `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;

/** amount > 0 lightens towards white, < 0 darkens towards black. */
function shade(color, amount) {
  const [r, g, b] = rgb(color);
  const f = (c) => (amount > 0 ? c + (255 - c) * amount : c * (1 + amount));
  return hex(f(r), f(g), f(b));
}

function luminance(color) {
  const [r, g, b] = rgb(color);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Very pale colourways (Ivory, Off White) would otherwise render as a blank
 * panel. Deepen them just enough that the weave stays legible, while keeping
 * the hue recognisable.
 */
function asCloth(color) {
  const l = luminance(color);
  if (l > 0.86) return shade(color, -0.16);
  if (l > 0.78) return shade(color, -0.1);
  return color;
}

/* ------------------------------ SVG layers -------------------------------- */
/* Each layer fills a w x h panel. `variant` (0-6) drives deterministic
   differences so no two products in a row look identical.                    */

function weaveLayer(cloth, w, h, variant) {
  const warp = shade(cloth, -0.3);
  const weft = shade(cloth, 0.3);
  const gap = 6 + (variant % 3) * 2;
  const slubGap = h / (5 + (variant % 3));

  return `
    <rect width="${w}" height="${h}" fill="${cloth}"/>
    <g stroke="${warp}" stroke-width="1.6" opacity="0.42">
      ${Array.from({ length: Math.ceil(w / gap) }, (_, i) => `<line x1="${i * gap}" y1="0" x2="${i * gap}" y2="${h}"/>`).join('')}
    </g>
    <g stroke="${weft}" stroke-width="1.4" opacity="0.5">
      ${Array.from({ length: Math.ceil(h / gap) }, (_, i) => `<line x1="0" y1="${i * gap}" x2="${w}" y2="${i * gap}"/>`).join('')}
    </g>
    <g stroke="${warp}" stroke-width="5" opacity="0.3">
      ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * slubGap + (variant % 4) * 5}" x2="${w}" y2="${i * slubGap + (variant % 4) * 5}"/>`).join('')}
    </g>
    <rect x="0" y="${h * 0.82}" width="${w}" height="${h * 0.18}" fill="${shade(cloth, -0.34)}" opacity="0.85"/>
    <g stroke="${shade(cloth, 0.45)}" stroke-width="2" opacity="0.55">
      ${Array.from({ length: 4 }, (_, i) => `<line x1="0" y1="${h * 0.845 + i * (h * 0.032)}" x2="${w}" y2="${h * 0.845 + i * (h * 0.032)}"/>`).join('')}
    </g>`;
}

function lustreLayer(cloth, w, h, variant) {
  const deep = shade(cloth, -0.34);
  const sheen = shade(cloth, 0.42);
  const folds = 5 + (variant % 3);

  return `
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="0.35">
        <stop offset="0%" stop-color="${deep}"/>
        <stop offset="38%" stop-color="${sheen}"/>
        <stop offset="55%" stop-color="${cloth}"/>
        <stop offset="100%" stop-color="${deep}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <g opacity="0.5">
      ${Array.from({ length: folds }, (_, i) => {
        const x = (w / folds) * i + (variant % 3) * 8;
        return `<path d="M${x} 0 C ${x + w * 0.1} ${h * 0.35}, ${x - w * 0.06} ${h * 0.62}, ${x + w * 0.05} ${h}
                         L${x + w / folds / 2} ${h} C ${x + w * 0.14} ${h * 0.6}, ${x + w * 0.02} ${h * 0.32}, ${x + w / folds / 2} 0 Z"
                       fill="${sheen}" opacity="0.35"/>`;
      }).join('')}
    </g>
    <rect x="0" y="${h * 0.86}" width="${w}" height="${h * 0.14}" fill="${'#B08D57'}" opacity="0.55"/>
    <g stroke="${shade(cloth, 0.6)}" stroke-width="1.2" opacity="0.5">
      ${Array.from({ length: 3 }, (_, i) => `<line x1="0" y1="${h * 0.875 + i * (h * 0.035)}" x2="${w}" y2="${h * 0.875 + i * (h * 0.035)}"/>`).join('')}
    </g>`;
}

function motifLayer(cloth, w, h, variant) {
  const gold = '#B08D57';
  const deep = shade(cloth, -0.2);
  const step = 40 + (variant % 3) * 10;
  const cells = [];

  for (let y = step * 0.6; y < h * 0.84; y += step) {
    for (let x = step * 0.5; x < w + step; x += step) {
      const off = (Math.round(y / step) % 2) * (step / 2);
      const cx = x + off;
      if (cx > w) continue;
      cells.push(
        `<path d="M${cx} ${y - 10} L${cx + 9} ${y} L${cx} ${y + 10} L${cx - 9} ${y} Z" fill="none" stroke="${gold}" stroke-width="1.6" opacity="0.75"/>` +
          `<circle cx="${cx}" cy="${y}" r="2.6" fill="${gold}" opacity="0.7"/>`,
      );
    }
  }

  return `
    <rect width="${w}" height="${h}" fill="${deep}"/>
    ${cells.join('')}
    <rect x="0" y="${h * 0.84}" width="${w}" height="${h * 0.16}" fill="${gold}" opacity="0.75"/>
    <g stroke="${shade(cloth, -0.45)}" stroke-width="1.6" opacity="0.6">
      ${Array.from({ length: 4 }, (_, i) => `<line x1="0" y1="${h * 0.865 + i * (h * 0.033)}" x2="${w}" y2="${h * 0.865 + i * (h * 0.033)}"/>`).join('')}
    </g>`;
}

function metalLayer(cloth, w, h, variant) {
  const gold = '#B08D57';
  const ground = '#2A2723';
  const cx = w / 2;
  const cy = h * 0.46;
  const r = Math.min(w, h) * 0.2;

  return `
    <rect width="${w}" height="${h}" fill="${ground}"/>
    <g fill="none" stroke="${shade(cloth, 0.1)}" opacity="0.35">
      ${Array.from({ length: 5 }, (_, i) => `<circle cx="${cx}" cy="${cy}" r="${r + i * r * 0.42}" stroke-width="${i % 2 ? 0.9 : 1.7}"/>`).join('')}
    </g>
    <circle cx="${cx}" cy="${cy - r * 0.75}" r="${r * 0.3}" fill="none" stroke="${gold}" stroke-width="3"/>
    <path d="M${cx - r} ${cy} a ${r} ${r} 0 0 0 ${r * 2} 0 z" fill="${gold}" opacity="0.9"/>
    <path d="M${cx - r} ${cy} a ${r} ${r} 0 0 1 ${r * 2} 0" fill="none" stroke="${gold}" stroke-width="2.5"/>
    <g fill="${gold}">
      ${Array.from({ length: 7 }, (_, i) => {
        const t = (i / 6) * Math.PI;
        return `<circle cx="${cx - Math.cos(t) * r * 0.92}" cy="${cy + Math.sin(t) * r * 0.92 + r * 0.22}" r="${3.4 + (variant % 2)}"/>`;
      }).join('')}
    </g>
    <rect x="0" y="${h * 0.86}" width="${w}" height="${h * 0.14}" fill="${shade(cloth, -0.1)}" opacity="0.5"/>`;
}

function grainLayer(cloth, w, h, variant) {
  const dark = shade(cloth, -0.32);
  const light = shade(cloth, 0.24);
  const lines = [];

  for (let y = 0; y < h; y += 8) {
    lines.push(
      `<line x1="0" y1="${y}" x2="${w}" y2="${y + ((y / 8 + variant) % 3) - 1}" stroke="${dark}" stroke-width="3.2" opacity="0.4"/>`,
    );
  }
  for (let x = 0; x < w; x += 8) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${light}" stroke-width="2.8" opacity="0.34"/>`);
  }

  return `
    <rect width="${w}" height="${h}" fill="${cloth}"/>
    ${lines.join('')}
    <rect x="${w * 0.18}" y="${h * 0.3}" width="${w * 0.64}" height="${h * 0.42}" rx="${w * 0.03}"
          fill="none" stroke="${shade(cloth, -0.45)}" stroke-width="3" opacity="0.6"/>
    <path d="M${w * 0.32} ${h * 0.3} a ${w * 0.18} ${h * 0.13} 0 0 1 ${w * 0.36} 0"
          fill="none" stroke="${shade(cloth, -0.45)}" stroke-width="3" opacity="0.6"/>`;
}

const LAYERS = {
  weave: weaveLayer,
  lustre: lustreLayer,
  motif: motifLayer,
  metal: metalLayer,
  grain: grainLayer,
};

/* ------------------------------ Generators -------------------------------- */

const escapeText = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const toDataUri = (svg) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

/**
 * A designed product placeholder — a fabric swatch on a studio backdrop.
 *
 * @param {number} seed    Stable per-image number driving all variation.
 * @param {string} color   Hex of the product's colourway.
 * @param {string} fabric  Selects the pattern family.
 * @param {string} label   Caption printed at the foot of the card.
 */
export function productImage({
  seed = 1,
  color = '#8A6E58',
  fabric = 'Cotton',
  label = '',
  w = 900,
  h = 1125,
} = {}) {
  if (USE_REMOTE_PHOTOS) return `${REMOTE_BASE}/${seed}-${w}x${h}.webp`;

  const variant = seed % 7;
  const backdrop = BASE_TONES[seed % BASE_TONES.length];
  const cloth = asCloth(color);
  const pattern = patternFor(fabric);

  /* The swatch sits in an inset panel, leaving a paper margin — it reads as
     cloth laid on a studio backdrop rather than a flat colour fill. */
  const m = Math.round(w * 0.08);
  const pw = w - m * 2;
  const ph = Math.round(h - m * 2 - h * 0.05);
  const cap = Math.round(w * 0.024);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${backdrop}"/>
    <rect x="${m + 6}" y="${m + 8}" width="${pw}" height="${ph}" fill="#1C1A17" opacity="0.07"/>
    <svg x="${m}" y="${m}" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}">
      ${LAYERS[pattern](cloth, pw, ph, variant)}
    </svg>
    <rect x="${m}" y="${m}" width="${pw}" height="${ph}" fill="none" stroke="#1C1A17" stroke-width="1.5" opacity="0.16"/>
    <text x="${m}" y="${h - Math.round(h * 0.019)}" font-family="Georgia, serif" font-size="${cap}"
          fill="#8A6E58" letter-spacing="${(w * 0.005).toFixed(1)}">SOPII</text>
    ${
      label
        ? `<text x="${w - m}" y="${h - Math.round(h * 0.019)}" text-anchor="end"
             font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(cap * 0.72)}"
             fill="#9A9289" letter-spacing="${(w * 0.004).toFixed(1)}">${escapeText(label).toUpperCase()}</text>`
        : ''
    }
  </svg>`;

  return toDataUri(svg);
}

/**
 * A large editorial placeholder for heroes, banners and category tiles —
 * graphic and atmospheric rather than swatch-like.
 */
export function editorialImage({
  seed = 1,
  color = '#8A6E58',
  fabric = 'Silk',
  eyebrow = '',
  w = 1600,
  h = 1000,
} = {}) {
  if (USE_REMOTE_PHOTOS) return `${REMOTE_BASE}/editorial-${seed}-${w}x${h}.webp`;

  const variant = seed % 7;
  const pattern = patternFor(fabric);
  const cloth = asCloth(color);
  const deep = shade(cloth, -0.55);
  const mid = shade(cloth, -0.2);
  const soft = shade(cloth, 0.4);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stop-color="${mid}"/>
        <stop offset="100%" stop-color="${deep}"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.72" cy="0.32" r="0.66">
        <stop offset="0%" stop-color="${soft}" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="${deep}" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <rect width="${w}" height="${h}" fill="url(#bg)"/>

    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" opacity="0.32">
      ${LAYERS[pattern](soft, w, h, variant)}
    </svg>

    <rect width="${w}" height="${h}" fill="url(#glow)"/>

    <g fill="none" stroke="${soft}" opacity="0.3">
      ${Array.from({ length: 6 }, (_, i) => `<circle cx="${w * (0.7 + (variant % 3) * 0.04)}" cy="${h * 0.4}" r="${w * 0.1 + i * w * 0.07}" stroke-width="${i % 2 ? 1 : 2}"/>`).join('')}
    </g>

    <path d="M0 ${h} Q ${w * 0.32} ${h * (0.52 + (variant % 4) * 0.05)} ${w} ${h * 0.7} L ${w} ${h} Z"
          fill="${deep}" opacity="0.7"/>

    ${
      eyebrow
        ? `<text x="${w * 0.05}" y="${h * 0.94}" font-family="Helvetica, Arial, sans-serif"
             font-size="${Math.round(w * 0.013)}" fill="#FBF8F3" opacity="0.55"
             letter-spacing="${(w * 0.005).toFixed(1)}">${escapeText(eyebrow).toUpperCase()}</text>`
        : ''
    }
  </svg>`;

  return toDataUri(svg);
}

/**
 * Legacy entry point for non-product imagery (hero, banners, category tiles).
 * `tags` picks a visual family; `seed` drives deterministic variation.
 */
const TAG_PRESETS = {
  saree: { color: '#8A6E58', fabric: 'Handloom' },
  silk: { color: '#6E2434', fabric: 'Silk' },
  blouse: { color: '#B5623C', fabric: 'Cotton' },
  dress: { color: '#2E4374', fabric: 'Rayon' },
  kurta: { color: '#276A6A', fabric: 'Cotton' },
  fashion: { color: '#6B7350', fabric: 'Linen' },
  jewellery: { color: '#B08D57', fabric: 'Metal' },
  handbag: { color: '#9C4A28', fabric: 'Jute' },
  textile: { color: '#2E4374', fabric: 'Handloom' },
  cotton: { color: '#8FB2CC', fabric: 'Cotton' },
  workwear: { color: '#33312D', fabric: 'Linen' },
  wedding: { color: '#6E2434', fabric: 'Brocade' },
  evening: { color: '#1A1A1A', fabric: 'Georgette' },
  summer: { color: '#E1836C', fabric: 'Cotton' },
};

export function photo({ seed = 1, tags = 'fashion', w = 800, h = 1000 } = {}) {
  const key = String(tags).split(',')[0].trim();
  const preset = TAG_PRESETS[key] || TAG_PRESETS.fashion;

  /* Always editorial: every `photo()` call site is decorative (hero, banners,
     category tiles, social grid) and carries its own caption, so the swatch
     treatment — with its baked-in SOPII footer — would only collide with it.
     Product imagery calls productImage() directly. */
  return editorialImage({ seed, ...preset, w, h });
}

/** On-brand fallback if a remote image ever fails to load. */
export function fallbackImage(label = 'SOPII') {
  return productImage({ seed: 3, color: '#8A6E58', fabric: 'Cotton', label, w: 800, h: 1000 });
}

export const PLACEHOLDER_TONE = '#F2EADF';
