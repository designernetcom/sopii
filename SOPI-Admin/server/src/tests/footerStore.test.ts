/*
 * Tests for footer persistence (`lib/footerStore.ts`) against a real MongoDB.
 * ===========================================================================
 * The footer is one document edited by read-modify-write, which is exactly the
 * shape that loses updates: two admins toggle two different sections at once,
 * both read revision 7, both write, and one toggle silently disappears. These
 * fire the writes together, because a test that awaits each in turn cannot
 * see that bug.
 *
 * Also pinned: the "no document means defaults" rule that keeps an upgraded
 * store's footer from rendering empty, and that a refused edit writes nothing.
 *
 * Run with:  npm test        (in server/)
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { FOOTER_ID, FooterModel } from '../db/models.js';
import { addFooterSection, DEFAULT_FOOTER_SECTIONS, updateFooterSection } from '../lib/footer.js';
import { mutateFooter, readFooter, resetFooter } from '../lib/footerStore.js';
import { HttpError } from '../lib/http.js';

let embedded: { stop: () => Promise<boolean> } | null = null;

before(async () => {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/sopii_test';
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
  } catch {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    embedded = server;
    await mongoose.connect(server.getUri('sopii_test'));
  }
});

after(async () => {
  await FooterModel.deleteOne({ _id: FOOTER_ID });
  await mongoose.disconnect();
  if (embedded) await embedded.stop();
});

beforeEach(async () => {
  await FooterModel.deleteOne({ _id: FOOTER_ID });
});

describe('footer store', () => {
  it('serves the built-in footer until the first save', async () => {
    const config = await readFooter();
    assert.equal(config.updatedAt, null);
    assert.deepEqual(
      config.sections.map((section) => section.id),
      DEFAULT_FOOTER_SECTIONS.map((section) => section.id),
    );
    assert.equal(await FooterModel.countDocuments({ _id: FOOTER_ID }), 0);
  });

  it('materialises the defaults on the first save and round-trips every field', async () => {
    const saved = await mutateFooter((sections) =>
      updateFooterSection(sections, 'fsec_brand', { display: { phone: false } }),
    );
    assert.ok(saved.updatedAt);

    const reread = await readFooter();
    assert.equal(reread.sections.length, DEFAULT_FOOTER_SECTIONS.length);
    const brand = reread.sections.find((section) => section.id === 'fsec_brand')!;
    assert.deepEqual(brand.display, { logo: true, address: true, email: true, phone: false });

    const social = reread.sections.find((section) => section.id === 'fsec_social')!;
    assert.equal(social.enabled, false);
    assert.equal(social.items[0].color, '#E1306C');
    // Embedded items keep their own `id` and gain no Mongo `_id`.
    assert.equal('_id' in social.items[0], false);
    // Only the brand section carries display switches.
    assert.equal(reread.sections.find((section) => section.id === 'fsec_shop')!.display, undefined);
  });

  it('writes nothing when the change is refused', async () => {
    await assert.rejects(
      mutateFooter((sections) => addFooterSection(sections, { type: 'copyright', content: '©' })),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
    assert.equal(await FooterModel.countDocuments({ _id: FOOTER_ID }), 0);
  });

  it('loses no update when several first saves race', async () => {
    const TITLES = ['One', 'Two', 'Three', 'Four', 'Five'];

    const results = await Promise.allSettled(
      TITLES.map((title) =>
        mutateFooter((sections) => addFooterSection(sections, { type: 'links', title })),
      ),
    );

    const titles = (await readFooter()).sections.map((section) => section.title);
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        assert.ok(titles.includes(TITLES[index]), `"${TITLES[index]}" reported saved but is missing`);
      } else {
        assert.equal((result.reason as HttpError).status, 409);
      }
    });
    assert.ok(results.some((result) => result.status === 'fulfilled'));
    assert.equal(await FooterModel.countDocuments({ _id: FOOTER_ID }), 1);
  });

  it('keeps concurrent toggles of different sections', async () => {
    await mutateFooter((sections) => sections); // materialise

    const targets = ['fsec_shop', 'fsec_care', 'fsec_about', 'fsec_legal'];
    const results = await Promise.allSettled(
      targets.map((id) =>
        mutateFooter((sections) => updateFooterSection(sections, id, { enabled: false })),
      ),
    );

    const sections = (await readFooter()).sections;
    results.forEach((result, index) => {
      if (result.status === 'rejected') return;
      const section = sections.find((candidate) => candidate.id === targets[index])!;
      assert.equal(section.enabled, false, `${targets[index]} toggle was lost`);
    });
    assert.ok(results.filter((result) => result.status === 'fulfilled').length >= 1);
  });

  it('reset goes back to the defaults', async () => {
    await mutateFooter((sections) => sections.filter((section) => section.type !== 'legal'));
    assert.equal(
      (await readFooter()).sections.some((section) => section.type === 'legal'),
      false,
    );

    const config = await resetFooter();
    assert.equal(config.updatedAt, null);
    assert.ok(config.sections.some((section) => section.type === 'legal'));
  });
});
