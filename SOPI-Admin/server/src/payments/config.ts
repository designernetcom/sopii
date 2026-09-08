/*
 * Payment gateway configuration.
 * ===========================================================================
 * Two sources, one answer — the same arrangement `auth/whatsappConfig.ts` uses,
 * and for the same reason: an operator can wire up a gateway from the admin
 * panel without a redeploy, while a deployment that would rather keep its
 * credentials in the environment simply never fills the form in.
 *
 *   settings.payments   what an admin has stored under Settings → Payments
 *   environment         RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET
 *
 * The **key secret never leaves this server.** It is AES-GCM encrypted at rest
 * (`auth/secretBox.ts`), decrypted only inside `payments/razorpay.ts` to sign a
 * request, and replaced by a mask on the way back to the admin panel. The key
 * *id* is a different animal — Razorpay's checkout script needs it in the
 * browser by design, so it is handed to the storefront deliberately, and only
 * as part of a payment the server has already priced and created.
 */

import { decryptSecret, encryptSecret, isEncrypted, maskSecret } from '../auth/secretBox.js';
import { loadSettings } from '../lib/settings.js';
import type { PaymentGateway } from '@/types';

/** Gateway keys that mean "money moves online, before the order exists". */
export const ONLINE_GATEWAYS = ['razorpay', 'upi', 'card', 'netbanking', 'stripe'] as const;

export const isOnlineGateway = (key: string) => (ONLINE_GATEWAYS as readonly string[]).includes(key);

/* -------------------------------- razorpay --------------------------------- */

export interface RazorpayConfig {
  /** Switched on in the panel *and* holding both halves of a key pair. */
  enabled: boolean;
  keyId: string;
  keySecret: string;
  testMode: boolean;
  apiUrl: string;
}

const RAZORPAY_API = process.env.RAZORPAY_API_URL?.trim() || 'https://api.razorpay.com/v1';

/**
 * A seeded placeholder is not a credential.
 *
 * The demo dataset ships `rzp_test_XXXXXXXXXXXXXX` and a row of bullets so the
 * settings screen has something to show. Treating those as configured would
 * mean every fresh install offers a Pay Now button that 401s at Razorpay, so
 * they are recognised and discarded here instead.
 */
const isPlaceholder = (value: string) =>
  !value || /X{6,}/.test(value) || /^[•*]+$/.test(value) || value.length < 8;

export async function resolveRazorpayConfig(): Promise<RazorpayConfig> {
  const { payments } = await loadSettings();
  const gateway = payments.find((entry) => entry.key === 'razorpay');

  const storedId = gateway?.keyId?.trim() ?? '';
  const storedSecret = gateway?.keySecret ? decryptSecret(gateway.keySecret) : '';

  const keyId = isPlaceholder(storedId) ? (process.env.RAZORPAY_KEY_ID?.trim() ?? '') : storedId;
  const keySecret = isPlaceholder(storedSecret)
    ? (process.env.RAZORPAY_KEY_SECRET?.trim() ?? '')
    : storedSecret;

  return {
    enabled: Boolean(gateway?.enabled) && !isPlaceholder(keyId) && !isPlaceholder(keySecret),
    keyId,
    keySecret,
    /*
     * Razorpay's own key prefix is the authority, not the checkbox: a live key
     * in a gateway someone left flagged "test mode" is still live money.
     */
    testMode: keyId.startsWith('rzp_test_') || Boolean(gateway?.testMode && !keyId.startsWith('rzp_live_')),
    apiUrl: RAZORPAY_API.replace(/\/+$/, ''),
  };
}

/**
 * Which gateway actually settles a given payment method.
 *
 * UPI is the interesting one. The store has a `upi` row with a merchant VPA in
 * it, which is a *display* setting — there is no integration behind a static
 * VPA that can confirm a payment, and a QR code somebody scans tells this
 * server nothing about whether money arrived. So UPI is settled through
 * Razorpay, whose checkout offers UPI as one of its methods, and the resulting
 * order records `paymentMethod: 'upi'` because that is what the customer
 * actually paid with. §2 of the brief asks for exactly this.
 */
export function settlesThrough(gatewayKey: string): 'razorpay' | null {
  return gatewayKey === 'razorpay' || gatewayKey === 'upi' ? 'razorpay' : null;
}

/* ---------------------------------- cod ------------------------------------ */

export interface CodRules {
  enabled: boolean;
  /** Orders below this cannot use COD. 0 = no floor. */
  minOrderValue: number;
  /** Orders above this cannot use COD. 0 = no ceiling. */
  maxOrderValue: number;
  /** The flat fee added to a COD order, from Settings → Shipping. */
  charge: number;
}

const money = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
};

/**
 * What Cash on Delivery is allowed to cover.
 *
 * The seeded description already promises "orders under ₹15,000", so the limit
 * is real configuration rather than prose: it is read from the COD gateway row,
 * falls back to the environment, and is enforced on the server whatever the
 * checkout drew.
 */
export async function resolveCodRules(): Promise<CodRules> {
  const settings = await loadSettings();
  const gateway = settings.payments.find((entry) => entry.key === 'cod') as
    | (PaymentGateway & { minOrderValue?: number; maxOrderValue?: number })
    | undefined;

  return {
    enabled: Boolean(gateway?.enabled),
    minOrderValue: money(gateway?.minOrderValue, money(process.env.COD_MIN_ORDER_VALUE, 0)),
    maxOrderValue: money(gateway?.maxOrderValue, money(process.env.COD_MAX_ORDER_VALUE, 15000)),
    charge: Math.max(0, Number(settings.shipping.codCharge) || 0),
  };
}

/**
 * Whether this order total may be paid on delivery, and why not when it may
 * not.
 *
 * Returns a reason rather than throwing, because the checkout wants to grey the
 * option out *before* somebody picks it — "Not available on orders above
 * ₹15,000" beside a disabled radio is a better experience than the same
 * sentence after a click. The order route calls this too, so the message is
 * the same in both places and the rule is enforced whatever the browser did.
 */
export function codProblem(rules: CodRules, total: number): string | null {
  if (!rules.enabled) return 'Cash on delivery is not available on this store.';

  if (rules.maxOrderValue > 0 && total > rules.maxOrderValue) {
    return `Cash on delivery is not available on orders above ₹${rules.maxOrderValue.toLocaleString('en-IN')}. Please pay online to continue.`;
  }
  if (rules.minOrderValue > 0 && total < rules.minOrderValue) {
    return `Cash on delivery needs an order of at least ₹${rules.minOrderValue.toLocaleString('en-IN')}.`;
  }

  return null;
}

/* -------------------------------- redaction -------------------------------- */

/**
 * The admin panel's view of the gateways: everything except the secret.
 *
 * `keySecretMasked` exists so an admin can confirm *which* key is installed
 * without the key crossing the wire, and `hasKeySecret` so the form can say
 * "replace" rather than "add". The `keyId` is not redacted — it is public by
 * design and appears in the browser during checkout either way.
 */
export function redactGateways(payments: PaymentGateway[]): PaymentGateway[] {
  return payments.map((gateway) => {
    const { keySecret, ...rest } = gateway;
    const decrypted = keySecret ? decryptSecret(keySecret) : '';

    /*
     * A seeded placeholder is reported as *absent*, using the same test the
     * runtime config applies. The demo dataset ships a row of bullets in this
     * field, and a panel that says "a key is installed — leave blank to keep
     * it" over a placeholder would talk an operator out of entering the real
     * one.
     */
    const plain = isPlaceholder(decrypted) ? '' : decrypted;

    return {
      ...rest,
      keySecretMasked: maskSecret(plain),
      hasKeySecret: Boolean(plain),
    } as PaymentGateway;
  });
}

/**
 * Normalises a gateway list on its way into the database.
 *
 * Two rules the panel cannot be trusted to keep for itself: the secret is
 * encrypted before it touches the settings document, and a submission carrying
 * the mask (or nothing at all) leaves the stored one alone rather than
 * overwriting a working key with dots. Without the second rule, saving a change
 * to the COD limit would silently wipe the Razorpay secret.
 */
export function mergeGatewaySecrets(
  incoming: PaymentGateway[],
  current: PaymentGateway[],
): PaymentGateway[] {
  const byId = new Map(current.map((gateway) => [gateway.id, gateway]));

  return incoming.map((gateway) => {
    const stored = byId.get(gateway.id);
    const submitted = typeof gateway.keySecret === 'string' ? gateway.keySecret.trim() : '';

    // Anything masked, empty, or unchanged from what we handed out keeps the
    // stored value. `•` is the mask character, and never valid in a real key.
    const keepExisting = !submitted || submitted.includes('•') || submitted === '__unchanged__';

    const keySecret = keepExisting
      ? stored?.keySecret
      : isEncrypted(submitted)
        ? submitted
        : encryptSecret(submitted);

    /* The redaction fields are display-only; they must not be written back. */
    const { keySecretMasked, hasKeySecret, ...clean } = gateway as PaymentGateway & {
      keySecretMasked?: string;
      hasKeySecret?: boolean;
    };
    void keySecretMasked;
    void hasKeySecret;

    return { ...clean, keySecret } as PaymentGateway;
  });
}
