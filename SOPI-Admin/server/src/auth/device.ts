/*
 * Turning a request into something a person recognises.
 * ===========================================================================
 * §16 asks the security screen to say "Chrome — Windows", not to print a
 * user-agent string. This is a small, honest parser: it names the common
 * browsers and platforms and says "Unknown" rather than guessing, which is the
 * right trade for a screen whose only job is helping someone spot a device
 * that is not theirs.
 */

import type { Request } from 'express';

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  /** `Chrome — Windows`, ready to render. */
  label: string;
}

/*
 * Order matters. Edge's UA contains "Chrome", Chrome's contains "Safari", and
 * every in-app browser on iOS contains all three — so the most specific token
 * has to be tested first or everything reports as Safari.
 */
const BROWSERS: [RegExp, string][] = [
  [/edg(?:e|a|ios)?\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/samsungbrowser/i, 'Samsung Internet'],
  [/firefox|fxios/i, 'Firefox'],
  [/chrome|crios|chromium/i, 'Chrome'],
  [/safari/i, 'Safari'],
  [/curl|wget|postman|insomnia|node-fetch|axios/i, 'API client'],
];

const PLATFORMS: [RegExp, string][] = [
  [/windows nt 10|windows nt 11/i, 'Windows'],
  [/windows/i, 'Windows'],
  [/android/i, 'Android'],
  [/iphone|ipod/i, 'iPhone'],
  [/ipad/i, 'iPad'],
  [/mac os x|macintosh/i, 'macOS'],
  [/cros/i, 'ChromeOS'],
  [/linux/i, 'Linux'],
];

function match(userAgent: string, table: [RegExp, string][], fallback: string) {
  for (const [pattern, name] of table) {
    if (pattern.test(userAgent)) return name;
  }
  return fallback;
}

function deviceType(userAgent: string): ClientInfo['deviceType'] {
  if (/ipad|tablet|playbook|silk/i.test(userAgent)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(userAgent)) return 'mobile';
  if (/windows|macintosh|linux|cros/i.test(userAgent)) return 'desktop';
  return 'unknown';
}

/**
 * The caller's address.
 *
 * `req.ip` already honours `X-Forwarded-For` when Express is told to trust the
 * proxy (see `trust proxy` in index.ts). Without that setting the header is
 * attacker-controlled and must not be read, which is why this does not reach
 * for it directly.
 */
export function clientIp(req: Request): string | undefined {
  const ip = req.ip ?? req.socket?.remoteAddress ?? undefined;
  if (!ip) return undefined;
  // Node reports IPv4 over a dual-stack socket as `::ffff:203.0.113.5`.
  return ip.replace(/^::ffff:/, '');
}

export function describeClient(req: Request): ClientInfo {
  const userAgent = req.get('user-agent') ?? '';
  const browser = match(userAgent, BROWSERS, 'Unknown browser');
  const os = match(userAgent, PLATFORMS, 'Unknown device');

  return {
    ip: clientIp(req),
    userAgent: userAgent.slice(0, 400) || undefined,
    browser,
    os,
    deviceType: deviceType(userAgent),
    label: `${browser} — ${os}`,
  };
}
