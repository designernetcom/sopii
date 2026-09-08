import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../env.js';

/** Hides credentials before a URI ever reaches the logs. */
export function redact(uri: string) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

let embedded: { stop: () => Promise<boolean> } | null = null;

/**
 * Which database the process actually ended up on.
 *
 * The fallback is the whole reason this exists. A server that failed over to
 * the embedded mongod is *connected* — `readyState` is 1, every query
 * succeeds, every endpoint answers quickly — it is simply answering from a
 * different catalogue than the one configured. That is worse than being down,
 * because nothing about the response says so: the only signal is one line at
 * boot, which scrolls away. `/api/health` reports this so the condition is
 * detectable by something other than a person remembering to read the log.
 */
export const dbBackend = (): 'configured' | 'embedded-fallback' =>
  embedded ? 'embedded-fallback' : 'configured';

/**
 * Connects to MongoDB.
 *
 * Preference order:
 *   1. `MONGODB_URI` (a local mongod or an Atlas cluster)
 *   2. an embedded mongod stored under `server/.data/mongo`
 *
 * The fallback exists so the panel runs on a machine with no MongoDB
 * installed. It is a real mongod with a real on-disk data directory — data
 * survives restarts — but it is a development convenience: set
 * `MEMORY_MONGO=false` and the server will refuse to start without a reachable
 * database instead of quietly using it.
 */
export async function connectDb() {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 2500,
      /* Hold a few connections open so a burst of concurrent requests is not
         also a burst of TLS handshakes. See env.mongoMinPoolSize. */
      minPoolSize: env.mongoMinPoolSize,
      maxPoolSize: env.mongoMaxPoolSize,
    });
    console.log(`[db] connected — ${redact(env.mongoUri)}`);
    return;
  } catch (error) {
    if (!env.allowEmbeddedMongo) {
      console.error(`[db] cannot reach ${redact(env.mongoUri)} and MEMORY_MONGO=false.`);
      throw error;
    }
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    console.warn(`[db] ${redact(env.mongoUri)} unreachable (${reason})`);
    console.warn('[db] starting an embedded MongoDB instead — first run downloads a mongod binary.');
  }

  const dbPath = path.resolve(process.cwd(), '.data', 'mongo');
  fs.mkdirSync(dbPath, { recursive: true });

  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: 'wiredTiger', dbName: 'sopii_admin' },
    });
    embedded = server;
    await mongoose.connect(server.getUri('sopii_admin'));
    console.log(`[db] embedded MongoDB ready — data directory ${dbPath}`);
  } catch (error) {
    console.error(
      '[db] could not start an embedded MongoDB. Install MongoDB locally or set MONGODB_URI to an Atlas cluster.',
    );
    throw error;
  }
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (embedded) {
    await embedded.stop();
    embedded = null;
  }
}
