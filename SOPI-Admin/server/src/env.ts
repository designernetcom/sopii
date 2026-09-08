import dns from 'node:dns';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/*
 * Resolve IPv4 first, for every outbound connection any entrypoint makes.
 *
 * Node 17 changed the default to `verbatim`, which hands DNS results to the
 * connector in the order the resolver returned them — IPv6 usually first. That
 * is right on a network whose IPv6 routes. On one whose IPv6 does not, every
 * connection stalls on a dead AAAA address before falling back, and the cost is
 * paid per connection, forever.
 *
 * This machine resolves api.razorpay.com to 64:ff9b::… — the NAT64 well-known
 * prefix, an IPv4 host wrapped in IPv6 — with no NAT64 route behind it.
 * Measured: Razorpay went from a 25 s timeout to 439 ms, and Atlas connect from
 * 9.3 s to 2.3 s. It also hits the *pool*, not just the first connect, which is
 * why a burst of concurrent queries collapsed before this.
 *
 * It lives HERE rather than in index.ts because every entrypoint imports this
 * module — the server, the migrations, `email:test`, the seed scripts. It was
 * in index.ts first, and the scripts silently kept the old behaviour: a test
 * email timed out at 10 s against a relay the server could reach in under
 * one.
 *
 * This routes around a broken network rather than fixing it. If IPv6 is ever
 * made to work here, this line stops being necessary and should go.
 */
dns.setDefaultResultOrder('ipv4first');

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/*
 * Resolved against the server directory rather than process.cwd(), so the
 * config is found whether you run `npm run dev` from server/ or invoke the
 * entrypoint from the repo root. `src/.env` is also checked because that is an
 * easy place to drop the file by mistake; the server root wins.
 */
dotenv.config({ path: path.join(serverRoot, '.env') });
dotenv.config({ path: path.join(serverRoot, 'src', '.env') });

function list(value: string | undefined, fallback: string[]) {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * A connection string with no database path (`...mongodb.net/`) silently lands
 * in Mongo's default `test` database, which is a confusing way to lose your
 * data. Default it explicitly instead.
 */
export function withDatabaseName(uri: string, fallbackDb = 'sopii_admin') {
  const [head, query] = uri.split('?');
  const afterScheme = head.split('://')[1] ?? '';
  const dbName = afterScheme.split('/')[1] ?? '';
  if (dbName) return uri;
  return `${head.replace(/\/$/, '')}/${fallbackDb}${query ? `?${query}` : ''}`;
}

const rawUri = process.env.MONGODB_URI?.trim().replace(/^["']|["']$/g, '');

/**
 * Cloudinary's own SDK reads a single `CLOUDINARY_URL` of the form
 * `cloudinary://<api_key>:<api_secret>@<cloud_name>`, and their dashboard hands
 * you that one line. Parsing it here means a deployment can paste the line it
 * was given instead of splitting it into three by hand.
 */
function parseCloudinaryUrl(value: string | undefined) {
  const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(value?.trim() ?? '');
  if (!match) return null;
  return { apiKey: match[1], apiSecret: match[2], cloudName: match[3].split('/')[0] };
}

const cloudinaryUrl = parseCloudinaryUrl(process.env.CLOUDINARY_URL);

/**
 * One Cloudinary credential, from whichever of the three spellings is present.
 *
 * The documented names win. `CLOUDINARY_NAME`/`_KEY`/`_SECRET` are accepted
 * because that is what an existing deployment's .env already used, and
 * `CLOUDINARY_URL` last because it is the SDK's own convention.
 */
function cloudinaryValue(
  canonical: string,
  alias: string,
  fromUrl: 'cloudName' | 'apiKey' | 'apiSecret',
): string {
  return (
    process.env[canonical]?.trim() ||
    process.env[alias]?.trim() ||
    cloudinaryUrl?.[fromUrl] ||
    ''
  );
}

/**
 * The credential Mailtrap's Email Sending dashboard hands you, accepted under
 * the name it is given there.
 *
 * On SMTP a Mailtrap API token *is* the password, and the user is the literal
 * string `api` — a mapping an operator has no reason to know, and the one
 * step that is silently wrong when a token is pasted into MAILTRAP_PASSWORD
 * while MAILTRAP_USER still holds a sandbox inbox id. So a token on its own is
 * enough: it fills in the user, and points the host at live sending, because a
 * token is only ever issued for a sending domain — the sandbox has no tokens,
 * only inbox credentials. Anything set explicitly still wins.
 */
const mailtrapApiToken = process.env.MAILTRAP_API_TOKEN?.trim() ?? '';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),

  mongoUri: withDatabaseName(rawUri || 'mongodb://127.0.0.1:27017/sopii_admin'),

  /**
   * When the configured MongoDB is unreachable, boot an embedded mongod so the
   * panel still runs on a clean machine. Set MEMORY_MONGO=false to hard-fail
   * instead — which is what you want once a real database is configured.
   */
  allowEmbeddedMongo: process.env.MEMORY_MONGO === 'true',

  /**
   * Connections the driver keeps open even while idle.
   *
   * The default is 0: every connection is opened on demand and closed when the
   * pool trims, so the first burst of concurrent requests after a restart or a
   * quiet spell pays a TLS handshake to Atlas *each*. Measured against this
   * cluster, six parallel queries cost 3,793 ms on a cold pool and 791 ms on a
   * warm one — which is most of the multi-second spikes that show up on the
   * admin panel's first paint, where a dozen endpoints load at once.
   *
   * Keep it comfortably under the cluster's connection limit: this is per
   * server process, so the ceiling is this number times however many instances
   * are running.
   */
  mongoMinPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE ?? 5),
  mongoMaxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE ?? 50),

  jwtSecret: process.env.JWT_SECRET ?? 'sopii-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  /** Shop accounts stay signed in far longer than admins — nobody wants to log
      in again to check where last week's saree got to. */
  shopSessionExpiresIn: process.env.SHOP_SESSION_EXPIRES_IN ?? '30d',

  corsOrigins: list(process.env.CORS_ORIGIN, [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]),

  /** Password every seeded admin gets, so the demo logins keep working. */
  seedPassword: process.env.SEED_PASSWORD ?? 'sopii123',

  /**
   * The media library on disk, served at `/media`. Defaults to the admin
   * panel's own `public/media`, which is where its dev server reads the same
   * files from — so one copy of a photograph serves both the panel and the
   * shop front, and a `/media/...` path means the same thing everywhere.
   */
  mediaDir: process.env.MEDIA_DIR
    ? path.resolve(process.env.MEDIA_DIR)
    : path.join(serverRoot, '..', 'public', 'media'),

  /**
   * Cloudinary — where product and banner imagery actually lives.
   *
   * THE API SECRET STAYS HERE. It signs upload and destroy calls, so anyone
   * holding it can write to and delete from the account. It is never returned
   * by an endpoint and must never appear in a VITE_-prefixed variable: the
   * admin panel uploads through this server precisely so the browser never
   * needs it. The cloud name is public by design (it is in every delivery
   * URL); the API key is not a signing credential on its own but is kept
   * server-side with the rest.
   *
   * With all three empty the upload endpoints answer 503 rather than quietly
   * writing base64 back into MongoDB.
   */
  cloudinary: {
    cloudName: cloudinaryValue('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_NAME', 'cloudName'),
    apiKey: cloudinaryValue('CLOUDINARY_API_KEY', 'CLOUDINARY_KEY', 'apiKey'),
    apiSecret: cloudinaryValue('CLOUDINARY_API_SECRET', 'CLOUDINARY_SECRET', 'apiSecret'),
    /** Top-level folder, so one account can host more than one store. */
    folder: process.env.CLOUDINARY_FOLDER?.trim() || 'sopii',
    /** Largest single image accepted, decoded, in bytes. */
    maxUploadBytes: Number(process.env.CLOUDINARY_MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),
  },

  /**
   * Transactional email, through Mailtrap.
   * -------------------------------------------------------------------------
   * The ONLY mail provider this server knows about. Order confirmation,
   * shipped, delivered, cancelled and password-reset mail all leave through
   * `lib/mailtrap.ts`, which is the one module holding these values.
   *
   * THE CREDENTIALS STAY HERE. A Mailtrap inbox credential can send mail as
   * this store, so it is never returned by an endpoint and must never appear
   * in a VITE_-prefixed variable — the browser has no reason to know the store
   * sends email at all. `SOPI-Admin/.env` and `SOPII/.env` hold no mail
   * configuration whatsoever, deliberately.
   *
   * With the host, user or password empty, `EmailService.isConfigured` is
   * false: sends are recorded against the order as `skipped` rather than
   * attempted, so a store with no mailer still checks out and the panel says
   * plainly that no mailer is configured rather than showing a failure nobody
   * can act on.
   *
   * Mailtrap gives you these on the inbox's SMTP tab (sandbox) or under
   * Sending Domains → SMTP (live):
   *   host  sandbox.smtp.mailtrap.io   |  live.smtp.mailtrap.io
   *   port  2525 / 587 / 25 / 465      |  587 / 2525 / 465
   */
  mailtrap: {
    host: process.env.MAILTRAP_HOST?.trim() || (mailtrapApiToken ? 'live.smtp.mailtrap.io' : ''),
    port: Number(process.env.MAILTRAP_PORT ?? (mailtrapApiToken ? 587 : 2525)),
    user: process.env.MAILTRAP_USER?.trim() || (mailtrapApiToken ? 'api' : ''),
    /*
     * Not trimmed of internal whitespace, only of the ends. A password that
     * contains a space is a password whose space is part of the secret; only
     * a stray leading or trailing one from a copy-paste is removed.
     */
    password: process.env.MAILTRAP_PASSWORD?.replace(/^\s+|\s+$/g, '') || mailtrapApiToken,
    /** Kept so a health check can name which credential shape is in use. */
    apiToken: mailtrapApiToken,
    /** Must be on a domain verified in Mailtrap, or live sending is refused. */
    fromEmail: process.env.MAILTRAP_FROM_EMAIL?.trim() ?? '',
    fromName: process.env.MAILTRAP_FROM_NAME?.trim() || 'SOPII',
    /**
     * Implicit TLS from the first byte — port 465 only. Mailtrap's documented
     * ports (2525, 587, 25) upgrade with STARTTLS instead, which nodemailer
     * does on its own, so this is derived rather than configured.
     */
    secure: Number(process.env.MAILTRAP_PORT) === 465,
    /**
     * One send's ceiling, applied to the connection, the greeting and the
     * socket. Past it the job is retried rather than holding a worker on a
     * socket that is not going to answer.
     */
    timeoutMs: Number(process.env.MAILTRAP_TIMEOUT_MS ?? 10_000),
  },

  /**
   * What goes *inside* the mail, as opposed to how it is delivered.
   *
   * Separate from `mailtrap` on purpose: swapping the provider should not
   * disturb the tracking link or the support footer, and none of this is
   * secret.
   */
  email: {
    /** Where "Track Order" points. Falls back to the shop front's own origin. */
    orderTrackingBase:
      process.env.ORDER_TRACKING_URL?.trim() ||
      `${(process.env.SHOP_URL?.trim() || 'http://localhost:5174').replace(/\/+$/, '')}/account/orders`,
    /** The shop front's origin — the logo and the reset link are served from it. */
    shopUrl: (process.env.SHOP_URL?.trim() || 'http://localhost:5174').replace(/\/+$/, ''),
    supportEmail: process.env.SUPPORT_EMAIL?.trim() || '',
    supportPhone: process.env.SUPPORT_PHONE?.trim() || '',
  },
};

export const isProduction = env.nodeEnv === 'production';
