/*
 * Gives every banner a real image on Cloudinary.
 * ---------------------------------------------------------------------------
 * The seeded banners were written pointing at `/media/banners/festive-desktop.jpg`
 * and seven siblings. Those files were never shipped: `public/media` contains
 * `products/` and nothing else, so all eight references have always been 404s.
 * `migrate-cloudinary` therefore had nothing to move — it refuses to replace a
 * field it cannot first upload and verify, which is the correct behaviour and
 * why those eight are the "failed uploads" in its summary.
 *
 * The shop front already survives this: `Hero.jsx` retires a source that
 * errors and falls through to generated art, so the page looks fine. It is
 * still wrong — the store shows art it did not choose, and every visitor pays
 * a 404 round trip per banner to discover it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS USES FOR ARTWORK
 * ---------------------------------------------------------------------------
 * There is no banner photography in this repository. The only usable images
 * are the four product photographs under `public/media/products`, which are
 * portrait (~850x1280) and were composed for a product card, not a hero.
 *
 * So this is a stopgap, and deliberately a visible one: it puts a real,
 * CDN-delivered, correctly-filed asset behind every banner slot so the
 * pipeline is exercised end to end and the 404s stop. It is NOT a substitute
 * for artwork. Replace each banner's image from the admin panel — that upload
 * lands in the same folder and overwrites what this wrote.
 *
 * Each slot gets its OWN asset rather than sharing one. `reapUnreferenced` in
 * routes/cms.ts is reference-counted, so sharing would in fact be safe; owning
 * one each simply means replacing the mobile crop cannot surprise the desktop
 * plate.
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *   npm run seed:banner-images                 # dry run — reports, changes nothing
 *   npm run seed:banner-images -- --confirm    # upload and write
 *
 *   --force      also replace slots that already hold a Cloudinary image
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { env } from '../env.js';
import { connectDb, disconnectDb } from './connect.js';
import { BannerModel } from './models.js';
import {
  bannerFolder,
  isCloudinaryUrl,
  uploadImage,
  verifyCredentials,
} from '../lib/cloudinary.js';

/** The two image fields a banner carries, and where their handles live. */
const SLOTS = [
  { slot: 'desktop', url: 'desktopImage', publicId: 'desktopImagePublicId' },
  { slot: 'mobile', url: 'mobileImage', publicId: 'mobileImagePublicId' },
] as const;

/**
 * The stopgap artwork, in rotation so four banners do not all show the same
 * photograph. Resolved against MEDIA_DIR rather than hard-coded, so a store
 * that has put real files there gets those instead.
 */
const SOURCES = ['saree-01.jpg', 'saree-02.jpg', 'saree-03.jpg', 'saree-04.jpg'];

function resolveSource(name: string): string | null {
  const file = path.resolve(env.mediaDir, 'products', name);
  return fs.existsSync(file) ? file : null;
}

/** True when a slot has nothing usable: empty, or a path with no file behind it. */
function needsImage(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return true;
  if (isCloudinaryUrl(value)) return false;
  if (/^https?:\/\//i.test(value)) return false;

  // A /media/... path is only real if the file is actually there.
  const relative = value.replace(/^\/media\//, '').replace(/^\/+/, '');
  return !fs.existsSync(path.resolve(env.mediaDir, relative));
}

async function main() {
  const argv = process.argv.slice(2);
  const confirm = argv.includes('--confirm');
  const force = argv.includes('--force');

  await verifyCredentials();
  await connectDb();

  const banners = await BannerModel.find({}).sort({ sortOrder: 1 }).lean();
  if (!banners.length) {
    console.log('[banners] none found');
    await disconnectDb();
    return;
  }

  let filled = 0;
  let skipped = 0;
  const failures: { record: string; field: string; message: string }[] = [];

  for (const [index, banner] of banners.entries()) {
    const id = String(banner._id);
    const folder = bannerFolder(id);
    const update: Record<string, string> = {};

    for (const { slot, url, publicId } of SLOTS) {
      const current = (banner as Record<string, unknown>)[url];
      if (!force && !needsImage(current)) {
        skipped += 1;
        continue;
      }

      /* Rotate over the sources, and offset the mobile plate so a banner's two
         crops are not the identical photograph. */
      const pick = SOURCES[(index + (slot === 'mobile' ? 1 : 0)) % SOURCES.length];
      const file = resolveSource(pick);
      if (!file) {
        failures.push({ record: id, field: url, message: `no source image at ${pick}` });
        continue;
      }

      if (!confirm) {
        console.log(`[banners]   would upload ${pick} → ${folder}/${slot}  (${id}.${url})`);
        filled += 1;
        continue;
      }

      try {
        const uploaded = await uploadImage(fs.readFileSync(file), {
          folder,
          publicId: slot,
          overwrite: true,
          tags: ['banner', id, 'placeholder'],
        });
        update[url] = uploaded.url;
        update[publicId] = uploaded.publicId;
        filled += 1;
        console.log(`[banners]   ${id}.${url} → ${uploaded.publicId}`);
      } catch (error) {
        failures.push({
          record: id,
          field: url,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Written once per banner, and only for the slots that actually landed.
    if (confirm && Object.keys(update).length) {
      await BannerModel.updateOne({ _id: banner._id }, { $set: update });
    }
  }

  console.log('\n──────────────────── banner images ────────────────────');
  console.log(`  Banners scanned          ${banners.length}`);
  console.log(`  Slots ${confirm ? 'filled ' : 'to fill'}            ${filled}`);
  console.log(`  Slots already usable     ${skipped}`);
  console.log(`  Failures                 ${failures.length}`);
  for (const f of failures) console.log(`    · ${f.record} ${f.field}: ${f.message}`);
  console.log('───────────────────────────────────────────────────────');

  if (!confirm) {
    console.log('\n  DRY RUN — nothing was uploaded and nothing was written.');
    console.log('  Re-run with --confirm to apply.\n');
  }

  await disconnectDb();
  if (failures.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[banners] failed:', error?.message ?? error);
    process.exit(1);
  });
}
