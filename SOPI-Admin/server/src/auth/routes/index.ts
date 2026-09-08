/*
 * The auth module's public surface, mounted at /api/auth.
 * ===========================================================================
 * Order matters here in one respect: `withUser` runs first so that the routes
 * which behave differently for a signed-in caller — `GET /google` starting a
 * *link* rather than a login, `POST /logout` falling back to the bearer token
 * when no cookie survives — can see one, without any of them being a hard gate.
 * The hard gates are `requireUser` on the individual routes that need them.
 */

import { Router } from 'express';
import { withUser } from '../middleware.js';
import { accountRoutes } from './account.js';
import { googleRoutes } from './google.js';
import { otpRoutes } from './otp.js';
import { passwordRoutes } from './password.js';
import { sessionRoutes } from './session.js';
import { whatsappRoutes } from './whatsapp.js';

export const authModuleRoutes = Router();

authModuleRoutes.use(withUser);

authModuleRoutes.use(passwordRoutes);
authModuleRoutes.use(otpRoutes);
authModuleRoutes.use(whatsappRoutes);
authModuleRoutes.use(googleRoutes);
authModuleRoutes.use(sessionRoutes);
authModuleRoutes.use(accountRoutes);
