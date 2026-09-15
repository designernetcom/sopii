/*
 * Gives an existing store its starting announcements.
 * ---------------------------------------------------------------------------
 * `seed.ts` only runs against an empty database, so a store that was seeded
 * before announcements existed has an empty collection — and the storefront
 * strip, which used to be hard-coded, renders nothing until someone adds one.
 * This fills that gap once, with the same copy the shop front used to ship.
 *
 * It refuses to touch a collection that already holds anything. That is what
 * makes it safe to run twice, and it is deliberately NOT run at boot: a boot
 * hook that re-seeds an empty collection would bring back announcements an
 * admin had deleted on purpose.
 *
 *   npm run seed:announcements
 */

import { pathToFileURL } from 'node:url';

import { announcements } from '@/data/cms';

import { connectDb, disconnectDb } from './connect.js';
import { AnnouncementModel } from './models.js';

async function main() {
  await connectDb();

  const existing = await AnnouncementModel.countDocuments();
  if (existing > 0) {
    console.log(`[announcements] ${existing} already present — nothing to do`);
    await disconnectDb();
    return;
  }

  const created = await AnnouncementModel.insertMany(
    announcements.map(({ id, ...rest }) => ({ _id: id, ...rest })),
    { ordered: false },
  );
  console.log(`[announcements] inserted ${created.length}`);

  await disconnectDb();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[announcements] failed:', error?.message ?? error);
    process.exit(1);
  });
}
