/*
 * Authentication data model (§9, §29).
 * ===========================================================================
 * A deliberately separate set of collections from the commerce models in
 * `db/models.ts`. The store already has a `Customer` (a person who buys) and
 * an `AdminUser` (a person who runs the shop); neither is an *identity*, and
 * bolting three login methods onto both would have duplicated every rule.
 *
 * So: `users` is the single identity, and it *points at* whichever commerce
 * records it owns (`customerId`, `adminUserId`). `bridge.ts` keeps the two
 * sides in step. That is what lets one login page serve the shop and the panel
 * while the existing panel screens keep reading the records they always did.
 *
 * Nothing reversible is stored. Passwords are bcrypt hashes, OTPs are bcrypt
 * hashes, refresh and reset tokens are keyed SHA-256 digests of a random value
 * the server showed exactly once.
 */

import { Schema, model, type Model } from 'mongoose';

/* ---------------------------------- roles ---------------------------------- */

/**
 * §10. `customer` is the only role public registration may produce; the rest
 * are assignable from the admin system alone.
 */
export const ROLES = [
  'customer',
  'support_staff',
  'content_manager',
  'manager',
  'admin',
  'super_admin',
] as const;

export type AuthRole = (typeof ROLES)[number];

/** Everything above `customer` reaches the panel. */
export const ADMIN_ROLES: AuthRole[] = [
  'support_staff',
  'content_manager',
  'manager',
  'admin',
  'super_admin',
];

export const isAdminRole = (role: string): role is AuthRole =>
  (ADMIN_ROLES as string[]).includes(role);

/** Maps an auth role onto the panel's existing `roles` collection key. */
export const ROLE_TO_ADMIN_ROLE_KEY: Record<string, string> = {
  super_admin: 'super_admin',
  admin: 'admin',
  manager: 'manager',
  content_manager: 'content_manager',
  support_staff: 'support',
};

export const ADMIN_ROLE_KEY_TO_ROLE: Record<string, AuthRole> = {
  super_admin: 'super_admin',
  admin: 'admin',
  manager: 'manager',
  content_manager: 'content_manager',
  support: 'support_staff',
};

/**
 * The ways an identity can prove itself. `otp` is a code over SMS; `whatsapp`
 * is the same six digits delivered through an official WhatsApp Business API
 * provider. They are separate providers rather than one channel-tagged entry
 * because §26's "Login Methods" panel lists them separately, and because an
 * account may have proved a number over WhatsApp without ever having received
 * an SMS on it.
 */
export const PROVIDERS = ['password', 'google', 'otp', 'whatsapp'] as const;
export type AuthProvider = (typeof PROVIDERS)[number];

/** How a one-time code reached its owner. */
export const OTP_CHANNELS = ['sms', 'whatsapp'] as const;
export type OtpChannel = (typeof OTP_CHANNELS)[number];

/* ---------------------------------- users ---------------------------------- */

export interface UserDoc {
  _id: string;
  firstName: string;
  lastName?: string;
  /** Lower-cased on write; the unique index is on this exact value. */
  email?: string;
  /** E.164, e.g. `+919820011223`. */
  mobile?: string;
  /** Absent for an identity that has only ever used Google or OTP. */
  passwordHash?: string;
  passwordUpdatedAt?: Date;
  profileImage?: string;
  status: 'active' | 'inactive' | 'locked';
  emailVerifiedAt?: Date;
  mobileVerifiedAt?: Date;
  /** Set when a code delivered over WhatsApp was verified on this number. */
  whatsappVerifiedAt?: Date;
  role: AuthRole;
  /** The commerce records this identity owns. */
  customerId?: string;
  adminUserId?: string;
  /** Set while a lockout is in force; cleared on success or expiry. */
  lockedUntil?: Date;
  failedLoginCount: number;
  lastLoginAt?: Date;
  acceptsMarketing: boolean;
  acceptedTermsAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    _id: String,
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true },
    /*
     * `sparse` matters: an OTP-only identity has no email and a password-only
     * one may have no mobile, and a plain unique index would collide on the
     * second document holding `null`.
     */
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    mobile: { type: String, trim: true, unique: true, sparse: true },
    /** Never selected unless a handler asks for it explicitly. */
    passwordHash: { type: String, select: false },
    passwordUpdatedAt: Date,
    profileImage: String,
    status: {
      type: String,
      enum: ['active', 'inactive', 'locked'],
      default: 'active',
      index: true,
    },
    emailVerifiedAt: Date,
    mobileVerifiedAt: Date,
    whatsappVerifiedAt: Date,
    role: { type: String, enum: ROLES, default: 'customer', index: true },
    customerId: { type: String, index: true, sparse: true },
    adminUserId: { type: String, index: true, sparse: true },
    lockedUntil: Date,
    failedLoginCount: { type: Number, default: 0 },
    lastLoginAt: Date,
    acceptsMarketing: { type: Boolean, default: false },
    acceptedTermsAt: Date,
  },
  { timestamps: true, versionKey: false },
);

export const UserModel: Model<UserDoc> = model<UserDoc>('AuthUserIdentity', userSchema, 'users');

/* ----------------------------- user identities ----------------------------- */

/**
 * One row per way an identity can prove itself. §8's account linking is
 * nothing more than a second row here pointing at the same `userId`.
 */
export interface UserIdentityDoc {
  _id: string;
  userId: string;
  provider: AuthProvider;
  /** Google's `sub`, the mobile number, or the email for a password login. */
  providerUserId: string;
  providerEmail?: string;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userIdentitySchema = new Schema<UserIdentityDoc>(
  {
    _id: String,
    userId: { type: String, required: true, index: true },
    provider: { type: String, enum: PROVIDERS, required: true },
    providerUserId: { type: String, required: true },
    providerEmail: { type: String, lowercase: true, trim: true },
    lastUsedAt: Date,
  },
  { timestamps: true, versionKey: false },
);

/* One Google account cannot be attached to two SOPII identities. */
userIdentitySchema.index({ provider: 1, providerUserId: 1 }, { unique: true });
userIdentitySchema.index({ userId: 1, provider: 1 });

export const UserIdentityModel: Model<UserIdentityDoc> = model<UserIdentityDoc>(
  'UserIdentity',
  userIdentitySchema,
  'user_identities',
);

/* --------------------------------- sessions -------------------------------- */

/**
 * One row per signed-in device (§16). The refresh tokens beneath it are what
 * actually expire and rotate; the session is the thing a person recognises in
 * "Chrome on Windows" and can end.
 */
export interface SessionDoc {
  _id: string;
  userId: string;
  /** How this session began, for the security screen's benefit. */
  method: AuthProvider;
  /** `shop` or `admin` — an admin session is not a shop session. */
  surface: 'shop' | 'admin';
  ip?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  location?: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
}

const sessionSchema = new Schema<SessionDoc>(
  {
    _id: String,
    userId: { type: String, required: true, index: true },
    method: { type: String, enum: PROVIDERS, default: 'password' },
    surface: { type: String, enum: ['shop', 'admin'], default: 'shop', index: true },
    ip: String,
    userAgent: String,
    browser: String,
    os: String,
    deviceType: String,
    location: String,
    createdAt: { type: Date, default: () => new Date() },
    lastActiveAt: { type: Date, default: () => new Date(), index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedReason: String,
  },
  { versionKey: false },
);

/*
 * Mongo sweeps expired sessions itself. The grace period keeps a just-expired
 * row around long enough to render honestly on the sessions screen.
 */
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export const SessionModel: Model<SessionDoc> = model<SessionDoc>(
  'AuthSession',
  sessionSchema,
  'sessions',
);

/* ------------------------------ refresh tokens ----------------------------- */

/**
 * Rotation with reuse detection: each refresh mints a successor and marks its
 * predecessor used. Presenting an already-used token after the grace window
 * means somebody has a copy they should not, so the whole session dies.
 */
export interface RefreshTokenDoc {
  _id: string;
  userId: string;
  sessionId: string;
  /** SHA-256(HMAC) of the token. The token itself was shown once. */
  tokenHash: string;
  /** The token this one replaced, so a reuse can be traced back. */
  replacedBy?: string;
  usedAt?: Date;
  revokedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    _id: String,
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    replacedBy: String,
    usedAt: Date,
    revokedAt: Date,
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export const RefreshTokenModel: Model<RefreshTokenDoc> = model<RefreshTokenDoc>(
  'RefreshToken',
  refreshTokenSchema,
  'refresh_tokens',
);

/* ----------------------------- otp verifications --------------------------- */

/**
 * §6. The code is never here in the clear, never leaves the server in a
 * response, and only one row per mobile number is ever `pending` — requesting
 * a new OTP consumes the old one.
 */
export interface OtpVerificationDoc {
  _id: string;
  /** Absent when the number belongs to nobody yet. */
  userId?: string;
  mobileNumber: string;
  otpHash: string;
  /** What the code is for, so a login OTP cannot verify a number and back. */
  purpose: 'login' | 'verify_mobile';
  /*
   * Which transport carried it. Deliberately *not* part of the lookup key: one
   * live code per number per purpose, whichever channel delivered it. Asking
   * for a WhatsApp code therefore invalidates an outstanding SMS one rather
   * than running a second live code alongside it, and the per-number request
   * limit counts both together. The field is here for the audit trail and for
   * the copy the message is built from.
   */
  channel: OtpChannel;
  expiresAt: Date;
  attemptCount: number;
  /** How many times this code has been re-sent, for the resend ceiling. */
  resendCount: number;
  verifiedAt?: Date;
  consumedAt?: Date;
  ip?: string;
  createdAt: Date;
}

const otpVerificationSchema = new Schema<OtpVerificationDoc>(
  {
    _id: String,
    userId: { type: String, index: true },
    mobileNumber: { type: String, required: true, index: true },
    /** bcrypt, never plain text, never reversible. */
    otpHash: { type: String, required: true, select: false },
    purpose: { type: String, enum: ['login', 'verify_mobile'], default: 'login' },
    channel: { type: String, enum: OTP_CHANNELS, default: 'sms' },
    expiresAt: { type: Date, required: true },
    attemptCount: { type: Number, default: 0 },
    resendCount: { type: Number, default: 0 },
    verifiedAt: Date,
    consumedAt: Date,
    ip: String,
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 });

export const OtpVerificationModel: Model<OtpVerificationDoc> = model<OtpVerificationDoc>(
  'OtpVerification',
  otpVerificationSchema,
  'otp_verifications',
);

/* -------------------------- password reset tokens -------------------------- */

export interface PasswordResetTokenDoc {
  _id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  ip?: string;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<PasswordResetTokenDoc>(
  {
    _id: String,
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    ip: String,
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 });

export const PasswordResetTokenModel: Model<PasswordResetTokenDoc> = model<PasswordResetTokenDoc>(
  'PasswordResetToken',
  passwordResetTokenSchema,
  'password_reset_tokens',
);

/* ------------------------------ login attempts ----------------------------- */

/**
 * The rate limiter's ledger (§18). One row per attempt, per key — an email, a
 * mobile number, an IP — counted inside a rolling window. Rows age out on
 * their own, so nothing ever needs sweeping by hand.
 */
export interface LoginAttemptDoc {
  _id: string;
  /** `login:email@example.com`, `otp_request:+919820011223`, ... */
  key: string;
  scope: string;
  identifier: string;
  ip?: string;
  successful: boolean;
  createdAt: Date;
  expiresAt: Date;
}

const loginAttemptSchema = new Schema<LoginAttemptDoc>(
  {
    _id: String,
    key: { type: String, required: true, index: true },
    scope: { type: String, required: true },
    identifier: { type: String, required: true },
    ip: String,
    successful: { type: Boolean, default: false },
    createdAt: { type: Date, default: () => new Date(), index: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginAttemptModel: Model<LoginAttemptDoc> = model<LoginAttemptDoc>(
  'LoginAttempt',
  loginAttemptSchema,
  'login_attempts',
);

/* ------------------------------- oauth states ------------------------------ */

/**
 * The half of an OAuth round trip that must not live in the browser: the PKCE
 * verifier, the nonce, and where to go afterwards. The browser holds only an
 * opaque id, in an HttpOnly cookie.
 */
export interface OAuthStateDoc {
  _id: string;
  provider: string;
  codeVerifier: string;
  nonce: string;
  surface: 'shop' | 'admin';
  redirectTo: string;
  /** Set when the flow is started by someone already signed in (§26). */
  linkUserId?: string;
  ip?: string;
  consumedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

const oauthStateSchema = new Schema<OAuthStateDoc>(
  {
    _id: String,
    provider: { type: String, default: 'google' },
    codeVerifier: { type: String, required: true },
    nonce: { type: String, required: true },
    surface: { type: String, enum: ['shop', 'admin'], default: 'shop' },
    redirectTo: { type: String, default: '/' },
    linkUserId: String,
    ip: String,
    consumedAt: Date,
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthStateModel: Model<OAuthStateDoc> = model<OAuthStateDoc>(
  'OAuthState',
  oauthStateSchema,
  'oauth_states',
);

/* ----------------------------- auth audit logs ----------------------------- */

export const AUDIT_ACTIONS = [
  'login',
  'logout',
  'failed_login',
  'otp_requested',
  'otp_verified',
  'otp_failed',
  'whatsapp_otp_requested',
  'whatsapp_otp_verified',
  'whatsapp_otp_failed',
  'whatsapp_linked',
  'whatsapp_unlinked',
  'whatsapp_test_message',
  'whatsapp_settings_updated',
  'password_changed',
  'password_reset_requested',
  'password_reset',
  'google_login',
  'google_linked',
  'google_unlinked',
  'account_locked',
  'account_unlocked',
  'account_created',
  'mobile_verified',
  'session_revoked',
  'token_reuse_detected',
  'access_denied',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * §19. Deliberately holds no secret: no password, no OTP, no token. The
 * `identifier` is whatever the person typed to identify themselves, which is
 * the one thing an operator needs to trace an incident.
 */
export interface AuthAuditLogDoc {
  _id: string;
  userId?: string;
  action: AuditAction;
  status: 'success' | 'failure';
  /** Email or mobile as supplied, so a failed login is still traceable. */
  identifier?: string;
  provider?: AuthProvider;
  surface?: 'shop' | 'admin';
  ip?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  sessionId?: string;
  /** A short, non-sensitive explanation — "invalid password", never a value. */
  reason?: string;
  createdAt: Date;
}

const authAuditLogSchema = new Schema<AuthAuditLogDoc>(
  {
    _id: String,
    userId: { type: String, index: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },
    status: { type: String, enum: ['success', 'failure'], default: 'success', index: true },
    identifier: String,
    provider: { type: String, enum: PROVIDERS },
    surface: { type: String, enum: ['shop', 'admin'] },
    ip: String,
    userAgent: String,
    browser: String,
    os: String,
    deviceType: String,
    sessionId: String,
    reason: String,
    createdAt: { type: Date, default: () => new Date(), index: true },
  },
  { versionKey: false },
);

export const AuthAuditLogModel: Model<AuthAuditLogDoc> = model<AuthAuditLogDoc>(
  'AuthAuditLog',
  authAuditLogSchema,
  'auth_audit_logs',
);

/* --------------------------------- exports --------------------------------- */

/** Every collection this module owns, for reseeding and teardown. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authModels: Model<any>[] = [
  UserModel,
  UserIdentityModel,
  SessionModel,
  RefreshTokenModel,
  OtpVerificationModel,
  PasswordResetTokenModel,
  LoginAttemptModel,
  OAuthStateModel,
  AuthAuditLogModel,
];
