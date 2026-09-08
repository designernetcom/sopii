/*
 * Image uploads.
 * ---------------------------------------------------------------------------
 * The single door between the admin panel and Cloudinary:
 *
 *     panel → POST /api/uploads/image → Cloudinary → { url, publicId } → panel
 *                                                                          ↓
 *                                                          saved on the record
 *
 * The panel never signs a Cloudinary request itself, and deliberately so. An
 * unsigned browser upload needs an upload preset that anyone reading the
 * bundle can replay against the account, and a signed one needs the API
 * secret in the bundle, which is worse. Routing the bytes through here costs
 * one hop and keeps the credential on the server.
 *
 * These handlers only ever *upload*. Nothing here writes to MongoDB: the panel
 * puts the returned `{ url, publicId }` on the product or banner it is editing
 * and saves that record the way it always did, so a failed upload leaves the
 * record exactly as it was rather than half-written.
 */

import { Router } from 'express';
import {
  CloudinaryError,
  bannerFolder,
  destroyImage,
  isConfigured,
  libraryFolder,
  MAX_UPLOAD_BYTES,
  productFolder,
  uploadImage,
  type UploadedImage,
} from '../lib/cloudinary.js';
import { requirePermission } from '../lib/auth.js';
import { ah, badRequest, HttpError, str } from '../lib/http.js';

export const uploadRoutes = Router();

/** The record kinds that get their own Cloudinary folder. */
type Scope = 'product' | 'banner' | 'library';

function folderFor(scope: Scope, ownerId?: string, folder?: string): string {
  if (scope === 'product') return productFolder(ownerId);
  if (scope === 'banner') return bannerFolder(ownerId);
  return libraryFolder(folder ?? ownerId);
}

/** Cloudinary's own errors carry a status worth passing through verbatim. */
function rethrow(error: unknown): never {
  if (error instanceof CloudinaryError) throw new HttpError(error.status, error.message);
  throw error;
}

interface IncomingImage {
  /** A base64 data URI, or an http(s) URL for Cloudinary to fetch. */
  data?: string;
  /** Accepted as an alias so a media-library payload can be posted unchanged. */
  url?: string;
  name?: string;
  alt?: string;
}

/**
 * Tells the panel whether uploads will work before it lets someone pick a file,
 * so a missing configuration surfaces as a disabled button with a reason rather
 * than a failed upload after the wait.
 */
uploadRoutes.get(
  '/status',
  ah(async (_req, res) => {
    res.json({ configured: isConfigured, maxBytes: MAX_UPLOAD_BYTES, provider: 'cloudinary' });
  }),
);

/**
 * One or many images, in one request.
 *
 * `scope` and `ownerId` decide the folder: `sopii/products/{productId}`,
 * `sopii/banners/{bannerId}`, or `sopii/library/{folder}` for the media
 * library. A product being created has no id yet, so its uploads land in
 * `sopii/products/unassigned` — the asset is real and the URL works; only the
 * filing is provisional.
 *
 * Partial success is reported rather than hidden: `images` holds what landed
 * and `failed` holds what did not, so a gallery of five where the fourth was
 * corrupt still adds four and says why the fifth is missing.
 */
uploadRoutes.post(
  '/image',
  requirePermission('media', 'create'),
  ah(async (req, res) => {
    const body = req.body as {
      scope?: Scope;
      ownerId?: string;
      folder?: string;
      image?: IncomingImage | string;
      images?: (IncomingImage | string)[];
    };

    const raw = body.images ?? (body.image ? [body.image] : []);
    if (!raw.length) badRequest('No image supplied');
    if (raw.length > 20) badRequest('Upload at most 20 images at a time');

    const scope: Scope = body.scope === 'product' || body.scope === 'banner' ? body.scope : 'library';
    const folder = folderFor(scope, body.ownerId, body.folder);

    const uploaded: (UploadedImage & { name?: string; alt?: string })[] = [];
    const failed: { name?: string; message: string }[] = [];

    /*
     * Sequential on purpose. Twenty parallel uploads of a few megabytes each
     * is a good way to hit Cloudinary's concurrency limit and get a batch of
     * 420s back, and the panel is uploading a gallery, not a bulk import.
     */
    for (const entry of raw) {
      const item: IncomingImage = typeof entry === 'string' ? { data: entry } : entry;
      const source = (item.data ?? item.url ?? '').trim();

      if (!source) {
        failed.push({ name: item.name, message: 'No image data' });
        continue;
      }

      try {
        const result = await uploadImage(source, {
          folder,
          tags: [scope, body.ownerId].filter((tag): tag is string => Boolean(tag)),
        });
        uploaded.push({ ...result, name: item.name, alt: item.alt });
      } catch (error) {
        if (error instanceof CloudinaryError && error.status === 503) rethrow(error);
        failed.push({
          name: item.name,
          message: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    }

    // Nothing landed and the caller asked for one thing: that is a failure, not
    // a 201 with an empty list.
    if (!uploaded.length) {
      throw new HttpError(502, failed[0]?.message ?? 'Upload failed');
    }

    res.status(201).json({ images: uploaded, failed });
  }),
);

/**
 * Destroys an asset by public id.
 *
 * Used when an admin discards an image they *just* uploaded and has not saved
 * the record — nothing references it, so leaving it would be a paid-for
 * orphan. Images already on a saved record are reaped by the record's own
 * writer instead (see `products.ts` and the banner handlers in `cms.ts`),
 * which knows what the record still points at.
 */
uploadRoutes.delete(
  '/image',
  requirePermission('media', 'delete'),
  ah(async (req, res) => {
    const publicId = str(req.query, 'publicId') ?? (req.body as { publicId?: string })?.publicId;
    if (!publicId) badRequest('publicId is required');

    const removed = await destroyImage(publicId);
    res.json({ publicId, removed });
  }),
);
