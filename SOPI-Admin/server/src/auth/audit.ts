/*
 * The authentication audit trail (§19).
 * ===========================================================================
 * Every authentication event lands here: who, what, from where, and whether it
 * worked. Two rules hold without exception.
 *
 * 1. **No secrets.** No password, no OTP, no token, not even a truncated one.
 *    `reason` is a short category ("invalid password"), never a value.
 * 2. **Never blocks the request.** A logging failure must not turn a
 *    successful login into a 500, so every write is best-effort and a problem
 *    is reported to the server console instead.
 */

import type { Request } from 'express';
import { AuthAuditLogModel, type AuditAction, type AuthProvider } from './models.js';
import { describeClient } from './device.js';
import { id } from './crypto.js';
import { maskEmail } from './identifiers.js';

export interface AuditEntry {
  action: AuditAction;
  status?: 'success' | 'failure';
  userId?: string;
  /** What the person typed to identify themselves. Emails are masked. */
  identifier?: string;
  provider?: AuthProvider;
  surface?: 'shop' | 'admin';
  sessionId?: string;
  /** A short category, never a secret. */
  reason?: string;
}

/**
 * An identifier is worth keeping — a failed login is untraceable without one —
 * but a full audit table is also a tidy list of every customer's email address
 * for anyone who gets read access to it. Emails are stored masked; mobile
 * numbers keep their last four digits by the same logic.
 */
function safeIdentifier(value: string | undefined) {
  if (!value) return undefined;
  if (value.includes('@')) return maskEmail(value);
  if (/^\+?\d[\d\s-]{5,}$/.test(value)) {
    const digits = value.replace(/\D/g, '');
    return `••••${digits.slice(-4)}`;
  }
  return value.slice(0, 64);
}

export async function audit(req: Request, entry: AuditEntry) {
  try {
    const client = describeClient(req);
    await AuthAuditLogModel.create({
      _id: id('log'),
      userId: entry.userId,
      action: entry.action,
      status: entry.status ?? 'success',
      identifier: safeIdentifier(entry.identifier),
      provider: entry.provider,
      surface: entry.surface,
      ip: client.ip,
      userAgent: client.userAgent,
      browser: client.browser,
      os: client.os,
      deviceType: client.deviceType,
      sessionId: entry.sessionId,
      reason: entry.reason?.slice(0, 200),
      createdAt: new Date(),
    });
  } catch (error) {
    console.warn('[auth] audit write failed:', error);
  }
}

/** The recent trail for one identity, for `/account/security`. */
export async function recentActivity(userId: string, limit = 20) {
  return AuthAuditLogModel.find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 100))
    .lean();
}
