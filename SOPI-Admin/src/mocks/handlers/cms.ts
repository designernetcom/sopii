import type { Announcement, Banner, FeaturedCollectionSection, MediaAsset } from '@/types';
import { db, nextId, nowIso } from '../db';
import { applyPatch, badRequest, list, matchesSearch, notFound, num, paginate, route, sortBy } from '../utils';

/* --------------------------------- banners --------------------------------- */

export const homepageRoutes = [
  route('GET', '/homepage/banners', () =>
    [...db.banners].sort((a, b) => a.sortOrder - b.sortOrder),
  ),

  route('POST', '/homepage/banners', ({ body }) => {
    const payload = body as Partial<Banner>;
    if (!payload.heading) badRequest('Banner heading is required');
    const banner: Banner = {
      id: nextId('ban'),
      title: payload.title ?? payload.heading,
      heading: payload.heading,
      subheading: payload.subheading,
      desktopImage: payload.desktopImage ?? '/media/banners/placeholder-desktop.jpg',
      mobileImage: payload.mobileImage,
      buttonText: payload.buttonText,
      buttonLink: payload.buttonLink,
      startDate: payload.startDate,
      endDate: payload.endDate,
      sortOrder: db.banners.length,
      status: payload.status ?? 'inactive',
    };
    db.banners.push(banner);
    return banner;
  }),

  route('PUT', '/homepage/banners/:id', ({ params, body }) => {
    const banner = db.banners.find((b) => b.id === params.id);
    if (!banner) notFound('Banner');
    applyPatch(banner, body as Partial<Banner>);
    return banner;
  }),

  route('DELETE', '/homepage/banners/:id', ({ params }) => {
    const index = db.banners.findIndex((b) => b.id === params.id);
    if (index === -1) notFound('Banner');
    const [removed] = db.banners.splice(index, 1);
    return { id: removed.id };
  }),

  route('PUT', '/homepage/banners/reorder', ({ body }) => {
    const { ids } = body as { ids: string[] };
    ids.forEach((id, index) => {
      const banner = db.banners.find((b) => b.id === id);
      if (banner) banner.sortOrder = index;
    });
    return [...db.banners].sort((a, b) => a.sortOrder - b.sortOrder);
  }),

  route('GET', '/homepage/sections', () =>
    [...db.homeSections].sort((a, b) => a.sortOrder - b.sortOrder),
  ),

  route('PUT', '/homepage/sections/:id', ({ params, body }) => {
    const section = db.homeSections.find((s) => s.id === params.id);
    if (!section) notFound('Section');
    applyPatch(section, body as Record<string, never>);
    return section;
  }),

  route('PUT', '/homepage/sections/reorder', ({ body }) => {
    const { ids } = body as { ids: string[] };
    ids.forEach((id, index) => {
      const section = db.homeSections.find((s) => s.id === id);
      if (section) section.sortOrder = index;
    });
    return [...db.homeSections].sort((a, b) => a.sortOrder - b.sortOrder);
  }),

  /* A lighter mirror of `server/src/lib/announcements.ts`: enough validation
     that the panel's error paths can be exercised without the API running. */

  route('GET', '/homepage/announcements', () => sortedAnnouncements()),

  route('POST', '/homepage/announcements', ({ body }) => {
    const payload = body as Partial<Announcement>;
    const message = payload.message?.replace(/\s+/g, ' ').trim();
    if (!message) badRequest('Announcement message is required');
    checkWindow(payload.startDate ?? null, payload.endDate ?? null);

    const now = nowIso();
    const announcement: Announcement = {
      id: nextId('ann'),
      message,
      isActive: payload.isActive ?? false,
      priority: payload.priority ?? 0,
      startDate: payload.startDate ?? null,
      endDate: payload.endDate ?? null,
      createdAt: now,
      updatedAt: now,
    };
    db.announcements.push(announcement);
    return announcement;
  }),

  route('PUT', '/homepage/announcements/:id', ({ params, body }) => {
    const announcement = db.announcements.find((a) => a.id === params.id);
    if (!announcement) notFound('Announcement');

    const patch = { ...(body as Partial<Announcement>) };
    if (patch.message !== undefined) {
      patch.message = patch.message.replace(/\s+/g, ' ').trim();
      if (!patch.message) badRequest('Announcement message is required');
    }
    checkWindow(
      patch.startDate !== undefined ? patch.startDate : announcement.startDate,
      patch.endDate !== undefined ? patch.endDate : announcement.endDate,
    );

    applyPatch(announcement, { ...patch, updatedAt: nowIso() });
    return announcement;
  }),

  route('DELETE', '/homepage/announcements/:id', ({ params }) => {
    const index = db.announcements.findIndex((a) => a.id === params.id);
    if (index === -1) notFound('Announcement');
    const [removed] = db.announcements.splice(index, 1);
    return { id: removed.id };
  }),

  /* A lighter mirror of `server/src/lib/featuredCollection.ts`: the cross-field
     rules the form's error paths depend on, not every limit. */

  route('GET', '/homepage/featured-collection', () => db.featuredCollection),

  route('PUT', '/homepage/featured-collection', ({ body }) => {
    const patch = { ...(body as Partial<FeaturedCollectionSection>) };
    delete patch.updatedAt;
    const merged = { ...db.featuredCollection, ...patch };

    if (merged.enabled && !merged.heading?.trim()) badRequest('Add a heading, or hide the section');
    if (merged.enabled && merged.image && !merged.imageAlt?.trim()) {
      badRequest('Describe the image in the alt text — screen readers announce it');
    }
    if (merged.ctaEnabled && (!merged.ctaText?.trim() || !merged.ctaLink?.trim())) {
      badRequest('A visible button needs both its text and its link');
    }
    if (merged.ctaLink && !/^\/(?![/\\])/.test(merged.ctaLink) && !/^https?:\/\/[^\s/]+/i.test(merged.ctaLink)) {
      badRequest('Button link must start with / or http(s)://');
    }
    if (merged.pillars.some((pillar) => !pillar.title?.trim())) badRequest('Every pillar needs a title');

    db.featuredCollection = {
      ...merged,
      pillars: merged.pillars.map((pillar) => ({ ...pillar, id: pillar.id || nextId('pil') })),
      updatedAt: nowIso(),
    };
    return db.featuredCollection;
  }),
];

function sortedAnnouncements() {
  return [...db.announcements].sort(
    (a, b) => a.priority - b.priority || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
  );
}

function checkWindow(start: string | null, end: string | null) {
  if (start && end && new Date(end) <= new Date(start)) {
    badRequest('End date must be after the start date');
  }
}

/* ---------------------------------- media ---------------------------------- */

export const mediaRoutes = [
  route('GET', '/media', ({ query }) => {
    const folders = list(query.folder);
    const filtered = db.media
      .filter((asset) => matchesSearch(query.search, [asset.name, asset.alt]))
      .filter((asset) => (folders.length ? folders.includes(asset.folder) : true));

    const sorted = sortBy(filtered, query.sortBy ?? 'createdAt', query.sortDir ?? 'desc', (a, key) =>
      key === 'createdAt'
        ? new Date(a.createdAt).getTime()
        : (a as unknown as Record<string, string | number>)[key],
    );
    return paginate(sorted, num(query.page, 1), num(query.pageSize, 24));
  }),

  route('GET', '/media/stats', () => ({
    total: db.media.length,
    size: db.media.reduce((sum, a) => sum + a.size, 0),
    byFolder: db.media.reduce<Record<string, number>>((acc, asset) => {
      acc[asset.folder] = (acc[asset.folder] ?? 0) + 1;
      return acc;
    }, {}),
  })),

  route('POST', '/media', ({ body }) => {
    const payload = body as Partial<MediaAsset> & { files?: Partial<MediaAsset>[] };
    const incoming = payload.files ?? [payload];

    const created = incoming.map((file) => {
      const asset: MediaAsset = {
        id: nextId('med'),
        name: file.name ?? 'upload.jpg',
        url: file.url ?? `/media/${file.folder ?? 'other'}/${file.name ?? 'upload.jpg'}`,
        folder: file.folder ?? 'other',
        mimeType: file.mimeType ?? 'image/jpeg',
        size: file.size ?? 0,
        width: file.width ?? 1200,
        height: file.height ?? 1600,
        alt: file.alt,
        uploadedBy: file.uploadedBy ?? 'Admin',
        createdAt: nowIso(),
      };
      db.media.unshift(asset);
      return asset;
    });

    return created.length === 1 ? created[0] : created;
  }),

  route('PUT', '/media/:id', ({ params, body }) => {
    const asset = db.media.find((a) => a.id === params.id);
    if (!asset) notFound('Media asset');
    applyPatch(asset, body as Partial<MediaAsset>);
    return asset;
  }),

  route('DELETE', '/media/:id', ({ params }) => {
    const index = db.media.findIndex((a) => a.id === params.id);
    if (index === -1) notFound('Media asset');
    const [removed] = db.media.splice(index, 1);
    return { id: removed.id };
  }),

  route('POST', '/media/bulk-delete', ({ body }) => {
    const { ids } = body as { ids: string[] };
    const set = new Set(ids);
    for (let i = db.media.length - 1; i >= 0; i -= 1) {
      if (set.has(db.media[i].id)) db.media.splice(i, 1);
    }
    return { affected: ids.length };
  }),
];

/* ------------------------------ notifications ------------------------------ */

export const notificationRoutes = [
  route('GET', '/notifications', ({ query }) => {
    const types = list(query.type);
    const filtered = db.notifications
      .filter((n) => (types.length ? types.includes(n.type) : true))
      .filter((n) => (query.unread === 'true' ? !n.read : true));

    const limit = num(query.limit, 0);
    const items = limit ? filtered.slice(0, limit) : filtered;

    return {
      items,
      total: filtered.length,
      unread: db.notifications.filter((n) => !n.read).length,
    };
  }),

  route('PUT', '/notifications/:id/read', ({ params }) => {
    const notification = db.notifications.find((n) => n.id === params.id);
    if (!notification) notFound('Notification');
    notification.read = true;
    return notification;
  }),

  route('PUT', '/notifications/read-all', () => {
    db.notifications.forEach((n) => {
      n.read = true;
    });
    return { affected: db.notifications.length };
  }),

  route('DELETE', '/notifications/:id', ({ params }) => {
    const index = db.notifications.findIndex((n) => n.id === params.id);
    if (index === -1) notFound('Notification');
    const [removed] = db.notifications.splice(index, 1);
    return { id: removed.id };
  }),

  route('DELETE', '/notifications', () => {
    const count = db.notifications.length;
    db.notifications.length = 0;
    return { affected: count };
  }),
];
