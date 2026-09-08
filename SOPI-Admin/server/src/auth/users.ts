/*
 * The identity service, and its bridge to the commerce records.
 * ===========================================================================
 * `users` is the identity (§9). The store also has two older records that
 * existing screens read from and write to: `customers` (someone who buys) and
 * `admin_users` (someone who runs the shop). This file is the single place
 * that knows how the three relate.
 *
 * The rule: an identity *owns* its commerce records and is created first. A
 * customer record is materialised the moment it is needed — at registration,
 * or on the first order — so an OTP-only shopper who has never bought anything
 * does not clutter the panel's customer list with an empty row.
 *
 * Keeping this in one file is what stops the sync rules leaking into eight
 * route handlers, and what makes the auth layer liftable: swap this file and
 * the rest of `auth/` works against a different back end unchanged.
 */

import type { Role } from '@/types';
import { AdminUserModel, CustomerModel, RoleModel, type CustomerDoc } from '../db/models.js';
import { nextId, nowIso } from '../lib/http.js';
import { id } from './crypto.js';
import { maskEmail } from './identifiers.js';
import {
  ADMIN_ROLE_KEY_TO_ROLE,
  ROLE_TO_ADMIN_ROLE_KEY,
  SessionModel,
  UserIdentityModel,
  UserModel,
  isAdminRole,
  type AuthProvider,
  type AuthRole,
  type SessionDoc,
  type UserDoc,
  type UserIdentityDoc,
} from './models.js';

/* ------------------------------- fetching ---------------------------------- */

/** With the password hash, which is `select: false` by default. */
export const findUserWithSecret = (filter: Record<string, unknown>) =>
  UserModel.findOne(filter).select('+passwordHash').lean<UserDoc>();

export const findUserById = (userId: string) => UserModel.findById(userId).lean<UserDoc>();

export const findUserByEmail = (email: string) =>
  UserModel.findOne({ email: email.toLowerCase() }).lean<UserDoc>();

export const findUserByMobile = (mobile: string) =>
  UserModel.findOne({ mobile }).lean<UserDoc>();

/**
 * §2's "Email / Username" box: a bare handle is matched against the local part
 * of an email, since the store has no separate username column.
 *
 * Anchored, case-insensitive, and the handle is escaped — an unescaped value
 * here would let `.*` match every account in the collection.
 */
export function findUserByUsername(username: string) {
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return UserModel.findOne({ email: new RegExp(`^${escaped}@`, 'i') })
    .select('+passwordHash')
    .lean<UserDoc>();
}

/* ------------------------------- identities -------------------------------- */

export const listIdentities = (userId: string) =>
  UserIdentityModel.find({ userId }).sort({ createdAt: 1 }).lean<UserIdentityDoc[]>();

export const findIdentity = (provider: AuthProvider, providerUserId: string) =>
  UserIdentityModel.findOne({ provider, providerUserId }).lean<UserIdentityDoc>();

/**
 * Records that an identity can authenticate a particular way.
 *
 * Idempotent: signing in with Google for the tenth time updates `lastUsedAt`
 * rather than adding a tenth row.
 */
export async function linkIdentity({
  userId,
  provider,
  providerUserId,
  providerEmail,
}: {
  userId: string;
  provider: AuthProvider;
  providerUserId: string;
  providerEmail?: string;
}) {
  await UserIdentityModel.updateOne(
    { provider, providerUserId },
    {
      $set: { userId, providerEmail, lastUsedAt: new Date() },
      $setOnInsert: { _id: id('uid'), createdAt: new Date() },
    },
    { upsert: true },
  );
}

export async function unlinkIdentity(userId: string, provider: AuthProvider) {
  await UserIdentityModel.deleteMany({ userId, provider });
}

/**
 * How many *distinct credentials* this identity can still get in with (§26).
 *
 * Credentials, not methods — the difference matters exactly once, and it is
 * the case that locks people out. SMS OTP and WhatsApp are listed separately
 * on the security screen, because that is what a person recognises, but they
 * are two channels onto one thing: the phone number. Lose the number and both
 * go. So they count once here, and an account whose only way in is that number
 * is refused permission to remove either of them.
 *
 * Counting them as two would let such an account delete its way out of
 * existence in two clicks — each removal individually leaving "another method"
 * that is really the same credential.
 *
 * A password counts even without a `password` identity row, because older
 * accounts predate the identities table and their hash is the real answer to
 * "can this person still sign in".
 */
export async function countAuthMethods(user: UserDoc): Promise<number> {
  const identities = await listIdentities(user._id);
  const credentials = new Set<string>(
    identities.map((entry) => (entry.provider === 'whatsapp' ? 'otp' : entry.provider)),
  );
  if (user.passwordHash) credentials.add('password');
  if (user.mobile && (user.mobileVerifiedAt || user.whatsappVerifiedAt)) credentials.add('otp');
  return credentials.size;
}

/* -------------------------------- creating --------------------------------- */

export interface NewUserInput {
  firstName: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  passwordHash?: string;
  profileImage?: string;
  role?: AuthRole;
  emailVerified?: boolean;
  mobileVerified?: boolean;
  acceptsMarketing?: boolean;
  acceptedTerms?: boolean;
}

/**
 * Creates an identity.
 *
 * `role` defaults to `customer` and every public entry point calls this
 * without one — §10's "never allow users to select an administrative role
 * during public registration" is enforced by the callers *and* by this
 * default, so a forgotten check downgrades to safe rather than to admin.
 */
export async function createUser(input: NewUserInput): Promise<UserDoc> {
  const now = new Date();
  const created = await UserModel.create({
    _id: id('usr'),
    firstName: input.firstName.trim(),
    lastName: input.lastName?.trim() || undefined,
    email: input.email?.toLowerCase(),
    mobile: input.mobile,
    passwordHash: input.passwordHash,
    passwordUpdatedAt: input.passwordHash ? now : undefined,
    profileImage: input.profileImage,
    status: 'active',
    emailVerifiedAt: input.emailVerified ? now : undefined,
    mobileVerifiedAt: input.mobileVerified ? now : undefined,
    role: input.role ?? 'customer',
    failedLoginCount: 0,
    acceptsMarketing: Boolean(input.acceptsMarketing),
    acceptedTermsAt: input.acceptedTerms ? now : undefined,
  });

  return created.toObject() as UserDoc;
}

export const fullName = (user: Pick<UserDoc, 'firstName' | 'lastName'>) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

/* --------------------------- the commerce bridge --------------------------- */

/**
 * The `customers` row this identity owns, created on demand.
 *
 * Called at registration and before checkout, never speculatively: an identity
 * that has only ever received an OTP has no business appearing in the panel's
 * customer list until it does something a shopkeeper would care about.
 */
export async function ensureCustomerRecord(user: UserDoc): Promise<CustomerDoc> {
  if (user.customerId) {
    const existing = await CustomerModel.findById(user.customerId).lean<CustomerDoc>();
    if (existing) return existing;
  }

  /*
   * A customer may already exist with this email — the panel seeds them, and a
   * guest checkout creates one. Claiming that record rather than making a
   * second is what keeps a shopper's order history intact when they finally
   * create an account (§8's "do not create duplicate accounts", applied to the
   * commerce side).
   */
  const claimed = user.email
    ? await CustomerModel.findOne({ email: new RegExp(`^${escapeRegExp(user.email)}$`, 'i') })
        .lean<CustomerDoc>()
    : null;

  if (claimed) {
    await UserModel.updateOne({ _id: user._id }, { $set: { customerId: claimed._id } });
    await CustomerModel.updateOne(
      { _id: claimed._id },
      {
        $set: {
          name: fullName(user) || claimed.name,
          phone: user.mobile ?? claimed.phone,
          avatar: user.profileImage ?? claimed.avatar,
        },
      },
    );
    return claimed;
  }

  const customer = await CustomerModel.create({
    _id: nextId('cus'),
    name: fullName(user) || 'SOPII customer',
    email: user.email ?? `${user._id}@no-email.sopii.local`,
    phone: user.mobile ?? '',
    avatar: user.profileImage,
    status: 'active',
    tier: 'new',
    addresses: [],
    wishlist: [],
    ordersCount: 0,
    totalSpent: 0,
    acceptsMarketing: Boolean(user.acceptsMarketing),
    activity: [
      { id: nextId('act'), type: 'account', message: 'Created a SOPII account', at: nowIso() },
    ],
    createdAt: nowIso(),
  });

  await UserModel.updateOne({ _id: user._id }, { $set: { customerId: customer._id } });
  return customer.toObject() as CustomerDoc;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Pushes a profile change down onto the commerce record it owns. */
export async function syncCommerceProfile(user: UserDoc) {
  const patch = {
    name: fullName(user),
    phone: user.mobile ?? '',
    avatar: user.profileImage,
  };

  if (user.customerId) {
    await CustomerModel.updateOne({ _id: user.customerId }, { $set: patch });
  }
  if (user.adminUserId) {
    await AdminUserModel.updateOne(
      { _id: user.adminUserId },
      { $set: { name: patch.name, phone: patch.phone, avatar: patch.avatar } },
    );
  }
}

/* ---------------------------------- roles ---------------------------------- */

/**
 * The panel's `Role` document behind this identity's role, or null.
 *
 * The permission matrix (§12) still lives in the `roles` collection the panel
 * already edits — the auth role is the coarse label, the matrix is the detail,
 * and keeping one source for the matrix means editing a role in the panel
 * changes what its holders can do without a second definition drifting.
 */
export async function roleFor(user: Pick<UserDoc, 'role'>): Promise<Role | null> {
  if (!isAdminRole(user.role)) return null;
  const key = ROLE_TO_ADMIN_ROLE_KEY[user.role];
  if (!key) return null;
  const doc = await RoleModel.findOne({ key }).lean<Role & { _id: string }>();
  return doc ? { ...doc, id: doc._id } : null;
}

/** The auth role an existing panel `AdminUser` corresponds to. */
export async function roleFromAdminUser(roleId: string | undefined): Promise<AuthRole> {
  if (!roleId) return 'support_staff';
  const doc = await RoleModel.findById(roleId).lean<{ key?: string }>();
  return ADMIN_ROLE_KEY_TO_ROLE[doc?.key ?? ''] ?? 'support_staff';
}

/* -------------------------------- the wire --------------------------------- */

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  /** Convenience for headers and greetings; the parts above are canonical. */
  name: string;
  email: string | null;
  emailMasked: string | null;
  mobile: string | null;
  profileImage?: string;
  status: string;
  role: AuthRole;
  emailVerified: boolean;
  mobileVerified: boolean;
  /** §26: the number has been proved over WhatsApp, not only over SMS. */
  whatsappVerified: boolean;
  hasPassword: boolean;
  isAdmin: boolean;
  acceptsMarketing: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** Which of the three methods this identity can use (§26). */
  identities: { provider: string; email?: string; createdAt: string }[];
  /** §12's matrix, null for a plain customer. */
  permissions: Role['permissions'] | null;
  roleName: string | null;
  /** The commerce records, so the shop can fetch orders without a second call. */
  customerId?: string;
  adminUserId?: string;

  /*
   * Present only for an admin. The panel's screens are typed against
   * `AuthUser` and read these directly; supplying them here means the panel
   * consumes the unified identity without an adapter, and — more usefully —
   * that its "signed-in devices" list is the real session table rather than
   * the frozen `loginActivity` array the old login route used to append to.
   */
  roleId?: string;
  roleKey?: string;
  phone?: string;
  avatar?: string;
  twoFactorEnabled?: boolean;
  loginActivity?: {
    id: string;
    device: string;
    browser: string;
    ip: string;
    location: string;
    at: string;
    current: boolean;
  }[];
}

const ROLE_LABELS: Record<AuthRole, string> = {
  customer: 'Customer',
  support_staff: 'Support Staff',
  content_manager: 'Content Manager',
  manager: 'Manager',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

/**
 * The only shape of a user that ever crosses the wire.
 *
 * No password hash, no lockout counters, no token — §30. `hasPassword` is a
 * boolean *about* the hash, which is what `/account/security` needs to decide
 * whether to offer "Set password" or "Change password".
 */
export async function toPublicUser(
  user: UserDoc,
  { currentSessionId }: { currentSessionId?: string } = {},
): Promise<PublicUser> {
  const [identities, role] = await Promise.all([listIdentities(user._id), roleFor(user)]);
  const admin = isAdminRole(user.role) ? await adminExtras(user, role, currentSessionId) : {};

  return {
    ...admin,
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName ?? '',
    name: fullName(user),
    email: user.email ?? null,
    emailMasked: user.email ? maskEmail(user.email) : null,
    mobile: user.mobile ?? null,
    profileImage: user.profileImage,
    status: user.status,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    mobileVerified: Boolean(user.mobileVerifiedAt),
    whatsappVerified: Boolean(user.whatsappVerifiedAt),
    hasPassword: Boolean(user.passwordHash),
    isAdmin: isAdminRole(user.role),
    acceptsMarketing: Boolean(user.acceptsMarketing),
    createdAt: user.createdAt?.toISOString?.() ?? new Date().toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString?.() ?? null,
    identities: identities.map((entry) => ({
      provider: entry.provider,
      email: entry.providerEmail,
      createdAt: entry.createdAt?.toISOString?.() ?? new Date().toISOString(),
    })),
    permissions: role?.permissions ?? null,
    roleName: role?.name ?? ROLE_LABELS[user.role] ?? null,
    customerId: user.customerId,
    adminUserId: user.adminUserId,
  };
}

/**
 * The admin-only half of the payload.
 *
 * `loginActivity` is built from the live `sessions` table rather than the
 * `admin_users.loginActivity` array the panel's old login route appended to —
 * that array stopped being written the moment the unified module took over
 * `/auth/login`, and a "signed-in devices" list that never changes is worse
 * than none at all.
 */
async function adminExtras(user: UserDoc, role: Role | null, currentSessionId?: string) {
  const [adminRecord, sessions] = await Promise.all([
    user.adminUserId
      ? AdminUserModel.findById(user.adminUserId).lean<{ twoFactorEnabled?: boolean }>()
      : null,
    SessionModel.find({
      userId: user._id,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastActiveAt: -1 })
      .limit(8)
      .lean<SessionDoc[]>(),
  ]);

  return {
    roleId: role?.id,
    roleKey: role?.key ?? user.role,
    phone: user.mobile ?? '',
    avatar: user.profileImage,
    twoFactorEnabled: Boolean(adminRecord?.twoFactorEnabled),
    loginActivity: sessions.map((session) => ({
      id: session._id,
      device: session.os ?? 'Unknown device',
      browser: session.browser ?? 'Unknown browser',
      ip: session.ip ?? '',
      location: session.location ?? 'Unknown location',
      at: session.lastActiveAt.toISOString(),
      current: session._id === currentSessionId,
    })),
  };
}

/**
 * `hasPassword` is derived from a field that is `select: false`, so a user
 * fetched the ordinary way would always report false. This refetches with the
 * hash included rather than making every caller remember to.
 */
export async function toPublicUserById(
  userId: string,
  options?: { currentSessionId?: string },
): Promise<PublicUser | null> {
  const user = await findUserWithSecret({ _id: userId });
  return user ? toPublicUser(user, options) : null;
}

/* ------------------------------- account state ----------------------------- */

/** §2's inactive/locked handling, as one decision the routes can share. */
export function accountProblem(user: UserDoc): string | null {
  if (user.status === 'inactive') return 'Your account is inactive.';
  if (user.status === 'locked') return 'This account is currently unavailable.';
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return 'Too many failed attempts. Please try again later.';
  }
  return null;
}

/** Clears the failure counter after a genuine sign-in. */
export async function markLoginSuccess(userId: string) {
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: { lastLoginAt: new Date(), failedLoginCount: 0 },
      $unset: { lockedUntil: '' },
    },
  );
}

export async function markLoginFailure(userId: string, lockUntil?: Date) {
  await UserModel.updateOne(
    { _id: userId },
    {
      $inc: { failedLoginCount: 1 },
      ...(lockUntil ? { $set: { lockedUntil: lockUntil } } : {}),
    },
  );
}
