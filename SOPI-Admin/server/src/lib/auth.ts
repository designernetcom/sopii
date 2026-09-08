import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthUser, PermissionAction, ResourceKey, Role } from '@/types';
import { env } from '../env.js';
import { AdminUserModel, RoleModel, type AdminUserDoc } from '../db/models.js';
import { isAdminRole } from '../auth/models.js';
import { findSession, verifyAccessToken } from '../auth/sessions.js';
import { findUserById } from '../auth/users.js';
import { forbidden, unauthorized } from './http.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `requireAuth`. */
      auth?: { user: AdminUserDoc; role: Role | null };
    }
  }
}

interface TokenPayload {
  sub: string;
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId } satisfies TokenPayload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

/** Merges a user with its role's permission matrix — the client's `AuthUser`. */
export function toAuthUser(user: AdminUserDoc, role: Role | null): AuthUser {
  const { passwordHash: _passwordHash, _id, ...rest } = user;
  void _passwordHash;
  return {
    ...(rest as Omit<AuthUser, 'id' | 'permissions' | 'roleKey'>),
    id: _id,
    roleKey: String(role?.key ?? 'support'),
    permissions: (role?.permissions ?? {}) as AuthUser['permissions'],
  };
}

/** Fetches a user plus its role and shapes them for the client. */
export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await AdminUserModel.findById(userId).lean<AdminUserDoc>();
  if (!user) return null;
  const role = await RoleModel.findById(user.roleId).lean<Role & { _id: string }>();
  return toAuthUser(user, role ? { ...role, id: role._id } : null);
}

export function hasPermission(
  role: Role | null,
  resource: ResourceKey,
  action: PermissionAction = 'view',
) {
  if (!role) return false;
  if (role.key === 'super_admin') return true;
  return Boolean(role.permissions?.[resource]?.[action]);
}

/**
 * Resolves the panel's `AdminUser` behind an auth-module access token.
 *
 * The token names an identity, so this walks `user.adminUserId` to the record
 * every panel screen reads. A customer's token resolves to nothing here, which
 * is §12's Flow 6 — an unauthorized customer reaching `/admin/*` is refused by
 * the API, not merely by a hidden menu item.
 */
async function adminFromAccessToken(token: string) {
  const claims = verifyAccessToken(token);
  if (!claims) return null;

  const session = await findSession(claims.sid);
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;

  const identity = await findUserById(claims.sub);
  if (!identity || identity.status !== 'active') return null;
  if (!isAdminRole(identity.role) || !identity.adminUserId) return null;

  return AdminUserModel.findById(identity.adminUserId).lean<AdminUserDoc>();
}

/**
 * Rejects anything without a valid, unexpired bearer token.
 *
 * Accepts both the auth module's access token and the panel's older
 * `signToken` one, so tokens issued before the auth module landed keep working
 * until they expire rather than logging every admin out on deploy.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) unauthorized();
  const token = header!.slice(7).trim();

  adminFromAccessToken(token)
    .then(async (fromModule) => {
      let user = fromModule;

      if (!user) {
        let payload: TokenPayload;
        try {
          payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
        } catch {
          unauthorized('Your session has expired. Please sign in again.');
        }
        user = await AdminUserModel.findById(payload!.sub).lean<AdminUserDoc>();
      }

      if (!user) unauthorized('This account no longer exists');
      if (user.status === 'suspended') forbidden('This account has been suspended');

      const roleDoc = await RoleModel.findById(user.roleId).lean<Role & { _id: string }>();
      req.auth = {
        user,
        role: roleDoc ? { ...roleDoc, id: roleDoc._id } : null,
      };
      next();
    })
    .catch(next);
};

/**
 * Server-side mirror of the panel's route guards. The UI hides what you cannot
 * use; this makes the API refuse it, which is the half that actually matters.
 */
export function requirePermission(
  resource: ResourceKey,
  action: PermissionAction = 'view',
): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) unauthorized();
    if (!hasPermission(req.auth.role, resource, action)) {
      forbidden(
        `Your role (${req.auth.user.roleName}) cannot ${action} ${resource.replace('_', ' ')}`,
      );
    }
    next();
  };
}
