import { useState } from 'react';
import {
  Building2,
  CreditCard,
  ImageIcon,
  Mail,
  Pencil,
  Percent,
  Save,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, usePermissions } from '@/hooks';
import { useGetSettingsQuery, useUpdateSettingsMutation } from '@/store/api/platformApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader, Tabs } from '@/components/common/PageHeader';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/common/Card';
import { Button, IconButton } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { AppImage } from '@/components/common/AppImage';
import { Field, Input, Select, Switch, Textarea } from '@/components/common/Field';
import { CardSkeleton, ErrorState } from '@/components/common/States';
import { FormModal } from '@/components/modals/FormModal';
import { MediaPickerModal } from '@/components/modals/MediaPickerModal';
import { useToast } from '@/components/common/Toast';
import { WhatsAppPanel } from './WhatsAppPanel';
import { INDIAN_STATES } from '@/utils/constants';
import { formatCurrency } from '@/utils/format';
import type {
  EmailSettings,
  EmailTemplate,
  PaymentGateway,
  Settings,
  ShippingSettings,
  StoreSettings,
  TaxSettings,
} from '@/types';

/**
 * The settings document's own sections, plus `authentication`.
 *
 * Authentication is a tab here but not a key of `Settings`: it is served by its
 * own endpoint, because it holds a credential that has to be encrypted on the
 * way in and redacted on the way out — neither of which the generic
 * `PUT /settings/:section` handler can do. So the tab list is widened and the
 * panel below fetches for itself.
 */
type SectionKey = keyof Settings | 'authentication';

/** Shared save affordance for every settings panel. */
function SaveBar({
  onSave,
  loading,
  disabled,
}: {
  onSave: () => void;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <CardFooter>
      <Button
        variant="primary"
        icon={<Save className="h-4 w-4" />}
        loading={loading}
        disabled={disabled}
        onClick={onSave}
      >
        Save changes
      </Button>
    </CardFooter>
  );
}

/* ---------------------------------- store ---------------------------------- */

function StorePanel({
  value,
  onSave,
  saving,
  readOnly,
}: {
  value: StoreSettings;
  onSave: (body: StoreSettings) => void;
  saving: boolean;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState<StoreSettings>(value);
  const [pickerOpen, setPickerOpen] = useState(false);

  const setAddress = (patch: Partial<StoreSettings['address']>) =>
    setDraft({ ...draft, address: { ...draft.address, ...patch } });

  return (
    <Card>
      <CardHeader
        title="Store details"
        description="Used on invoices, transactional email and the storefront footer."
      />
      <CardBody className="space-y-5">
        <Field label="Store Logo">
          <div className="flex flex-wrap items-center gap-3">
            <AppImage
              src={draft.logo}
              alt={draft.storeName}
              seed="store-logo"
              wrapperClassName="h-16 w-16 shrink-0"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<ImageIcon className="h-3.5 w-3.5" />}
                disabled={readOnly}
                onClick={() => setPickerOpen(true)}
              >
                Change logo
              </Button>
              {draft.logo && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={readOnly}
                  onClick={() => setDraft({ ...draft, logo: '' })}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store Name" required>
            <Input
              value={draft.storeName}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, storeName: event.target.value })}
            />
          </Field>
          <Field label="Legal Entity Name">
            <Input
              value={draft.legalName}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, legalName: event.target.value })}
            />
          </Field>
          <Field label="Support Email" required>
            <Input
              type="email"
              value={draft.supportEmail}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, supportEmail: event.target.value })}
            />
          </Field>
          <Field label="Support Phone">
            <Input
              value={draft.phone}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
            />
          </Field>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium text-ink-800 dark:text-ink-200">
            Registered address
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Address Line 1" className="sm:col-span-2">
              <Input
                value={draft.address.line1}
                disabled={readOnly}
                onChange={(event) => setAddress({ line1: event.target.value })}
              />
            </Field>
            <Field label="Address Line 2" className="sm:col-span-2">
              <Input
                value={draft.address.line2 ?? ''}
                disabled={readOnly}
                onChange={(event) => setAddress({ line2: event.target.value })}
              />
            </Field>
            <Field label="City">
              <Input
                value={draft.address.city}
                disabled={readOnly}
                onChange={(event) => setAddress({ city: event.target.value })}
              />
            </Field>
            <Field label="State">
              <Select
                value={draft.address.state}
                disabled={readOnly}
                onChange={(event) => setAddress({ state: event.target.value })}
                options={INDIAN_STATES.map((state) => ({ value: state, label: state }))}
              />
            </Field>
            <Field label="PIN Code">
              <Input
                value={draft.address.pincode}
                disabled={readOnly}
                inputMode="numeric"
                onChange={(event) => setAddress({ pincode: event.target.value })}
              />
            </Field>
            <Field label="Country">
              <Input
                value={draft.address.country}
                disabled={readOnly}
                onChange={(event) => setAddress({ country: event.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Currency">
            <Input
              value={draft.currency}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
            />
          </Field>
          <Field label="Currency Symbol">
            <Input
              value={draft.currencySymbol}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, currencySymbol: event.target.value })}
            />
          </Field>
          <Field label="Timezone">
            <Select
              value={draft.timezone}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
              options={[
                { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
                { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
                { value: 'UTC', label: 'UTC' },
              ]}
            />
          </Field>
          <Field label="Weight Unit">
            <Select
              value={draft.weightUnit}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, weightUnit: event.target.value })}
              options={[
                { value: 'kg', label: 'Kilograms (kg)' },
                { value: 'g', label: 'Grams (g)' },
              ]}
            />
          </Field>
        </div>
      </CardBody>

      {!readOnly && <SaveBar onSave={() => onSave(draft)} loading={saving} />}

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple={false}
        folder="other"
        title="Select store logo"
        onSelect={(assets) => {
          if (assets[0]) setDraft({ ...draft, logo: assets[0].url });
        }}
      />
    </Card>
  );
}

/* -------------------------------- shipping --------------------------------- */

function ShippingPanel({
  value,
  onSave,
  saving,
  readOnly,
}: {
  value: ShippingSettings;
  onSave: (body: ShippingSettings) => void;
  saving: boolean;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState<ShippingSettings>(value);

  const updateZone = (id: string, patch: Partial<ShippingSettings['zones'][number]>) =>
    setDraft({
      ...draft,
      zones: draft.zones.map((zone) => (zone.id === id ? { ...zone, ...patch } : zone)),
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Shipping rates"
          description="Defaults applied when no zone rule matches the delivery address."
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Flat Rate">
              <Input
                type="number"
                min={0}
                prefix="₹"
                className="tabular-nums"
                value={String(draft.flatRate)}
                disabled={readOnly}
                onChange={(event) => setDraft({ ...draft, flatRate: Number(event.target.value) })}
              />
            </Field>
            <Field label="Free Shipping Above" hint="0 disables free shipping.">
              <Input
                type="number"
                min={0}
                prefix="₹"
                className="tabular-nums"
                value={String(draft.freeShippingThreshold)}
                disabled={readOnly}
                onChange={(event) =>
                  setDraft({ ...draft, freeShippingThreshold: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="COD Charge">
              <Input
                type="number"
                min={0}
                prefix="₹"
                className="tabular-nums"
                value={String(draft.codCharge)}
                disabled={readOnly}
                onChange={(event) => setDraft({ ...draft, codCharge: Number(event.target.value) })}
              />
            </Field>
            <Field label="Processing Time">
              <Input
                value={draft.processingTime}
                disabled={readOnly}
                onChange={(event) => setDraft({ ...draft, processingTime: event.target.value })}
                placeholder="1–2 business days"
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Delivery zones"
          description="Zone rates override the flat rate for the states they cover."
        />
        <ul className="divide-y divide-ink-200 dark:divide-ink-800">
          {draft.zones.map((zone) => (
            <li key={zone.id} className={cn('p-4', !zone.enabled && 'opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900 dark:text-ink-100">{zone.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-ink-500 dark:text-ink-400">
                    {zone.states.length ? zone.states.join(', ') : 'No states mapped'}
                  </p>
                </div>
                <Switch
                  size="sm"
                  checked={zone.enabled}
                  disabled={readOnly}
                  onChange={(checked) => updateZone(zone.id, { enabled: checked })}
                  label={`Toggle ${zone.name}`}
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Charge">
                  <Input
                    type="number"
                    min={0}
                    prefix="₹"
                    sizeVariant="sm"
                    className="tabular-nums"
                    value={String(zone.charge)}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateZone(zone.id, { charge: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Delivery Estimate">
                  <Input
                    sizeVariant="sm"
                    value={zone.etaDays}
                    disabled={readOnly}
                    onChange={(event) => updateZone(zone.id, { etaDays: event.target.value })}
                    placeholder="2–3 days"
                  />
                </Field>
              </div>
            </li>
          ))}
        </ul>
        {!readOnly && <SaveBar onSave={() => onSave(draft)} loading={saving} />}
      </Card>
    </div>
  );
}

/* ----------------------------------- tax ----------------------------------- */

function TaxPanel({
  value,
  onSave,
  saving,
  readOnly,
}: {
  value: TaxSettings;
  onSave: (body: TaxSettings) => void;
  saving: boolean;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState<TaxSettings>(value);

  const updateRule = (id: string, patch: Partial<TaxSettings['rules'][number]>) =>
    setDraft({
      ...draft,
      rules: draft.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    });

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Tax" description="GST registration and the rates applied at checkout." />
      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GSTIN">
            <Input
              value={draft.gstin}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, gstin: event.target.value.toUpperCase() })}
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Default Rate">
            <Input
              type="number"
              min={0}
              max={100}
              suffix="%"
              className="tabular-nums"
              value={String(draft.defaultRate)}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, defaultRate: Number(event.target.value) })}
            />
          </Field>
        </div>

        <div className="rounded-lg border border-ink-200 p-4 dark:border-ink-700">
          <Switch
            checked={draft.pricesIncludeTax}
            disabled={readOnly}
            onChange={(checked) => setDraft({ ...draft, pricesIncludeTax: checked })}
            label="Product prices include tax"
            description="When on, the listed price is the final price and tax is shown as a breakdown."
          />
        </div>
      </CardBody>

      <div className="border-t border-ink-200 dark:border-ink-800">
        <div className="px-5 py-3">
          <p className="text-sm font-semibold text-ink-900 dark:text-ink-100">Tax rules</p>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            Applied in order; the first matching rule wins.
          </p>
        </div>
        <ul className="divide-y divide-ink-200 border-t border-ink-200 dark:divide-ink-800 dark:border-ink-800">
          {draft.rules.map((rule) => (
            <li
              key={rule.id}
              className={cn(
                'flex flex-wrap items-center gap-3 px-5 py-3',
                !rule.enabled && 'opacity-60',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                  {rule.name}
                </p>
                <p className="truncate text-2xs text-ink-500 dark:text-ink-400">{rule.appliesTo}</p>
              </div>
              <Input
                type="number"
                min={0}
                max={100}
                suffix="%"
                sizeVariant="sm"
                className="w-24 shrink-0 tabular-nums"
                value={String(rule.rate)}
                disabled={readOnly}
                onChange={(event) => updateRule(rule.id, { rate: Number(event.target.value) })}
                aria-label={`Rate for ${rule.name}`}
              />
              <Switch
                size="sm"
                checked={rule.enabled}
                disabled={readOnly}
                onChange={(checked) => updateRule(rule.id, { enabled: checked })}
                label={`Toggle ${rule.name}`}
              />
            </li>
          ))}
        </ul>
      </div>

      {!readOnly && <SaveBar onSave={() => onSave(draft)} loading={saving} />}
    </Card>
  );
}

/* --------------------------------- payments -------------------------------- */

function PaymentsPanel({
  value,
  onSave,
  saving,
  readOnly,
}: {
  value: PaymentGateway[];
  onSave: (body: PaymentGateway[]) => void;
  saving: boolean;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState<PaymentGateway[]>(value);
  /* Newly typed secrets, held apart from the draft so an untouched field stays
     out of the payload entirely rather than submitting an empty string. */
  const [secrets, setSecrets] = useState<Record<string, string>>({});

  const update = (id: string, patch: Partial<PaymentGateway>) =>
    setDraft(draft.map((gateway) => (gateway.id === id ? { ...gateway, ...patch } : gateway)));

  const submit = () =>
    onSave(
      draft.map((gateway) => {
        const typed = secrets[gateway.id]?.trim();
        return typed ? { ...gateway, keySecret: typed } : gateway;
      }),
    );

  return (
    <div className="space-y-4">
      {draft.map((gateway) => (
        <Card key={gateway.id} className={cn(!gateway.enabled && 'opacity-75')}>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">
                    {gateway.name}
                  </h3>
                  {gateway.testMode && gateway.enabled && (
                    <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400">
                      Test mode
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{gateway.description}</p>
              </div>
              <Switch
                checked={gateway.enabled}
                disabled={readOnly}
                onChange={(checked) => update(gateway.id, { enabled: checked })}
                label={`Toggle ${gateway.name}`}
              />
            </div>

            {gateway.enabled && gateway.key === 'upi' && (
              <div className="grid gap-4 border-t border-ink-200 pt-4 dark:border-ink-800">
                <Field
                  label="Merchant VPA"
                  hint="Shown on the receipt. UPI payments themselves are collected through Razorpay, which is what can confirm them."
                >
                  <Input
                    value={gateway.keyId ?? ''}
                    disabled={readOnly}
                    onChange={(event) => update(gateway.id, { keyId: event.target.value })}
                    className="font-mono text-xs"
                    placeholder="sopii@hdfcbank"
                  />
                </Field>
              </div>
            )}

            {gateway.enabled && gateway.key === 'cod' && (
              <div className="grid gap-4 border-t border-ink-200 pt-4 dark:border-ink-800 sm:grid-cols-2">
                {/*
                  The eligibility window the checkout greys the option out
                  against, and the server refuses an order outside. Both read
                  the same two numbers, so the message a shopper sees and the
                  rule that is enforced cannot drift apart.
                */}
                <Field label="Minimum order value" hint="0 for no minimum.">
                  <Input
                    type="number"
                    min={0}
                    value={gateway.minOrderValue ?? 0}
                    disabled={readOnly}
                    prefix="₹"
                    onChange={(event) =>
                      update(gateway.id, { minOrderValue: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Maximum order value" hint="0 for no ceiling.">
                  <Input
                    type="number"
                    min={0}
                    value={gateway.maxOrderValue ?? 0}
                    disabled={readOnly}
                    prefix="₹"
                    onChange={(event) =>
                      update(gateway.id, { maxOrderValue: Number(event.target.value) })
                    }
                  />
                </Field>
              </div>
            )}

            {gateway.enabled && gateway.key !== 'cod' && gateway.key !== 'upi' && (
              <div className="grid gap-4 border-t border-ink-200 pt-4 dark:border-ink-800 sm:grid-cols-2">
                <Field label="Key ID" hint="Public — it reaches the browser during checkout by design.">
                  <Input
                    value={gateway.keyId ?? ''}
                    disabled={readOnly}
                    onChange={(event) => update(gateway.id, { keyId: event.target.value })}
                    className="font-mono text-xs"
                    placeholder="rzp_live_XXXXXXXX"
                  />
                </Field>
                <Field
                  label={gateway.hasKeySecret ? 'Replace Key Secret' : 'Key Secret'}
                  hint={
                    gateway.hasKeySecret
                      ? 'Leave blank to keep the stored key.'
                      : 'Encrypted before it is stored, and never returned to this page.'
                  }
                >
                  {/*
                    Bound to a local draft, not to `gateway.keySecret` — the API
                    does not return that field at all. An empty box means "keep
                    what is stored", which is why changing the test-mode switch
                    no longer wipes a working key.
                  */}
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={secrets[gateway.id] ?? ''}
                    disabled={readOnly}
                    onChange={(event) =>
                      setSecrets({ ...secrets, [gateway.id]: event.target.value })
                    }
                    className="font-mono text-xs"
                    placeholder={gateway.keySecretMasked || '••••••••'}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Switch
                    checked={gateway.testMode}
                    disabled={readOnly}
                    onChange={(checked) => update(gateway.id, { testMode: checked })}
                    label="Test mode"
                    description="Razorpay's own key prefix decides this in the end — an rzp_live_ key takes real money whatever this says."
                  />
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      ))}

      {!readOnly && (
        <Card>
          <SaveBar onSave={submit} loading={saving} />
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------- email ---------------------------------- */

function EmailPanel({
  value,
  onSave,
  saving,
  readOnly,
}: {
  value: EmailSettings;
  onSave: (body: EmailSettings) => void;
  saving: boolean;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState<EmailSettings>(value);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);

  const updateTemplate = (id: string, patch: Partial<EmailTemplate>) =>
    setDraft({
      ...draft,
      templates: draft.templates.map((template) =>
        template.id === id ? { ...template, ...patch } : template,
      ),
    });

  const submitTemplate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    updateTemplate(editing.id, {
      subject: editing.subject,
      body: editing.body,
      name: editing.name,
    });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Sender identity"
          description="How transactional email appears in a customer's inbox."
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Sender Name">
              <Input
                value={draft.senderName}
                disabled={readOnly}
                onChange={(event) => setDraft({ ...draft, senderName: event.target.value })}
              />
            </Field>
            <Field label="Sender Email">
              <Input
                type="email"
                value={draft.senderEmail}
                disabled={readOnly}
                onChange={(event) => setDraft({ ...draft, senderEmail: event.target.value })}
              />
            </Field>
            <Field label="Reply-To">
              <Input
                type="email"
                value={draft.replyTo}
                disabled={readOnly}
                onChange={(event) => setDraft({ ...draft, replyTo: event.target.value })}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Templates"
          description="Placeholders such as {{customer_name}} are filled in when the email is sent."
        />
        <ul className="divide-y divide-ink-200 dark:divide-ink-800">
          {draft.templates.map((template) => (
            <li
              key={template.id}
              className={cn(
                'flex flex-wrap items-center gap-3 px-5 py-3.5',
                !template.enabled && 'opacity-60',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                  {template.name}
                </p>
                <p className="truncate text-2xs text-ink-500 dark:text-ink-400">
                  {template.subject}
                </p>
              </div>
              <IconButton
                label={`Edit ${template.name}`}
                size="sm"
                disabled={readOnly}
                onClick={() => setEditing({ ...template })}
              >
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
              <Switch
                size="sm"
                checked={template.enabled}
                disabled={readOnly}
                onChange={(checked) => updateTemplate(template.id, { enabled: checked })}
                label={`Toggle ${template.name}`}
              />
            </li>
          ))}
        </ul>
        {!readOnly && <SaveBar onSave={() => onSave(draft)} loading={saving} />}
      </Card>

      <FormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={submitTemplate}
        title={editing ? `Edit ${editing.name}` : 'Edit template'}
        description="Changes apply the next time this email is sent."
        submitLabel="Apply"
        size="lg"
      >
        {editing && (
          <>
            <Field label="Template Name" required>
              <Input
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </Field>
            <Field label="Subject" required>
              <Input
                value={editing.subject}
                onChange={(event) => setEditing({ ...editing, subject: event.target.value })}
              />
            </Field>
            <Field
              label="Body"
              hint="Available placeholders: {{customer_name}}, {{order_code}}, {{order_total}}, {{courier}}, {{tracking_number}}"
            >
              <Textarea
                rows={12}
                value={editing.body}
                onChange={(event) => setEditing({ ...editing, body: event.target.value })}
                className="font-mono text-xs"
              />
            </Field>
          </>
        )}
      </FormModal>
    </div>
  );
}

/* ---------------------------------- page ----------------------------------- */

const TABS: { key: SectionKey; label: string; icon: typeof Building2 }[] = [
  { key: 'store', label: 'Store', icon: Building2 },
  { key: 'shipping', label: 'Shipping', icon: Truck },
  { key: 'tax', label: 'Tax', icon: Percent },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'authentication', label: 'Authentication', icon: ShieldCheck },
];

export default function SettingsPage() {
  useDocumentTitle('Settings');

  const toast = useToast();
  const { can } = usePermissions();
  const readOnly = !can('settings', 'edit');

  const [tab, setTab] = useState<SectionKey>('store');
  const { data, isLoading, isError, refetch } = useGetSettingsQuery();
  const [updateSettings, { isLoading: saving }] = useUpdateSettingsMutation();

  const save = async (section: keyof Settings, body: unknown) => {
    try {
      await updateSettings({ section, body }).unwrap();
      toast.success('Settings saved.', `${TABS.find((item) => item.key === section)?.label} updated.`);
    } catch (error) {
      toast.error('Could not save the settings', errorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Store identity, delivery, tax, payment gateways, transactional email and how customers sign in."
        meta={
          readOnly ? (
            <Badge dot="bg-amber-500">Read-only</Badge>
          ) : undefined
        }
      />

      <Tabs
        items={TABS.map((item) => ({
          key: item.key,
          label: item.label,
          icon: <item.icon className="h-3.5 w-3.5" />,
        }))}
        active={tab}
        onChange={(key) => setTab(key as SectionKey)}
      />

      {tab === 'authentication' ? (
        /*
         * Rendered ahead of the settings-document branches because it does not
         * read `data` at all — a failure loading store settings should not
         * hide the screen where WhatsApp login is configured.
         */
        <WhatsAppPanel readOnly={readOnly} />
      ) : isError ? (
        <Card>
          <ErrorState
            title="We could not load your settings"
            description="The settings request failed. Try again in a moment."
            onRetry={refetch}
          />
        </Card>
      ) : isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : (
        <>
          {tab === 'store' && (
            <StorePanel
              key={JSON.stringify(data.store)}
              value={data.store}
              saving={saving}
              readOnly={readOnly}
              onSave={(body) => save('store', body)}
            />
          )}
          {tab === 'shipping' && (
            <ShippingPanel
              key={JSON.stringify(data.shipping)}
              value={data.shipping}
              saving={saving}
              readOnly={readOnly}
              onSave={(body) => save('shipping', body)}
            />
          )}
          {tab === 'tax' && (
            <TaxPanel
              key={JSON.stringify(data.tax)}
              value={data.tax}
              saving={saving}
              readOnly={readOnly}
              onSave={(body) => save('tax', body)}
            />
          )}
          {tab === 'payments' && (
            <PaymentsPanel
              key={JSON.stringify(data.payments)}
              value={data.payments}
              saving={saving}
              readOnly={readOnly}
              onSave={(body) => save('payments', body)}
            />
          )}
          {tab === 'email' && (
            <EmailPanel
              key={JSON.stringify(data.email)}
              value={data.email}
              saving={saving}
              readOnly={readOnly}
              onSave={(body) => save('email', body)}
            />
          )}
        </>
      )}

      {tab === 'shipping' && data && (
        <p className="text-center text-xs text-ink-400">
          Orders above {formatCurrency(data.shipping.freeShippingThreshold)} ship free.
        </p>
      )}
    </div>
  );
}
