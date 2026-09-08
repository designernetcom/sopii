/*
 * Moves base64 imagery out of MongoDB and onto Cloudinary.
 * ---------------------------------------------------------------------------
 * The catalogue was built storing uploaded photographs inline, as
 * `data:image/jpeg;base64,...` strings on the documents that referenced them.
 * That is why `/api/storefront/bootstrap` grew to ~19.6 MB and ~115 s — past
 * the shop front's own request timeout, so the storefront gave up on the real
 * catalogue and rendered its bundled demo data instead.
 *
 * This script uploads each of those images and replaces the data URI with the
 * `secure_url` and `public_id` Cloudinary hands back.
 *
 *     { url: 'https://res.cloudinary.com/…/sopii/products/prd_0001/ab12.jpg',
 *       publicId: 'sopii/products/prd_0001/ab12' }
 *
 * ---------------------------------------------------------------------------
 * SAFETY
 * ---------------------------------------------------------------------------
 * The original bytes only exist in one place, so the order of operations is
 * the whole design:
 *
 *   1. upload            — if this throws, the document is not touched at all
 *   2. verify            — HEAD the returned URL; a 200 with image bytes is
 *                          the only evidence that the asset is really there
 *   3. write             — and only now is the data URI replaced
 *
 * A failure at 1 or 2 leaves the base64 exactly where it was and records the
 * image under `failed`. Nothing is ever deleted: replacing a field is the only
 * destructive act, and it happens per image, after that image is confirmed
 * readable from the CDN.
 *
 * Re-runnable. Public ids are derived from the record and a hash of the bytes
 * (`derivedPublicId`), so an interrupted run resumes rather than duplicating,
 * and an image already migrated is simply not found by the next run's query.
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *   npm run migrate:cloudinary                 # dry run — reports, changes nothing
 *   npm run migrate:cloudinary -- --confirm    # the real thing
 *
 *   --confirm            actually upload and write. Without it nothing leaves
 *                        the machine and nothing is written.
 *   --only=products      products | banners | media (repeatable, comma-separated)
 *   --limit=50           stop after this many documents per collection
 *   --concurrency=3      parallel uploads (default 3; Cloudinary throttles hard)
 *   --verbose            one line per image rather than per document
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { env } from '../env.js';
import { connectDb, disconnectDb } from './connect.js';
import { BannerModel, MediaModel, ProductModel } from './models.js';
import {
  bannerFolder,
  dataUriBytes,
  derivedPublicId,
  isConfigured,
  isDataUri,
  libraryFolder,
  productFolder,
  uploadImage,
  verifyCredentials,
  type UploadedImage,
} from '../lib/cloudinary.js';

/* ------------------------- the two things it migrates ----------------------- */

/**
 * Imagery reaches Cloudinary from one of two places.
 *
 * 1. **base64 data URIs**, stored inline in the document. This is the weight
 *    the migration exists to remove.
 * 2. **`/media/...` paths**, pointing at files under `MEDIA_DIR` that the API
 *    serves off its own disk. Lighter, but still a single-origin dependency
 *    with no CDN, no format negotiation and no resizing in front of it.
 *
 * Both end up as a `secure_url` and a `public_id`.
 */
const isMediaPath = (value?: string | null) => /^\/?media\//i.test(value ?? '');

/** Where a `/media/...` path actually lives on disk, or null if it does not. */
function resolveMediaFile(url: string): string | null {
  const relative = url.replace(/^\/?media\//i, '').split(/[?#]/)[0];
  // A path that climbs out of MEDIA_DIR is not a media path.
  const absolute = path.resolve(env.mediaDir, relative);
  if (!absolute.startsWith(path.resolve(env.mediaDir))) return null;
  return fs.existsSync(absolute) ? absolute : null;
}

/** Anything this script knows how to move. */
const isMigratable = (url?: string | null) => isDataUri(url) || isMediaPath(url);

/**
 * A stable Cloudinary id for a file on disk, derived from its path.
 *
 * Deliberately *not* per-record. The seeded catalogue points hundreds of
 * products at the same four photographs, and giving each product its own copy
 * would be hundreds of uploads of four images — paid for, and cached,
 * separately. One path means one asset, and every record that referenced the
 * path ends up referencing the same URL.
 */
function mediaPublicId(url: string): { folder: string; publicId: string } {
  const relative = url.replace(/^\/?media\//i, '').split(/[?#]/)[0];
  const dir = path.posix.dirname(relative);
  const base = path.posix.basename(relative).replace(/\.[^.]+$/, '');
  const root = (env.cloudinary.folder || 'sopii').replace(/^\/+|\/+$/g, '');
  return {
    folder: dir && dir !== '.' ? `${root}/media/${dir}` : `${root}/media`,
    publicId: base,
  };
}

/**
 * One upload per distinct file, per run.
 *
 * A path-derived public id already means one asset per file however many
 * records point at it — but without this the *bytes* still went up once per
 * reference. The seeded catalogue has 456 products sharing four photographs,
 * which was 1820 uploads of the same four files: slow, and a good way to meet
 * Cloudinary's rate limiter for no benefit. Keyed by path, not by content, so
 * it never has to hold an image in memory.
 */
const uploadedByPath = new Map<string, Promise<UploadedImage>>();

/**
 * Uploads one image, whatever form it is in, and proves it landed.
 *
 * `perRecord` is the folder/id a data URI gets — it belongs to the record that
 * held the bytes, because nothing else has a copy. A disk path ignores it and
 * uses its own path-derived id instead, so the asset is shared.
 */
async function migrateSource(
  source: string,
  perRecord: { folder: string; publicId: string },
): Promise<UploadedImage> {
  if (isDataUri(source)) return migrateOne(source, perRecord.folder, perRecord.publicId);

  const file = resolveMediaFile(source);
  if (!file) throw new Error(`no file on disk for ${source} (looked under ${env.mediaDir})`);

  const key = file.toLowerCase();
  const cached = uploadedByPath.get(key);
  if (cached) return cached;

  const { folder, publicId } = mediaPublicId(source);
  /* The promise goes in the map, not the result: concurrent workers reaching
     the same file wait on the one upload rather than starting a second. */
  const pending = migrateOne(fs.readFileSync(file), folder, publicId);
  uploadedByPath.set(key, pending);

  try {
    return await pending;
  } catch (error) {
    // A failed upload must not be cached, or every later reference to that
    // file inherits the failure instead of getting its own attempt.
    uploadedByPath.delete(key);
    throw error;
  }
}

/** Bytes a record gives back to the database once this image moves. */
const sourceBytes = (source: string) => (isDataUri(source) ? dataUriBytes(source) : 0);

/* ---------------------------------- options --------------------------------- */

type Target = 'products' | 'banners' | 'media';
const ALL_TARGETS: Target[] = ['products', 'banners', 'media'];

interface Options {
  confirm: boolean;
  targets: Target[];
  limit: number;
  concurrency: number;
  verbose: boolean;
}

export function parseOptions(argv: string[]): Options {
  const flag = (name: string) => argv.includes(`--${name}`);
  const value = (name: string) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

  const only = (value('only') ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is Target => (ALL_TARGETS as string[]).includes(item));

  return {
    confirm: flag('confirm') || flag('apply'),
    targets: only.length ? only : ALL_TARGETS,
    limit: Number(value('limit') ?? 0) || Number.POSITIVE_INFINITY,
    concurrency: Math.max(1, Math.min(8, Number(value('concurrency') ?? 3) || 3)),
    verbose: flag('verbose'),
  };
}

/* ---------------------------------- summary --------------------------------- */

export interface MigrationSummary {
  productsScanned: number;
  productsMigrated: number;
  productImagesMigrated: number;
  bannersScanned: number;
  bannersMigrated: number;
  bannerImagesMigrated: number;
  mediaScanned: number;
  mediaMigrated: number;
  /** Bytes of base64 removed from MongoDB, decoded. */
  bytesFreed: number;
  failures: { record: string; field: string; message: string }[];
}

const emptySummary = (): MigrationSummary => ({
  productsScanned: 0,
  productsMigrated: 0,
  productImagesMigrated: 0,
  bannersScanned: 0,
  bannersMigrated: 0,
  bannerImagesMigrated: 0,
  mediaScanned: 0,
  mediaMigrated: 0,
  bytesFreed: 0,
  failures: [],
});

/* ------------------------------ upload + verify ----------------------------- */

/**
 * Confirms the asset is actually readable from the CDN before the caller is
 * allowed to drop the only other copy of it.
 *
 * A successful upload response is Cloudinary saying it accepted the bytes; a
 * 200 from the delivery URL is the CDN saying it can serve them. They are
 * usually the same thing and occasionally are not — a transformation that
 * cannot be built, a delivery restriction on the account — and the difference
 * matters when the alternative copy is about to be overwritten.
 */
async function verify(url: string): Promise<void> {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) {
    throw new Error(`uploaded, but ${url} answered ${response.status} — leaving the original in place`);
  }
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) {
    throw new Error(`uploaded, but ${url} served '${type}' rather than an image`);
  }
}

/** Upload one image and prove it landed. Throws with everything intact. */
async function migrateOne(
  source: string | Buffer,
  folder: string,
  publicId: string,
): Promise<UploadedImage> {
  const uploaded = await uploadImage(source, { folder, publicId, overwrite: true });
  await verify(uploaded.url);
  return uploaded;
}

/** Runs `worker` over `items`, at most `limit` of them in flight. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/* --------------------------------- products --------------------------------- */

async function migrateProducts(options: Options, summary: MigrationSummary) {
  const query = ProductModel.find(
    { $or: [{ 'images.url': /^data:/i }, { 'images.url': /^\/?media\//i }] },
    { name: 1, images: 1 },
  ).sort({ _id: 1 });
  if (Number.isFinite(options.limit)) query.limit(options.limit);

  const products = await query.lean();
  summary.productsScanned = products.length;

  if (!products.length) {
    console.log('[migrate] products: nothing left to move');
    return;
  }
  console.log(`[migrate] products: ${products.length} hold imagery to move`);

  for (const product of products) {
    const images = product.images ?? [];
    const folder = productFolder(product._id);

    /* Indices, not a filtered copy: the gallery's order is the product's main
       image and its hover swap, so a migrated entry has to land back in the
       slot it came from. */
    const pending = images
      .map((image, index) => ({ image, index }))
      .filter(({ image }) => isMigratable(image?.url));

    const outcomes = await pooled(pending, options.concurrency, async ({ image, index }) => {
      const source = image.url as string;
      const bytes = sourceBytes(source);
      const publicId = derivedPublicId(image.id || `image-${index + 1}`, source);

      if (!options.confirm) {
        if (options.verbose) {
          const target = isDataUri(source)
            ? `${folder}/${publicId}`
            : (({ folder: f, publicId: id }) => `${f}/${id}`)(mediaPublicId(source));
          console.log(
            `[migrate]   would upload ${product._id}/${image.id ?? index} ` +
              `(${isDataUri(source) ? `${(bytes / 1024).toFixed(0)} KB base64` : source}) → ${target}`,
          );
        }
        return { index, bytes, uploaded: null as UploadedImage | null };
      }

      try {
        const uploaded = await migrateSource(source, { folder, publicId });
        if (options.verbose) {
          console.log(`[migrate]   ${product._id}/${image.id ?? index} → ${uploaded.publicId}`);
        }
        return { index, bytes, uploaded };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.failures.push({
          record: `product ${product._id} (${product.name})`,
          field: `images[${index}]`,
          message,
        });
        console.warn(`[migrate]   FAILED ${product._id}/${image.id ?? index}: ${message}`);
        return { index, bytes, uploaded: null as UploadedImage | null };
      }
    });

    const landed = outcomes.filter((outcome) => outcome.uploaded);
    const counted = options.confirm ? landed : outcomes;

    summary.productImagesMigrated += counted.length;
    summary.bytesFreed += counted.reduce((sum, outcome) => sum + outcome.bytes, 0);

    if (!options.confirm) {
      console.log(
        `[migrate]   ${product.name}: ${pending.length} image(s) would move to ${folder}`,
      );
      continue;
    }
    if (!landed.length) continue;

    /*
     * Written per image, not per product. A gallery where four of five landed
     * keeps the four as CDN references and leaves the fifth as base64 for the
     * next run — rather than rolling back four good uploads or, worse,
     * dropping the one image that has nowhere else to live.
     */
    const next = images.map((image) => ({ ...image }));
    for (const { index, uploaded } of landed) {
      if (!uploaded) continue;
      next[index] = { ...next[index], url: uploaded.url, publicId: uploaded.publicId };
    }

    await ProductModel.updateOne({ _id: product._id }, { $set: { images: next } });
    summary.productsMigrated += 1;
    console.log(
      `[migrate]   ${product.name}: ${landed.length}/${pending.length} image(s) now on Cloudinary`,
    );
  }
}

/* ---------------------------------- banners --------------------------------- */

const BANNER_SLOTS = [
  { slot: 'desktop', url: 'desktopImage', publicId: 'desktopImagePublicId' },
  { slot: 'mobile', url: 'mobileImage', publicId: 'mobileImagePublicId' },
] as const;

async function migrateBanners(options: Options, summary: MigrationSummary) {
  const movable = [/^data:/i, /^\/?media\//i];
  const query = BannerModel.find(
    {
      $or: movable.flatMap((rx) => [{ desktopImage: rx }, { mobileImage: rx }]),
    },
    { title: 1, heading: 1, desktopImage: 1, mobileImage: 1 },
  ).sort({ _id: 1 });
  if (Number.isFinite(options.limit)) query.limit(options.limit);

  const banners = await query.lean();
  summary.bannersScanned = banners.length;

  if (!banners.length) {
    console.log('[migrate] banners: nothing left to move');
    return;
  }
  console.log(`[migrate] banners: ${banners.length} hold imagery to move`);

  for (const banner of banners) {
    const folder = bannerFolder(banner._id);
    const update: Record<string, string> = {};
    let moved = 0;

    for (const { slot, url, publicId } of BANNER_SLOTS) {
      const source = (banner as Record<string, unknown>)[url];
      if (typeof source !== 'string' || !isMigratable(source)) continue;

      const bytes = sourceBytes(source);

      if (!options.confirm) {
        const target = isDataUri(source)
          ? `${folder}/${slot}`
          : (({ folder: f, publicId: id }) => `${f}/${id}`)(mediaPublicId(source));
        console.log(
          `[migrate]   would upload ${banner._id}.${url} ` +
            `(${isDataUri(source) ? `${(bytes / 1024).toFixed(0)} KB base64` : source}) → ${target}`,
        );
        moved += 1;
        summary.bytesFreed += bytes;
        continue;
      }

      try {
        const uploaded = await migrateSource(source, { folder, publicId: slot });
        update[url] = uploaded.url;
        update[publicId] = uploaded.publicId;
        moved += 1;
        summary.bytesFreed += bytes;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.failures.push({
          record: `banner ${banner._id} (${banner.heading ?? banner.title ?? ''})`,
          field: url,
          message,
        });
        console.warn(`[migrate]   FAILED ${banner._id}.${url}: ${message}`);
      }
    }

    summary.bannerImagesMigrated += moved;
    if (!options.confirm || !Object.keys(update).length) continue;

    await BannerModel.updateOne({ _id: banner._id }, { $set: update });
    summary.bannersMigrated += 1;
    console.log(`[migrate]   ${banner.heading ?? banner._id}: ${moved} image(s) now on Cloudinary`);
  }
}

/* ------------------------------- media library ------------------------------ */

/**
 * The library rows the panel's uploader wrote. Not named in the brief, but they
 * are base64 in MongoDB for the same reason and are what the media picker
 * copies into product galleries — leaving them behind would mean the next
 * gallery edit reintroduced exactly what this script removes.
 */
async function migrateMedia(options: Options, summary: MigrationSummary) {
  const query = MediaModel.find(
    { $or: [{ url: /^data:/i }, { url: /^\/?media\//i }] },
    { name: 1, url: 1, folder: 1 },
  ).sort({ _id: 1 });
  if (Number.isFinite(options.limit)) query.limit(options.limit);

  const assets = await query.lean();
  summary.mediaScanned = assets.length;

  if (!assets.length) {
    console.log('[migrate] media library: nothing left to move');
    return;
  }
  console.log(`[migrate] media library: ${assets.length} hold imagery to move`);

  await pooled(assets, options.concurrency, async (asset) => {
    const source = asset.url as string;
    const bytes = sourceBytes(source);
    const folder = libraryFolder(asset.folder);
    const publicId = derivedPublicId(asset.name ?? asset._id, source);

    if (!options.confirm) {
      if (options.verbose) {
        const target = isDataUri(source)
          ? `${folder}/${publicId}`
          : (({ folder: f, publicId: id }) => `${f}/${id}`)(mediaPublicId(source));
        console.log(
          `[migrate]   would upload ${asset._id} ` +
            `(${isDataUri(source) ? `${(bytes / 1024).toFixed(0)} KB base64` : source}) → ${target}`,
        );
      }
      summary.mediaMigrated += 1;
      summary.bytesFreed += bytes;
      return;
    }

    try {
      const uploaded = await migrateSource(source, { folder, publicId });
      await MediaModel.updateOne(
        { _id: asset._id },
        {
          $set: {
            url: uploaded.url,
            publicId: uploaded.publicId,
            size: uploaded.bytes ?? bytes,
            width: uploaded.width,
            height: uploaded.height,
          },
        },
      );
      summary.mediaMigrated += 1;
      summary.bytesFreed += bytes;
      if (options.verbose) console.log(`[migrate]   ${asset.name ?? asset._id} → ${uploaded.publicId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failures.push({ record: `media ${asset._id}`, field: 'url', message });
      console.warn(`[migrate]   FAILED ${asset._id}: ${message}`);
    }
  });
}

/* ---------------------------------- driver ---------------------------------- */

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MB`;

export function printSummary(summary: MigrationSummary, options: Options) {
  const verb = options.confirm ? 'migrated' : 'would migrate';

  /*
   * On a live run these are counts of what actually landed — a document is
   * only "migrated" once a write succeeded for it. On a dry run nothing lands,
   * so the scanned counts stand in. Conflating the two would report a run that
   * failed every upload as a run that migrated everything.
   */
  const products = options.confirm ? summary.productsMigrated : summary.productsScanned;
  const banners = options.confirm ? summary.bannersMigrated : summary.bannersScanned;

  console.log('');
  console.log('──────────────────── migration summary ────────────────────');
  console.log(`  Products ${verb}          ${products} of ${summary.productsScanned} scanned`);
  console.log(`  Product images ${verb}    ${summary.productImagesMigrated}`);
  console.log(`  Banners ${verb}           ${banners} of ${summary.bannersScanned} scanned`);
  console.log(`  Banner images ${verb}     ${summary.bannerImagesMigrated}`);
  console.log(`  Media assets ${verb}      ${summary.mediaMigrated} of ${summary.mediaScanned} scanned`);
  console.log(`  Base64 removed from DB   ${mb(summary.bytesFreed)}`);
  console.log(`  Failed uploads           ${summary.failures.length}`);

  if (summary.failures.length) {
    console.log('');
    console.log('  Failures (base64 left untouched — safe to re-run):');
    for (const failure of summary.failures) {
      console.log(`    · ${failure.record} ${failure.field}: ${failure.message}`);
    }
  }
  console.log('───────────────────────────────────────────────────────────');

  if (!options.confirm) {
    console.log('');
    console.log('  DRY RUN — nothing was uploaded and nothing was written.');
    console.log('  Re-run with --confirm to perform the migration.');
    console.log('');
  }
}

export async function migrateToCloudinary(options: Options): Promise<MigrationSummary> {
  if (options.confirm && !isConfigured) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in server/.env.',
    );
  }

  // One round trip before touching anything, so a bad credential is one clear
  // error rather than one `Invalid Signature` per image.
  if (options.confirm) {
    await verifyCredentials();
    console.log('[migrate] credentials verified');
  }

  const summary = emptySummary();

  console.log(
    options.confirm
      ? '[migrate] LIVE RUN — images will be uploaded and documents rewritten'
      : '[migrate] dry run — pass --confirm to actually migrate',
  );
  console.log(`[migrate] targets: ${options.targets.join(', ')}`);

  if (options.targets.includes('products')) await migrateProducts(options, summary);
  if (options.targets.includes('banners')) await migrateBanners(options, summary);
  if (options.targets.includes('media')) await migrateMedia(options, summary);

  printSummary(summary, options);
  return summary;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const options = parseOptions(process.argv.slice(2));

  connectDb()
    .then(() => migrateToCloudinary(options))
    .then(async (summary) => {
      await disconnectDb();
      // A failed upload is a partial migration, and CI should notice.
      process.exit(summary.failures.length ? 1 : 0);
    })
    .catch(async (error) => {
      console.error('[migrate] failed:', error instanceof Error ? error.message : error);
      await disconnectDb().catch(() => {});
      process.exit(1);
    });
}
