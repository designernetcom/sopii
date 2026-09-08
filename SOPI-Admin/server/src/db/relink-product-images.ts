/*
 * Repoints every product in Mongo at the shipped product photography.
 *
 * The catalogue was seeded with generated asset paths (`/media/products/<slug>-1.jpg`)
 * that never had files behind them. This rewrites only the image fields —
 * gallery, variant thumbnails and the OG image — so pricing, stock, orders and
 * every other relation survive untouched. Re-runnable and idempotent.
 *
 * Run with: npm run relink:images   (from ./server)
 */

import { pathToFileURL } from 'node:url';

import { PRODUCT_IMAGES } from '@/data/products';

import { connectDb, disconnectDb } from './connect.js';
import { ProductModel } from './models.js';

/**
 * Mirrors `galleryFor` in `src/data/products.ts`: the rotation is keyed off the
 * product's ordinal (`prd_0230` → 229, held in `_id`) so a record updated here
 * and the same record produced by a fresh seed land on identical URLs.
 */
function galleryFor(offset: number) {
  return PRODUCT_IMAGES.map((_, i) => PRODUCT_IMAGES[(offset + i) % PRODUCT_IMAGES.length]);
}

function ordinalOf(id: string, fallback: number) {
  const parsed = Number.parseInt(id.replace(/^\D+/, ''), 10);
  return Number.isFinite(parsed) ? parsed - 1 : fallback;
}

export async function relinkProductImages() {
  const products = await ProductModel.find({}, { name: 1, sku: 1, variants: 1 }).lean();
  console.log(`[relink] ${products.length} products, ${PRODUCT_IMAGES.length} source images`);

  const operations = products.map((product, position) => {
    const gallery = galleryFor(ordinalOf(product._id, position));
    const variants = (product.variants ?? []).map((variant, i) => ({
      ...variant,
      image: gallery[(i + 1) % gallery.length],
    }));

    return {
      updateOne: {
        filter: { _id: product._id },
        update: {
          $set: {
            images: gallery.map((url, i) => ({
              id: `${product.sku}-img-${i + 1}`,
              url,
              alt: `${product.name} — view ${i + 1}`,
              isMain: i === 0,
            })),
            variants,
            'seo.ogImage': gallery[0],
          },
        },
      },
    };
  });

  if (!operations.length) {
    console.log('[relink] nothing to do — no products found');
    return 0;
  }

  const result = await ProductModel.bulkWrite(operations, { ordered: false });
  console.log(`[relink] matched ${result.matchedCount}, modified ${result.modifiedCount}`);
  return result.modifiedCount;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  connectDb()
    .then(relinkProductImages)
    .then(async () => {
      await disconnectDb();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('[relink] failed:', error);
      await disconnectDb().catch(() => {});
      process.exit(1);
    });
}
