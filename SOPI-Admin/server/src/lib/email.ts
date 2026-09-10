/*
 * Transactional email — the service.
 * ===========================================================================
 * The one place mail leaves this server. Nothing here is called from a request
 * that a customer is waiting on: `writeOrder` enqueues `email.send` and
 * returns, and the worker calls into this module. That ordering is the point —
 * a shopper who has just paid should not wait on an SMTP round trip, and
 * Mailtrap being down must never fail an order that already took money.
 *
 *     Order Service          writeOrder()
 *          │
 *          ▼
 *     Email Event            enqueue(JOB.orderPlaced) ──▶ enqueue(JOB.emailSend)
 *          │                 dedupeKey: mail:order:SOP10711
 *          ▼
 *     Email Service          sendAndRecordOrderEmail()   ← this file
 *          │                 · duplicate guard   · retry classification
 *          │                 · delivery log      · status written to the order
 *          ▼
 *     Mailtrap               lib/mailtrap.ts
 *
 * ---------------------------------------------------------------------------
 * THE FOUR GUARANTEES, AND WHERE EACH ONE LIVES
 * ---------------------------------------------------------------------------
 *   Checkout never fails on email   `enqueue()` never throws, and nothing on
 *                                   the checkout path awaits a send.
 *   Retries                         The queue: 5 attempts, exponential
 *                                   backoff, but only for faults classified
 *                                   transient by `mailtrap.classify`.
 *   No duplicate email              Two layers. The queue's unique
 *                                   `dedupeKey` stops the job existing twice;
 *                                   `alreadySent()` below stops a *second*
 *                                   job sending again if one slips through
 *                                   (a reclaimed lease, a replayed payment
 *                                   webhook, two instances racing).
 *   Idempotency                     Every send carries a stable key —
 *                                   `kind:orderCode:recipient` — which is
 *                                   what the duplicate guard and the delivery
 *                                   log are both keyed on.
 *
 * A resend from the admin panel deliberately passes `force`, because an
 * operator pressing Resend has *asked* for the duplicate.
 *
 * ---------------------------------------------------------------------------
 * CREDENTIALS
 * ---------------------------------------------------------------------------
 * None are in this file. They are in `lib/mailtrap.ts`, read from
 * `MAILTRAP_*` on the server, and never reach the browser — see §30, §31 and
 * the note in `env.ts`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../env.js';
import { recordDelivery } from './emailLog.js';
import { logger } from './logger.js';
import {
  isConfigured,
  send as deliver,
  TransientEmailError,
  type EmailDelivery,
} from './mailtrap.js';

export { TransientEmailError, type EmailDelivery, type EmailStatus } from './mailtrap.js';
export { isConfigured } from './mailtrap.js';

/** Kept as the historical name so call sites and tests read unchanged. */
export type EmailResult = EmailDelivery;

/** The kinds of order mail this service sends. Also the key it records under. */
export type OrderEmailKind =
  | 'order_confirmation'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled';

/** Everything this service can send, order mail and account mail together. */
export type EmailKind = OrderEmailKind | 'password_reset';

/* -------------------------------- templating -------------------------------- */

const TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates');

/** Read once per process. Templates do not change under a running server. */
const templateCache = new Map<string, string>();

function loadTemplate(name: string): string {
  const cached = templateCache.get(name);
  if (cached) return cached;

  const file = path.join(TEMPLATE_DIR, `${name}.html`);
  const source = fs.readFileSync(file, 'utf8');
  templateCache.set(name, source);
  return source;
}

/**
 * HTML-escaped, always.
 *
 * A product name, a customer name and an address are all attacker-influenced
 * strings that end up inside markup. Escaping at substitution time means a
 * product called `<script>` arrives as text — and means no caller has to
 * remember to escape anything.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type Scalar = string | number | boolean | null | undefined;
type TemplateVars = Record<string, Scalar | Record<string, Scalar>[]>;

/**
 * The smallest template engine that renders these files: `{{#each}}` over a
 * list, `{{#if}}` on a flag, and `{{name}}` for a value.
 *
 * Deliberately not Handlebars. The dependency would be larger than this
 * function, and an email template that needs more logic than "repeat the lines
 * and hide the discount row" is a template doing work the caller should have
 * done — which is why every value arriving here is already a formatted string.
 */
function render(source: string, vars: TemplateVars): string {
  let output = source;

  // {{#each products}} … {{/each}} — inner {{name}} resolves against the item.
  output = output.replace(
    /\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, key: string, body: string) => {
      const list = vars[key];
      if (!Array.isArray(list)) return '';
      return list
        .map((item) =>
          body.replace(/\{\{(\w+)\}\}/g, (_m, field: string) => escapeHtml(item[field])),
        )
        .join('');
    },
  );

  // {{#if flag}} … {{/if}}
  output = output.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key: string, body: string) => (vars[key] ? body : ''),
  );

  // {{name}} — anything still unresolved becomes empty rather than literal.
  output = output.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return Array.isArray(value) ? '' : escapeHtml(value);
  });

  return output;
}

/* --------------------------------- money ----------------------------------- */

const rupees = (value: unknown) => {
  const amount = Number(value) || 0;
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

const orderDate = (value: unknown) => {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * A delivery estimate the shopper can act on.
 *
 * Prefers whatever the order already promised at checkout (`shippingEta`), so
 * the email cannot contradict the confirmation page. Falls back to a week out
 * rather than printing nothing, because "when will it arrive" is the question
 * this email exists to answer.
 */
function expectedDelivery(order: OrderLike): string {
  const promised = String(order.shippingEta ?? '').trim();
  if (promised) return promised;

  const placed = order.createdAt ? new Date(String(order.createdAt)) : new Date();
  const eta = new Date((Number.isNaN(placed.getTime()) ? new Date() : placed).getTime());
  eta.setDate(eta.getDate() + 7);
  return eta.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The address as a mail client will render it: one block, line breaks kept. */
function formatAddress(order: OrderLike): string {
  const a = order.shippingAddress ?? {};
  return [
    a.name,
    a.line1,
    a.line2,
    [a.city, a.state].filter(Boolean).join(', '),
    a.pincode,
    a.phone ? `Phone: ${a.phone}` : '',
  ]
    .map((line) => String(line ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

/* ------------------------------- the payloads ------------------------------- */

interface AddressLike {
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

/** Only what an email needs — deliberately narrower than the Order document. */
export interface OrderLike {
  _id?: string;
  code?: string;
  customerName?: string;
  customerEmail?: string;
  createdAt?: string;
  placedAt?: string;
  items?: {
    name?: string;
    image?: string;
    variant?: string;
    size?: string;
    color?: string;
    price?: number;
    quantity?: number;
    total?: number;
  }[];
  subtotal?: number;
  discount?: number;
  couponCode?: string;
  tax?: number;
  shipping?: number;
  codCharge?: number;
  total?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  shippingEta?: string;
  trackingNumber?: string;
  courier?: string;
  shippingAddress?: AddressLike;
  emailNotifications?: {
    kind?: string;
    status?: string;
    recipient?: string;
    attempts?: number;
    sentAt?: string;
  }[];
}

/** Copy that differs per lifecycle stage. Everything else is shared. */
const COPY: Record<
  OrderEmailKind,
  { badge: string; headline: string; subject: (code: string) => string }
> = {
  order_confirmation: {
    badge: '✓',
    headline: 'Order Confirmed',
    subject: (code) => `Order ${code} confirmed`,
  },
  order_shipped: {
    badge: '📦',
    headline: 'Your Order Has Shipped',
    subject: (code) => `Order ${code} is on its way`,
  },
  order_delivered: {
    badge: '🏡',
    headline: 'Delivered',
    subject: (code) => `Order ${code} has been delivered`,
  },
  order_cancelled: {
    badge: '✕',
    headline: 'Order Cancelled',
    subject: (code) => `Order ${code} has been cancelled`,
  },
};

function introFor(kind: OrderEmailKind, order: OrderLike): string {
  const name = String(order.customerName ?? '').split(' ')[0] || 'there';
  switch (kind) {
    case 'order_shipped':
      return order.courier && order.trackingNumber
        ? `${name}, your order is on its way with ${order.courier} (${order.trackingNumber}).`
        : `${name}, your order has left our studio and is on its way to you.`;
    case 'order_delivered':
      return `${name}, your order has been delivered. We hope you love it.`;
    case 'order_cancelled':
      return `${name}, your order has been cancelled. Any payment made will be refunded to its original method.`;
    default:
      return `Thank you, ${name} — we have your order and it is being prepared.`;
  }
}

/** How the payment reads to a human, plus the COD caveat where it applies. */
function paymentLabel(order: OrderLike): { method: string; note: string } {
  const method = String(order.paymentMethod ?? '').toLowerCase();
  if (method === 'cod') {
    return { method: 'Cash on Delivery', note: ' — please keep the amount ready' };
  }
  if (method === 'upi') return { method: 'UPI', note: order.paymentStatus === 'paid' ? '' : ' — payment pending' };

  const pretty = method ? method.charAt(0).toUpperCase() + method.slice(1) : 'Online payment';
  return {
    method: pretty,
    note: order.paymentStatus === 'paid' ? '' : ' — payment pending',
  };
}

/*
 * Remote images, because a mail client will not read this server's disk. The
 * logo is served from the shop front's public folder; Cloudinary carries the
 * product photography already, so item images need no special handling.
 */
const LOGO_URL = `${env.email.shopUrl}/final_logo-240.png`;
const PLACEHOLDER_IMAGE =
  'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_144,h_180,c_fill/sample.jpg';

/** Every value the order templates substitute, formatted and ready. */
function buildVars(kind: OrderEmailKind, order: OrderLike): TemplateVars {
  const code = String(order.code ?? order._id ?? '');
  const payment = paymentLabel(order);
  const discount = Number(order.discount) || 0;
  const codCharge = Number(order.codCharge) || 0;

  const trackingUrl = `${env.email.orderTrackingBase.replace(/\/+$/, '')}/${encodeURIComponent(code)}`;

  const support = [
    env.email.supportEmail && `Email us at ${env.email.supportEmail}`,
    env.email.supportPhone && `call ${env.email.supportPhone}`,
  ]
    .filter(Boolean)
    .join(' or ');

  return {
    badge: COPY[kind].badge,
    headline: COPY[kind].headline,
    intro: introFor(kind, order),

    logoUrl: LOGO_URL,
    customerName: order.customerName ?? 'there',
    orderNumber: code,
    orderDate: orderDate(order.createdAt ?? order.placedAt),

    products: (order.items ?? []).map((item) => ({
      name: item.name ?? 'Item',
      // A missing image must not render a broken box in a mail client.
      image: item.image || PLACEHOLDER_IMAGE,
      variant: item.variant || [item.size, item.color].filter(Boolean).join(' · ') || '',
      quantity: Number(item.quantity) || 1,
      price: rupees(item.price),
      total: rupees(item.total ?? (Number(item.price) || 0) * (Number(item.quantity) || 1)),
    })),

    subtotal: rupees(order.subtotal),
    hasDiscount: discount > 0,
    discount: rupees(discount),
    discountLabel: order.couponCode ? ` (${order.couponCode})` : '',
    shipping: Number(order.shipping) > 0 ? rupees(order.shipping) : 'Free',
    hasCodCharge: codCharge > 0,
    codCharge: rupees(codCharge),
    tax: rupees(order.tax),
    total: rupees(order.total),

    paymentMethod: payment.method,
    paymentNote: payment.note,
    shippingAddress: formatAddress(order),
    expectedDelivery: expectedDelivery(order),
    trackingUrl,
    supportLine: support || 'Reply to this email and we will help.',
  };
}

/**
 * The plain-text alternative, built from the same values rather than by
 * stripping tags out of the HTML.
 *
 * Stripping produces text full of the layout table's whitespace; building it
 * produces something a person would actually read, and it cannot drift from
 * the HTML because both come from one `vars`.
 */
function orderText(vars: TemplateVars): string {
  const line = (label: string, value: unknown) => `${label.padEnd(22)}${String(value ?? '')}`;
  const products = Array.isArray(vars.products) ? vars.products : [];

  return [
    String(vars.headline ?? ''),
    '',
    String(vars.intro ?? ''),
    '',
    line('Order number', vars.orderNumber),
    line('Order date', vars.orderDate),
    '',
    'YOUR ITEMS',
    ...products.map(
      (item) =>
        `  ${item.name}${item.variant ? ` (${item.variant})` : ''} × ${item.quantity} — ${item.total}`,
    ),
    '',
    line('Subtotal', vars.subtotal),
    ...(vars.hasDiscount ? [line(`Discount${String(vars.discountLabel ?? '')}`, `-${vars.discount}`)] : []),
    line('Shipping', vars.shipping),
    ...(vars.hasCodCharge ? [line('Cash on delivery fee', vars.codCharge)] : []),
    line('GST', vars.tax),
    line('Total', vars.total),
    '',
    line('Payment', `${vars.paymentMethod}${vars.paymentNote ?? ''}`),
    line('Expected delivery', vars.expectedDelivery),
    '',
    'SHIPPING ADDRESS',
    ...String(vars.shippingAddress ?? '')
      .split('\n')
      .map((row) => `  ${row}`),
    '',
    `Track your order: ${vars.trackingUrl}`,
    '',
    String(vars.supportLine ?? ''),
    '',
    `You are receiving this because you placed order ${vars.orderNumber} with SOPII.`,
  ].join('\n');
}

/* ------------------------------ order emails -------------------------------- */

/** A stable handle for "this exact message to this exact person". */
export const idempotencyKeyFor = (kind: EmailKind, subject: string, recipient: string) =>
  `${kind}:${subject}:${recipient.toLowerCase()}`;

interface OrderSendOptions {
  /** Bypasses the duplicate guard. The panel's Resend button sets this. */
  force?: boolean;
  /** Who asked — `queue`, `admin:usr_x`, `script`. Recorded in the log. */
  source?: string;
}

/**
 * Renders and sends one order email. No database writes; see
 * `sendAndRecordOrderEmail` for the operation that records the outcome.
 */
async function sendOrderEmail(
  kind: OrderEmailKind,
  order: OrderLike,
  options: OrderSendOptions = {},
): Promise<EmailResult> {
  const to = String(order.customerEmail ?? '').trim();
  const code = String(order.code ?? order._id ?? '');

  if (!to) {
    logger.warn('email.no_recipient', { detail: `order ${code} has no customer email` });
    return { status: 'failed', recipient: '', error: 'order has no customer email' };
  }

  const vars = buildVars(kind, order);
  const subject = COPY[kind].subject(code);
  const startedAt = Date.now();

  try {
    const result = await deliver({
      to,
      subject,
      html: render(loadTemplate('order-confirmation'), vars),
      text: orderText(vars),
      category: kind,
    });

    void recordDelivery({
      kind,
      status: result.status,
      recipient: result.recipient,
      subject,
      orderId: order._id,
      orderCode: code,
      messageId: result.messageId,
      error: result.error,
      attempt: attemptNumber(order, kind),
      idempotencyKey: idempotencyKeyFor(kind, code, to),
      durationMs: Date.now() - startedAt,
      source: options.source ?? 'queue',
    });

    return result;
  } catch (error) {
    /* A transient failure is still an attempt, and the log should show it —
       four silent retries look identical to never having tried. */
    void recordDelivery({
      kind,
      status: 'failed',
      recipient: to,
      subject,
      orderId: order._id,
      orderCode: code,
      error: error instanceof Error ? error.message : String(error),
      attempt: attemptNumber(order, kind),
      idempotencyKey: idempotencyKeyFor(kind, code, to),
      durationMs: Date.now() - startedAt,
      source: options.source ?? 'queue',
    });
    throw error;
  }
}

const attemptNumber = (order: OrderLike, kind: OrderEmailKind) =>
  (order.emailNotifications?.find((entry) => entry.kind === kind)?.attempts ?? 0) + 1;

/**
 * Has this exact email already gone to this exact address?
 *
 * The second layer of duplicate prevention. The first is the queue's unique
 * `dedupeKey`, which stops the job being created twice; this stops the *send*
 * happening twice if a job runs twice anyway — which it can, because a worker
 * that dies after sending and before marking the job done will have its lease
 * reclaimed and the job re-run. Without this guard that shopper receives two
 * confirmations for one order.
 *
 * Keyed on kind *and* recipient, so correcting a customer's address and
 * resending is not mistaken for a duplicate.
 */
function alreadySent(order: OrderLike, kind: OrderEmailKind, recipient: string): boolean {
  const previous = order.emailNotifications?.find((entry) => entry.kind === kind);
  return (
    previous?.status === 'sent' &&
    String(previous.recipient ?? '').toLowerCase() === recipient.toLowerCase()
  );
}

/* ---------------------------- send, and record it --------------------------- */

/**
 * The whole order-email operation: load, guard, send, write the outcome back.
 *
 * Shared by the queue handler and the panel's Resend button so there is one
 * implementation of "email this order" rather than two that drift.
 *
 * The order is READ HERE rather than carried in the job payload. Three
 * reasons: a job row stays small, a resend renders today's data rather than a
 * snapshot taken at checkout, and a payload cannot go stale between enqueue
 * and send.
 *
 * Throws only on a transient failure, which is what reschedules the job.
 */
export async function sendAndRecordOrderEmail(
  orderRef: { id?: string; code?: string },
  kind: OrderEmailKind,
  options: OrderSendOptions = {},
): Promise<EmailResult> {
  const { OrderModel } = await import('../db/models.js');

  const filter = orderRef.id ? { _id: orderRef.id } : { code: orderRef.code };
  const order = await OrderModel.findOne(filter).lean<OrderLike & { _id: string }>();

  if (!order) {
    /* A permanent condition: the order is not coming back, so this returns
       rather than throwing and burning four more attempts. */
    logger.warn('email.order_missing', {
      detail: `no order for ${orderRef.id ?? orderRef.code ?? 'unknown'}`,
    });
    return { status: 'failed', recipient: '', error: 'order not found' };
  }

  const recipient = String(order.customerEmail ?? '').trim();

  /*
   * The duplicate guard. Returns the *previous* success rather than an error,
   * because the caller asking again is almost always a retry that never saw
   * the first answer — and "already sent" is the true answer to it.
   */
  if (!options.force && recipient && alreadySent(order, kind, recipient)) {
    logger.info('email.duplicate_suppressed', {
      template: kind,
      detail: `${order.code} — ${kind} already sent to ${recipient.split('@')[1] ?? 'unknown'}`,
    });
    return { status: 'sent', recipient };
  }

  let result: EmailResult;
  try {
    result = await sendOrderEmail(kind, order, options);
  } catch (error) {
    // A transient failure is still an attempt, and the panel should see it.
    await recordAttempt(order._id, kind, {
      status: 'failed',
      recipient,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  await recordAttempt(order._id, kind, result);
  return result;
}

/**
 * Upserts one entry in `order.emailNotifications`, keyed by kind.
 *
 * Two statements because MongoDB cannot upsert into an array in one: update
 * the matching element, and push only when nothing matched. Concurrent sends
 * of the same kind could both push, which the queue's unique `dedupeKey`
 * already prevents for the automatic path and which a double-clicked Resend
 * cannot reach because that route awaits its own send.
 */
async function recordAttempt(orderId: string, kind: OrderEmailKind, result: EmailResult) {
  const { OrderModel } = await import('../db/models.js');
  const at = new Date().toISOString();

  const set: Record<string, unknown> = {
    'emailNotifications.$.status': result.status,
    'emailNotifications.$.recipient': result.recipient,
    'emailNotifications.$.error': result.error ?? '',
    'emailNotifications.$.lastAttemptAt': at,
  };
  // `sentAt` records the last *successful* send, so a later failure cannot
  // erase the fact that the customer did receive one.
  if (result.status === 'sent') {
    set['emailNotifications.$.sentAt'] = at;
    set['emailNotifications.$.messageId'] = result.messageId ?? '';
  }

  const updated = await OrderModel.updateOne(
    { _id: orderId, 'emailNotifications.kind': kind },
    { $set: set, $inc: { 'emailNotifications.$.attempts': 1 } },
  );

  if (!updated.matchedCount) {
    await OrderModel.updateOne(
      { _id: orderId },
      {
        $push: {
          emailNotifications: {
            kind,
            status: result.status,
            recipient: result.recipient,
            messageId: result.messageId ?? '',
            error: result.error ?? '',
            attempts: 1,
            sentAt: result.status === 'sent' ? at : '',
            lastAttemptAt: at,
          },
        },
      },
    );
  }
}

/* ------------------------------ password reset ------------------------------ */

export interface PasswordResetInput {
  to: string;
  /** The one-time link. It is the secret — it goes to Mailtrap and nowhere else. */
  resetUrl: string;
  /** Shown in the greeting. Falls back to the local part of the address. */
  name?: string;
  /** How long the link is good for, already in words: "1 hour". */
  expiresIn?: string;
  source?: string;
  /** Which try this is. Recorded against the delivery log, nothing more. */
  attempt?: number;
  /**
   * Rethrow a transient fault instead of reporting it.
   *
   * The route must never see a throw (§4), so it leaves this unset. The queue
   * handler sets it, because a throw is exactly how a job asks to be retried.
   */
  rethrowTransient?: boolean;
}

export interface PasswordResetResult extends EmailResult {
  /**
   * Set on a failure the relay might not repeat — a timeout, a 4xx, a
   * throttle. It is the difference between "worth queueing" and "queueing
   * this five times will fail it five times", which is the same call
   * `mailtrap.classify` makes for order mail.
   */
  transient?: boolean;
}

/**
 * The password reset link, by email.
 *
 * Attempted inline by the request that triggered it, because a reset that
 * arrives seconds after the click is the flow working as intended — and
 * unlike checkout, nothing irreversible has already happened, so there is no
 * "must not fail" constraint to protect. It still cannot throw into the route:
 * a transient failure is caught and reported as a failed send, because §4's
 * constant answer must not vary with whether the relay was up. What the route
 * does with that failure — hand it to the queue — is its business, not this
 * function's.
 *
 * NOTHING ABOUT THE ACCOUNT IS LOGGED. The URL carries the token; the address
 * is a personal identifier. Only the kind and the outcome reach the log.
 */
async function sendPasswordReset(input: PasswordResetInput): Promise<PasswordResetResult> {
  const to = String(input.to ?? '').trim();
  if (!to) return { status: 'failed', recipient: '', error: 'no recipient address' };

  const subject = 'Reset your SOPII password';
  const expiresIn = input.expiresIn || '1 hour';
  const name = input.name?.trim() || to.split('@')[0];

  const vars: TemplateVars = {
    logoUrl: LOGO_URL,
    customerName: name,
    resetUrl: input.resetUrl,
    expiresIn,
    supportLine:
      [
        env.email.supportEmail && `Email us at ${env.email.supportEmail}`,
        env.email.supportPhone && `call ${env.email.supportPhone}`,
      ]
        .filter(Boolean)
        .join(' or ') || 'Reply to this email and we will help.',
  };

  const text = [
    'Reset your SOPII password',
    '',
    `Hello ${name},`,
    '',
    'Somebody asked to reset the password on your SOPII account. Open the link',
    `below to choose a new one. It stops working in ${expiresIn}, and can be used once.`,
    '',
    input.resetUrl,
    '',
    'If this was not you, ignore this email — your password has not changed.',
    '',
    String(vars.supportLine ?? ''),
  ].join('\n');

  const startedAt = Date.now();

  try {
    const result = await deliver({
      to,
      subject,
      html: render(loadTemplate('password-reset'), vars),
      text,
      category: 'password_reset',
    });

    void recordDelivery({
      kind: 'password_reset',
      status: result.status,
      recipient: result.recipient,
      subject,
      messageId: result.messageId,
      error: result.error,
      attempt: input.attempt ?? 1,
      idempotencyKey: idempotencyKeyFor('password_reset', subject, to),
      durationMs: Date.now() - startedAt,
      source: input.source ?? 'auth',
    });

    return result;
  } catch (error) {
    /*
     * Caught rather than rethrown by default. §4 requires `/forgot-password`
     * to answer identically whether or not the account exists and whether or
     * not the relay is up, so the route gets a value. The queue handler asks
     * for the throw instead, because that is how it schedules a retry.
     */
    const message = error instanceof Error ? error.message : String(error);
    const transient = error instanceof TransientEmailError;

    void recordDelivery({
      kind: 'password_reset',
      status: 'failed',
      recipient: to,
      subject,
      error: message,
      attempt: input.attempt ?? 1,
      idempotencyKey: idempotencyKeyFor('password_reset', subject, to),
      durationMs: Date.now() - startedAt,
      source: input.source ?? 'auth',
    });

    logger.warn('email.password_reset_failed', { detail: message });

    if (transient && input.rethrowTransient) throw error;
    return { status: 'failed', recipient: to, error: message, transient };
  }
}

/* --------------------------------- the service ------------------------------ */

/**
 * One entry point per message this store sends.
 *
 * Each returns an `EmailResult` for the caller to record, and the order ones
 * throw only when a retry is wanted — see the note at the top of this file.
 */
export const EmailService = {
  /** False when `MAILTRAP_*` is incomplete; sends are then recorded `skipped`. */
  isConfigured,

  sendOrderConfirmation: (order: OrderLike, options?: OrderSendOptions) =>
    sendOrderEmail('order_confirmation', order, options),
  sendOrderShipped: (order: OrderLike, options?: OrderSendOptions) =>
    sendOrderEmail('order_shipped', order, options),
  sendOrderDelivered: (order: OrderLike, options?: OrderSendOptions) =>
    sendOrderEmail('order_delivered', order, options),
  sendOrderCancelled: (order: OrderLike, options?: OrderSendOptions) =>
    sendOrderEmail('order_cancelled', order, options),
  sendPasswordReset,

  /** Exposed for the resend endpoint, which picks the kind at runtime. */
  sendOrderEmail,
  /** Exposed for tests. */
  render,
  buildVars,
  orderText,
  alreadySent,
};

export { render as renderTemplate, buildVars as buildTemplateVars, orderText as renderOrderText };
