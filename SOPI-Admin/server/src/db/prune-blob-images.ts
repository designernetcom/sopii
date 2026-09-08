/*
 * Removes dead `blob:` image URLs from the catalogue.
 *
 * The product gallery editor used to preview picked files with
 * `URL.createObjectURL`, and that object URL was what got saved. Such a URL is
 * a pointer into the memory of the one browser tab that created it: the image
 * looked right in the panel that uploaded it and was already unreachable
 * everywhere else — after a reload, and on the shop front, which runs on a
 * different origin and never had the blob to begin with.
 *
 * The editor now uploads real bytes to the media library, and the API rejects
 * `blob:` on write, so nothing new arrives in this state. This clears what was
 * stored while the old behaviour was live: products fall back to their
 * generated swatch until a real image is uploaded, which is what the shop front
 * was already showing.
 *
 * Only image fields are touched. Re-runnable and idempotent.
 *
 * Run with: npm run prune:blob-images   (from ./server)
 */

import { pathToFileURL } from 'node:url';

import { connectDb, disconnectDb } from './connect.js';
import { ProductModel } from './models.js';

const isBlob = (url?: string | null) => /^blob:/i.test(url ?? '');

export async function pruneBlobImages() {
  const products = await ProductModel.find(
    { $or: [{ 'images.url': /^blob:/i }, { 'variants.image': /^blob:/i }, { 'seo.ogImage': /^blob:/i }] },
    { name: 1, images: 1, variants: 1, seo: 1 },
  ).lean();

  if (!products.length) {
    console.log('[prune] nothing to do — no blob: URLs found');
    return 0;
  }

  console.log(`[prune] ${products.length} product(s) hold blob: URLs`);

  const operations = products.map((product) => {
    const images = (product.images ?? []).filter((image) => !isBlob(image?.url));
    // The gallery leads with its main image, so promote whatever survived.
    const repaired = images.map((image, i) => ({ ...image, isMain: i === 0 }));

    const variants = (product.variants ?? []).map((variant) =>
      isBlob(variant?.image) ? { ...variant, image: repaired[0]?.url } : variant,
    );

    const dropped = (product.images ?? []).length - images.length;
    console.log(`[prune]   ${product.name}: dropped ${dropped}, ${repaired.length} left`);

    const update: Record<string, unknown> = { images: repaired, variants };
    if (isBlob(product.seo?.ogImage)) update['seo.ogImage'] = repaired[0]?.url;

    return { updateOne: { filter: { _id: product._id }, update: { $set: update } } };
  });

  const result = await ProductModel.bulkWrite(operations, { ordered: false });
  console.log(`[prune] matched ${result.matchedCount}, modified ${result.modifiedCount}`);
  return result.modifiedCount;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  connectDb()
    .then(pruneBlobImages)
    .then(async () => {
      await disconnectDb();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('[prune] failed:', error);
      await disconnectDb().catch(() => {});
      process.exit(1);
    });
}
