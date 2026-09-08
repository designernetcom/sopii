/*
 * Cloudinary: the one place image bytes leave this server.
 * ---------------------------------------------------------------------------
 * Product and banner imagery used to be stored as base64 data URIs inside the
 * MongoDB documents that referenced them. That works until it does not: a
 * gallery of five 400 KB photographs is 2.7 MB of BSON after the base64 tax,
 * `/api/storefront/bootstrap` grew to ~19.6 MB, and every shopper paid for the
 * full-resolution original of every image on the page before the first product
 * could paint.
 *
 * Now the bytes go to Cloudinary and the document keeps two short strings:
 *
 *     { url: 'https://res.cloudinary.com/<cloud>/image/upload/v1/...jpg',
 *       publicId: 'sopii/products/prd_0001/main' }
 *
 * `publicId` is the handle: it is what lets a replaced or deleted image take
 * its Cloudinary asset with it instead of orphaning it, and it is why the
 * field is stored alongside the URL rather than parsed back out of one.
 *
 * ---------------------------------------------------------------------------
 * CREDENTIALS
 * ---------------------------------------------------------------------------
 * Three environment variables, read once at boot. The API secret signs upload
 * and destroy requests, so anyone holding it can write to — and delete from —
 * the account: it stays on this server, is never returned by any endpoint, and
 * must never appear in a VITE_-prefixed variable or anywhere the browser
 * bundle can reach it. The admin panel uploads *through* this server for
 * exactly that reason; it never talks to Cloudinary directly.
 *
 * With nothing configured `isConfigured` is false and every upload path fails
 * loudly rather than silently writing base64 back into the database.
 */

import { createHash } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../env.js';

export interface UploadedImage {
  /** The CDN URL to store and serve. Always https. */
  url: string;
  /** The Cloudinary handle, needed to replace or destroy the asset later. */
  publicId: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
}

export const isConfigured = Boolean(
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret,
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

/** Thrown for anything the caller could fix — a missing config, a bad payload. */
export class CloudinaryError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'CloudinaryError';
    this.status = status;
  }
}

function assertConfigured(): void {
  if (!isConfigured) {
    throw new CloudinaryError(
      'Image storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET on the server.',
      503,
    );
  }
}

/**
 * Asks Cloudinary whether the configured credentials actually work.
 *
 * Worth one round trip before any batch job. A wrong API secret is not
 * reported as "wrong API secret" — every upload fails individually with
 * `Invalid Signature`, which reads like a bug in the signing code rather than
 * a typo in `.env`. One truncated secret produced 352 of those in a single
 * migration run before anyone looked at the credential.
 */
export async function verifyCredentials(): Promise<void> {
  assertConfigured();
  try {
    await cloudinary.api.ping();
  } catch (error) {
    const message =
      (error as { error?: { message?: string } })?.error?.message ??
      (error as { message?: string })?.message ??
      'unknown error';
    throw new CloudinaryError(
      `Cloudinary rejected the configured credentials (${message}). ` +
        `Check CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in server/.env — ` +
        `an API secret is 27 characters and can begin with '-', which is easy to lose to a copy-paste.`,
      401,
    );
  }
}

/* --------------------------------- folders --------------------------------- */

/**
 * Cloudinary public ids are path-like, and the path is the only grouping the
 * media console gives you. One folder per record means an admin can see
 * everything belonging to a product in one place, and a stray asset is
 * traceable to the document that made it.
 */
const ROOT = (env.cloudinary.folder || 'sopii').replace(/^\/+|\/+$/g, '');

/** Anything that is not safe in a public id path segment. */
const sanitizeSegment = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'item';

export const productFolder = (productId?: string | null) =>
  productId ? `${ROOT}/products/${sanitizeSegment(productId)}` : `${ROOT}/products/unassigned`;

export const bannerFolder = (bannerId?: string | null) =>
  bannerId ? `${ROOT}/banners/${sanitizeSegment(bannerId)}` : `${ROOT}/banners/unassigned`;

/** The media library's own folders — `products`, `banners`, `avatars`, … */
export const libraryFolder = (folder?: string | null) =>
  `${ROOT}/library/${sanitizeSegment(folder || 'other')}`;

/* --------------------------------- uploads --------------------------------- */

const DATA_URI = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/;

/**
 * The raster formats a storefront actually needs (§17, insecure file uploads).
 *
 * Two things are excluded on purpose, and SVG is the one that matters. An SVG
 * is an XML document that may contain `<script>`, and Cloudinary serves it as
 * `image/svg+xml` from a domain the store links to. Rendered through `<img>`
 * — which is how every image in SOPII is rendered — scripts inside it do not
 * execute, so this is not an active hole today. It becomes one the moment
 * somebody inlines a logo, opens an asset in a new tab, or a CDN in front of
 * Cloudinary rewrites a content type. Refusing the format costs nothing and
 * removes the whole class.
 *
 * PDF is excluded for the same reason: Cloudinary treats it as an image
 * resource, and it is an executable document format.
 *
 * Enforced by Cloudinary itself rather than by inspecting the bytes here: the
 * `Content-Type` in a data URI is whatever the caller typed, so trusting it is
 * not validation. Cloudinary decodes the file and rejects it if the real
 * format is not on this list.
 */
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'];

/** The declared MIME types that can correspond to the formats above. */
const ALLOWED_MIME = /^image\/(jpe?g|png|webp|avif|gif)$/i;

/** True for the base64 payloads this migration exists to get rid of. */
export const isDataUri = (value?: string | null) => /^data:/i.test(value ?? '');

/** True for a URL already served by Cloudinary. */
export function isCloudinaryUrl(value?: string | null): boolean {
  if (!value) return false;
  return /^https?:\/\/res\.cloudinary\.com\//i.test(value);
}

/**
 * Decoded size of a data URI, without materialising the buffer. base64 carries
 * 3 bytes in every 4 characters, minus whatever the trailing `=` padding
 * stands in for.
 */
export function dataUriBytes(value: string): number {
  const base64 = value.slice(value.indexOf(',') + 1).replace(/\s/g, '');
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** The largest image accepted, decoded. */
export const MAX_UPLOAD_BYTES = env.cloudinary.maxUploadBytes;

export interface UploadOptions {
  /** Cloudinary folder, e.g. `sopii/products/prd_0001`. */
  folder: string;
  /** Leaf name inside the folder. Randomised by Cloudinary when omitted. */
  publicId?: string;
  /** Replace an asset at the same public id rather than erroring. */
  overwrite?: boolean;
  tags?: string[];
}

/**
 * Uploads one image and answers the two fields a document should keep.
 *
 * `source` is a data URI, an http(s) URL Cloudinary can fetch, or a Buffer.
 * Nothing is written to MongoDB by this function — the caller saves the result
 * only once it has one, which is what keeps a failed upload from leaving a
 * half-written image record behind.
 */
export async function uploadImage(
  source: string | Buffer,
  options: UploadOptions,
): Promise<UploadedImage> {
  assertConfigured();

  let payload: string;
  if (Buffer.isBuffer(source)) {
    payload = `data:image/jpeg;base64,${source.toString('base64')}`;
  } else {
    payload = source.trim();
    if (isDataUri(payload)) {
      const match = DATA_URI.exec(payload);
      if (!match) {
        throw new CloudinaryError('Only base64-encoded image data URIs can be uploaded', 400);
      }
      /*
       * A first, cheap refusal on the declared type — so an obviously wrong
       * upload fails here instead of after megabytes have crossed the wire to
       * Cloudinary. It is not the real check: the header is caller-supplied.
       * `allowed_formats` below is, because Cloudinary decodes the bytes.
       */
      if (!ALLOWED_MIME.test(match[1])) {
        throw new CloudinaryError(
          `${match[1]} images are not accepted. Use JPEG, PNG, WebP, AVIF or GIF.`,
          415,
        );
      }
      const bytes = dataUriBytes(payload);
      if (bytes > MAX_UPLOAD_BYTES) {
        throw new CloudinaryError(
          `Image is ${(bytes / 1048576).toFixed(1)} MB — the limit is ${(MAX_UPLOAD_BYTES / 1048576).toFixed(0)} MB`,
          413,
        );
      }
    } else if (!/^https?:\/\//i.test(payload)) {
      throw new CloudinaryError('Expected a data URI or an http(s) URL to upload', 400);
    } else {
      /*
       * The remote-fetch branch: Cloudinary is asked to pull the URL itself.
       *
       * Cloudinary does the fetching, not this server, so this is not an SSRF
       * into the store's own network — but an authenticated admin should still
       * not be able to point the account's fetcher at a private address, and a
       * loopback or link-local URL is never a legitimate product photograph.
       * Refusing the obvious ones is cheap; the caller can always upload the
       * bytes instead.
       */
      const host = (() => {
        try {
          return new URL(payload).hostname.toLowerCase();
        } catch {
          return '';
        }
      })();

      const isPrivate =
        !host ||
        host === 'localhost' ||
        host === '::1' ||
        host.endsWith('.local') ||
        host.endsWith('.internal') ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^169\.254\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host);

      if (isPrivate) {
        throw new CloudinaryError('That URL cannot be fetched. Upload the image instead.', 400);
      }
    }
  }

  try {
    const result = await cloudinary.uploader.upload(payload, {
      folder: options.folder,
      public_id: options.publicId,
      overwrite: options.overwrite ?? true,
      /* Two names for the same bytes is two bills for the same bytes. With no
         explicit id, let Cloudinary derive one rather than collide on
         `upload.jpg` for every file anybody ever named that. */
      unique_filename: !options.publicId,
      resource_type: 'image',
      /*
       * The real format check. Cloudinary decodes the file and rejects it if
       * what it actually is does not appear here — which is the only way to
       * validate a format, since every byte of the request came from a caller.
       */
      allowed_formats: ALLOWED_FORMATS,
      invalidate: true,
      tags: options.tags,
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      format: result.format,
    };
  } catch (error) {
    const message =
      (error as { message?: string })?.message ??
      (error as { error?: { message?: string } })?.error?.message ??
      'Upload failed';
    throw new CloudinaryError(`Cloudinary upload failed: ${message}`);
  }
}

/**
 * Removes an asset. Deliberately forgiving: a public id that is already gone,
 * or that belongs to another account, is not a reason to fail the request that
 * was deleting the record referencing it.
 *
 * Answers whether Cloudinary reported the asset as removed.
 */
export async function destroyImage(publicId?: string | null): Promise<boolean> {
  if (!publicId || !isConfigured) return false;
  try {
    const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    return result?.result === 'ok';
  } catch (error) {
    console.warn(`[cloudinary] could not destroy ${publicId}:`, (error as Error)?.message ?? error);
    return false;
  }
}

/** Cleanup for a set of ids, used when a record is deleted or an image replaced. */
export async function destroyImages(publicIds: (string | null | undefined)[]): Promise<number> {
  const ids = [...new Set(publicIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return 0;
  const results = await Promise.all(ids.map(destroyImage));
  return results.filter(Boolean).length;
}

/* ------------------------------ transformations ----------------------------- */

/**
 * The delivery presets. Every storefront image is served through one of these
 * rather than at its original resolution — a 4000 px phone photograph is 4 MB
 * to fetch and 200 px wide on a product card.
 *
 * `f_auto` picks AVIF/WebP per browser and `q_auto` picks the quality that
 * survives a visual-difference check; together they are worth 60-80% off the
 * transfer before the resize does anything.
 */
export const IMAGE_PRESETS = {
  /** Cart lines, search results, admin tables. */
  thumb: 'f_auto,q_auto,c_fill,g_auto,w_200,h_250,dpr_auto',
  /** Product cards on listing and home pages. */
  card: 'f_auto,q_auto,c_fill,g_auto,w_600,h_750,dpr_auto',
  /** The main image on a product page, and its lightbox. */
  detail: 'f_auto,q_auto,c_limit,w_1200,h_1500,dpr_auto',
  /** The gallery's thumbnail rail. */
  gallery: 'f_auto,q_auto,c_fill,g_auto,w_160,h_200,dpr_auto',
  /** Desktop hero and editorial banners. */
  bannerDesktop: 'f_auto,q_auto,c_fill,g_auto,w_1920,h_1080',
  /** Phone hero — the portrait crop the shop actually shows on a phone. */
  bannerMobile: 'f_auto,q_auto,c_fill,g_auto,w_900,h_1200',
  /** Category and collection tiles. */
  tile: 'f_auto,q_auto,c_fill,g_auto,w_800,h_800,dpr_auto',
  /** Anything with no better idea — format and quality only, no resize. */
  auto: 'f_auto,q_auto',
} as const;

export type ImagePreset = keyof typeof IMAGE_PRESETS;

/**
 * Rewrites a Cloudinary delivery URL to carry a transformation.
 *
 * Anything that is not a Cloudinary URL — a `/media/...` path still served off
 * disk, an absolute URL someone pasted, a generated placeholder — passes
 * through untouched, which is what keeps this safe to apply to every image
 * field during the transition.
 *
 * An existing transformation segment is replaced rather than stacked, so
 * calling this twice is the same as calling it once.
 */
export function withTransform(url: string | null | undefined, preset: ImagePreset = 'auto'): string {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value || !isCloudinaryUrl(value)) return value;

  const marker = '/image/upload/';
  const at = value.indexOf(marker);
  if (at === -1) return value;

  const head = value.slice(0, at + marker.length);
  let tail = value.slice(at + marker.length);

  /* Drop a transformation an earlier call put there. A version segment
     (`v1712345678`) and the public id itself are left alone: only a leading
     segment shaped like `key_value,key_value` is a transformation. */
  const firstSlash = tail.indexOf('/');
  if (firstSlash > 0) {
    const segment = tail.slice(0, firstSlash);
    if (!/^v\d+$/.test(segment) && /^[a-z]{1,3}_[^/]+(,[a-z]{1,3}_[^/]+)*$/.test(segment)) {
      tail = tail.slice(firstSlash + 1);
    }
  }

  return `${head}${IMAGE_PRESETS[preset]}/${tail}`;
}

/**
 * A stable public id for a migrated image, derived from the record and the
 * bytes. Re-running the migration over an image it already moved lands on the
 * same id, so a half-finished run resumes instead of duplicating.
 */
export function derivedPublicId(prefix: string, source: string): string {
  const digest = createHash('sha1').update(source).digest('hex').slice(0, 12);
  return `${sanitizeSegment(prefix)}-${digest}`;
}
