# Intent - user-accounts

**Status:** DRAFT, planning only. Nothing here is built. Approval record to be opened at
`qa/gates/plan-approved-user-accounts.md`.
**Authority:** mini-grill `qa/gates/whatsapp-multiuser-grill-2026-10-29.md`, binding lines Q1=1b
("hnn yhi baa lete hai user wise": build real per-user accounts with login FIRST), Q7 (email +
password, session persists until the user logs out), Q8 (open signup, admin approves later), Q9
(roles admin + member + viewer, viewer read-only), Q5 persistence line ("one login stays forever
possible until user logs out themselves"). This is a NEW feature the human asked for; it is the
first feature in the order, and `docs/features/whatsapp-multiuser/` depends on it.
**Siblings:** `spec.md` (behaviour, requirement ids UA-n), `plan.md` (build units A1..A9).

Every input the human has not stated is marked **[ASSUMPTION]**.

## 1. Problem

What exists today (cited from code):

- The KB has no user concept. Authentication is `Authorization: Bearer <api key>` resolved by an
  injected `ApiKeyStore` to `{tenantId, scopes, keyId?}` (`apps/api/src/auth.ts:11-15,49-71`). A
  key belongs to a tenant, never to a person (`schema/api_keys.schema.json`: no user field).
- The web app asks a person to paste that key once and keeps it in `localStorage`
  (`apps/web/src/auth/AuthContext.tsx`, storage key `lkbApiKey`). Anyone who holds the key is that
  person; there is no logout that revokes anything server-side, no per-person audit, no way to cut
  one person off without rotating a key others may share.
- Two partial "account" concepts exist and are NOT this feature: `apps/api/src/counsellor-accounts/`
  (profile rows bound to an API key id, `email` and `displayName`, no credential) and the hosting
  role table (`apps/api/src/hosting/types.ts`: roles `viewer|editor|admin|owner` per `keyId`). Both
  are keyed to API keys. This feature does not change or absorb them.
- No password hashing, no session store, no mail sender exist in `apps/api` (no hashing dependency
  in `apps/api/package.json`; `apps/api/src/hash.ts` is sha256 for key lookup only; the only
  outbound mail is the `gws` CLI alert transport in `packages/meeting-bot/src/autojoin/gws-channels.ts`,
  which sends as a single Google mailbox and is not a transactional sender).
- The site is served under a configurable base path (`APP_BASE_PATH`, production `/knowledgebase`
  on the shared host vidysea.com, decision 1b of 2026-10-29); the browser calls `<base>/api/*`,
  which the web container's nginx proxies to the API (`apps/web/nginx.conf`).

So: "per user" has nothing to attach to. The WhatsApp multi-user feature (and any later per-person
feature) needs a real principal with a login, a role and a revocable session.

## 2. Outcomes (what "done" looks like to Umesh)

1. A person signs up with email and password. They get **no access** until an admin approves them.
2. After approval they log in and **stay logged in until they log out themselves** (or an admin
   revokes them). Closing the browser, restarting the server or waiting weeks does not log them out.
3. Three roles: **admin** (manages users and sees everything in the tenant), **member** (normal
   read and contribute), **viewer** (read-only, enforced by the server, not only hidden in the UI).
4. An admin can see pending signups, approve or reject them with a role, change roles, disable a
   person, and revoke their sessions at once.
5. Existing API keys keep working unchanged for scripts, the meeting bot and tests.
6. The web app signs in with an account, not a pasted key, and works under the configurable base path.
7. Every sign-in, sign-out, approval, role change and lockout is in an append-only audit log.

## 3. Non-goals

- SSO, OAuth, Google sign-in, passkeys, MFA/TOTP. [ASSUMPTION] later, separate features; the
  credential layer is built so a second factor can be added without changing sessions.
- Multi-tenant self-service (creating tenants, one email in several tenants). v1: one email maps to
  exactly one user in exactly one tenant, and signup lands in the single configured tenant.
- Changing hosting roles, counsellor accounts or the API key model. Keys stay the machine identity.
- Email change, account deletion/erasure workflow, profile photos, organisation structures.
  [ASSUMPTION] account deletion is a later privacy item; disable is the v1 off-switch.
- Per-feature fine-grained permissions beyond three roles (the role to scope table is the whole model).

## 4. User types

Navigation is relative to the configurable base path (decision 1b); no absolute hrefs.

| # | Type | Who | What they do | Navigation |
|---|---|---|---|---|
| T1 | **Visitor / applicant** | Anyone with the URL | Signs up, verifies email, waits, sees "awaiting approval" if they log in early | `/signup` -> `/signup/check-email` -> `/verify?token=` -> `/login` -> `/pending` |
| T2 | **Pending user** | Signed up, not yet approved | Can log in only to see the pending screen; no data access, no API scope | `/login` -> `/pending` (log out available) |
| T3 | **Member** | Approved staff | Uses the KB (ask, search, ingest, WhatsApp link) with member scopes; manages own password and sessions | `/login` -> app home -> `/account` (password, active sessions, log out) |
| T4 | **Viewer** | Approved read-only person | Reads and asks; every write is refused server-side; sees a read-only banner | `/login` -> app home -> `/account` |
| T5 | **Admin** | Umesh and any admin he approves | Approves/rejects signups with a role, changes roles, disables people, revokes sessions, sees the audit log | `/admin/users` (pending tab default) -> `/admin/users/:id` -> `/admin/audit` |
| T6 | **Script / bot (API-key caller)** | Meeting bot, ingest scripts, live-verify | Continues to use Bearer keys; cannot manage users, cannot become a user | No UI. `Authorization: Bearer` as today |
| T7 | **Platform operator** | DevOps | Provides mail sender, cookie/proxy settings, secrets; creates the first admin with a script; has no web path to user data | `docs/DEVOPS-HANDOVER.md`, server `.env`, `scripts/create-admin.mjs` |

Persona walks needed at build time (rule for new screens): T1, T2, T3, T4, T5.

## 5. Constraints that shape everything

- Tenancy, auth and sessions are dual-check territory (two independent checkers, one adversarial
  about auth bypass, tenancy leak and privilege escalation). Every unit in `plan.md` says so.
- Production Mongo is read-only except the approved paths; this feature writes only to the KB's own
  application database through `@lkb/db` scoped accessors, and proofs run on the work DB.
- The browser is served from the shared origin vidysea.com. An httpOnly cookie is strictly better
  than today's script-readable key in `localStorage`, but script from other pages of the same origin
  can still make same-origin calls. This is the same exposure as today, recorded as an accepted
  residual risk (spec UA-26), not solved here (decision 1b stands).
- No secret value is read or stored in the repo; the CSRF secret, mail credentials and cookie
  settings are human-provided server env (see `plan.md` human items).

## Open questions

Moved to `plan.md` "Open questions" (two: the mail sender and signup domain restriction, each with
options and a recommendation). None blocks A1-A4; the first blocks only A5 (mail).
