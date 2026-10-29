# Spec - user-accounts

**Status:** DRAFT. Nothing is built. Every unstated input is **[ASSUMPTION]**. Requirement ids
(UA-n) are what `plan.md` acceptance criteria cite. Binding inputs: the Answered lines of
`qa/gates/whatsapp-multiuser-grill-2026-10-29.md` (Q1b, Q7, Q8, Q9, Q5 persistence).

## 0. What exists and is reused (do not rebuild)

| Piece | Where | Reused as |
|---|---|---|
| API-key auth middleware, `VerifiedKey`, `requireScope` (exact match) | `apps/api/src/auth.ts` | Extended in place: a second principal source (session) feeds the same `req.auth`. Bearer path unchanged. |
| Per-tenant scoped data access, tenant id validation | `@lkb/db` `scopedCollection`, `assertValidTenantId`; `isValidTenantId` in `auth.ts:42` | Every new collection. |
| Rate limiter (express-rate-limit 8.6.2, `ipKeyGenerator`) | `apps/api/src/rate-limit.ts` | New limiter instances on auth routes (the existing one keys on tenant, so it is not reused as is). |
| Strict-body pattern (`hostingObject`, `hostingFields`) | `apps/api/src/hosting/types.ts` | Pattern to copy for strict bodies. Not imported (different domain). |
| Runtime base path in web and nginx | `apps/web/src/config/runtime.ts`, `apps/web/nginx.conf`, `.env.example` `APP_BASE_PATH` | Cookie path and every web href. |
| Scope catalogue and the test that every `requireScope` literal is listed | `scripts/lib/mint-scopes.mjs` (`ALL_SCOPES`, `mint-scopes.test.mjs`) | New scopes are added there so keys can be minted with them. |
| Append-only decision log, migration lint | `scripts/append_decision.ps1`, `scripts/lint-migrations.mjs` | Process. |
| Web auth state + 401 invalidation event | `apps/web/src/auth/AuthContext.tsx`, `apps/web/src/api/client.ts` (`AUTH_INVALIDATED_EVENT`) | Reworked in place for sessions (A7); the stale-401 guard pattern is kept. |

Not present and therefore new: password hashing, session store, mail sender, user collections.

## 1. Concepts

- **User**: a person, `{userId, tenantId, email, passwordHash, status, role, ...}`. Belongs to
  exactly one tenant. Distinct from API keys and from counsellor accounts.
- **Status**: `unverified` (signed up, email not confirmed) -> `pending` (email confirmed, awaiting
  admin) -> `active` | `rejected`; `active` <-> `disabled`. Only `active` has any access.
- **Role**: `admin | member | viewer`, set by an admin at approval. Roles map to scopes (UA-9).
- **Session**: a server-side record behind an opaque token held in an httpOnly cookie. Revocable.
- **Principal**: what `req.auth` holds after authentication. Two kinds: `key` (today) and
  `session` (new). Handlers that only read `tenantId`/`scopes` work unchanged for both.

## 2. Signup, verification, approval (UA-1 .. UA-8)

- **UA-1 Signup (open, Q8).** `POST /auth/signup {email, password, displayName}`. Anyone may call
  it. Tenant comes from server configuration `USER_SIGNUP_TENANT`, never from the body; unset means
  signup answers 503 `signup_not_configured`. Strict body, unknown fields rejected. Creates a user
  `unverified`, role `null`. The response is identical whether or not the email already exists
  (no enumeration); an existing email gets an "you already have an account" mail instead of an error.
- **UA-2 Email normalisation.** `trim`, Unicode NFKC, lowercase, max 254 chars, exactly one `@`, no
  control characters. Uniqueness is on the normalised value, enforced by a unique index (an index,
  not an application check). One email = one user = one tenant (v1).
- **UA-3 Password policy.** 12..128 characters, any characters allowed (spaces, Unicode), no
  composition rules, rejected if it contains the email local part or is in a bundled deny list of
  common passwords [ASSUMPTION: top 10,000 list as a checked-in data file]. Never logged, never
  echoed, never stored except as a hash (UA-10).
- **UA-4 Email verification.** A single-use 256-bit random token mailed to the address, stored only
  as sha256, valid 24 h. `POST /auth/verify-email {token}` moves `unverified -> pending`. Tokens are
  bound to `(userId, purpose)`; a reset token cannot verify and vice versa. Unverified accounts
  older than 7 days are purged by a sweep and are never shown in the admin queue, so signup spam
  cannot fill the approval queue.
- **UA-5 Approval gate (Q8).** A `pending` user has **no access**: login may succeed only to reach a
  "waiting for approval" state (UA-12); the session carries zero scopes and every route except
  `/auth/*` answers 403 `account_not_active`. An `admin` approves via
  `POST /admin/users/:id/approve {role}` (role required, no default) or rejects via `/reject
  {reason?}`; both write audit events. Rejection is final until an admin re-opens it.
- **UA-6 Approver rules.** Only an `active` `admin` of the same tenant may approve, reject, change
  role, disable, enable or revoke sessions. An admin cannot change their own role or disable
  themselves. **Last-admin guard:** the last `active` admin cannot be demoted, disabled or have
  their sessions revoked by any path; the API refuses with 409 `last_admin`. A second admin is made
  only by an existing admin approving/promoting another user (audited) or by the bootstrap script.
- **UA-7 First admin bootstrap.** There is no web path to the first admin. The operator runs
  `scripts/create-admin.mjs --tenant toc --email ...` on the host (modelled on
  `scripts/mint-key.mjs`: work or staging DB by default, production only with the same explicit
  opt-in flags). The script reads the password from stdin (never argv, never logged), creates the
  user `active`, role `admin`, email verified, and writes an audit event with actor
  `bootstrap-script`.
- **UA-8 Admin notification.** A new `pending` user raises a badge in the admin web screen (count
  from the queue). Email to admins is optional [ASSUMPTION: off in v1; depends on the mail sender,
  Q-A].

## 3. Roles and scopes (UA-9)

- **UA-9 Role to scope table.** The server derives a session's scopes from its role at every
  request (never copied into the session record, so a role change applies at once). Draft table
  [ASSUMPTION; Umesh approves it in `docs/user-accounts/roles.md` before A3 merges]:

  | Role | Scopes (existing names from `mint-scopes.mjs`, plus new ones marked new) |
  |---|---|
  | `viewer` | `ask`, `search`, `citations`, `sessions`, `graph`, `gaps`, `calendar`, `sources` |
  | `member` | viewer + `ingest`, `whatsapp`, `whatsapp-link` (new) |
  | `admin` | member + `user-admin` (new), `whatsapp-admin` (new), `join-rules`, `registration:approve`, `answer-policy:read`, `answer-policy:write` |

  No role ever receives `hosting`, `keys`, `jobs`, `operations:write`, `automation:*`, `send-now`,
  `webhooks`, `gmail`: those stay API-key (operator) scopes. New scope names are added to
  `scripts/lib/mint-scopes.mjs` `EXTRA_SCOPES` in one unit (A3 defines `user-admin`,
  `whatsapp-link`, `whatsapp-admin` together so no later unit edits that file).
- **UA-9a Viewer is read-only by construction.** A session principal with role `viewer` is refused
  (403 `read_only_role`) on any method other than GET/HEAD/OPTIONS, except an explicit allowlist of
  read-like POSTs (`POST /ask`, and `POST /search` if it exists) kept in one file. A generated test
  enumerates every mounted route and asserts: for a viewer session each non-GET route is on the
  allowlist or answers 403. A route added later fails that test until it is classified.
- **UA-9b Non-active principals.** `pending`, `rejected`, `disabled` resolve to scopes `[]` and a
  flag that the guard turns into 403 `account_not_active`.

## 4. Credentials (UA-10 .. UA-11)

- **UA-10 Hashing.** argon2id, OWASP parameters (m=19 MiB, t=2, p=1, or stronger as the host
  allows), per-user random salt, PHC string format so parameters travel with the hash and can be
  raised later (rehash on a successful login when parameters are older). Dependency check today
  (`apps/api/package.json`): no hashing dependency; the archiver uses `bcryptjs` but is a different
  repo and not importable. **[ASSUMPTION]** add one exactly-pinned dependency `@node-rs/argon2`
  (prebuilt binaries, no compile step); it needs a human dependency approval and a check that the
  API image base supports its binary. **Fallback if refused or incompatible:** `node:crypto`
  `scrypt` (zero new dependency; N=2^17, r=8, p=1, same PHC-style string). bcrypt is rejected
  (72-byte input truncation, weaker memory hardness). The module exposes only `hash`, `verify`,
  `needsRehash`.
- **UA-11 Timing and enumeration.** Login for an unknown email still runs a full verify against a
  fixed dummy hash, so unknown and wrong-password cost the same. All failure responses share one
  status, body and shape (`401 invalid_credentials`) until the password has verified.

## 5. Login, session, logout (UA-12 .. UA-20)

- **UA-12 Login.** `POST /auth/login {email, password}`. On success for an `active` user: create a
  session (UA-13), `Set-Cookie`, return `{user:{id,displayName,role}, csrfToken}`. For a correct
  password on a non-active account: `200 {state:"pending"|"rejected"|"disabled"}`; only `pending`
  receives a session (zero scopes, so it can reach the pending screen and log out); `rejected` and
  `disabled` get none. Status is revealed only after the password verified, so it is not an
  enumeration oracle.
- **UA-13 Session shape (long-lived, rotating, revocable; Q7 + persistence).** Server-side
  collection `user_sessions`: `_id`, `tenantId`, `userId`, `familyId`, `tokenHash` (sha256 of a
  256-bit random token; the token exists only in the cookie), `previousTokenHash` +
  `previousValidUntil` (rotation grace), `createdAt`, `lastUsedAt`, `rotatedAt`, `ipPrefix`
  (truncated /24 or /48, not the full address), `userAgentSummary` (browser family + OS, no raw
  string), `revokedAt`, `revokedReason` (`logout|admin|password_change|password_reset|disabled|
  reuse_detected`). **No absolute expiry.** Idle expiry: 365 days since `lastUsedAt` [ASSUMPTION;
  browsers cap cookie lifetime at 400 days, so a larger value is meaningless]. Because the cookie
  is re-issued on rotation, an active person is effectively never logged out; this is the literal
  meaning of "stays until the user logs out themselves", the only bound being one year of total
  inactivity. Revoked and expired rows are purged 30 days after the event (TTL index on a `purgeAt`
  field set at revoke or expiry); active rows have no TTL.
- **UA-14 Rotation.** On an authenticated request where `rotatedAt` is older than 24 h
  [ASSUMPTION], the server issues a new token, moves the old hash to `previousTokenHash` valid for
  30 s (parallel tabs and in-flight requests do not log the person out) and sets a fresh cookie.
  Presenting a token that matches neither the current nor an in-grace previous hash but is
  recognisable as an earlier token of a known family counts as **reuse**: the whole family is
  revoked (`reuse_detected`) and an audit event is written. Rotation is a compare-and-swap on the
  session row so two simultaneous requests cannot fork a family. [ASSUMPTION] to recognise earlier
  tokens, the session keeps a short list (last 5) of retired token hashes with `familyId`.
- **UA-15 Cookie.** Name `__Secure-lkb_sid` (the prefix forces `Secure`); `HttpOnly`; `Secure`;
  `SameSite=Strict`; `Path=<APP_BASE_PATH>/api` (so it is never sent with static assets or to other
  applications on vidysea.com; a root deployment uses `/api`); no `Domain` attribute (host-only);
  `Max-Age` 400 days, refreshed on rotation. `Secure` is never turned off in production; local
  development over `http://localhost` uses the unprefixed name `lkb_sid` and omits `Secure` only
  when `NODE_ENV !== "production"` and the request is loopback. The cookie is parsed by a small
  strict in-repo function (one name, length-capped) [ASSUMPTION: no new `cookie-parser` dependency
  in `apps/api`].
- **UA-16 CSRF.** The cookie principal is subject to three checks on every method other than
  GET/HEAD/OPTIONS: (a) the `Origin` header is present and equals an allowed origin
  (`APP_PUBLIC_ORIGIN`, same list as CORS); (b) `X-LKB-CSRF` equals the session's CSRF token (HMAC
  of the session id with the server secret `AUTH_CSRF_SECRET`, delivered in the login and
  `GET /auth/session` bodies and held in page memory, never in a cookie or storage); (c)
  `SameSite=Strict` as defense in depth. A Bearer-key request skips CSRF (no ambient credential).
  Failure is 403 `csrf`. State changes never use GET.
- **UA-17 Precedence.** If an `Authorization: Bearer` header is present it alone is used and any
  cookie is ignored; otherwise the cookie is used; neither is 401. A request is never authenticated
  as two principals. A Bearer key never acts as a user (no `userId`); a session never carries `keyId`.
- **UA-18 Logout.** `POST /auth/logout` revokes the current session row and clears the cookie (same
  path). `POST /auth/logout-all` revokes every session of the user. Logout is the only user action
  that ends a session. **Logging out of the KB never unlinks WhatsApp** (that is the WhatsApp
  feature's rule 6a).
- **UA-19 Admin and system revocation.** Admin disable, password change, password reset and admin
  "revoke sessions" each set `revokedAt` on the affected sessions at once; the next request from
  those cookies is 401 `session_revoked`. Sessions are validated against the store on every request
  (an in-process cache is allowed only with a TTL of at most 5 s [ASSUMPTION]), so revocation takes
  effect within that bound.
- **UA-20 Account page.** `GET /auth/sessions` lists the person's own sessions (coarse device, last
  used, ip prefix, which is current) and `DELETE /auth/sessions/:id` revokes one. A session id of
  another user never resolves (404).

## 6. Reset, change, throttling (UA-21 .. UA-25)

- **UA-21 Password reset.** `POST /auth/password/forgot {email}` always answers 202 with the same
  body; if a user exists, a single-use 256-bit token (sha256 stored, 1 h) is mailed.
  `POST /auth/password/reset {token, newPassword}` sets the new hash, marks the token used,
  **revokes all the user's sessions** and writes an audit event. Allowed for `pending` users;
  refused (same generic 400 `invalid_token`) for `rejected` and `disabled`.
- **UA-22 Password change.** `POST /auth/password/change {currentPassword, newPassword}` requires an
  active session and the current password; revokes all *other* sessions of the user.
- **UA-23 Rate limiting.** Per IP (express-rate-limit, `ipKeyGenerator` for IPv6): login 20 per
  15 min, signup 5 per hour, forgot-password 5 per hour, verify/reset token attempts 20 per hour;
  plus per-email limits on the mail-sending routes (3 mails per hour per address) so one address
  cannot be mail-bombed from many IPs. A global daily signup cap (default 200 [ASSUMPTION]) answers
  429 `signup_capacity`. The API must know the real client IP: Express `trust proxy` is **not set
  today** (no occurrence in `apps/api/src`), so the unit sets it from `TRUST_PROXY_HOPS`
  (human-provided; the chain is front proxy -> web nginx -> API, [ASSUMPTION] 2). A wrong hop count
  would let a caller spoof their IP, so a startup log line prints the effective setting and the
  unit tests spoofed `X-Forwarded-For`. The in-process store is acceptable for one API instance
  [ASSUMPTION: single instance]; with more than one, limits need a shared store (a named risk in
  `plan.md`, not built).
- **UA-24 Lockout.** Failed logins are counted per normalised email in `auth_throttles` (a row is
  kept even for emails with no account, so lockout does not reveal existence). 5 failures in 15 min
  lock that email for 15 min; each further lock doubles, up to 24 h; a success or an admin unlock
  clears it. Existing sessions are unaffected by a lock. The DoS trade-off (anyone can lock an
  address for a while) is accepted and noted; a lock never shows itself to an unauthenticated
  caller (same 401 body, no `Retry-After`).
- **UA-25 Audit log.** Append-only `auth_events`: `at`, `tenantId`, `type` (`signup`,
  `email_verified`, `login_ok`, `login_failed`, `locked`, `logout`, `session_revoked`,
  `reuse_detected`, `approved`, `rejected`, `role_changed`, `disabled`, `enabled`,
  `password_changed`, `password_reset`, `admin_bootstrap`), `actorUserId`, `targetUserId`,
  `ipPrefix`, `userAgentSummary`, `outcome`, `detail` (closed vocabulary). Never a password, token,
  cookie, free text from the client, or the raw email of an unknown account (a salted hash is
  stored instead). Insert and read helpers only; no update or delete helper exists. Read via
  `GET /admin/audit` (`user-admin`), tenant-scoped, cursor-paged. Retention [ASSUMPTION]: 2 years.

## 7. Tenancy and API keys (UA-26 .. UA-30)

- **UA-26 Accepted residual risk.** Because the app shares the origin vidysea.com, script from
  another page of that origin could issue same-origin API calls with the person's cookie (SameSite
  does not stop same-origin). Today it could read the pasted key from `localStorage`; the cookie is
  strictly better (httpOnly, not exfiltrable). Recorded as accepted. A dedicated subdomain (the
  option 1a of go-live batch 4, not chosen) would remove it and is not blocked by this design
  (cookie `Path` and the origin list are configuration).
- **UA-27 Tenant isolation.** Every user, session, token, throttle and event row carries
  `tenantId`; reads go through `scopedCollection`; an admin of tenant A resolves tenant B's user ids
  to 404 (not 403). The tenant on a session principal comes from the user row, never from a header
  or body. Session lookup by `tokenHash` still checks that the user's tenant equals the row's.
- **UA-28 API keys are untouched.** `ApiKeyStore.verify` and the Bearer path keep their behaviour
  and tests. Keys remain the identity for scripts, the bot, `live-verify` and hosting. A key cannot
  call any `/auth/*` mutation and cannot approve, reject, change roles or revoke sessions. A key
  holding `user-admin` may read users and the audit [ASSUMPTION: useful for operations; drop it in
  A6 if not wanted]; it can never mint a session or act as a user.
- **UA-29 Per-user attribution.** Handlers that record an actor use `actorId(req.auth)` =
  `user:<userId>` for sessions and the existing key fingerprint for keys. This feature supplies the
  helper; the WhatsApp review router adopts it in its own unit.
- **UA-30 Web moves from key to session.** The login page replaces the paste-a-key gate. A "Use an
  API key (advanced)" link keeps the old gate for operators for one release [ASSUMPTION], then is
  removed by a later DECISIONS-backed change. The web client sends cookies same-origin
  (`credentials: "same-origin"`), attaches `X-LKB-CSRF` on unsafe methods, keeps the CSRF token in
  memory only, treats 401 `session_revoked` as "signed out" (clears state, shows login), and never
  stores a session token (it cannot read one).

## 8. Failure modes (what the system does, so no case is guesswork)

| Case | Behaviour |
|---|---|
| Mail sender not configured | Signup/forgot still answer the generic success; the `Mailer` writes to a dev outbox (non-production) or, in production, the admin queue shows the user as `unverified (mail not sent)` and an admin can issue a one-time link from the admin page. Never a silent drop (Q-A). |
| Two tabs rotate at once | CAS on the session row; the loser re-reads and keeps working inside the 30 s grace. |
| Stolen cookie used after the real user rotated | Reuse detection revokes the family; both parties are logged out; audit event. |
| Server restart | Sessions are in Mongo; nothing is lost; cookies keep working. |
| Admin disables a user mid-session | Next request 401 `session_revoked` (within the cache TTL). |
| Last admin tries to demote or disable themself | 409 `last_admin`. |
| Clock skew on token expiry | API host clock only; all expiries are computed and compared there. |
| Mongo down | 503 `auth_unavailable` on session validation; never "treat as logged in". |
| Wrong `TRUST_PROXY_HOPS` | Startup warning; limits may key on the proxy IP (too tight) or be spoofable; unit tests pin the configured value. |
| Cookie blocked by browser | The login page calls `GET /auth/session` right after login; a 401 shows "cookies are required"; no fallback to a token in JS. |
| Base path changes | The cookie `Path` is derived from `APP_BASE_PATH` at start; the old cookie becomes unreachable, so people log in once. Documented in ops notes. |
| Viewer hits a write route | 403 `read_only_role`; the handler does not run. |
| Pending user calls a data route | 403 `account_not_active`. |
| Email already registered | Same signup response; the owner gets an "already registered" mail. |

## 9. Surfaces

- API (under `/auth` and `/admin`, strict bodies, tenant from the principal):
  `POST /auth/signup`, `/auth/verify-email`, `/auth/login`, `/auth/logout`, `/auth/logout-all`,
  `GET /auth/session`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`,
  `POST /auth/password/forgot|reset|change`; `GET /admin/users?status=`, `GET /admin/users/:id`,
  `POST /admin/users/:id/{approve,reject,role,disable,enable,revoke-sessions,unlock,issue-link}`,
  `GET /admin/audit`.
- Web: `/login`, `/signup`, `/signup/check-email`, `/verify`, `/forgot`, `/reset`, `/pending`,
  `/account`, `/admin/users`, `/admin/users/:id`, `/admin/audit` (all relative to the base path).
- Script: `scripts/create-admin.mjs`.
- Collections (schemas in `schema/`, unit A1): `users`, `user_sessions`, `user_tokens`,
  `auth_throttles`, `auth_events`.
