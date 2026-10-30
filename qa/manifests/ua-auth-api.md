# Manifest — ua-auth-api
**Contract:** none specific; criteria A4-1..A4-10 below (D-206; docs/features/user-accounts/plan.md row A4 "ua-auth-api" acceptance items 1-10; spec.md UA-1, UA-4, UA-5, UA-11, UA-12, UA-18, UA-20..UA-25; no qa/contracts file, the maker never edits qa/contracts/)
**Goal task:** none
**Date:** 2026-10-30
**Status:** checked-PASS (dual: A 7773f672, B 63d5265d/fb9cd6a9, cycle 0)
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/api/src/user-accounts/auth-service.ts:184
**Persona walk:** skip (no screen, flow or user type built here; HTTP API and service only; the web screens are A7)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one auth unit (service, router, throttle, Mongo store) built by a single builder in a private worktree; no external executor was worthy.

Authority: D-206 (docs/DECISIONS.md) and the gate answers: Q-A no mail in v1 (admin-issued links), Q-B any email + password may sign up but gets no access until an admin approves, Q7 email + password with a session that lasts until logout, Q9 roles admin / member / viewer, H-4 argon2id. Plan row A4 lists `mailer.ts`; it is NOT built (A5 dropped, v1 sends no mail).

## Acceptance criteria
- **A4-1** Signup: identical response for a new and an existing email (byte-equal body, same status; timing recorded, not asserted tight). Unknown field -> 400; a tenant in the body is ignored (rejected); `USER_SIGNUP_TENANT` unset -> 503 `signup_not_configured`.
- **A4-2** Verify: a valid token moves unverified -> pending once; reuse, expired and wrong-purpose tokens all give the same 400 `invalid_token`; unverified older than 7 d is swept and never listed.
- **A4-3** Login: unknown email and wrong password give the same 401 body and both run a full hash verify (spy asserts it). Pending with the correct password gets a session with `[]` scopes and every data route is 403. rejected / disabled get no cookie.
- **A4-4** Lockout (faked clock): 5 failures lock the email for 15 min, a never-registered email included; doubling schedule; success and admin unlock clear it; the lock does not change the 401 body.
- **A4-5** Reset: always 202; token single use; reset revokes all sessions (a pre-existing session gets 401 on its next request); rejected / disabled reset refused generically.
- **A4-6** Change password: wrong current password refused; success revokes the other sessions only.
- **A4-7** Logout and logout-all revoke the right rows and clear the cookie on the exact path.
- **A4-8** Rate limits per route and per email answer 429 with the standard body; global signup cap.
- **A4-9** Every transition writes exactly one `auth_events` row with a closed-vocabulary `detail`; a grep of all rows after a full scenario finds no password, token or cookie substring.
- **A4-10** No route in this unit is reachable with a Bearer key (asserted).

## What changed
- NEW apps/api/src/user-accounts/throttle.ts: lockout state machine (5 failures / 15 min -> 15 min lock, doubling to 24 h, a failure while locked changes nothing), `createThrottle` over an injected `ThrottleStore` with a COMPARE-AND-SET `put` (parallel guesses cannot lose each other's count), `createWindowLimiter` (per-email, in memory), `createIpLimiters` (express-rate-limit, 429 + Retry-After, standard body; defaults login 20 / 15 min, signup 5 / h, forgot 5 / h, token attempts 20 / h).
- NEW apps/api/src/user-accounts/auth-service.ts: transport-free service (`signup`, `verifyEmail`, `login`, `currentSession`, `logout`, `logoutAll`, `listSessions`, `revokeOwnSession`, `forgotPassword`, `resetPassword`, `changePassword`, plus the A6 exports below). Storage is the injected `AuthStore`. Salted HMAC subject hash (AUTH_CSRF_SECRET) for throttle rows and audit events, so a raw email is never stored. Every transition writes one closed-vocabulary event through the real `buildAuthEvent`.
- NEW apps/api/src/user-accounts/auth-router.ts: Express router mounted at `/auth`. Any `Authorization` header -> 403 `key_not_allowed` (line 109); an Origin that is present and not allow-listed on a non-session unsafe request -> 403 `csrf`; strict body schemas (unknown key -> 400); per-IP limiters before the handler; storage failure -> opaque 503 `auth_unavailable`; `Cache-Control: no-store`; a successful login ends the session the browser presented.
- EDIT apps/api/src/composition/integrations/user-accounts.ts (owned by this unit for this wave): `createMongoAuthStore(db)` (tenant-scoped accessors only; CAS throttle `put`), `parseSignupCap`, `buildUserAccounts` now builds `auth` (service) and `authRouter` and returns both; env `USER_SIGNUP_TENANT` (validated with `isValidTenantId`, else a warning and 503s), `USER_SIGNUP_DAILY_CAP`. The `/admin` placeholder is untouched; `mountUserAccounts` itself is unchanged (it already prefers `ua.authRouter`).
- NEW tests: throttle.test.ts, auth-service.test.ts, auth-router.test.ts, auth-service.mongo.test.ts (opt-in, skipped here), and the test double auth-service.testsupport.ts (in-memory `AuthStore` with global-unique email E11000, atomic single-use tokens, CAS throttle).
- Not touched: auth.ts, server.ts, principal.ts, sessions.ts and the A1 collections (A1-A3 code is used as is). No consent code (D-210).

### Design decisions taken (flag if wrong)
1. Public routes (signup, login, verify, forgot, reset) use the server-side `USER_SIGNUP_TENANT` as their tenant; the body can never name one (unknown field -> 400, asserted with `tenantId` in the body).
2. A pending user may change password and log out; `/auth/session` shows `state: "pending"`.
3. `forgotPassword` issues nothing in v1 (no mail): always 202 `{ok:true}`, 429 on the per-address limit (3 / h). The admin issues the link via `issueToken`.
4. `issueToken` writes the `link_issued` event itself: A6 must NOT write a second one.
5. The 7-day sweep of stale unverified users runs opportunistically (at most hourly) from signup, is exported as `sweepUnverified`, and a stale user can never verify (checked at verify time too).
6. A successful login ends the session the browser presented (best effort, after the new one exists). A stale or revoked cookie never blocks signing in again; the router's `Set-Cookie` replaces whatever the perimeter appended, so exactly one cookie header is sent.
7. Lockout is keyed on the salted subject hash per tenant. Change-password with the wrong current password counts toward the same lockout and answers 403 (not 401, so the web client does not sign the user out).

## Exports for A6
From `apps/api/src/composition/integrations/user-accounts.ts`: `buildUserAccounts(env, db, log)` now returns `UserAccountsRuntime` with `auth: AuthService`. A6 builds its admin router from `runtime.auth` and passes it as `adminRouter` to `mountUserAccounts`. From `auth-service.ts` (type `AuthService`):
- `issueToken(tenantId, purpose: "verify_email" | "password_reset", userId, issuedBy?) -> Promise<{ token, expiresAt, purpose } | null>`: raw token returned once (only sha256 stored), null when the user is not in this tenant; writes the `link_issued` event.
- `unlockEmail(tenantId, email, actorUserId?) -> Promise<boolean>`: clears the throttle row and writes `unlocked`.
- `revokeAllSessions(tenantId, userId, reason, exceptSessionId?) -> Promise<number>`: no event (the admin route owns its own).
- `sweepUnverified(tenantId) -> Promise<number>`; `isStaleUnverified(user)`; `subjectHash(tenantId, email)`.
- Also exported: `UNVERIFIED_MAX_AGE_MS`, `DEFAULT_SIGNUP_DAILY_CAP`, types `AuthStore`, `ApiResult`, `RequestMeta`; from router `ipPrefixOf`, `userAgentSummaryOf`; from throttle `createThrottle`, `createWindowLimiter`, `ThrottleStore`.

## Open points for the coordinator
1. NO REAL MONGO WAS REACHABLE (docker daemon not running, no mongod on PATH). `createMongoAuthStore` and the Mongo CAS throttle are therefore NOT exercised against a real server here; `auth-service.mongo.test.ts` is written, typechecked and skips without `LKB_UA_AUTH_MONGO_URI` (loopback only, throwaway database, applies the A1 migration). Run it before merge: `LKB_UA_AUTH_MONGO_URI=mongodb://127.0.0.1:27098/?directConnection=true node --test --import tsx src/user-accounts/auth-service.mongo.test.ts`. It proves parallel lockout, parallel single-use redemption, cross-tenant duplicate email, and secret-free audit rows. This is a stated gap, not a pass.
2. `buildUserAccounts` still has no caller in the production entry point (as in A3), so nothing is live until the entry wires it with `USER_SIGNUP_TENANT` and the other env names.
3. structure.config.json: apps/api/src/user-accounts holds 29 files; lint-dirsize passes today, but A6's files will need an override (not touched here).
4. A7 note: `session.attach` applies the CSRF guard, so a login made while holding a still-valid cookie needs the `X-LKB-CSRF` header; a stale or revoked cookie does not.
5. Env names introduced: `USER_SIGNUP_TENANT`, `USER_SIGNUP_DAILY_CAP` (not yet in `.env.example` or docker-compose; the plan assigns those to the mailer/ops rows).
6. Per-email limits and the signup cap use in-memory windows (single API instance, UA-23); the cap counts users created in the last 24 h.
7. `/admin` ordering note from A3 (mounted before the rate limiter) is still open for A6.
8. Commit trailer: the harness attribution for this session is "Claude Sonnet 5.5".

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: tier L, 10 criteria, single builder, fix cycle 0, est 180 min, no checker dispatch by the builder
Tier: L (authentication and credential handling)
Base / checked state: base 7a4ed51a; code commits 222a2d4f and 959d5e8e (adds one test for the one surviving mutant); this manifest follows and touches only qa/.
Affected tests: apps/api/src/user-accounts/{throttle,auth-service,auth-router,auth-service.mongo,principal,viewer-guard,cookie,sessions}.test.ts and apps/api/src/server.test.ts, one file per invocation.
Real Mongo: none reachable (see open point 1).
Not run / limits: no production or shared Mongo; no real Mongo at all; no browser; the full suite was not run (instruction); timing of the identical signup response is not asserted.
Tests[A4-1]: apps/api/src/user-accounts/auth-service.test.ts::"A4 #1 signup ..." (byte-equal response, both hash) + auth-router.test.ts::"A4 #1 signup over HTTP ..." (byte-equal HTTP body, unknown field and tenant-in-body 400 and nothing created, 503 signup_not_configured) - the diff adds signup in auth-service.ts and its POST /auth/signup route; these drive the byte-equal reply, the strict body and the 503 branch
Tests[A4-2]: auth-service.test.ts::"A4 #2 ..." (valid once, reuse / expired / wrong purpose the same 400, older than 7 d swept, cannot verify) + auth-router.test.ts::"A4 verify over HTTP ..." - the diff adds verifyEmail and the 7-day sweep; these drive valid once, generic 400 and the stale user
Tests[A4-3]: auth-service.test.ts::"A4 #3 login: unknown email and wrong password ... both run a full verify" (spy on the password module) and "A4 #3 login: active gets a session ... pending gets a ZERO-scope session; rejected ..." + auth-router.test.ts::"A4 #3 login over HTTP ..." and "A4 #3 a pending user ... every data route is 403 account_not_active" - the diff adds login with the dummy-verify path and the status gate; these drive the spy, the zero-scope session and the no-cookie states
Tests[A4-4]: throttle.test.ts (state machine, doubling, cap, hammering while locked, 12 PARALLEL failures) + auth-service.test.ts::"A4 #4 lockout ...", "A4 #4 a lock does not end existing sessions; the second lock lasts 30 min", "A4 #4 a successful login clears the failure counter" (fake clock) - the diff adds the lockout state machine, its CAS store contract and the login/change wiring; these drive 5/15 min, doubling, parallel guesses and clearing
Tests[A4-5]: auth-service.test.ts::"A4 #5 reset ..." + auth-router.test.ts::"A4 #5 reset over HTTP ..." (pre-existing session 401 session_revoked on the next request) - the diff adds forgot/reset with session revocation; these drive single use, the generic 202 and the dead pre-existing session
Tests[A4-6]: auth-service.test.ts::"A4 #6 change password ..." + auth-router.test.ts::"A4 #6 change password over HTTP ..." - the diff adds changePassword; these drive the refusal and the other-sessions-only revoke
Tests[A4-7]: auth-service.test.ts::"A4 #7 ..." + auth-router.test.ts::"A4 #7 logout needs CSRF ... exact path ..." (exact Set-Cookie string) and "A4 UA-20 sessions list and revoke-own over HTTP" - the diff adds logout, logout-all, sessions list/revoke and cookie clearing in the router; these drive the revoked rows and the exact Set-Cookie
Tests[A4-8]: auth-router.test.ts::"A4 #8 rate limits ..." (per-IP login / signup / token / forgot, per-address forgot, standard body, Retry-After) + auth-service.test.ts::"A4 #8 signup: global daily cap -> 429 signup_capacity" - the diff adds the per-IP limiters, the per-address windows and the signup cap; these drive each 429 and its body
Tests[A4-9]: auth-service.test.ts::"A4 #9 every transition writes exactly one auth_events row ..." (full scenario, grep of every row for password / token / cookie substrings) - the diff adds one emit per transition through buildAuthEvent; this drives the one-row-per-transition count and the secret grep
Tests[A4-10]: auth-router.test.ts::"A4 #10 no /auth route is reachable with a Bearer key ..." (11 routes, with and without a cookie, junk key, no session minted) - the diff adds the Authorization-header refusal at the top of the router; this drives every /auth route with a key
Pre-check[A4-1]: 959d5e8e cd apps/api; node --test --import tsx src/user-accounts/auth-service.test.ts; node --test --import tsx src/user-accounts/auth-router.test.ts -> exit 0, 17 + 15 passed, 0 failed t=1
Pre-check[A4-2]: 959d5e8e cd apps/api; node --test --import tsx src/user-accounts/auth-service.test.ts; node --test --import tsx src/user-accounts/auth-router.test.ts -> exit 0, 17 + 15 passed, 0 failed t=1
Pre-check[A4-3]: 959d5e8e cd apps/api; node --test --import tsx src/user-accounts/auth-service.test.ts; node --test --import tsx src/user-accounts/auth-router.test.ts -> exit 0, 17 + 15 passed, 0 failed t=1
Pre-check[A4-4]: 959d5e8e cd apps/api; node --test --import tsx src/user-accounts/throttle.test.ts; node --test --import tsx src/user-accounts/auth-service.test.ts -> exit 0, 7 + 17 passed, 0 failed t=1
Pre-check[A4-5]: 959d5e8e cd apps/api; node --test --import tsx src/user-accounts/auth-service.test.ts; node --test --import tsx src/user-accounts/auth-router.test.ts -> exit 0, 17 + 15 passed, 0 failed t=1
Pre-check[A4-6]: 959d5e8e cd apps/api; node --test --import tsx src/user-accounts/auth-service.test.ts; node --test --import tsx src/user-accounts/auth-router.test.ts -> exit 0, 17 + 15 passed, 0 failed t=1
Pre-check[A4-7]: 959d5e8e cd apps/api; node --test --import tsx src/user-accounts/auth-service.test.ts; node --test --import tsx src/user-accounts/auth-router.test.ts -> exit 0, 17 + 15 passed, 0 failed t=1
Pre-check[A4-8]: 959d5e8e cd apps/api; node --test --import tsx src/user-accounts/auth-router.test.ts; node --test --import tsx src/user-accounts/auth-service.test.ts -> exit 0, 15 + 17 passed, 0 failed t=1
Pre-check[A4-9]: 959d5e8e cd apps/api; node --test --import tsx src/user-accounts/auth-service.test.ts -> exit 0, 17 passed, 0 failed t=1
Pre-check[A4-10]: 959d5e8e cd apps/api; node --test --import tsx src/user-accounts/auth-router.test.ts -> exit 0, 15 passed, 0 failed t=1
Pre-check[T1]: 959d5e8e cd apps/api; npx tsc --noEmit -p tsconfig.json; node scripts/lint-loc.mjs --all; node scripts/lint-dirsize.mjs; per-file: principal 9, viewer-guard 6, cookie 6, sessions 14, server 10 passed, 0 failed -> exit 0, tsc no output, `lint-loc: OK (1883 file(s) within budget)`, `lint-dirsize: OK (301 dir(s) within budget)`, auth-service.mongo.test.ts skipped 1 (no Mongo) t=1
mutant-cap-raise: one falsification per criterion is mandatory; A4-1, A4-3, A4-4, A4-5, A4-6, A4-7, A4-8, A4-9 carry several because each has independent conjuncts
Metrics: builder_min=180 mutants=23 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable
Live browser evidence: Not UI-touching

## Red evidence (TDD)
- auth-service.test.ts: written first, observed red (`ERR_MODULE_NOT_FOUND` for auth-service.js), then green.
- auth-router.test.ts: written first, observed red (`ERR_MODULE_NOT_FOUND` for auth-router.js; 15 tests cancelled / failed), then green on the first run of the implementation (15 passed); the strength of the assertions is shown by the falsification table below, not by a red-green history.
- throttle.test.ts: the state-machine tests were NOT observed red first (the implementation was written right after them in the same step); disclosed, compensated by the falsification table. The CAS test ("12 PARALLEL ...") WAS observed red first (2 failures against the last-write-wins store), then green after `put` became compare-and-set.
- The success-clears-counter test was added after the first mutation run showed that mutant surviving; it fails on the mutant (see table).

## Capability coverage (falsification table)
Harness: python driver in the private scratchpad (not committed) using the repo's `scripts/lib/mutate.mjs` (`apply` refuses a file that is not byte-identical to HEAD; `restore` is `git checkout` to HEAD) after the code commit; 150 s timeout per test run; restore in a `finally` block per mutation (per-mutation, no run-scoped backup, no EXIT trap); after EACH mutation `git hash-object <file>` equals `git rev-parse HEAD:<file>` (all 23 runs OK); final `mutate.mjs assert-clean` exit 0 and `git diff HEAD --stat -- apps/api/src` clean. A first run of the driver mis-parsed the test output (UTF-8 summary symbols) and reported everything as killed; it was discarded, the parser was fixed (`NOPARSE` is now its own verdict) and the whole set was re-run.

| Criterion | Mutation (throwaway) | Result |
|---|---|---|
| A4-1 | existing-email signup returns 409 instead of the generic reply | KILLED: auth-service.test.ts (2), auth-router.test.ts (1) |
| A4-1 | unknown body keys no longer rejected (tenant in body accepted) | KILLED: auth-router.test.ts |
| A4-1 | no-tenant 503 `signup_not_configured` disabled | KILLED: auth-router.test.ts |
| A4-2 | stale-unverified check removed from verify | KILLED: auth-service.test.ts |
| A4-3 | unknown email skips the password verify | KILLED: auth-service.test.ts (spy) |
| A4-3 | rejected / disabled users receive a session | KILLED: auth-service.test.ts, auth-router.test.ts |
| A4-4 | lock threshold 6 | KILLED: throttle.test.ts, auth-service.test.ts (4) |
| A4-4 | locked login answers 429 instead of the same 401 | KILLED: auth-service.test.ts (2) |
| A4-4 | doubling schedule linear (`BASE * n`) | KILLED: throttle.test.ts |
| A4-4 | CAS result ignored (parallel guesses lose updates) | KILLED: throttle.test.ts |
| A4-4 | success does not clear the throttle | first run SURVIVED (the lock-expiry restart masked it); added "a successful login clears the failure counter"; re-run KILLED |
| A4-5 | reset no longer revokes sessions | KILLED: auth-service.test.ts, auth-router.test.ts |
| A4-5 | rejected / disabled reset allowed | KILLED: auth-service.test.ts |
| A4-6 | change password revokes the current session too | KILLED: auth-service.test.ts (router test did not fail: the service-level test owns the other-sessions-only property) |
| A4-6 | wrong current password accepted | KILLED: auth-service.test.ts, auth-router.test.ts |
| A4-7 | logout clears the cookie with `Path=/` | KILLED: auth-router.test.ts |
| A4-7 | logout-all revokes nothing | KILLED: auth-service.test.ts, auth-router.test.ts |
| A4-8 | login route without its per-IP limiter | KILLED: auth-router.test.ts |
| A4-8 | global signup cap multiplied out of reach | KILLED: auth-service.test.ts |
| A4-8 | per-address forgot limit removed | KILLED: auth-router.test.ts (service-level test did not fail) |
| A4-9 | logout writes no audit event | KILLED: auth-service.test.ts |
| A4-9 | raw email appended to the stored subject hash | KILLED: auth-service.test.ts |
| A4-10 | Authorization header check disabled (`if (false)`) | KILLED: auth-router.test.ts |

## How to verify
- From apps/api, one file per invocation: `node --test --import tsx src/user-accounts/<file>.test.ts` for throttle, auth-service, auth-router, principal, viewer-guard, cookie, sessions; `node --test --import tsx src/server.test.ts`.
- `npx tsc --noEmit -p tsconfig.json`; `node scripts/lint-loc.mjs --all`; `node scripts/lint-dirsize.mjs`.
- Real Mongo (gap, see open point 1): start a loopback mongod, then `LKB_UA_AUTH_MONGO_URI=mongodb://127.0.0.1:<port>/?directConnection=true node --test --import tsx src/user-accounts/auth-service.mongo.test.ts`.
