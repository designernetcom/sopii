/*
 * Tests for the Featured Collection section.
 * ===========================================================================
 * Two halves.
 *
 * The rules (`lib/featuredCollection.ts`) are pure, and they are what stands
 * between the panel's form and the home page: a CTA link that is not refused
 * here is a `javascript:` link on every visit, and a partial save that is not
 * checked against the stored section can leave a visible button with no text.
 *
 * The flow is the contract the storefront relies on: what the panel saves is
 * what MongoDB holds, and what `/bootstrap` sends — immediately, not after a
 * cache TTL — with `/version` moving so open tabs notice. It runs against the
 * real routers and a real database (an embedded one if none is reachable).
 *
 * Run with:  npm test        (in server/)
 */

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';

import { featuredCollectionDefaults } from '@/data/featuredCollection';
import type { FeaturedCollectionSection } from '@/types';

import { FeaturedCollectionModel } from '../db/models.js';
import {
  FEATURED_COLLECTION_ID,
  FEATURED_COLLECTION_LIMITS,
  isSafeLink,
  ownsFeaturedAsset,
  parseFeaturedCollectionInput,
  publicFeaturedCollection,
  resolveFeaturedCollection,
} from '../lib/featuredCollection.js';
import { errorHandler, HttpError } from '../lib/http.js';
import { invalidates } from '../lib/invalidation.js';
import { NAMESPACE } from '../lib/cache.js';
import { homepageRoutes } from '../routes/cms.js';
import { storefrontRoutes } from '../routes/storefront.js';

/* --------------------------------- helpers ---------------------------------- */

const defaults = (): FeaturedCollectionSection => structuredClone(featuredCollectionDefaults);

let idCounter = 0;
const makeId = () => `pil_gen${++idCounter}`;

const parse = (body: unknown, existing = defaults()) =>
  parseFeaturedCollectionInput(body, existing, { makeId });

/** Asserts the call is refused as a 400, and that the message mentions `match`. */
function rejects(fn: () => unknown, match: RegExp) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof HttpError, 'expected an HttpError');
    assert.equal(error.status, 400);
    assert.match(error.message, match);
    return true;
  });
}

/* ---------------------------------- rules ----------------------------------- */

describe('featured collection: reading', () => {
  it('stands in the defaults for a store that has never saved the section', () => {
    assert.deepEqual(resolveFeaturedCollection(null), featuredCollectionDefaults);
  });

  it('completes a partial document from the defaults without keeping unknown keys', () => {
    const out = resolveFeaturedCollection({
      heading: 'Saved heading',
      pillars: [],
      _id: FEATURED_COLLECTION_ID,
    } as Partial<FeaturedCollectionSection>);

    assert.equal(out.heading, 'Saved heading');
    assert.deepEqual(out.pillars, [], 'a deliberately emptied list stays empty');
    assert.equal(out.eyebrow, featuredCollectionDefaults.eyebrow);
    assert.equal('_id' in out, false);
  });

  it('does not let a caller mutate the shared defaults', () => {
    resolveFeaturedCollection(null).pillars.push({ id: 'x', title: 'x', text: '', enabled: true });
    assert.equal(featuredCollectionDefaults.pillars.length, 3);
  });
});

describe('featured collection: parsing a save', () => {
  it('accepts a complete section and ignores fields the panel does not edit', () => {
    const out = parse({
      ...defaults(),
      updatedAt: '1999-01-01T00:00:00.000Z',
      _id: 'hijack',
      somethingElse: true,
    });

    assert.equal('updatedAt' in out, false);
    assert.equal('_id' in out, false);
    assert.equal('somethingElse' in out, false);
    assert.equal(out.heading, featuredCollectionDefaults.heading);
    assert.equal(out.pillars?.length, 3);
  });

  it('collapses whitespace in one-line copy', () => {
    const out = parse({ eyebrow: '  SOPII \n Signature ', description: 'One\n\ntwo   three' });
    assert.equal(out.eyebrow, 'SOPII Signature');
    assert.equal(out.description, 'One two three');
  });

  it('keeps the heading on its own lines, dropping blank ones', () => {
    const out = parse({ heading: '  Timeless   silhouettes. \r\n\n Contemporary craftsmanship.  ' });
    assert.equal(out.heading, 'Timeless silhouettes.\nContemporary craftsmanship.');
    rejects(() => parse({ heading: 'a\nb\nc\nd' }), /at most 3 lines/);
  });

  it('enforces the length limits', () => {
    rejects(() => parse({ eyebrow: 'e'.repeat(FEATURED_COLLECTION_LIMITS.eyebrow + 1) }), /60 characters/);
    rejects(() => parse({ ctaText: 'c'.repeat(FEATURED_COLLECTION_LIMITS.ctaText + 1) }), /40 characters/);
    rejects(() => parse({ eyebrow: 42 }), /must be text/);
  });

  it('requires a heading while the section is shown, but not while hidden', () => {
    rejects(() => parse({ heading: '   ' }), /Add a heading/);
    assert.deepEqual(parse({ heading: '', enabled: false }), { heading: '', enabled: false });
  });

  it('validates a partial save against what is already stored', () => {
    const stored = { ...defaults(), ctaEnabled: false, ctaText: '', ctaLink: '' };
    rejects(() => parse({ ctaEnabled: true }, stored), /both its text and its link/);
    assert.deepEqual(parse({ enabled: false }, stored), { enabled: false });
  });

  it('only accepts links the storefront can follow safely', () => {
    for (const link of ['/collections/sopii-signature', '/shop?sort=new', 'https://example.com/x']) {
      assert.equal(isSafeLink(link), true, link);
      assert.equal(parse({ ctaLink: link }).ctaLink, link);
    }
    for (const link of ['javascript:alert(1)', '//evil.example', '/\\evil.example', 'collections/x', 'data:text/html,x']) {
      assert.equal(isSafeLink(link), false, link);
      rejects(() => parse({ ctaLink: link }), /must start with/);
    }
  });

  it('refuses inline image bytes and URLs that are not images the shop can load', () => {
    rejects(() => parse({ image: 'data:image/png;base64,AAAA' }), /Upload the image first/);
    rejects(() => parse({ image: 'javascript:alert(1)' }), /http\(s\) URL or a media path/);
  });

  it('drops the old Cloudinary handle when the image changes without a new one', () => {
    const stored = { ...defaults(), imagePublicId: 'sopii/banners/featured-collection/old' };
    assert.equal(parse({ image: 'https://res.cloudinary.com/x/image/upload/new.jpg' }, stored).imagePublicId, '');
    assert.equal(
      parse({ image: 'https://res.cloudinary.com/x/image/upload/new.jpg', imagePublicId: 'new' }, stored)
        .imagePublicId,
      'new',
    );
    assert.equal(parse({ image: '', imagePublicId: 'stale' }, stored).imagePublicId, '');
  });

  it('asks for alt text on a shown image', () => {
    rejects(() => parse({ imageAlt: '' }), /alt text/);
    assert.equal(parse({ image: '', imageAlt: '' }).image, '');
  });

  it('validates pillars, defaulting `enabled` and repairing bad or repeated ids', () => {
    const out = parse({
      pillars: [
        { id: 'pil_a', title: ' Woven  by hand ', text: 'Eleven clusters.' },
        { id: 'pil_a', title: 'Duplicate id', text: '', enabled: false },
        { id: 'bad id!', title: 'Malformed id' },
        { title: 'No id' },
      ],
    });

    assert.deepEqual(
      out.pillars?.map(({ title, enabled }) => [title, enabled]),
      [
        ['Woven by hand', true],
        ['Duplicate id', false],
        ['Malformed id', true],
        ['No id', true],
      ],
    );
    const ids = out.pillars?.map((pillar) => pillar.id) ?? [];
    assert.equal(ids[0], 'pil_a');
    assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  });

  it('refuses a pillar without a title, and too many pillars', () => {
    rejects(() => parse({ pillars: [{ id: 'p', title: '  ', text: 'x' }] }), /Pillar 1 needs a title/);
    rejects(
      () => parse({ pillars: Array.from({ length: 9 }, (_, i) => ({ title: `P${i}` })) }),
      /At most 8 pillars/,
    );
    rejects(() => parse({ pillars: 'nope' }), /must be a list/);
  });
});

describe('featured collection: what the storefront is sent', () => {
  it('sends only `{ enabled: false }` for a hidden section', () => {
    assert.deepEqual(publicFeaturedCollection({ ...defaults(), enabled: false }), { enabled: false });
  });

  it('drops disabled pillars, the write handle and a switched-off button', () => {
    const section: FeaturedCollectionSection = {
      ...defaults(),
      imagePublicId: 'sopii/banners/featured-collection/abc',
      pillars: [
        { id: 'a', title: 'Shown', text: 'yes', enabled: true },
        { id: 'b', title: 'Hidden', text: 'no', enabled: false },
      ],
      ctaEnabled: false,
    };

    const out = publicFeaturedCollection(section, (url) => `${url}?sized`);
    assert.equal('imagePublicId' in out, false);
    assert.deepEqual(out.pillars, [{ id: 'a', title: 'Shown', text: 'yes' }]);
    assert.equal(out.cta, null);
    assert.equal(out.image, `${featuredCollectionDefaults.image}?sized`);
  });

  it('knows which uploads it owns', () => {
    const folder = 'sopii/banners/featured-collection';
    assert.equal(ownsFeaturedAsset(`${folder}/abc`, folder), true);
    assert.equal(ownsFeaturedAsset('sopii/banners/ban_0002/abc', folder), false);
    assert.equal(ownsFeaturedAsset('sopii/banners/featured-collection-evil/abc', folder), false);
    assert.equal(ownsFeaturedAsset('', folder), false);
  });
});

/* ----------------------- panel → database → storefront ---------------------- */

describe('featured collection: panel → database → storefront feed', () => {
  let embedded: { stop: () => Promise<boolean> } | null = null;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let base = '';
  let role: { key: string; permissions: Record<string, Record<string, boolean>> } = {
    key: 'super_admin',
    permissions: {},
  };

  before(async () => {
    const uri = process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017/sopii_featured_test';
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
    } catch {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const memory = await MongoMemoryServer.create();
      embedded = memory;
      await mongoose.connect(memory.getUri('sopii_featured_test'));
    }
    await FeaturedCollectionModel.deleteMany({});

    /* The two routers as `index.ts` mounts them — invalidation included, since
       "a save shows up at once" is part of what is being tested. The session
       layer is replaced by a fixed admin whose role each test can change. */
    const app = express();
    app.use(express.json());
    app.use('/api/homepage', (req, _res, next) => {
      (req as unknown as { auth: unknown }).auth = { user: { name: 'Test' }, role };
      next();
    });
    app.use('/api/homepage', invalidates(NAMESPACE.cms, NAMESPACE.catalog), homepageRoutes);
    app.use('/api/storefront', storefrontRoutes);
    app.use(errorHandler);

    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  after(async () => {
    await FeaturedCollectionModel.deleteMany({}).catch(() => undefined);
    await new Promise((resolve) => server?.close(resolve));
    await mongoose.disconnect();
    if (embedded) await embedded.stop();
  });

  const call = async (path: string, init?: { method?: string; body?: unknown }) => {
    const response = await fetch(`${base}${path}`, {
      method: init?.method ?? 'GET',
      headers: { 'content-type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };

  const bootstrap = async () => (await call('/storefront/bootstrap')).body.featuredCollection;
  const versionToken = async () => (await call('/storefront/version')).body.token as string;

  it('serves the defaults to both sides before anything is saved', async () => {
    const admin = await call('/homepage/featured-collection');
    assert.equal(admin.status, 200);
    assert.equal(admin.body.heading, featuredCollectionDefaults.heading);
    assert.equal(await FeaturedCollectionModel.countDocuments(), 0, 'reading must not write');

    const shop = await bootstrap();
    assert.equal(shop.enabled, true);
    assert.equal(shop.eyebrow, featuredCollectionDefaults.eyebrow);
    assert.equal(shop.pillars.length, 3);
    assert.deepEqual(shop.cta, { text: 'Explore Signature', link: '/collections/sopii-signature' });
  });

  it('writes a full edit to the database and the storefront feed at once', async () => {
    const tokenBefore = await versionToken();
    await bootstrap(); // warm the cache, so a stale read would be caught

    const [first, second, third] = featuredCollectionDefaults.pillars;
    const saved = await call('/homepage/featured-collection', {
      method: 'PUT',
      body: {
        eyebrow: 'The Festive Edit',
        heading: 'Silk for the season.\nCut for the day.',
        description: 'Handwoven for celebrations.',
        image: 'https://res.cloudinary.com/demo/image/upload/v1/sopii/banners/featured-collection/new.jpg',
        imagePublicId: 'sopii/banners/featured-collection/new',
        imageAlt: 'A festive silk drape',
        // Reordered, one switched off, one added.
        pillars: [
          { ...third },
          { ...first, enabled: false },
          { ...second, title: 'Pure fibres' },
          { id: 'pil_new_client', title: 'Dyed by hand', text: 'Natural dyes only.', enabled: true },
        ],
        ctaEnabled: true,
        ctaText: 'Shop Festive',
        ctaLink: '/collections/festive-edit',
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    const doc = await FeaturedCollectionModel.findById(FEATURED_COLLECTION_ID).lean();
    assert.ok(doc, 'the first save creates the document');
    assert.equal(doc.eyebrow, 'The Festive Edit');
    assert.equal(doc.imagePublicId, 'sopii/banners/featured-collection/new');
    assert.deepEqual(
      doc.pillars.map((pillar) => [pillar.id, pillar.enabled]),
      [
        [third.id, true],
        [first.id, false],
        [second.id, true],
        ['pil_new_client', true],
      ],
    );
    assert.ok(doc.updatedAt);

    const shop = await bootstrap();
    assert.equal(shop.eyebrow, 'The Festive Edit');
    assert.equal(shop.heading, 'Silk for the season.\nCut for the day.');
    assert.equal(shop.imageAlt, 'A festive silk drape');
    assert.match(shop.image, /\/image\/upload\/f_auto,q_auto,c_limit,w_1200,h_1500,dpr_auto\/v1\//);
    assert.equal('imagePublicId' in shop, false);
    assert.deepEqual(
      shop.pillars.map((pillar: { title: string }) => pillar.title),
      ['Made to last', 'Pure fibres', 'Dyed by hand'],
    );
    assert.deepEqual(shop.cta, { text: 'Shop Festive', link: '/collections/festive-edit' });

    assert.notEqual(await versionToken(), tokenBefore, 'open tabs must be told to refresh');
  });

  it('hides the button, then the whole section, with partial saves', async () => {
    assert.equal((await call('/homepage/featured-collection', { method: 'PUT', body: { ctaEnabled: false } })).status, 200);
    let shop = await bootstrap();
    assert.equal(shop.cta, null);
    assert.equal(shop.eyebrow, 'The Festive Edit', 'a toggle must not touch the copy');

    assert.equal((await call('/homepage/featured-collection', { method: 'PUT', body: { enabled: false } })).status, 200);
    shop = await bootstrap();
    assert.deepEqual(shop, { enabled: false });

    const admin = await call('/homepage/featured-collection');
    assert.equal(admin.body.enabled, false);
    assert.equal(admin.body.ctaText, 'Shop Festive', 'hidden copy is kept for when it comes back');
  });

  it('refuses an invalid save and leaves the stored section untouched', async () => {
    const before = await FeaturedCollectionModel.findById(FEATURED_COLLECTION_ID).lean();

    const refused = await call('/homepage/featured-collection', {
      method: 'PUT',
      body: { enabled: true, ctaEnabled: true, ctaText: 'Go', ctaLink: 'javascript:alert(1)' },
    });
    assert.equal(refused.status, 400);
    assert.match(refused.body.message, /must start with/);

    assert.deepEqual(await FeaturedCollectionModel.findById(FEATURED_COLLECTION_ID).lean(), before);
  });

  it('lets a role read but not edit without the homepage edit permission', async () => {
    role = { key: 'viewer', permissions: { homepage: { view: true } } };
    try {
      assert.equal((await call('/homepage/featured-collection')).status, 200);
      const refused = await call('/homepage/featured-collection', { method: 'PUT', body: { enabled: true } });
      assert.equal(refused.status, 403);
    } finally {
      role = { key: 'super_admin', permissions: {} };
    }
  });
});
