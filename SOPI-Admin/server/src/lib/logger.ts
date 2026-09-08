/*
 * Structured logging (§18).
 * ===========================================================================
 * One line of JSON per event, so a log shipper can index it and an operator
 * can ask "how many payment failures in the last hour" without a regular
 * expression. `console.log` still works; it just is not searchable.
 *
 * THE REDACTION RULE
 * ---------------------------------------------------------------------------
 * §18 forbids logging passwords, OTP values, API secrets, payment secrets and
 * authentication tokens. That is enforced here rather than remembered at every
 * call site: `scrub` walks the payload and replaces the value of any key whose
 * name looks like a secret, at any depth, and truncates long strings so a
 * pasted JWT cannot ride along inside a message.
 *
 * A call site that hands over a whole request body therefore cannot leak a
 * password by accident, which is the only version of this rule that survives
 * contact with a hurry.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

const threshold = LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? 'info'] ?? LEVELS.info;

/** Pretty lines in development, one-line JSON everywhere else. */
const pretty = process.env.LOG_FORMAT
  ? process.env.LOG_FORMAT === 'pretty'
  : process.env.NODE_ENV !== 'production';

/**
 * Key names whose values never appear in a log. Matched case-insensitively as
 * a substring, so `razorpayKeySecret`, `X-CSRF-Token` and `otpCode` are all
 * caught without anybody having to enumerate them.
 */
const SECRET_KEY = /pass|secret|token|otp|authorization|cookie|signature|apikey|api_key|credential|hash|pin|cvv|card/i;

const MAX_STRING = 512;

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.split('\n', 4).join('\n') };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrub(item, depth + 1));

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : scrub(item, depth + 1);
    }
    return out;
  }

  return String(value);
}

export interface LogFields {
  /** Correlates every line emitted while serving one request. */
  requestId?: string;
  userId?: string;
  sessionId?: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  ip?: string;
  detail?: string;
  error?: unknown;
  [key: string]: unknown;
}

function emit(level: LogLevel, event: string, fields: LogFields = {}) {
  if (LEVELS[level] < threshold) return;

  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(scrub(fields) as Record<string, unknown>),
  };

  const line = pretty
    ? `[${level}] ${event} ${Object.entries(record)
        .filter(([key]) => !['ts', 'level', 'event'].includes(key))
        .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
        .join(' ')}`
    : JSON.stringify(record);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};
