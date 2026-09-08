import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { Role } from '@/types';
import { AdminUserModel, RoleModel, type AdminUserDoc } from '../db/models.js';
import { loadAuthUser, requireAuth, signToken, toAuthUser } from '../lib/auth.js';
import { ah, badRequest, forbidden, nextId, notFound, nowIso, unauthorized } from '../lib/http.js';

export const authRoutes = Router();

/** Enough of a device fingerprint for the "signed-in devices" list. */
function describeClient(userAgent = '', ip = '') {
  const browser =
    /edg\//i.test(userAgent) ? 'Edge'
    : /chrome|crios/i.test(userAgent) ? 'Chrome'
    : /firefox|fxios/i.test(userAgent) ? 'Firefox'
    : /safari/i.test(userAgent) ? 'Safari'
    : 'Unknown browser';

  const device =
    /android/i.test(userAgent) ? 'Android'
    : /iphone|ipad|ipod/i.test(userAgent) ? 'iOS'
    : /macintosh|mac os/i.test(userAgent) ? 'macOS'
    : /windows/i.test(userAgent) ? 'Windows'
    : /linux/i.test(userAgent) ? 'Linux'
    : 'Unknown device';

  return {
    browser,
    device,
    ip: ip.replace(/^::ffff:/, '') || '127.0.0.1',
    location: 'Local network',
  };
}

async function respondWithAuthUser(userId: string) {
  const authUser = await loadAuthUser(userId);
  if (!authUser) notFound('Admin user');
  return authUser;
}

authRoutes.post(
  '/login',
  ah(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) badRequest('Email and password are required');

    const user = await AdminUserModel.findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash')
      .lean<AdminUserDoc>();

    // Same message either way — never reveal which admin emails exist.
    if (!user) badRequest('Incorrect email or password');
    if (user.status === 'suspended') badRequest('This account has been suspended');

    const matches = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!matches) badRequest('Incorrect email or password');

    const session = {
      id: nextId('ses'),
      ...describeClient(req.get('user-agent') ?? '', req.ip ?? ''),
      at: nowIso(),
      current: true,
    };

    await AdminUserModel.updateOne(
      { _id: user._id },
      [
        {
          $set: {
            lastLoginAt: nowIso(),
            loginActivity: {
              $slice: [
                {
                  $concatArrays: [
                    [session],
                    {
                      $map: {
                        input: { $ifNull: ['$loginActivity', []] },
                        as: 'entry',
                        in: { $mergeObjects: ['$$entry', { current: false }] },
                      },
                    },
                  ],
                },
                6,
              ],
            },
          },
        },
      ],
    );

    const role = await RoleModel.findById(user.roleId).lean<Role & { _id: string }>();
    const fresh = await AdminUserModel.findById(user._id).lean<AdminUserDoc>();

    res.json({
      token: signToken(user._id),
      user: toAuthUser(fresh ?? user, role ? { ...role, id: role._id } : null),
    });
  }),
);

authRoutes.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json(await respondWithAuthUser(req.auth!.user._id));
  }),
);

authRoutes.post('/logout', requireAuth, (_req, res) => {
  // Tokens are stateless; the client drops it. Kept so the client has one place
  // to call when a real token blocklist arrives.
  res.json({ ok: true });
});

authRoutes.put(
  '/profile',
  requireAuth,
  ah(async (req, res) => {
    const { id, name, email, phone, avatar } = req.body as {
      id: string;
      name?: string;
      email?: string;
      phone?: string;
      avatar?: string;
    };

    const targetId = id ?? req.auth!.user._id;
    if (targetId !== req.auth!.user._id) forbidden('You can only edit your own profile here');

    if (email) {
      const taken = await AdminUserModel.exists({
        email: email.toLowerCase().trim(),
        _id: { $ne: targetId },
      });
      if (taken) badRequest('Another admin already uses that email');
    }

    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (email !== undefined) patch.email = email.toLowerCase().trim();
    if (phone !== undefined) patch.phone = phone;
    if (avatar !== undefined) patch.avatar = avatar;

    await AdminUserModel.updateOne({ _id: targetId }, { $set: patch });
    res.json(await respondWithAuthUser(targetId));
  }),
);

authRoutes.put(
  '/password',
  requireAuth,
  ah(async (req, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!newPassword || newPassword.length < 8) badRequest('Use at least 8 characters');

    const user = await AdminUserModel.findById(req.auth!.user._id)
      .select('+passwordHash')
      .lean<AdminUserDoc>();
    if (!user) unauthorized();

    const matches = user.passwordHash
      ? await bcrypt.compare(currentPassword ?? '', user.passwordHash)
      : false;
    if (!matches) badRequest('Current password is incorrect');

    await AdminUserModel.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await bcrypt.hash(newPassword, 10) } },
    );

    res.json({ ok: true });
  }),
);

authRoutes.put(
  '/two-factor',
  requireAuth,
  ah(async (req, res) => {
    const { id, enabled } = req.body as { id: string; enabled: boolean };
    const targetId = id ?? req.auth!.user._id;
    if (targetId !== req.auth!.user._id) forbidden('You can only change this for your own account');

    await AdminUserModel.updateOne({ _id: targetId }, { $set: { twoFactorEnabled: Boolean(enabled) } });
    res.json(await respondWithAuthUser(targetId));
  }),
);

authRoutes.delete(
  '/sessions/:id',
  requireAuth,
  ah(async (req, res) => {
    const userId = (req.query.userId as string) ?? req.auth!.user._id;
    if (userId !== req.auth!.user._id) forbidden('You can only revoke your own sessions');

    await AdminUserModel.updateOne(
      { _id: userId },
      { $pull: { loginActivity: { id: req.params.id } } },
    );
    res.json(await respondWithAuthUser(userId));
  }),
);
