import { useState } from 'react';
import { AlertTriangle, KeyRound, MessageCircle, Save, Send, ShieldCheck } from 'lucide-react';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Field, Input, Select, Switch } from '@/components/common/Field';
import { CardSkeleton, ErrorState } from '@/components/common/States';
import { useToast } from '@/components/common/Toast';
import { errorMessage } from '@/store/api/baseQuery';
import {
  useGetWhatsAppSettingsQuery,
  useTestWhatsAppMutation,
  useUpdateWhatsAppSettingsMutation,
} from '@/store/api/platformApi';
import type { WhatsAppProvider, WhatsAppSettings, WhatsAppSettingsInput } from '@/types';

/**
 * Admin → Settings → Authentication → WhatsApp (§9).
 *
 * The one rule this screen exists to respect: **the access token goes up and
 * never comes back down.** The API answers with `accessTokenMasked` and this
 * form renders that as a placeholder; the token field is left empty, and an
 * empty token field on save means "keep what is stored". So an admin can
 * change the OTP expiry without re-typing a credential, and a credential is
 * never sitting in a browser's memory waiting to be read by whatever else is
 * running on the page.
 *
 * The provider list is deliberately closed — Meta, Twilio, or another approved
 * Business Solution Provider behind a webhook. There is no option here for
 * WhatsApp Web automation or a personal account, because there is no such
 * transport on the server either.
 */

const PROVIDERS: { value: WhatsAppProvider; label: string }[] = [
  { value: 'meta', label: 'Meta WhatsApp Business Platform (Cloud API)' },
  { value: 'twilio', label: 'Twilio WhatsApp' },
  { value: 'webhook', label: 'Other approved Business Solution Provider' },
];

/** What each provider actually needs, so the form shows only those fields. */
const NEEDS: Record<WhatsAppProvider, ('phoneNumberId' | 'businessAccountId' | 'template' | 'twilio')[]> = {
  meta: ['phoneNumberId', 'businessAccountId', 'template'],
  twilio: ['twilio', 'template'],
  webhook: ['phoneNumberId', 'businessAccountId', 'template'],
};

export function WhatsAppPanel({ readOnly }: { readOnly: boolean }) {
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useGetWhatsAppSettingsQuery();

  if (isError) {
    return (
      <Card>
        <ErrorState
          title="We could not load the WhatsApp settings"
          description="The request failed. Try again in a moment."
          onRetry={refetch}
        />
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  /*
   * Keyed on `updatedAt` so a successful save re-seeds the draft from the
   * server rather than leaving the form holding what was typed — which matters
   * for the token field, whose stored value is now a mask the draft must not
   * try to submit back.
   */
  return <WhatsAppForm key={data.updatedAt ?? 'new'} value={data} readOnly={readOnly} toast={toast} />;
}

function WhatsAppForm({
  value,
  readOnly,
  toast,
}: {
  value: WhatsAppSettings;
  readOnly: boolean;
  toast: ReturnType<typeof useToast>;
}) {
  const [update, { isLoading: saving }] = useUpdateWhatsAppSettingsMutation();
  const [test, { isLoading: testing }] = useTestWhatsAppMutation();

  const [draft, setDraft] = useState<WhatsAppSettingsInput>({
    enabled: value.enabled,
    provider: value.provider,
    apiUrl: value.apiUrl,
    phoneNumberId: value.phoneNumberId,
    businessAccountId: value.businessAccountId,
    templateName: value.templateName,
    templateLanguage: value.templateLanguage,
    fromNumber: value.fromNumber,
    accountSid: value.accountSid,
    otpExpiryMinutes: value.otpExpiryMinutes,
    maxAttempts: value.maxAttempts,
    resendLimit: value.resendLimit,
  });

  /* Held apart from `draft` so it is only ever sent when actually typed. */
  const [token, setToken] = useState('');
  const [testNumber, setTestNumber] = useState('');

  const set = <K extends keyof WhatsAppSettingsInput>(key: K, next: WhatsAppSettingsInput[K]) =>
    setDraft((current) => ({ ...current, [key]: next }));

  const needs = NEEDS[draft.provider];

  const save = async () => {
    try {
      await update({ ...draft, ...(token ? { accessToken: token } : {}) }).unwrap();
      setToken('');
      toast.success('WhatsApp settings saved.', 'Customers will see the change immediately.');
    } catch (error) {
      toast.error('Could not save the WhatsApp settings', errorMessage(error));
    }
  };

  const sendTest = async () => {
    try {
      const result = await test({ mobile: testNumber }).unwrap();
      if (result.ok) toast.success('Test message sent.', result.message);
      else toast.error('The test message was not delivered', result.message);
    } catch (error) {
      toast.error('Could not send the test message', errorMessage(error));
    }
  };

  return (
    <div className="space-y-4">
      {/* ------------------------------ connection ----------------------------- */}
      <Card>
        <CardHeader
          title="WhatsApp OTP"
          description="Let customers sign in with a one-time code sent over WhatsApp."
          action={
            value.ready ? (
              <Badge dot="bg-emerald-500">Live</Badge>
            ) : value.enabled ? (
              <Badge dot="bg-amber-500">Incomplete</Badge>
            ) : (
              <Badge dot="bg-ink-400">Off</Badge>
            )
          }
        />
        <CardBody className="space-y-5">
          <Switch
            checked={Boolean(draft.enabled)}
            disabled={readOnly}
            onChange={(checked) => set('enabled', checked)}
            label="Enable WhatsApp login"
            description="When off, the storefront hides the WhatsApp option entirely and the API refuses WhatsApp OTP requests."
          />

          {/*
            Named plainly rather than left for the admin to discover through a
            failed test. The server applies the same rule — `enabled` alone is
            not enough to switch the method on.
          */}
          {draft.enabled && value.missing.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                WhatsApp login stays off until these are filled in:{' '}
                <strong>{value.missing.join(', ')}</strong>.
              </span>
            </p>
          )}

          <Field
            label="WhatsApp Provider"
            hint="Only official WhatsApp Business API providers are supported."
            required
          >
            <Select
              value={draft.provider}
              disabled={readOnly}
              options={PROVIDERS}
              onChange={(event) => set('provider', event.target.value as WhatsAppProvider)}
            />
          </Field>

          <Field
            label="API URL"
            hint={
              draft.provider === 'meta'
                ? 'Graph API base, e.g. https://graph.facebook.com/v21.0'
                : draft.provider === 'twilio'
                  ? 'Leave as the Twilio default unless you use a regional edge.'
                  : 'The endpoint your provider accepts message POSTs on.'
            }
            required={draft.provider === 'webhook'}
          >
            <Input
              value={draft.apiUrl}
              disabled={readOnly}
              placeholder="https://graph.facebook.com/v21.0"
              onChange={(event) => set('apiUrl', event.target.value)}
            />
          </Field>

          {needs.includes('phoneNumberId') && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Phone Number ID"
                hint="From the WhatsApp Manager — not the phone number itself."
                required={draft.provider === 'meta'}
              >
                <Input
                  value={draft.phoneNumberId}
                  disabled={readOnly}
                  placeholder="1029384756574839"
                  onChange={(event) => set('phoneNumberId', event.target.value)}
                />
              </Field>

              <Field label="Business Account ID" hint="WABA ID. Optional, kept for reference.">
                <Input
                  value={draft.businessAccountId}
                  disabled={readOnly}
                  placeholder="9182736450918273"
                  onChange={(event) => set('businessAccountId', event.target.value)}
                />
              </Field>
            </div>
          )}

          {needs.includes('twilio') && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account SID" required>
                <Input
                  value={draft.accountSid}
                  disabled={readOnly}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  onChange={(event) => set('accountSid', event.target.value)}
                />
              </Field>

              <Field label="From Number" hint="The WhatsApp-enabled sender." required>
                <Input
                  value={draft.fromNumber}
                  disabled={readOnly}
                  placeholder="whatsapp:+14155238886"
                  onChange={(event) => set('fromNumber', event.target.value)}
                />
              </Field>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Field
              label="OTP Template Name"
              hint={
                draft.provider === 'twilio'
                  ? 'A Content SID (HX…) for business-initiated messages.'
                  : 'An approved AUTHENTICATION template with one body variable.'
              }
              required={draft.provider === 'meta'}
            >
              <Input
                value={draft.templateName}
                disabled={readOnly}
                placeholder="sopii_login_otp"
                onChange={(event) => set('templateName', event.target.value)}
              />
            </Field>

            <Field label="Template Language">
              <Input
                value={draft.templateLanguage}
                disabled={readOnly}
                placeholder="en"
                onChange={(event) => set('templateLanguage', event.target.value)}
              />
            </Field>
          </div>
        </CardBody>
        {!readOnly && (
          <CardFooter>
            <Button
              variant="primary"
              icon={<Save className="h-4 w-4" />}
              loading={saving}
              onClick={save}
            >
              Save changes
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* ------------------------------ credential ----------------------------- */}
      <Card>
        <CardHeader
          title="Access Token"
          description="Stored encrypted on the server and never sent back to this page."
          action={<KeyRound className="h-4 w-4 text-ink-400" />}
        />
        <CardBody className="space-y-4">
          <Field
            label={value.hasAccessToken ? 'Replace Access Token' : 'Access Token'}
            hint={
              value.hasAccessToken
                ? 'Leave blank to keep the token that is already stored.'
                : draft.provider === 'twilio'
                  ? 'Your Twilio auth token.'
                  : 'A permanent System User token from Meta.'
            }
          >
            <Input
              /*
               * `type="password"` and `autoComplete="off"`: this is a
               * credential being typed into a shared machine, and no browser
               * should be offering to remember it or showing it to whoever
               * walks past.
               */
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              disabled={readOnly}
              placeholder={value.accessTokenMasked || 'EAAG…'}
              onChange={(event) => setToken(event.target.value)}
            />
          </Field>

          <p className="flex items-start gap-2 text-xs text-ink-500 dark:text-ink-400">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {value.accessTokenFromEnv
                ? 'The token currently in use comes from the server environment. Saving one here overrides it.'
                : value.hasAccessToken
                  ? `A token is installed (${value.accessTokenMasked}). It is encrypted at rest and is never returned to the browser.`
                  : 'No token is installed yet. It will be encrypted before it is stored, and never sent back here.'}
            </span>
          </p>
        </CardBody>
        {!readOnly && (
          <CardFooter>
            <Button
              variant="primary"
              icon={<Save className="h-4 w-4" />}
              loading={saving}
              disabled={!token}
              onClick={save}
            >
              Save token
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* -------------------------------- limits ------------------------------- */}
      <Card>
        <CardHeader
          title="OTP rules"
          description="How long a code lives, and how hard it may be guessed at."
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="OTP Expiry" hint="1–30 minutes.">
              <Input
                type="number"
                min={1}
                max={30}
                value={draft.otpExpiryMinutes}
                disabled={readOnly}
                suffix="min"
                onChange={(event) => set('otpExpiryMinutes', Number(event.target.value))}
              />
            </Field>

            <Field label="Maximum Attempts" hint="Wrong guesses before the code is burned.">
              <Input
                type="number"
                min={1}
                max={10}
                value={draft.maxAttempts}
                disabled={readOnly}
                onChange={(event) => set('maxAttempts', Number(event.target.value))}
              />
            </Field>

            <Field label="Resend Limit" hint="Resends allowed on one verification.">
              <Input
                type="number"
                min={1}
                max={10}
                value={draft.resendLimit}
                disabled={readOnly}
                onChange={(event) => set('resendLimit', Number(event.target.value))}
              />
            </Field>
          </div>

          <p className="mt-4 text-xs text-ink-500 dark:text-ink-400">
            Requests per number per hour, the resend cooldown and the per-IP ceiling are set in the
            server environment and apply to every OTP channel together — so raising these does not
            widen the overall rate limit.
          </p>
        </CardBody>
        {!readOnly && (
          <CardFooter>
            <Button
              variant="primary"
              icon={<Save className="h-4 w-4" />}
              loading={saving}
              onClick={save}
            >
              Save changes
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* --------------------------------- test -------------------------------- */}
      <Card>
        <CardHeader
          title="Test the configuration"
          description="Sends one message through exactly the path a real OTP takes."
          action={<MessageCircle className="h-4 w-4 text-ink-400" />}
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Send to" className="min-w-[220px] flex-1">
              <Input
                value={testNumber}
                disabled={readOnly || !value.hasAccessToken}
                placeholder="+91 98765 43210"
                onChange={(event) => setTestNumber(event.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              icon={<Send className="h-3.5 w-3.5" />}
              loading={testing}
              disabled={readOnly || !testNumber || !value.hasAccessToken}
              onClick={sendTest}
            >
              Send Test WhatsApp Message
            </Button>
          </div>

          <p className="text-xs text-ink-500 dark:text-ink-400">
            The test carries a throwaway code that cannot sign anyone in, and it uses whatever is
            <strong> saved</strong> — save your changes first. Limited to five an hour.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
