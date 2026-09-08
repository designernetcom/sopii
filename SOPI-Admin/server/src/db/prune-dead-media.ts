/*
 * Removes media-library records whose file does not exist.
 * ---------------------------------------------------------------------------
 * The seeded library was written with 48 records pointing at paths under
 * `public/media` — eight each in products, banners, categories, collections,
 * blog and other. Only `products/` was ever shipped, and only with four files
 * none of those records name. So all 48 have always referred to nothing.
 *
 * They are not harmless. The panel's Media page renders a thumbnail per
 * record, so opening it fires one 404 per entry, and `migrate-cloudinary`
 * counts all 48 as failures every run — it will not replace a field it cannot
 * first upload and verify, which is correct, and which means these records can
 * never be migrated, only removed.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WILL NOT TOUCH
 * ---------------------------------------------------------------------------
 * A record is only ever deleted when its `url` is a local path with no file
 * behind it. Anything on Cloudinary, anything on another http(s) host, and
 * anything whose file actually resolves under MEDIA_DIR is left alone — so
 * this stays safe to run against a library holding real assets, and safe to
 * re-run.
 *
 * These are seed records. `npm run seed` writes them again if you want them
 * back, dead paths and all.
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *   npm run prune:dead-media                 # dry run — reports, deletes nothing
 *   npm run prune:dead-media -- --confirm    # delete
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { env } from '../env.js';
import { connectDb, disconnectDb } from './connect.js';
import { MediaModel } from './models.js';
import { isCloudinaryUrl } from '../lib/cloudinary.js';

/** Where a record's bytes are, if anywhere. */
type Verdict = 'remote' | 'present' | 'dead';

function classify(url: unknown): Verdict {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value) return 'dead';

  // Anything already off this disk is somebody else's to worry about.
  if (isCloudinaryUrl(value) || /^https?:\/\//i.test(value) || /^data:/i.test(value)) {
    return 'remote';
  }

  const relative = value.replace(/^\/media\//, '').replace(/^\/+/, '');

  /* A path that climbs out of MEDIA_DIR is not a media path, and resolving it
     would be reason enough to refuse rather than to delete on. */
  const resolved = path.resolve(env.mediaDir, relative);
  const root = path.resolve(env.mediaDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return 'remote';

  return fs.existsSync(resolved) ? 'present' : 'dead';
}

async function main() {
  const confirm = process.argv.slice(2).includes('--confirm');

  await connectDb();

  const assets = await MediaModel.find({}).lean();
  const dead: { id: string; url: string; folder?: string }[] = [];
  let remote = 0;
  let present = 0;

  for (const asset of assets as Record<string, unknown>[]) {
    const verdict = classify(asset.url);
    if (verdict === 'remote') remote += 1;
    else if (verdict === 'present') present += 1;
    else {
      dead.push({
        id: String(asset._id),
        url: String(asset.url ?? '(empty)'),
        folder: asset.folder as string | undefined,
      });
    }
  }

  const byFolder: Record<string, number> = {};
  for (const asset of dead) {
    const key = asset.folder || asset.url.replace(/^\/media\//, '').split('/')[0] || '?';
    byFolder[key] = (byFolder[key] ?? 0) + 1;
  }

  for (const asset of dead.slice(0, 10)) {
    console.log(`[media] ${confirm ? 'deleting' : 'would delete'} ${asset.id} → ${asset.url}`);
  }
  if (dead.length > 10) console.log(`[media] …and ${dead.length - 10} more`);

  if (confirm && dead.length) {
    const result = await MediaModel.deleteMany({ _id: { $in: dead.map((d) => d.id) } });
    console.log(`[media] deleted ${result.deletedCount} record(s)`);
  }

  console.log('\n──────────────────── dead media ────────────────────');
  console.log(`  Records scanned          ${assets.length}`);
  console.log(`  File present on disk     ${present}`);
  console.log(`  Remote (CDN / http)      ${remote}`);
  console.log(`  Dead ${confirm ? 'deleted  ' : 'to delete'}           ${dead.length}`);
  for (const [folder, count] of Object.entries(byFolder)) {
    console.log(`      ${folder.padEnd(14)} ${count}`);
  }
  console.log('────────────────────────────────────────────────────');

  if (!confirm) {
    console.log('\n  DRY RUN — nothing was deleted.');
    console.log('  Re-run with --confirm to apply.\n');
  }

  await disconnectDb();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[media] failed:', error?.message ?? error);
    process.exit(1);
  });
}
