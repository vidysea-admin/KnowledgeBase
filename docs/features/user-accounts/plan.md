# Plan - user-accounts

**Status:** DRAFT, awaiting plan approval at `qa/gates/plan-approved-user-accounts.md`. No unit
below is buildable before that.
**Derived from:** `spec.md` (requirement ids UA-n) and the Answered lines of
`qa/gates/whatsapp-multiuser-grill-2026-10-29.md`.
**Backlog tier:** roadmap feature work (CLAUDE.md "Backlog priority override", tier 3). It is the
**first** feature in the order: `docs/features/whatsapp-multiuser/plan.md` starts after A4 and A6
close (the WhatsApp schema unit W1 and the cross-repo archiver unit W2 may run in parallel because
they touch no auth code).
Every unstated input is **[ASSUMPTION]**.

## Conventions

- **Tier**: `H` = high (auth, sessions, tenancy, consent, data write), `M` = medium, `L` = low.
- **Dual check: required** (two independent checkers, at least one adversarial about auth bypass,
  privilege escalation and cross-tenant reads) for every unit that touches auth, sessions, tenancy,
  consent or data writes. In this feature that is every unit except A8 (docs only). Each unit below carries a **Dual-trigger**
  line naming the reason. Adversarial hunt output is **filed**, not auto-promoted into another round,
  except security-class findings, which are never capped (D-014).
- **Edit in place.** Every named file is edited where it exists. Files marked **NEW** do not exist;
  approving this plan is permission for exactly those files and no others.
- **Mutation runs** by checkers follow the per-mutation trap and HEAD-fidelity rules in CLAUDE.md
  (D-020 and its 2026-09-28 amendment); prefer `scripts/lib/mutate.mjs`.
- **Real-Mongo proofs.** Unique indexes, CAS rotation and TTL behaviour cannot be shown with fakes.
  Units that depend on them state a real-Mongo run (work DB only, never production) in acceptance.
- **Fresh checker for the live proof** (A9) never receives the maker's reasoning.
- **Dependencies.** The only new dependency proposed is `@node-rs/argon2` (spec UA-10), exact-pinned;
  it is a human item (H-4). Fallback `node:crypto` scrypt needs none.

## Units

File ownership is exclusive per wave; two units never edit one file in the same wave.

| # | Unit | Files (edit in place; **NEW** marked) | Req | Tier | Dual | Depends |
|---|---|---|---|---|---|---|
| A1 | `ua-schema` | **NEW** `schema/users.schema.json`, `schema/user_sessions.schema.json`, `schema/user_tokens.schema.json`, `schema/auth_throttles.schema.json`, `schema/auth_events.schema.json`; **NEW** `packages/db/src/collections/{users,user-sessions,user-tokens,auth-throttles,auth-events}.ts` (+ tests); `packages/db/src/collections/index` export lines; **NEW** migration (name per `scripts/lint-migrations.mjs`) creating collections and indexes (unique normalised email, unique `tokenHash`, TTL `purgeAt`, TTL on tokens and throttles) | UA-2, UA-13, UA-25, UA-27 | H | yes | none |
| A2 | `ua-credentials` | **NEW** `apps/api/src/user-accounts/{password,password-policy,tokens,email}.ts` + tests; **NEW** `apps/api/src/user-accounts/common-passwords.txt` (data); `apps/api/package.json` + lockfile only if H-4 approves argon2 | UA-2, UA-3, UA-10, UA-11 | H | yes | none |
| A3 | `ua-session-core` | `apps/api/src/auth.ts` (second principal source, precedence, `actorId`, non-active flag); **NEW** `apps/api/src/user-accounts/{sessions,principal,csrf,cookie,roles,viewer-guard}.ts` + tests; **NEW** `apps/api/src/composition/integrations/user-accounts.ts` (mounts two placeholder routers that A4 and A6 fill); `apps/api/src/server.ts` (trust proxy, one mount line); `scripts/lib/mint-scopes.mjs` + its test (adds `user-admin`, `whatsapp-link`, `whatsapp-admin`); **NEW** `docs/user-accounts/roles.md` (approved role table) | UA-9, UA-9a, UA-9b, UA-13..UA-19, UA-23 (trust proxy), UA-27, UA-28, UA-29 | H | yes | A1, A2 |
| A4 | `ua-auth-api` | **NEW** `apps/api/src/user-accounts/auth-router.ts`, `apps/api/src/user-accounts/auth-service.ts`, `apps/api/src/user-accounts/throttle.ts`, `apps/api/src/user-accounts/mailer.ts` (port + dev outbox only) + tests | UA-1, UA-4, UA-5, UA-11, UA-12, UA-18, UA-20..UA-25 | H | yes | A3 |
| A5 | `ua-mailer` | **NEW** `apps/api/src/user-accounts/mailer-<provider>.ts` + `docs/user-accounts/mail.md` + `.env.example` lines + `docker-compose.yml` env forwards. Provider is the answer to Q-A; the unit is not buildable until Umesh answers Q-A and provides credentials (H-1) | UA-4, UA-8, UA-21 (delivery) | M | yes (token and template handling) | A4, Q-A, H-1 |
| A6 | `ua-admin-api` | **NEW** `apps/api/src/user-accounts/admin-router.ts`, `apps/api/src/user-accounts/admin-service.ts` + tests; **NEW** `scripts/create-admin.mjs` (+ test); `scripts/lib/` helper only if needed | UA-5..UA-8, UA-19, UA-25, UA-28 | H | yes | A3 |
| A7 | `ua-web` | `apps/web/src/auth/AuthContext.tsx` (+ its tests), `apps/web/src/api/client.ts` (+ test), `apps/web/src/App.tsx` (routes and gate), **NEW** `apps/web/src/pages/user-accounts/{LoginPage,SignupPage,CheckEmailPage,VerifyPage,ForgotPage,ResetPage,PendingPage,AccountPage,UsersAdminPage,UserDetailPage,AuditPage}.tsx` + tests; **NEW** `apps/web/src/api/user-accounts.ts` | UA-12, UA-16, UA-18, UA-20, UA-30 | H | yes (client side of CSRF and session invalidation) | A4, A6 |
| A8 | `ua-deploy-cookie-proxy` | Docs only by the maker: `docs/DEVOPS-HANDOVER.md` section, `docs/user-accounts/ops.md` (env table, base-path cookie note, proxy chain, rollback), `.env.example` lines (`USER_SIGNUP_TENANT`, `AUTH_CSRF_SECRET` name only, `TRUST_PROXY_HOPS`, `APP_PUBLIC_ORIGIN`); `docker-compose.yml` env forwards (enforcement path: needs `Approved-by`). Host work is human | UA-15, UA-23, UA-26 | M | no (docs; the cookie behaviour is proven in A3 and A9) | A3 |
| A9 | `ua-live-proof` | No code. Supervised run with a real browser against the work/staging stack, evidence pasted; a fresh checker runs it | outcomes 1..7 | H | independent fresh checker, not the maker | A5 or Q-A fallback, A7, A8 |

### Per-unit acceptance

**A1 ua-schema.** Dual-trigger: new tenant-scoped auth data model.
1. Each schema validates a sample for every `status` and rejects: missing `tenantId`, unknown
   fields, role outside `admin|member|viewer`, `active` without a role, a session without
   `familyId`.
2. Real-Mongo test: the unique index rejects a second user with the same normalised email even
   with different case, Unicode composition and surrounding spaces, and in a different tenant (UA-2);
   `tokenHash` is unique.
3. `scopedCollection` accessors reject a missing/invalid tenant; a cross-tenant `findOne` by id
   returns null for every new collection.
4. `auth_events` exposes insert and read only; a test asserts no update/delete helper exists.
5. TTL: a revoked session with `purgeAt` in the past is removed by Mongo; an active one (no
   `purgeAt`) is never removed (real-Mongo, using short TTL in the test config).
6. Migration applies and re-applies idempotently on the work DB and passes `lint-migrations`.

**A2 ua-credentials.** Dual-trigger: password storage and token secrecy.
1. `hash` then `verify` round-trips; a wrong password, empty string and 129-char string fail;
   `needsRehash` is true for a weaker parameter string and false for the current one.
2. Stored value is PHC-formatted, salted (two hashes of one password differ), contains no password.
3. Email normaliser: table-driven tests for case, NFKC (`ＡＢ@x` forms), whitespace, control chars,
   two `@`, over-length; idempotent.
4. Policy: rejects < 12, > 128, deny-list hits, local-part containment; accepts passphrases with
   spaces and non-ASCII.
5. Token generator yields 256 random bits, returns the raw value once, and stores/compares only
   sha256 with `timingSafeEqual`.
6. If argon2 is used: dependency exactly pinned, import works in the API container image base
   (checked by building the image or by a documented `node -e` probe); otherwise the scrypt fallback
   passes the same tests. Dependency decision recorded (H-4).

**A3 ua-session-core.** Dual-trigger: authentication, sessions, tenancy, authorization.
1. Principal resolution matrix (table-driven): Bearer only, cookie only, both (Bearer wins,
   cookie ignored), neither (401), revoked session (401 `session_revoked`), idle-expired (401),
   `pending` (scopes `[]` + 403 `account_not_active`), `disabled` (401), cross-tenant row mismatch (401).
2. Existing auth tests (`requireAuth`, `requireScope`, key store) pass **unmodified** (UA-28).
3. Cookie: exact attributes asserted on the `Set-Cookie` string (name `__Secure-lkb_sid`,
   HttpOnly, Secure, SameSite=Strict, `Path` = `<APP_BASE_PATH>/api`, no Domain, Max-Age 400 d),
   for base path `/knowledgebase`, `/`, and a path with a trailing slash.
4. Rotation: real-Mongo test, two parallel requests with the same cookie after 24 h both succeed
   (grace) and the family is not forked; a replay of the retired token after the grace revokes the
   family and writes an audit event (UA-14).
5. CSRF: unsafe method with cookie and no/wrong `X-LKB-CSRF`, or wrong/missing `Origin`, is 403
   `csrf`; with a Bearer key, CSRF is not demanded; GET never needs it.
6. Viewer guard: generated route-enumeration test (UA-9a) passes; adding a throwaway POST route in
   the test fails the build until classified (proves the test bites).
7. Role to scope: changing a user's role changes the very next request's scopes; no role holds
   `hosting`, `keys`, `jobs`, `operations:write`, `automation:*`, `send-now`, `webhooks`, `gmail`
   (asserted against `ALL_SCOPES`); `mint-scopes.test.mjs` passes with the three new names.
8. Trust proxy: spoofed `X-Forwarded-For` beyond the configured hop count does not change the
   limiter key (test with 0, 1 and 2 hops).
9. Adversarial brief (checker): forge a cookie, replay across tenants, use a session id as a token,
   swap tenant header/body, downgrade `Secure`, send both credentials; none escalates.

**A4 ua-auth-api.** Dual-trigger: login, signup, reset, lockout (credential handling).
1. Signup: identical response for new and existing email (byte-equal body, same status; timing
   within a tolerance check is recorded, not asserted tight); unknown field -> 400; tenant in body
   ignored; `USER_SIGNUP_TENANT` unset -> 503 `signup_not_configured`.
2. Verify: valid token moves `unverified -> pending` once; reuse, expired, wrong-purpose token all
   give the same 400 `invalid_token`; unverified > 7 d swept and never listed.
3. Login: unknown email and wrong password give the same 401 body/shape and both run a full hash
   verify (spy asserts the verify call); `pending` correct password -> session with `[]` scopes and
   every data route 403; `rejected`/`disabled` -> no cookie.
4. Lockout (real clock faked): 5 failures lock the email for 15 min including for a never-registered
   email; the doubling schedule; success and admin unlock clear it; lock does not alter the 401 body.
5. Reset: always 202; token single-use; reset revokes all sessions (a pre-existing session gets 401
   on its next request); `rejected`/`disabled` reset refused generically.
6. Change password: wrong current password refused; success revokes other sessions only.
7. Logout and logout-all revoke the right rows and clear the cookie on the exact path.
8. Rate limits per route and per email respond 429 with the standard body; the global signup cap.
9. Every transition writes exactly one `auth_events` row with a closed-vocabulary `detail`; a test
   greps all rows for password, token and cookie substrings after a full scenario and finds none.
10. No route in this unit is reachable with a Bearer key except where UA-28 allows (asserted).

**A5 ua-mailer.** Dual-trigger: carries single-use credential tokens.
1. `Mailer` implementation sends verify, reset, "already registered" and (optional) admin-notify
   mails from templates; links are built from `APP_PUBLIC_ORIGIN` + base path, never from a request
   `Host`/`X-Forwarded-Host` (host-header injection test).
2. Header injection: an email address or display name containing CR/LF is refused before any send.
3. Failure to send never reveals itself to the requester (generic response) and is logged as a
   closed code; the admin page shows "mail not sent" (UA failure table).
4. Credentials come from env only; none appears in logs (test with a canary value).
5. If Q-A resolves to "no email in v1", this unit is replaced by `issue-link` in A6 and A5 is
   closed as not-applicable by the plan owner, not silently skipped.

**A6 ua-admin-api.** Dual-trigger: privilege assignment, tenancy.
1. Only an `active` `admin` session reaches any `/admin/*` mutation; member, viewer, pending, a
   Bearer key without `user-admin`, and a key with `user-admin` (mutations) are all refused.
2. Approve requires a role; reject/approve/role/disable/enable/revoke/unlock each write one event
   with actor and target; an admin of tenant B receives 404 for tenant A user ids (list and detail).
3. Last-admin guard: demote, disable and revoke-all by/for the sole admin -> 409; with two admins it
   succeeds for one; concurrent demotion of both admins (real-Mongo race) leaves exactly one admin.
4. An admin cannot change their own role or disable themself.
5. Disable/revoke takes effect on the target's next request (401) in the same test run.
6. `scripts/create-admin.mjs`: refuses without work/staging DB or the production opt-in; password
   only via stdin; idempotent for the same email (no second user); output never prints the password.
7. Adversarial brief: mass-assignment (extra body fields like `role`, `status`, `tenantId` on
   self-service routes), id guessing, role escalation by editing own record, replaying an approve
   with a swapped tenant.

**A7 ua-web.** Dual-trigger: client-side session handling and CSRF.
1. Persona walks T1..T5 in a real browser against the work stack: signup -> check-email -> verify ->
   pending -> admin approves (role chosen) -> member logs in -> uses the app -> closes the browser
   and reopens (still logged in) -> logs out -> API call returns 401. Each step asserted by state
   change, not by render; console error count 0 per page.
2. A viewer sees a read-only banner and write controls absent, and a forced write via devtools
   fetch is still 403 (server proof, not UI).
3. Under a non-root base path every link, redirect and the cookie `Path` work; the guard
   `noRootAbsoluteHrefs.test.ts` still passes.
4. `localStorage` holds no session token or CSRF token after login (test reads storage); CSRF token
   exists only in memory; a page reload re-fetches it from `GET /auth/session`.
5. 401 `session_revoked` from any call returns the user to the login page without a loop; the stale
   401 guard from `client.ts` is kept (an old in-flight request cannot log out a new login).
6. The "Use an API key (advanced)" path still works for an operator (existing LoginGate tests pass).
7. Failure states render: cookies blocked, 429, 503 `signup_not_configured`, locked account (generic).

**A8 ua-deploy-cookie-proxy.** (docs; performed by humans)
Checklist with evidence slots: `APP_PUBLIC_ORIGIN` and `APP_BASE_PATH` set; HTTPS end to end so
`Secure` cookies are accepted; the vidysea.com front proxy forwards `Cookie`/`Set-Cookie`,
`Origin`, `X-Forwarded-For` and `X-Forwarded-Proto` for `/knowledgebase/api/*`; `TRUST_PROXY_HOPS`
verified by a curl with a forged `X-Forwarded-For` showing it is ignored; `AUTH_CSRF_SECRET`
generated and stored in the server `.env` only; `USER_SIGNUP_TENANT=toc`; first admin created with
the script; rollback note (disable the session path by unsetting `USER_SIGNUP_TENANT` and keeping
API keys working).

**A9 ua-live-proof.** Dual-trigger: security-class proof.
A fresh checker runs on the real stack: the full signup-approve-login-persist-logout cycle;
persistence across an API restart and across a 24 h+ rotation (clock moved on the work stack);
admin revoke kills a live session; password reset kills sessions; viewer write refused; pending
user refused; API keys still work for a script; forged `X-Forwarded-For` ignored; cookie attributes
inspected in the browser. Evidence pasted per step.

## Order and waves

```
Wave 1:  A1  ||  A2                        (disjoint: schema/db vs api credential code)
Wave 2:  A3                                (needs A1 for the stores and A2 for hashes/tokens)
Wave 3:  A4  ||  A6  ||  A8 (docs)         (A3 created the two router stubs; each fills its own file)
Wave 4:  A5  (once Q-A answered)  ||  A7   (A7 needs A4 and A6; A5 needs A4)
Wave 5:  A9 live proof
```

Only these edges are real; everything else runs in parallel:

- A1, A2 -> A3: A3 needs the stores and the credential module.
- A3 -> A4, A6: both consume the principal, cookie and stub routers; they edit disjoint files.
- A4 -> A5: the mailer fills the port A4 defines.
- A4, A6 -> A7: the web uses their APIs.
- A5 may be skipped (see Q-A option c) without blocking A7 or A9; A9 then proves the admin
  issue-link path instead.
- The WhatsApp feature: W1 (schema) and W2 (archiver service API, other repo) do not depend on this
  feature and may start in Wave 1; W3.. start after A4 and A6 close.

## Open questions

Each states what it blocks. None blocks A1-A4. (One more question, on per-link approval, lives in the WhatsApp plan.)

**Q-A. Which mail sender sends verification and reset mail?** (blocks A5 only)
No transactional sender exists. The only outbound mail is the `gws` CLI alert path, which sends as
one Google mailbox and is Windows-first (Linux binary still being pinned, gate
`golive-decisions`).
- (a) A dedicated transactional sender: SMTP credentials or a provider account (for example the
  company mail relay or a transactional API) for a `no-reply` address. **Recommended.**
- (b) Reuse `gws` with a named service mailbox. Works only once the Linux `gws` is pinned and
  authorised on the server; ties account recovery to a CLI that also does calendar and alerts.
- (c) No email in v1: admin approval doubles as identity verification, and the admin issues
  one-time reset/verify links from the admin page (`issue-link`). Zero new infrastructure, more admin
  work, and a link must reach the person out of band.
Recommendation: (a) for the product; build (c)'s `issue-link` anyway as the fallback so nothing
waits on the mail account.

**Q-B. Should signup be restricted by email domain?** (blocks nothing; default applies)
- (a) Open to any address as answered (Q8), protected by email verification before the admin queue,
  rate limits and a daily cap. **Recommended** (the literal answer).
- (b) Allowed-domain list (for example `vidysea.com`) auto-queues; other domains are rejected.
- (c) An invite code, like the archiver's `INVITE_CODE`.
Recommendation: (a); an optional later `ALLOWED_EMAIL_DOMAINS` hint that only sorts the queue.

## Human-provided items (nothing here is available to the maker)

| # | Item | Needed by | Notes |
|---|---|---|---|
| H-1 | Mail sender account and credentials, the `no-reply` address, SPF/DKIM for it (per Q-A) | A5 | Values go to server `.env` by DevOps; never to chat or this repo. |
| H-2 | Plan approval at `qa/gates/plan-approved-user-accounts.md`, including permission for the NEW files above | before A1 | |
| H-3 | Schema approval for the five new collections and retention numbers (sessions purge 30 d after revoke, events 2 y, throttles 24 h, unverified 7 d, idle expiry 365 d) | before A1 | |
| H-4 | Dependency approval: `@node-rs/argon2` exact pin (or accept the scrypt fallback) | A2 | |
| H-5 | DECISIONS entries via `scripts/append_decision.ps1`: user accounts as a second auth authority beside API keys; role to scope table; session lifetime rule ("until logout", 365 d idle); open signup with admin approval. Entries touching the enforcement path carry `Approved-by: Umesh` | before A3 | |
| H-6 | Role table approval (`docs/user-accounts/roles.md`; the draft is in spec UA-9: members get `ingest`, `whatsapp`, `whatsapp-link`; admins add `user-admin`, `whatsapp-admin`, `join-rules`, `registration:approve`, `answer-policy:*`; nothing operator-grade; widening to `send-now` or narrowing `ingest` is Umesh's call) | before A3 merge | |
| H-7 | Domain / cookie / proxy settings: `APP_PUBLIC_ORIGIN`, `APP_BASE_PATH=/knowledgebase`, HTTPS on the front proxy, `TRUST_PROXY_HOPS`, the vidysea.com team forwarding `Cookie`, `Set-Cookie`, `Origin`, `X-Forwarded-*` for the API path | A8, A9 | The front proxy belongs to the vidysea.com team (batch 4 item 1b). |
| H-8 | `AUTH_CSRF_SECRET` (random, 32+ bytes) and `USER_SIGNUP_TENANT=toc` in the server `.env` | A8, A9 | |
| H-9 | First admin: Umesh's email, and the password entered at the script prompt on the host | A9 | |
| H-10 | The list of first users to expect (so approvals are not guesses) | A9 | [ASSUMPTION] staff, fewer than 20. |
| H-11 | Confirmation of `docker-compose.yml` as an enforcement path needing `Approved-by` for the env forwards | A5, A8 | |

## Risks the plan carries openly

- **Auth is the foundation of the next feature.** A defect here becomes a WhatsApp privacy defect.
  A3 is the largest risk; its adversarial checker starts from "assume the session check is wrong".
- **Shared origin.** Other scripts on vidysea.com can act as a logged-in person (spec UA-26); accepted,
  not worse than the `localStorage` key today; a subdomain is the clean fix if ever wanted.
- **Single API instance assumed.** In-process limiter and the 5 s cache assume one instance; scaling
  out needs a shared limiter store. Named, not built.
- **Mail deliverability.** Verification and reset depend on mail landing; fallback is admin
  `issue-link`.
- **Lockout can be abused to lock out a named person for up to 24 h.** Accepted and logged; admin
  unlock exists; existing sessions are unaffected.
- **Dependency.** A native-binary dependency can fail on the API image; the scrypt fallback is
  specified so the unit cannot stall.
- **Two role systems.** Hosting roles (per API key) and user roles coexist; they never merge in v1
  and the admin UI says which one it shows.
