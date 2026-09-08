# SOPII Authentication

One authentication system, four ways in, two front ends.

`SOPI-Admin/server/src/auth/` is a self-contained module mounted at `/api/auth`.
It serves the customer shop (`SOPII/`) and the admin panel (`SOPI-Admin/`) from
a single identity model, and decides — server-side, on every request — which of
them a given session is allowed to touch.

---

## Contents

1. [The shape of it](#the-shape-of-it)
2. [Running it](#running-it)
3. [The identity model](#the-identity-model)
4. [Sessions and tokens](#sessions-and-tokens)
5. [The four login methods](#the-four-login-methods)
6. [Roles and access control](#roles-and-access-control)
7. [Rate limiting and lockout](#rate-limiting-and-lockout)
8. [The audit log](#the-audit-log)
9. [API reference](#api-reference)
10. [Frontend](#frontend)
11. [Configuration](#configuration)
12. [Security decisions, and why](#security-decisions-and-why)
13. [Before you deploy](#before-you-deploy)

---

## The shape of it

```
                     ┌──────────────────────────────┐
   SOPII shop  ─────▶│                              │
   :5174            │   /api/auth   (src/auth/)     │
                     │                              │
   Admin panel ─────▶│   one identity model         │
   :5173            │   one set of rules            │
                     │   surface check per session   │
                     └───────────────┬──────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              users +          sessions +       audit log +
              identities       refresh tokens   rate limits
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
  customers                admin_users
  (commerce record)        (panel record)
```

The two records at the bottom are the store's existing ones. The auth module
**owns** an identity and *points at* whichever of them that identity has —
`user.customerId`, `user.adminUserId`. `src/auth/users.ts` is the only file
that knows how the three relate, which is what lets the panel's existing screens
carry on reading the records they always did.

### Files

| Path | What it holds |
|---|---|
| `auth/config.ts` | Every limit, window and lifetime, read from the environment |
| `auth/models.ts` | The nine collections of §29 |
| `auth/crypto.ts` | bcrypt for passwords and OTPs, keyed digests for tokens |
| `auth/identifiers.ts` | Normalising emails, mobiles and usernames |
| `auth/sessions.ts` | Access tokens, refresh rotation, device list |
| `auth/otp.ts` / `auth/sms.ts` | OTP issue and verify; the SMS provider seam |
| `auth/google.ts` | OAuth 2.0 / OIDC, PKCE, JWKS verification |
| `auth/rateLimit.ts` | Fixed-window and progressive throttling |
| `auth/audit.ts` | The authentication trail |
| `auth/middleware.ts` | `requireUser`, `requireAdmin`, `requirePermission`, CSRF |
| `auth/users.ts` | The identity service and its bridge to commerce records |
| `auth/seed.ts` | Migrates existing admins and customers into `users` |
| `auth/routes/` | The endpoints |

---

## Running it

```bash
# 1. API
cd SOPI-Admin/server
cp .env.example .env          # read the AUTHENTICATION block before deploying
npm install
npm run dev                   # http://localhost:4000

# 2. Admin panel
cd SOPI-Admin
npm install && npm run dev    # http://localhost:5173

# 3. Shop front
cd SOPII
npm install && npm run dev    # http://localhost:5174
```

Both front ends proxy `/api` to the API server, so the browser stays on one
origin in development and cookies work without any `SameSite` gymnastics.

On first boot, `seedAuthIdentities()` walks the existing `admin_users` and any
`customers` who had set a password, and gives each an identity — carrying the
bcrypt hash across rather than asking anyone to register again. It is
idempotent, so it is safe on every start.

**Demo sign-in:** any seeded admin email (`rajesh@sopii.in`, `meera@sopii.in`,
…) with the password from `SEED_PASSWORD`, default `sopii123`.

### Trying the OTP flow

With no SMS provider configured, development prints the code to the API server
log:

```
[auth] ─── DEV OTP ────────────────────────────────
[auth]   +919876543210  →  418302
[auth]   expires in 300s
[auth] ─────────────────────────────────────────────
```

It is never in an HTTP response, and the printing is force-disabled when
`NODE_ENV=production`. Password reset links behave the same way.

### Trying Google

Create an OAuth 2.0 Client ID (type *Web application*) in the Google Cloud
console, register `http://localhost:4000/api/auth/google/callback` as an
authorised redirect URI, and put the id and secret in `server/.env`. The
"Continue with Google" button appears on both login pages by itself — it asks
the API whether Google is configured and renders nothing when it is not.

---

## The identity model

```
users                              user_identities
├── id                             ├── id
├── first_name, last_name          ├── user_id  ─────┐
├── email          (unique,sparse) ├── provider      │ password | google | otp
├── mobile         (unique,sparse) ├── provider_user_id
├── password_hash  (select:false)  ├── provider_email
├── profile_image                  └── created_at
├── status         active|inactive|locked
├── email_verified_at                     one row per way in.
├── mobile_verified_at                    §8's account linking is
├── role                                  a second row pointing at
├── customer_id ──▶ customers             the same user_id.
├── admin_user_id ─▶ admin_users
├── locked_until, failed_login_count
└── created_at, updated_at
```

`email` and `mobile` are **sparse** unique indexes. An OTP-only shopper has no
email and a password-only account may have no mobile; a plain unique index
would collide on the second document holding `null`.

A customer's commerce record is created **on demand** — at registration, or on
their first order — so an identity that has only ever received an OTP does not
clutter the panel's customer list with an empty row.

---

## Sessions and tokens

Three things, with different jobs:

| | Lives | Lifetime | Job |
|---|---|---|---|
| **Access token** | JavaScript memory | 15 min | Sent as `Authorization: Bearer` |
| **Refresh token** | HttpOnly cookie | 30 days, rotated | Mints new access tokens |
| **Session** | `sessions` row | Until revoked | What a person recognises and can end |

Nothing is written to `localStorage` (§30). A reload loses the access token,
which is the point: the durable half is a cookie the page's JavaScript cannot
read, so a script that manages to run there can act as the user *while the tab
is open* but cannot carry a credential away and replay it tomorrow.

### Rotation, and reuse detection

Every `/auth/refresh` marks the presented token used and issues a successor.

If an already-used token turns up again more than 30 seconds later, two parties
hold the same secret — the honest client and whoever copied it — and there is no
way to tell which is which. The whole session is revoked and a
`token_reuse_detected` line goes in the audit log.

The 30-second grace window exists because two browser tabs waking at the same
instant legitimately present the same token. Inside the window the successor is
handed back instead of an alarm being raised.

### CSRF

`/auth/refresh` and `/auth/logout` are the only endpoints authenticated by
cookie, so they are the only ones that need CSRF protection. Both use
double-submit: the `X-CSRF-Token` header must equal the readable `sopii_csrf`
cookie. Same-origin JavaScript can read that cookie; a cross-site form cannot.

Every other endpoint carries a bearer token, which a cross-site page has no way
to obtain — so it cannot be forged, and no check is needed.

### Revocation is immediate

`requireUser` reads the session row named by the token's `sid` on every request.
That is one indexed lookup per call, and it buys "Log out this device" actually
working the moment it is pressed rather than up to fifteen minutes later.

---

## The four login methods

### Password

```
identifier + password
   ↓  parseIdentifier — email? mobile? username?
   ↓  rate limit: progressive per identifier, fixed per IP
   ↓  bcrypt compare  (against a dummy hash when there is no such user,
   ↓                   so timing does not distinguish the two)
   ↓  status check    (after the password, never before)
   ↓  create session, set cookies, audit
```

The single "Email / Username" field accepts all three. A bare handle is matched
against the local part of an email, since the store has no separate username
column: typing `rajesh` finds `rajesh@sopii.in`.

**Every failure answers `Invalid email or password.`** — same message, same
status, same timing, whether the account exists or not.

### Mobile OTP

```
mobile → 6 random digits (rejection-sampled, not modulo-biased)
       → bcrypt hash → otp_verifications
       → SMS provider
                            ↓
       user types it → bcrypt compare → session
```

The code is never stored in the clear, never in a response, never logged
outside the development helper. Requesting a new OTP **consumes** the
outstanding one, so two live codes never coexist for a number. A code dies on
success, on expiry, or after five wrong guesses — whichever comes first.

The attempt counter is incremented *before* the comparison, so a client that
disconnects mid-request has still spent its guess.

A number nobody has registered still gets a code, and the account is created on
successful verification. Answering "no such number" would be a free directory
check.

### WhatsApp OTP

Mobile OTP, delivered over an **official WhatsApp Business API** instead of an
SMS gateway. The generation, hashing, expiry, attempt counting and rate limiting
are literally the same code — `auth/otp.ts` takes a `channel`, and only the last
step differs:

```
mobile → 6 random digits → bcrypt hash → otp_verifications { channel: 'whatsapp' }
       → auth/whatsapp.ts → Meta Cloud API | Twilio | approved BSP webhook
                            ↓
       user types it → bcrypt compare → find / link / create → session
```

**One live code per number, across channels.** The outstanding record is looked
up by number and purpose, never by channel, so asking for a WhatsApp code
invalidates an outstanding SMS one rather than running two valid codes at once
— which would double an attacker's guesses. The per-number hourly ceiling counts
both together for the same reason.

**Resends are capped per verification attempt.** The resend count is carried
forward from the live code's chain, so calling `request-otp` in a loop instead
of `resend-otp` buys nothing: both land in the same function and see the same
chain.

**Only official transports.** `auth/whatsapp.ts` implements Meta's Cloud API,
Twilio's WhatsApp channel and a generic BSP webhook. There is deliberately no
transport that drives WhatsApp Web, automates a personal account, or asks a
customer for their WhatsApp credentials — those breach WhatsApp's terms, get the
sending number banned, and are outside this module's threat model. Adding one
would mean adding a `case` that does not exist.

**Meta needs an approved AUTHENTICATION template.** Business-initiated free text
is not deliverable, so the code travels as a template variable. Templates with
and without a copy-code button are both common and the admin form asks only for
a name, so the sender includes the button component and retries without it on
Meta's error 132000 — once, and only for that complaint.

**Credentials never reach the browser.** The access token is AES-256-GCM
encrypted at rest (`auth/secretBox.ts`, keyed off `AUTH_SECRET`), decrypted only
inside the sender, and replaced by a mask (`EAAG••••••••b7Zq`) on the way back
to the admin panel. `GET /api/settings` omits the whole `authentication` block;
the panel reads it from an endpoint that knows how to redact.

**Configured from the panel, not only the environment.** Settings →
Authentication → WhatsApp holds the provider, API URL, phone number ID, business
account ID, access token, template, OTP expiry, maximum attempts, resend limit
and the enable switch. The environment supplies fallbacks; the stored settings
win where they have a value. Turning it on is not enough on its own — the method
stays off until the chosen provider's required fields are filled in, so the shop
never offers a button that cannot work.

### Google

```
/api/auth/google
   → state (random, HttpOnly cookie) + nonce + PKCE S256
   → accounts.google.com   scope: openid email profile
   → /api/auth/google/callback
       ├ state cookie must match the returned state
       ├ code exchanged server-side (the secret never leaves the server)
       ├ id_token verified against Google's JWKS — signature, iss, aud, exp, nonce
       ├ email_verified enforced
       └ find / link / create  →  session  →  redirect to /auth/callback
```

The callback does **not** put a token in the URL. It sets the refresh cookie and
redirects; the SPA then calls `/auth/refresh` for an access token. A token in a
query string ends up in browser history and in the `Referer` of the next
request.

`?next=` is honoured only when it resolves inside a configured front end, so the
callback cannot be turned into an open redirect. Both `https://evil.example/…`
and `//evil.example` are discarded.

### Linking (§8)

A verified Google email that matches an existing SOPII account **attaches to it**
rather than creating a second one. Verification is enforced for exactly this
reason — the email is being used as proof of ownership of an existing account.

A Google account already linked elsewhere is refused, or one Google login could
open two SOPII accounts.

The same holds for a verified WhatsApp number: `users.mobile` is unique, so a
number that already belongs to an account gains a `whatsapp` identity row on
*that* account rather than opening a second one. A customer who signed up with
email and password and later signs in with WhatsApp on the number already on
their profile lands in the same account, with the same orders.

Linking from inside an account uses `/whatsapp/link/request` and
`/whatsapp/link/verify`, which mint codes with the `verify_mobile` purpose. A
code issued there cannot be presented to `/whatsapp/verify-otp` to open a
session — the purpose is part of the lookup, which is the whole reason the two
purposes exist.

**SMS OTP and WhatsApp are one credential.** They are listed separately on the
security screen because that is what a person recognises, but both are the phone
number: lose it and both go. `countAuthMethods` counts the number once, so an
account whose only way in is that number cannot remove either channel and cannot
delete its way out of existence in two clicks.

---

## Roles and access control

```
customer  →  the shop
support_staff  ─┐
content_manager │
manager         ├──  the admin panel, filtered by the permission matrix
admin           │
super_admin  ───┘    (full access by definition)
```

`customer` is the only role public registration can produce. The register
handler does not read a role from the body at all, and `createUser` defaults to
`customer`, so a forgotten check downgrades to safe rather than to admin.

Two layers:

- **Coarse** — `isAdminRole()` decides whether an identity may hold an *admin*
  session. Checked when the session is created, not only when it is used: a
  customer signing in on the admin page is refused a session rather than given
  one every later request has to remember to reject.
- **Fine** — the permission matrix in the panel's editable `roles` collection,
  enforced by `requirePermission(resource, action)`.

The frontend's `RoleGuard` and `ProtectedRoute` decide what to *render*. They
are not the authorization — the API refuses the same request regardless (§30).

---

## Rate limiting and lockout

Counters live in MongoDB, not process memory. An in-memory limiter forgets
everything on restart and counts each instance separately, so "5 per hour"
quietly becomes "5 per hour per process, until the next deploy".

| Endpoint | Per identifier | Per IP |
|---|---|---|
| Password login | 5 / 15 min, then doubling lockout to 1 h | 10× that |
| OTP request | 5 / hour per number, 30 s cooldown | 10× |
| OTP verify | 5 attempts per code | — |
| Password reset | 5 / hour per email | 10× |
| Google callback | — | 20 / 15 min |
| Register | — | 10 / hour |

The per-IP limits are the ones that are easy to forget. Without them, a single
client can spray one attempt each across a thousand addresses and never trip a
per-identifier limit.

Progressive lockout means the first few failures cost nothing — people mistype
passwords — and each further failure past the threshold doubles the wait,
measured from the *most recent* failure, so continuing to hammer the endpoint
extends the wait rather than expiring it.

`/auth/forgot-password` does not return 429 even when throttled. A 429 there
would tell an attacker which addresses are worth hammering; the request is
dropped and the same sentence returned.

---

## The audit log

`auth_audit_logs` records login, logout, failed login, OTP requested/verified/
failed, password changed/reset, Google login/linked/unlinked, account locked,
session revoked, token reuse, access denied.

Two rules hold without exception:

1. **No secrets.** No password, no OTP, no token, not even truncated. `reason`
   is a category (`"invalid password"`), never a value. Emails are stored
   masked; mobiles keep their last four digits.
2. **Never blocks the request.** A logging failure must not turn a successful
   login into a 500.

Customers see their own trail on `/account/security`.

---

## API reference

All under `/api/auth`. Requests send `credentials: 'include'`.

### Public

| Method | Path | |
|---|---|---|
| `GET` | `/config` | Which methods are on, and the password policy |
| `POST` | `/register` | §3 — creates a customer, always |
| `POST` | `/login` | §2 — `{ identifier, password, surface? }` |
| `POST` | `/forgot-password` | §4 — constant answer |
| `POST` | `/reset-password` | §4 — revokes every session |
| `POST` | `/otp/request` | §5 — never returns the code |
| `POST` | `/otp/verify` | §5 |
| `GET` | `/otp/status` | Resend countdown, for a reloaded page |
| `POST` | `/whatsapp/request-otp` | `{ mobile }` — never returns the code |
| `POST` | `/whatsapp/resend-otp` | `{ mobile }` — same limits, own audit line |
| `POST` | `/whatsapp/verify-otp` | `{ mobile, otp }` — logs in, or creates a customer |
| `GET` | `/whatsapp/status` | Whether WhatsApp is configured, and its OTP terms |
| `GET` | `/google` | Starts the redirect flow |
| `GET` | `/google/callback` | Finishes it |
| `POST` | `/google` | Verifies a GIS credential |
| `GET` | `/google/status` | Whether Google is configured |

### Cookie-authenticated (CSRF header required)

| Method | Path | |
|---|---|---|
| `POST` | `/refresh` | Rotates the refresh token, mints an access token |
| `POST` | `/logout` | §15 — invalidates the session |

### Bearer-authenticated

| Method | Path | |
|---|---|---|
| `GET` | `/me` | §13 — user, role, permissions |
| `GET` | `/sessions` | §16 |
| `DELETE` | `/sessions/:id` | §16 — own sessions only |
| `POST` | `/sessions/logout-all` | §16 |
| `GET` | `/activity` | §19, scoped to the caller |
| `GET` | `/methods` | §26 — with `canRemove` per method |
| `PATCH` | `/profile` | |
| `POST` | `/password` | Change, or set a first one |
| `POST` | `/mobile/request` · `/mobile/verify` · `DELETE /mobile` | §26 |
| `POST` | `/google/link` · `DELETE /google/link` | §26 |
| `POST` | `/whatsapp/link/request` · `/whatsapp/link/verify` · `DELETE /whatsapp/link` | §26 |

WhatsApp configuration lives on the admin API rather than here, because it is
store settings and needs the `settings` permission:

| Method | Path | |
|---|---|---|
| `GET` | `/api/settings/authentication/whatsapp` | Redacted — the token is a mask |
| `PUT` | `/api/settings/authentication/whatsapp` | Encrypts the token; an omitted one is kept |
| `POST` | `/api/settings/authentication/whatsapp/test` | Sends one throwaway-code message, 5/hour |

Responses are `{ message }` on error, with `Retry-After` on a 429.

---

## Frontend

### Shop (`SOPII/`)

```
/login              password · OTP · WhatsApp · Google, switchable via ?method=
/login/otp          the SMS OTP flow on its own address
/login/whatsapp     the WhatsApp flow on its own address
/register
/forgot-password
/reset-password     ?token=…
/auth/callback      where Google returns
/account
/account/security   login methods, recent activity
/account/sessions   active devices
```

```js
const {
  user, isAuthenticated, role, permissions, ready,
  login, loginWithOTP, loginWithGoogle, register, logout,
  requestOtp, requestPasswordReset, resetPassword,
  requestWhatsAppOtp, resendWhatsAppOtp, loginWithWhatsApp,
  changePassword, updateProfile, refreshUser,
} = useAuth();
```

`ready` is the one to respect. On a cold load the session is restored
asynchronously, so for a moment a signed-in shopper looks signed out — guards
that decide during that window bounce people to `/login` on every reload.

Components: `LoginForm`, `RegisterForm`, `PasswordInput` (+ `PasswordStrength`),
`OTPInput`, `OTPVerification`, `ResendOTP` (+ `OTPExpiry`), `AuthMethodSelector`,
`WhatsAppLogin`, `WhatsAppOTPForm`, `WhatsAppVerification`, `WhatsAppMark`,
`GoogleLoginButton`, `AuthLayout`, `AuthField`, `ProtectedRoute`, `GuestRoute`,
`RoleGuard`, `SessionManager`, `LoginMethods`, `LogoutButton`. Validation is
React Hook Form + Zod (`src/lib/authSchemas.js`).

`ResendOTP` and `OTPExpiry` count down to a wall-clock deadline rather than
decrementing a counter, so a backgrounded tab does not drift and a resend that
returns the same "30 seconds" still restarts the timer. Both OTP screens use
them, which is what stops the SMS and WhatsApp flows disagreeing about what a
cooldown does.

`useWhatsAppAvailable()` and `useGoogleAvailable()` are hooks rather than logic
inside their buttons, so a page can collapse the divider alongside a method it
is not offering — a lone rule floating above a form is the tell that a button
used to be there.

### Admin (`SOPI-Admin/`)

```
/admin/login            password, Google, and OTP/WhatsApp when enabled
/admin/forgot-password
/admin/reset-password
/admin/auth/callback
/admin/*                behind RequireAuth + RequirePermission
```

The access token lives in Redux — memory only. `useSessionBootstrap()` restores
it from the refresh cookie before any guard decides anything, and refreshes on a
timer while a tab is open.

WhatsApp is configured under **Settings → Authentication → WhatsApp**
(`src/pages/settings/WhatsAppPanel.tsx`). The access-token field is left empty
on load and shows the stored mask as its placeholder: an empty field on save
means "keep what is stored", so changing the OTP expiry never requires
re-typing a credential, and a credential is never sitting in the page waiting
to be read.

---

## Configuration

Everything is in `SOPI-Admin/server/.env` — see `.env.example`, which documents
each value. Nothing is hard-coded at its use site (§18).

**The three that must change before deploying:**

```env
AUTH_SECRET=          # openssl rand -base64 48
JWT_SECRET=
MONGODB_URI=
```

WhatsApp is the one method whose live configuration is **not** only in the
environment: the values below are fallbacks, and Settings → Authentication →
WhatsApp overrides them from the database.

```env
WHATSAPP_ENABLED=false
WHATSAPP_PROVIDER=meta            # meta | twilio | webhook
WHATSAPP_API_URL=https://graph.facebook.com/v21.0
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=            # or store it from the panel, encrypted
WHATSAPP_OTP_TEMPLATE=sopii_login_otp
ADMIN_WHATSAPP_ENABLED=false      # §11 — admin sign-in over WhatsApp, off by default
```

**Nothing secret goes in a `VITE_` variable.** Every `VITE_`-prefixed value is
inlined into the JavaScript bundle that ships to the browser — it is public,
whatever file it came from. The Google client *secret*, `AUTH_SECRET`, the
database URL, the SMS key and the WhatsApp access token all stay server-side
(§30, §31). The WhatsApp token additionally never leaves the server *at all*:
the panel that configures it only ever sees a mask.

---

## Security decisions, and why

**bcrypt cost 12 for passwords, 10 for OTPs.** A password must survive an
offline campaign against a leaked database; an OTP lives five minutes behind an
attempt counter. Tuning them the same would be wrong in one direction or the
other.

**Rejection sampling for OTP digits.** `randomByte % 10` is biased toward the
low digits, and a biased OTP is a smaller search space. Bytes ≥ 250 are
discarded.

**Password verification against a dummy hash when there is no user.** Returning
early would make "no such account" measurably faster than "wrong password" — an
enumeration oracle that no amount of message-wording fixes.

**Status checked after the password, not before.** Checking first would answer
"your account is inactive" to anyone who types a known address with any
password at all.

**The role is re-read from the database on every request**, not taken from the
token. A demoted admin loses access at once rather than at their next refresh.

**A password change signs out every *other* device.** Changing a password is
what someone does when they think another person has access; leaving those
sessions alive would make the change cosmetic. The current device is kept, so
they are not thrown out of the screen they are on.

**A password reset signs out *every* device, and does not sign you in.** §4's
flow ends at "Login" for a reason: signing in whoever holds the link would undo
half the point of revoking the old sessions.

**Refresh tokens are stored as keyed digests, not bcrypt.** They must be looked
up, not compared — there is nothing to look up a bcrypt hash by. A 256-bit
random value has no entropy problem, so a keyed SHA-256 is the right primitive.

**The WhatsApp access token is encrypted at rest, not hashed.** It has to be
presented to Meta on every send, so it must be reversible — which a password or
an OTP must not be. AES-256-GCM keyed off `AUTH_SECRET` does not protect against
someone holding both the database and the environment, and nothing storing a
reversible credential could; what it buys is that a leaked backup is not a
leaked WhatsApp Business account. Rotating `AUTH_SECRET` makes the stored token
unreadable, which is the expected outcome: the admin re-enters it.

**Provider errors are reduced to status and error codes before they are logged.**
Meta's and Twilio's error bodies routinely quote the request back, and the
request contains the OTP. The admin settings screen is shown the codes — it is
the one audience entitled to them, and the one that has to fix the template.

**The last authentication method cannot be removed.** A single mis-click would
otherwise lock somebody out permanently, and no support process can undo that
without becoming an account-takeover mechanism itself.

---

## Before you deploy

- [ ] `AUTH_SECRET` and `JWT_SECRET` set to long random values
- [ ] `MONGODB_URI` points at a real database, `MEMORY_MONGO=false`
- [ ] HTTPS everywhere — `AUTH_COOKIE_SECURE` defaults on in production
- [ ] `AUTH_COOKIE_SAMESITE=none` if the SPA and API are on different sites
- [ ] `SHOP_URL` and `ADMIN_URL` set to the real origins
- [ ] `TRUST_PROXY_HOPS` matches your load balancer, or rate limits see one IP
- [ ] `OTP_PROVIDER_URL` configured, or SMS OTP login silently never delivers
- [ ] WhatsApp configured in the panel (or `WHATSAPP_*` set) if the button is on
- [ ] The WhatsApp OTP template is **approved** — an unapproved one fails at send
- [ ] `ADMIN_WHATSAPP_ENABLED` left off unless admins really should sign in by phone
- [ ] `MAILTRAP_*` configured, or password reset silently never delivers
- [ ] Google credentials set, with the production redirect URI registered
- [ ] Every seeded admin has changed their password off `SEED_PASSWORD`
- [ ] No real credentials in any committed `.env` or `.env.example`
