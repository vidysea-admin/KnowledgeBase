# Manifest — ua-admin-api
**Contract:** none specific; scope is `docs/features/user-accounts/plan.md` row A6 and section "A6 ua-admin-api" (spec UA-5, UA-6, UA-7, UA-8, UA-19, UA-25, UA-28). Authorization: D-206.
**Goal task:** user-accounts A6 (wave 2, tier 3 roadmap feature; depends on A1 stores, A2 credentials, A3 session core; independent of A4/A5)
**Date:** 2026-10-30
**Status:** checked-PASS (dual: A 6a65a3c3, B dd8571a3, cycle 0; merge waits on A4 + /admin mount CORE-REQUEST)
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/api/src/user-accounts/admin-router.ts:54
**Persona walk:** skip (no screen, flow or user type; JSON admin API only. The admin screen is a later unit and consumes this contract.)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one new service/router pair plus one script, all new files; edit-in-place satisfied (the only existing file touched is `structure.config.json`, one number plus its comment).

## Criteria (verbatim from plan.md, "A6 ua-admin-api", Dual-trigger: authorization of account administration)
- A6-1 Only an `active` `admin` session reaches any `/admin/*` mutation; member, viewer, pending, a Bearer key without `user-admin`, and a key with `user-admin` (mutations) are refused.
- A6-2 Approve requires a role. Reject, approve, role, disable, enable, revoke and unlock each write one event with actor and target. A tenant-B admin gets 404 for tenant-A user ids (list and detail).
- A6-3 Last-admin guard: demote, disable and revoke-all by/for the sole admin give 409; with two admins it succeeds for one; a concurrent demotion of both admins (real-Mongo race) leaves exactly one admin.
- A6-4 An admin cannot change their own role or disable themself.
- A6-5 Disable/revoke takes effect on the target's next request (401) in the same test run.
- A6-6 `scripts/create-admin.mjs`: refuses without a work/staging DB or the production opt-in; takes the password only via stdin; is idempotent for the same email (no second user); never prints the password.
- A6-7 Adversarial brief: mass-assignment (extra `role`/`status`/`tenantId` fields), id guessing, role escalation by editing own record, replaying an approve with a swapped tenant.

## What changed
New files:
- `apps/api/src/user-accounts/admin-service.ts` — `createAdminService(deps)` over an injected `AdminStore`; `createMongoAdminStore(db)` (built on the A1 `@lkb/db` modules and `scopedCollection`, so every query carries the tenant). Methods `listUsers`, `getUser`, `approve`, `reject`, `setRole`, `disable`, `enable`, `revokeSessions`, `unlock`, `issueLink`, `audit`. Every mutation runs under a per-tenant promise-chain lock and RE-READS the acting admin from the store (a session valid on arrival but demoted a moment ago is refused). Last-admin guard = pre-check, compare-and-swap, post-check that reverts when the write left zero admins. Audit rows come from the closed-vocabulary `buildAuthEvent` (`approved`, `rejected`, `role_changed`, `disabled`, `enabled`, `session_revoked`, `unlocked`, `link_issued`), actor and target on each.
- `apps/api/src/user-accounts/admin-router.ts` — `createAdminRouter(deps)` (also accepts `{service}`). Reads `GET /users`, `/users/:id`, `/audit` need scope `user-admin` (held by an admin session and, by UA-28, by a key minted with it). Mutations `POST /users/:id/{approve,reject,role,disable,enable,revoke-sessions,unlock,issue-link}` go through `requireAdminSession` (active admin SESSION holding `user-admin`; any API key is refused). Strict bodies and queries (unknown field = 400), `Cache-Control: no-store`, cursor paging, store failure = generic 503 (logs error name and code only).
- `apps/api/src/user-accounts/admin.testsupport.ts` — in-memory `AdminStore` with Mongo's CAS semantics, and `adminRig` that mounts the router through the REAL `createServer` exactly as `mountUserAccounts` mounts `/admin`.
- `scripts/create-admin.mjs` — bootstrap of the first admin (UA-7). `main({argv, env, deps, out, err})` is exported with injected deps and guarded by an `import.meta.url === pathToFileURL(process.argv[1]).href` entry check.
- Tests: `admin-router.test.ts` (20), `admin.mongo.test.ts` (8, opt-in real mongod), `scripts/create-admin.test.mjs` (10; the last one spawns the real script against a real mongod, opt-in).
Existing file edited: `structure.config.json` — `dirsize.overrides.scripts` 32 -> 34 and its `$comment` (create-admin.mjs and its test are the 33rd and 34th loose files; `pnpm lint:structure` failed on it before). It is the one line unit authors of this feature have already used for their directory budgets; flagged for the orchestrator because A4 may touch the same line.

Design decisions and honest limits (for the checkers):
1. **issue-link is the A5 replacement** (A5 mailer dropped): admin-only; it supersedes the user's earlier unused token of that purpose, stores only the sha256, returns the raw token once inside a URL built from the configured public origin plus base path (never Host / X-Forwarded-Host). The token sits in the URL fragment: `.../verify#token=...` or `.../reset#token=...` (`LINK_PATHS`, `LINK_TOKEN_KEY`). That fragment contract is for the A7 screens. With no configured origin it answers 503 `link_origin_not_configured` and writes nothing.
2. **Reject `reason` is validated and discarded.** Free text from a client never reaches the audit log (closed vocabulary only). Approve of a `rejected` user is the "re-open" path.
3. **The two-instance race can end with two admins, never zero.** In one API instance the lock makes a cross-demotion deterministic (exactly one admin). With a second instance (its own lock) both CAS writes can land, then the post-check of each sees zero and reverts. Real-Mongo measurement over 40 rounds: always `last_admin/last_admin`, leaving 2 admins, never 0. The plan's "exactly one" is proved for the documented single-instance deployment (UA-23); the second-instance case proves the weaker, safety-relevant property (never zero). Stated, not hidden.
4. **sole-admin `revoke-sessions`** is guarded by a pre-check only (there is no state write to compare-and-swap or revert), so it is weaker than demote/disable under a cross-instance race. Revoking sessions is reversible by logging in again.
5. **Unlock needs the A4 subject hash.** `deps.subjectHash(tenantId, emailNormalized)` is injected (A4 owns the salted hash used to key `auth_throttles`). The composition wiring must pass A4's function; with a wrong function, unlock is a harmless no-op that still audits. Tests use a fake keyed hash plus a real `auth_throttles` row on real Mongo.
6. **Wiring is a CORE-REQUEST** (below). This unit exports `createAdminRouter` only; `mountUserAccounts` still returns the 503 placeholder until the core line is changed.
7. **The tests were written together with the code**, so there is no red-against-HEAD run (the modules did not exist). The proof the tests bite is the falsification table.
8. `create-admin` against production still requires `--i-know-this-is-production`, `MONGODB_DB=lkb|lkb_prod`, and (D-196) a human-approved run; this unit does not run it there.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 9 files, 7 criteria, est 150 min, single builder, one test file per node:test invocation, no checker dispatch by the builder
slow-plan: seven criteria across a service, a router, a Mongo store and a script, each needing its own falsification; the real-mongod race and script runs plus twelve mutation runs are the wall-clock steps
mutant-cap-raise: one falsification per criterion is mandatory; A6-1 has two (router layer and the service re-read of the actor) and A6-3 has three (guard threshold, lock, post-check revert) because each criterion states independent properties
Tier: L (auth and credential handling; dual-trigger: auth apps/api/src/user-accounts/admin-router.ts:54)
Base / checked state: base 7a4ed51a; code commits c087fbd9 and 71f950c2 on branch wave/ua-admin-api (the manifest commit that follows touches only qa/). Final code SHA: 71f950c2.
Affected tests: only the three new test files; no existing test touched. Whole-suite run: not made (suite_runs=0 by instruction; no existing source other than `structure.config.json` touched).
Owners: ua-admin-api-builder
Independent review: NOT run by the builder; the checkers own review (dual check). Requested adversarial brief for the second checker: cross-tenant reach through any id-taking route, a key holding `user-admin` reaching a mutation, mass assignment into `status`/`role`/`tenantId`, last-admin bypass by two different routes (role + disable) racing, self-promotion, the issue-link token leaking into logs/audit/headers, `Host` header influence on the link, unlock reaching another tenant's throttle row, and the `create-admin` password never appearing on argv, stdout, stderr or in the audit row.
Known limits: items 3, 4 and 5 above. Not done by design: mail (dropped), the admin screen (later unit), consent (D-210 out of scope).
CORE-REQUEST: apps/api/src/composition/integrations/user-accounts.ts replace /admin 503 placeholder with createAdminRouter
Tests[A6-1]: apps/api/src/user-accounts/admin-router.test.ts::"[A6-1] only an active admin session mutates: member, viewer, pending, keys (with and without user-admin), anonymous and a CSRF-less admin are all refused, state untouched", "[A6-1] reads need the user-admin scope", "[A6-3] a stale session whose admin was demoted a moment ago is refused by the service itself", "[A6-1] unlock deletes exactly the throttle row keyed by the injected subject hash" — the router and service tests exercise every mutation route with each refused principal and assert state and audit are untouched
Tests[A6-2]: apps/api/src/user-accounts/admin-router.test.ts::"[A6-2] approve needs a role and writes one event with actor and target; reject / role / disable / enable / revoke / unlock likewise", "[A6-2] state machine ...", "[A6-2] a role change applies on the very next request", "[A6-2] tenant isolation: an admin of tenant B gets 404 for tenant A user ids on list, detail and every mutation", "[A6-2] listing ...", "[A6-2] audit ..."; admin.mongo.test.ts (tenant isolation on real scopedCollection) — the tests assert one event per action with actor and target, the role requirement, and tenant-B 404s on list, detail and every mutation, plus tenant scoping on the real scopedCollection
Tests[A6-3]: apps/api/src/user-accounts/admin-router.test.ts::"[A6-3] last-admin guard ...", "[A6-3] a concurrent demotion of both admins (each demoting the other) leaves exactly one admin", "[A6-3] a second API instance racing this one ... can never leave zero admins"; admin.mongo.test.ts (cross-demotion race 10 rounds -> exactly one admin; two-instance race 40 rounds -> never zero) — the memory suite covers sole-admin 409s and a second admin succeeding; the real-mongod test proves the concurrent cross-demotion leaves one admin and a two-instance race never leaves zero
Tests[A6-4]: apps/api/src/user-accounts/admin-router.test.ts::"[A6-4] an admin cannot change their own role or disable themself when another admin exists (403 self_action_forbidden)" — the test has two admins and asserts 403 self_action_forbidden for own role change and own disable
Tests[A6-5]: apps/api/src/user-accounts/admin-router.test.ts::"[A6-5] disable and revoke-sessions take effect on the target's very next request (401) in the same run"; admin.mongo.test.ts (same on real user_sessions) — the test disables and revokes a logged-in target and asserts the very next request is 401, in memory and on real user_sessions
Tests[A6-6]: scripts/create-admin.test.mjs (9 fake-dep tests: create, idempotent re-run, lost insert race, existing account untouched, DB guard, production opt-in, stdin-only password, bad inputs, audit-write failure; 1 real-script-on-real-mongod test) — nine fake-dependency tests cover the refusals, stdin-only password, idempotency and no-print, and one test spawns the real script on a real mongod
Tests[A6-7]: apps/api/src/user-accounts/admin-router.test.ts::"[A6-7] adversarial: mass assignment, role escalation by editing own record, id guessing, operator injection, replay with swapped tenant" — the adversarial test sends extra role/status/tenantId fields, guesses ids, edits its own record and replays an approve with a swapped tenant
Pre-check[A6-1]: 71f950c2 node --test --import tsx apps/api/src/user-accounts/admin-router.test.ts -> exit 0, 20 passed t=3 blobs=apps/api/src/user-accounts/admin-router.test.ts:886e41b5
Pre-check[A6-2]: 71f950c2 node --test --import tsx apps/api/src/user-accounts/admin-router.test.ts -> exit 0, 20 passed t=3 blobs=apps/api/src/user-accounts/admin-router.test.ts:886e41b5
Pre-check[A6-3]: 71f950c2 LKB_UA_ADMIN_MONGO_URI=mongodb://127.0.0.1:27999 node --test --import tsx apps/api/src/user-accounts/admin.mongo.test.ts -> exit 0, 8 passed t=14 blobs=apps/api/src/user-accounts/admin.mongo.test.ts:3b483573
Pre-check[A6-4]: 71f950c2 node --test --import tsx apps/api/src/user-accounts/admin-router.test.ts -> exit 0, 20 passed t=3 blobs=apps/api/src/user-accounts/admin-router.test.ts:886e41b5
Pre-check[A6-5]: 71f950c2 node --test --import tsx apps/api/src/user-accounts/admin-router.test.ts -> exit 0, 20 passed t=3 blobs=apps/api/src/user-accounts/admin-router.test.ts:886e41b5
Pre-check[A6-6]: 71f950c2 LKB_UA_ADMIN_MONGO_URI=mongodb://127.0.0.1:27999 node --test --import tsx scripts/create-admin.test.mjs -> exit 0, 10 passed t=9 blobs=scripts/create-admin.test.mjs:01962af7
Pre-check[A6-7]: 71f950c2 node --test --import tsx apps/api/src/user-accounts/admin-router.test.ts -> exit 0, 20 passed t=3 blobs=apps/api/src/user-accounts/admin-router.test.ts:886e41b5
Pre-check[T1]: 71f950c2 npx tsc --noEmit -p tsconfig.json (cwd apps/api) -> exit 0, clean t=25
Pre-check[S1]: 71f950c2 pnpm lint:structure -> exit 0, OK (10 stages, 0 failed)
Live browser evidence: Not UI-touching
Metrics: builder_min=150 mutants=16 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
Honest account: tests and modules were written in the same pass, so there is no "red against HEAD" run (the modules did not exist, the import would fail). The proof the tests bite is the falsification below. Genuine reds during development: the first Mongo run failed 401 on every call because `insertUser` generates its own `_id` (the seed helper now uses the returned one); `userTokens().updateMany` is not a method of the scoped collection (replaced by `bulkWrite([{updateMany}])`); the migration refused to run without the work-DB env (the test now sets and restores it).

## Capability coverage (one falsification per criterion, on the committed tree)
Method (D-020 and its 2026-09-28 amendment): per-mutation byte backup taken immediately before each single mutation and restored by a `finally` right after it; no run-scoped backup and no EXIT trap; each test run under a timeout (150-280 s); after every restore a byte compare against the backup, and at the end `git hash-object <file>` equal to `git rev-parse HEAD:<file>` for all three touched files (OK) and `git status --short` empty. Script: the scratchpad `falsify.py` of this session (not committed).

| Criterion | falsifying edit | test file | observed |
|---|---|---|---|
| A6-1 | router layer made a no-op (`if (a?.principal === "session" &&` -> `if (true ||`) | admin-router.test.ts | KILLED (nonzero exit; member/viewer/key cases fall through to the service) |
| A6-1b | service re-read of the actor drops the `role !== "admin"` test | admin-router.test.ts | KILLED (stale demoted admin accepted) |
| A6-2 | approve accepts a missing role (defaults to `member`) | admin-router.test.ts | KILLED |
| A6-2b | `getUser` reads tenant `tA` instead of the caller's tenant | admin-router.test.ts | KILLED (tenant-B admin sees tenant-A user) |
| A6-2c | `role_changed` event not written | admin-router.test.ts | KILLED |
| A6-3 | last-admin pre-check threshold `<= 1` -> `<= 0` | admin-router.test.ts | KILLED |
| A6-3b | per-tenant lock removed (`const run = fn();`) | admin.mongo.test.ts (real mongod) | KILLED |
| A6-3c | post-check revert disabled (`if (false) { await revert() ...`) | admin.mongo.test.ts (real mongod) | KILLED |
| A6-4 | self-action guard line removed | admin-router.test.ts | KILLED |
| A6-5 | disable no longer revokes sessions (`const revoked = 0;`) | admin-router.test.ts | KILLED |
| A6-6 | `--pass*` argv refusal removed | create-admin.test.mjs | KILLED |
| A6-6b | idempotency branch disabled (`if (false) {`) | create-admin.test.mjs | KILLED |
| A6-6c | DB guard replaced by `{url, dbName: MONGO_WORK_DB ?? "lkb"}` | create-admin.test.mjs | KILLED |
| A6-7 | strict-body check removed (unknown fields allowed) | admin-router.test.ts | KILLED |

Two results worth the checker's attention (reported as measured, not tidied):
- **Equivalent mutant, then a stronger one.** Dropping only the `a.userRole === "admin"` clause of `requireAdminSession` SURVIVED: a member session has no `user-admin` scope, so the scope clause blocks it with the same 403 `admin_session_required`. That is deliberate defence in depth, not a test gap; the A6-1 row above removes the whole router layer and is killed, and A6-1b removes the service layer's re-read and is killed.
- **The lock mutation SURVIVES the in-memory suite and is KILLED only by the real mongod.** Without the lock, the in-memory double still ends a cross-demotion with one admin (microtask ordering plus the post-check revert). The criterion says "real-Mongo race", and it is the Mongo test that detects the missing lock. Run `admin.mongo.test.ts`; skipping it leaves A6-3b untested.

## How to verify
- From `apps/api`, one file per run: `node --test --import tsx src/user-accounts/admin-router.test.ts` (20); `npx tsc --noEmit -p tsconfig.json` -> exit 0.
- Real mongod (loopback only, creates and drops its own throwaway database): `LKB_UA_ADMIN_MONGO_URI=mongodb://127.0.0.1:<port> node --test --import tsx src/user-accounts/admin.mongo.test.ts` (8) from `apps/api`; and from the repo root `LKB_UA_ADMIN_MONGO_URI=... node --test --import tsx scripts/create-admin.test.mjs` (10; 9 without the variable, the last one is skipped).
- From the root `pnpm lint:structure` -> OK (10 stages).
- `git diff 7a4ed51a 71f950c2 --stat` touches `apps/api/src/user-accounts/admin*`, `scripts/create-admin*` and `structure.config.json` only.
