import { Router } from 'express';
import type { Banner, HomeSection, MediaAsset } from '@/types';
import {
  BannerModel,
  HomeSectionModel,
  MediaModel,
  NotificationModel,
  ProductModel,
} from '../db/models.js';
import { requirePermission } from '../lib/auth.js';
import {
  CloudinaryError,
  bannerFolder,
  destroyImages,
  isDataUri,
  libraryFolder,
  uploadImage,
} from '../lib/cloudinary.js';
import {
  ah,
  badRequest,
  bool,
  clean,
  HttpError,
  list,
  nextId,
  notFound,
  nowIso,
  num,
  pageParams,
  paginated,
  searchFilter,
  serializeMany,
  sortSpec,
  str,
} from '../lib/http.js';

/* -------------------------------- homepage ---------------------------------- */

export const homepageRoutes = Router();

/**
 * The two image slots on a banner, and the field each stores its Cloudinary
 * handle in. Written out rather than derived so the shape stays greppable.
 */
const BANNER_SLOTS = [
  { slot: 'desktop', url: 'desktopImage', publicId: 'desktopImagePublicId' },
  { slot: 'mobile', url: 'mobileImage', publicId: 'mobileImagePublicId' },
] as const;

type BannerPayload = Partial<Banner> & Record<string, unknown>;

/**
 * Makes sure a banner is saved with a CDN URL rather than the image itself.
 *
 * The panel uploads through `/api/uploads/image` and submits the `{ url,
 * publicId }` it got back, so in the normal path there is nothing to do here.
 * A raw data URI still arriving — an older panel build, a scripted call, an
 * import — is uploaded rather than rejected, because the alternative is
 * putting megabytes of base64 back into a document the storefront reads on
 * every cold load.
 *
 * The upload happens *before* the write. A banner is never saved pointing at
 * an image that failed to land.
 */
async function resolveBannerImages(payload: BannerPayload, bannerId: string): Promise<BannerPayload> {
  const resolved: BannerPayload = { ...payload };

  for (const { slot, url, publicId } of BANNER_SLOTS) {
    const value = resolved[url];
    if (typeof value !== 'string' || !isDataUri(value)) continue;

    try {
      const uploaded = await uploadImage(value, {
        folder: bannerFolder(bannerId),
        publicId: slot,
        tags: ['banner', bannerId],
      });
      resolved[url] = uploaded.url;
      resolved[publicId] = uploaded.publicId;
    } catch (error) {
      if (error instanceof CloudinaryError) throw new HttpError(error.status, error.message);
      throw error;
    }
  }

  return resolved;
}

/**
 * Cloudinary assets a banner used to point at and no longer does — a replaced
 * desktop image, a mobile image that was cleared. Reconciled from the saved
 * record so an abandoned edit destroys nothing.
 */
function orphanedBannerAssets(before: BannerPayload, after: BannerPayload): string[] {
  const orphans: string[] = [];

  for (const { url, publicId } of BANNER_SLOTS) {
    const oldId = before[publicId];
    if (typeof oldId !== 'string' || !oldId) continue;

    /*
     * The slot still holds the same asset when both the handle and the URL
     * came through the save unchanged. Requiring both matters: an admin can
     * paste a different URL over a slot without the panel clearing the handle,
     * and that is still a replacement.
     */
    const unchanged = after[publicId] === oldId && after[url] === before[url];
    if (!unchanged) orphans.push(oldId);
  }

  return orphans;
}

/** Best-effort: a Cloudinary hiccup must not fail a save the database took. */
function reapBanner(publicIds: string[]) {
  if (!publicIds.length) return;
  void destroyImages(publicIds).catch((error) => {
    console.warn('[banners] could not clean up replaced images:', error?.message ?? error);
  });
}

homepageRoutes.get(
  '/banners',
  requirePermission('homepage'),
  ah(async (_req, res) => {
    const banners = await BannerModel.find().sort({ sortOrder: 1 }).lean();
    res.json(serializeMany(banners));
  }),
);

homepageRoutes.put(
  '/banners/reorder',
  requirePermission('homepage', 'edit'),
  ah(async (req, res) => {
    const { ids } = req.body as { ids: string[] };
    await BannerModel.bulkWrite(
      ids.map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { sortOrder: index } } },
      })),
    );
    const banners = await BannerModel.find().sort({ sortOrder: 1 }).lean();
    res.json(serializeMany(banners));
  }),
);

homepageRoutes.post(
  '/banners',
  requirePermission('homepage', 'create'),
  ah(async (req, res) => {
    const payload = clean(req.body as Partial<Banner>);
    if (!payload.heading) badRequest('Banner heading is required');

    /* The id is minted first so uploaded imagery can be filed under
       `sopii/banners/{bannerId}` rather than a folder named after nothing. */
    const bannerId = nextId('ban');
    const resolved = await resolveBannerImages(payload, bannerId);

    const created = await BannerModel.create({
      _id: bannerId,
      status: 'inactive',
      ...resolved,
      title: payload.title ?? payload.heading,
      /* A banner saved without imagery keeps an EMPTY image field, not a
         stand-in path. `/media/banners/placeholder-desktop.jpg` used to go here
         and no such file has ever existed, so every image-less banner was born
         holding a 404 that `migrate-cloudinary` could then never move — it will
         not replace a field it cannot first upload and verify.

         Empty is also what the readers already expect: the shop front's
         adapter falls through to generated art when `desktopImage` is missing
         (`cdnMedia(...) ?? photo(...)` in SOPII/src/services/adapters.js), and
         Hero.jsx retires a source that errors. Absent renders correctly;
         a path to nothing costs a request to find that out. */
      sortOrder: await BannerModel.estimatedDocumentCount(),
    });

    res.status(201).json(created.toJSON());
  }),
);

homepageRoutes.put(
  '/banners/:id',
  requirePermission('homepage', 'edit'),
  ah(async (req, res) => {
    const existing = await BannerModel.findById(req.params.id).lean();
    if (!existing) notFound('Banner');

    const resolved = await resolveBannerImages(
      clean(req.body as Partial<Banner>),
      req.params.id,
    );

    const updated = await BannerModel.findByIdAndUpdate(
      req.params.id,
      { $set: resolved },
      { new: true },
    );
    if (!updated) notFound('Banner');

    // After the write, and only for what the saved banner stopped pointing at.
    reapBanner(orphanedBannerAssets(existing as BannerPayload, updated.toJSON() as BannerPayload));

    res.json(updated.toJSON());
  }),
);

homepageRoutes.delete(
  '/banners/:id',
  requirePermission('homepage', 'delete'),
  ah(async (req, res) => {
    const removed = await BannerModel.findByIdAndDelete(req.params.id).lean();
    if (!removed) notFound('Banner');

    // A banner owns its imagery outright — nothing else references
    // `sopii/banners/{id}` — so both slots go with it.
    reapBanner(
      BANNER_SLOTS.map(({ publicId }) => (removed as BannerPayload)[publicId]).filter(
        (id): id is string => typeof id === 'string' && Boolean(id),
      ),
    );

    res.json({ id: removed._id });
  }),
);

homepageRoutes.get(
  '/sections',
  requirePermission('homepage'),
  ah(async (_req, res) => {
    const sections = await HomeSectionModel.find().sort({ sortOrder: 1 }).lean();
    res.json(serializeMany(sections));
  }),
);

homepageRoutes.put(
  '/sections/reorder',
  requirePermission('homepage', 'edit'),
  ah(async (req, res) => {
    const { ids } = req.body as { ids: string[] };
    await HomeSectionModel.bulkWrite(
      ids.map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { sortOrder: index } } },
      })),
    );
    const sections = await HomeSectionModel.find().sort({ sortOrder: 1 }).lean();
    res.json(serializeMany(sections));
  }),
);

homepageRoutes.put(
  '/sections/:id',
  requirePermission('homepage', 'edit'),
  ah(async (req, res) => {
    const updated = await HomeSectionModel.findByIdAndUpdate(
      req.params.id,
      { $set: clean(req.body as Partial<HomeSection>) },
      { new: true },
    );
    if (!updated) notFound('Section');
    res.json(updated.toJSON());
  }),
);

/* ---------------------------------- media ----------------------------------- */

export const mediaRoutes = Router();

mediaRoutes.get(
  '/stats',
  requirePermission('media'),
  ah(async (_req, res) => {
    const [totals] = await MediaModel.aggregate([
      { $group: { _id: null, total: { $sum: 1 }, size: { $sum: '$size' } } },
    ]);
    const byFolderRows = await MediaModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$folder', count: { $sum: 1 } } },
    ]);

    res.json({
      total: totals?.total ?? 0,
      size: totals?.size ?? 0,
      byFolder: Object.fromEntries(byFolderRows.map((row) => [row._id, row.count])),
    });
  }),
);

/**
 * Destroys the Cloudinary assets behind deleted library rows — but only the
 * ones nothing else points at.
 *
 * Picking an image out of the library into a product gallery or a banner
 * copies the URL and the handle rather than re-uploading, so one asset can be
 * referenced from several records. Deleting the library row is a statement
 * about the library, not about the product using the photograph, so the
 * records are asked first.
 */
async function reapLibrary(publicIds: (string | null | undefined)[]) {
  const ids = [...new Set(publicIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;

  const [inProducts, inBanners] = await Promise.all([
    ProductModel.distinct('images.publicId', { 'images.publicId': { $in: ids } }).catch(
      () => [] as string[],
    ),
    BannerModel.find(
      {
        $or: [
          { desktopImagePublicId: { $in: ids } },
          { mobileImagePublicId: { $in: ids } },
        ],
      },
      { desktopImagePublicId: 1, mobileImagePublicId: 1 },
    )
      .lean()
      .catch(() => []),
  ]);

  const used = new Set<string>(inProducts as string[]);
  for (const banner of inBanners as BannerPayload[]) {
    for (const { publicId } of BANNER_SLOTS) {
      const value = banner[publicId];
      if (typeof value === 'string') used.add(value);
    }
  }

  const removable = ids.filter((id) => !used.has(id));
  if (!removable.length) return;

  void destroyImages(removable).catch((error) => {
    console.warn('[media] could not delete stored images:', error?.message ?? error);
  });
}

mediaRoutes.post(
  '/bulk-delete',
  requirePermission('media', 'delete'),
  ah(async (req, res) => {
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) badRequest('No files selected');

    const doomed = await MediaModel.find({ _id: { $in: ids } }, { publicId: 1 }).lean();
    const result = await MediaModel.deleteMany({ _id: { $in: ids } });
    void reapLibrary(doomed.map((asset) => asset.publicId));

    res.json({ affected: result.deletedCount ?? 0 });
  }),
);

mediaRoutes.get(
  '/',
  requirePermission('media'),
  ah(async (req, res) => {
    const { page, pageSize, skip } = pageParams(req.query, 24);
    const filter: Record<string, unknown> = {};

    const search = searchFilter(str(req.query, 'search'), ['name', 'alt']);
    if (search) Object.assign(filter, search);

    const folders = list(req.query, 'folder');
    if (folders.length) filter.folder = { $in: folders };

    const [items, total] = await Promise.all([
      MediaModel.find(filter)
        .sort(sortSpec(req.query, 'createdAt', 'desc'))
        .skip(skip)
        .limit(pageSize)
        .lean(),
      MediaModel.countDocuments(filter),
    ]);

    res.json(paginated(serializeMany(items), total, page, pageSize));
  }),
);

/**
 * Accepts the browser's parsed files.
 *
 * Images arrive as data URIs and used to be *stored* as data URIs, inline in
 * the document. They now go to Cloudinary on the way in and the row keeps the
 * `secure_url` and `public_id` that came back — the same bytes, two short
 * strings instead of a megabyte of base64, and a CDN in front of them.
 *
 * The upload happens before the insert, so a library row never exists pointing
 * at an image that failed to land. An entry that already carries a real URL
 * (a media path on disk, something re-registered) is inserted as-is.
 */
mediaRoutes.post(
  '/',
  requirePermission('media', 'create'),
  ah(async (req, res) => {
    const payload = req.body as Partial<MediaAsset> & { files?: Partial<MediaAsset>[] };
    const incoming = payload.files ?? [payload];
    if (!incoming.length) badRequest('No files supplied');

    const docs: (Partial<MediaAsset> & { _id: string })[] = [];

    for (const file of incoming) {
      const folder = file.folder ?? 'other';
      let url = file.url ?? `/media/${folder}/${file.name ?? 'upload.jpg'}`;
      let publicId = file.publicId;
      let { width, height, size } = file;

      if (isDataUri(file.url)) {
        try {
          const uploaded = await uploadImage(file.url as string, {
            folder: libraryFolder(folder),
            tags: ['library', folder],
          });
          url = uploaded.url;
          publicId = uploaded.publicId;
          // Cloudinary decoded the file, so believe it over the browser.
          width = uploaded.width ?? width;
          height = uploaded.height ?? height;
          size = uploaded.bytes ?? size;
        } catch (error) {
          if (error instanceof CloudinaryError) throw new HttpError(error.status, error.message);
          throw error;
        }
      }

      docs.push({
        _id: nextId('med'),
        name: file.name ?? 'upload.jpg',
        url,
        publicId,
        folder,
        mimeType: file.mimeType ?? 'image/jpeg',
        size: size ?? 0,
        width: width ?? 1200,
        height: height ?? 1600,
        alt: file.alt,
        uploadedBy: file.uploadedBy ?? req.auth?.user.name ?? 'Admin',
        createdAt: nowIso(),
      });
    }

    const created = await MediaModel.insertMany(docs);
    const serialized = serializeMany(created.map((doc) => doc.toObject()));
    res.status(201).json(serialized.length === 1 ? serialized[0] : serialized);
  }),
);

mediaRoutes.put(
  '/:id',
  requirePermission('media', 'edit'),
  ah(async (req, res) => {
    const updated = await MediaModel.findByIdAndUpdate(
      req.params.id,
      { $set: clean(req.body as Partial<MediaAsset>) },
      { new: true },
    );
    if (!updated) notFound('Media asset');
    res.json(updated.toJSON());
  }),
);

mediaRoutes.delete(
  '/:id',
  requirePermission('media', 'delete'),
  ah(async (req, res) => {
    const removed = await MediaModel.findByIdAndDelete(req.params.id).lean();
    if (!removed) notFound('Media asset');

    void reapLibrary([removed.publicId]);

    res.json({ id: removed._id });
  }),
);

/* ------------------------------ notifications ------------------------------- */

export const notificationRoutes = Router();

notificationRoutes.get(
  '/',
  requirePermission('notifications'),
  ah(async (req, res) => {
    const filter: Record<string, unknown> = {};

    const types = list(req.query, 'type');
    if (types.length) filter.type = { $in: types };
    if (bool(req.query, 'unread')) filter.read = false;

    const limit = num(req.query, 'limit', 0);
    const query = NotificationModel.find(filter).sort({ createdAt: -1 });
    if (limit > 0) query.limit(limit);

    const [items, total, unread] = await Promise.all([
      query.lean(),
      NotificationModel.countDocuments(filter),
      NotificationModel.countDocuments({ read: false }),
    ]);

    res.json({ items: serializeMany(items), total, unread });
  }),
);

notificationRoutes.put(
  '/read-all',
  requirePermission('notifications', 'edit'),
  ah(async (_req, res) => {
    const result = await NotificationModel.updateMany({ read: false }, { $set: { read: true } });
    res.json({ affected: result.modifiedCount ?? 0 });
  }),
);

notificationRoutes.put(
  '/:id/read',
  requirePermission('notifications', 'edit'),
  ah(async (req, res) => {
    const updated = await NotificationModel.findByIdAndUpdate(
      req.params.id,
      { $set: { read: true } },
      { new: true },
    );
    if (!updated) notFound('Notification');
    res.json(updated.toJSON());
  }),
);

notificationRoutes.delete(
  '/',
  requirePermission('notifications', 'delete'),
  ah(async (_req, res) => {
    const result = await NotificationModel.deleteMany({});
    res.json({ affected: result.deletedCount ?? 0 });
  }),
);

notificationRoutes.delete(
  '/:id',
  requirePermission('notifications', 'delete'),
  ah(async (req, res) => {
    const removed = await NotificationModel.findByIdAndDelete(req.params.id).lean();
    if (!removed) notFound('Notification');
    res.json({ id: removed._id });
  }),
);
