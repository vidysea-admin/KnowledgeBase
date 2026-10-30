# Manifest — ua-production-enable
**Contract:** none specific; follow-through recorded in `qa/manifests/ua-admin-mount.md` open point 1 and `qa/QUEUE.md` (`ua-production-enable`). Scope `docs/features/user-accounts/plan.md` A3/A4/A6 integration; needed before A9. Authorization: D-206.
**Goal task:** user-accounts production enablement (integration of A4 + A6 + ua-admin-mount)
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/api/src/composition/production.ts:265
**Persona walk:** skip (no screen; composition wiring and tests only)
**Issues addressed:** ISS-UAADMIN-005 (wiring test gap: unlock through the built router, issue-link origin)
**Executor:** claude-sonnet (builder in worktree `.worktrees/ua-prod-enable`, branch `wave/ua-prod-enable`)
**Round:** one round, est 20 min, tier L by the auth trigger.

## Criteria
- P-1 With a usable AUTH_CSRF_SECRET, buildProductionDeps(...).userAccounts is defined and the server mounts /auth and /admin; without it, userAccounts is undefined and API-key behaviour is unchanged (test both).
- P-2 Request-level /admin mount test through mountUserAccounts/createServer: anonymous -> 401, API-key POST mutation -> 403, admin session POST mutation -> 200 (senior review of ua-admin-mount).
- P-3 Close ISS-UAADMIN-005: a composition test that locks a user via A4 failed logins on an in-memory Db, unlocks through the router built by buildUserAccounts, and asserts the A4 throttle row is gone; plus an issue-link origin assertion (APP_PUBLIC_ORIGIN + APP_BASE_PATH). A mutant replacing subjectHash must turn it red.
- P-4 The moved helper behaves identically (its existing tests pass unchanged); lint:structure and tsc green.

## What changed (base 0f565734, head e9600960)
- `apps/api/src/composition/production.ts`: `buildProductionDeps` now sets `userAccounts: buildUserAccounts(process.env, db, logger)` (line 265; `db` is the existing lazy Db, `logger` the module logger). `buildUserAccounts` returns undefined without a usable AUTH_CSRF_SECRET (logs one warning), so API keys are unchanged when unset. To make room under the 300 non-blank-line budget the watch helpers moved out (300 -> 264 lines): `watchHeartbeatIntervalMs`, `createMongoWatchSilenceDeps`, `createMongoWatchStateReadDeps` (verbatim, no behaviour change; the last gained `export`). Unused imports removed (`scopedCollection`, `createTelegramAlertSink`, `WatchState`, `WatchSilenceDeps`).
- `apps/api/src/activity-health/watch-runs.ts` (existing module, already `@lkb/db` + watcher scoped): receives the three moved functions and their imports. No new source file.
- `apps/api/src/production.test.ts`: two new tests (P-1), existing four untouched.
- `apps/api/src/composition/integrations/mounted-routes.test.ts`: two new tests (P-2, P-3) plus an in-memory Db double; existing four untouched.
- No change to `structure.config.json`, `user-accounts/` (stays 34/34), `server.ts`, `user-accounts.ts`.

## Evidence
Pre-check[P-1]: e9600960 node --test --import tsx apps/api/src/production.test.ts -> 6 passed, 0 failed
Pre-check[P-2]: e9600960 node --test --import tsx apps/api/src/composition/integrations/mounted-routes.test.ts -> 6 passed, 0 failed
Pre-check[P-3]: e9600960 node --test --import tsx apps/api/src/composition/integrations/mounted-routes.test.ts -> 6 passed, 0 failed
Pre-check[P-4]: e9600960 node --test --import tsx apps/api/src/activity-health/watch-runs.test.ts apps/api/src/routes/health/watch-silence.test.ts apps/api/src/routes/health/health.test.ts apps/api/src/routes/watched-sources.test.ts -> 49 passed (5/18/7/19), 0 failed
Lint[P-4]: e9600960 lint:structure (package.json script, all 10 stages incl. loc, dirsize, dependencies) -> OK, 0 failed, production.ts 264 non-blank lines; tsc --noEmit on apps/api exit 0
Tests[P-1]: apps/api/src/production.test.ts — the two P-1 tests: secret set -> userAccounts defined, both routers are functions, /auth/no-such-route 404 (mounted terminal 404), anonymous /admin/users 401, key without user-admin 403; secret unset or 12 bytes -> userAccounts undefined, /auth/no-such-route 401 (shared perimeter, not mounted), valid API key still authenticates, anonymous 401
Tests[P-2]: apps/api/src/composition/integrations/mounted-routes.test.ts — P-2 over the real createServer with `buildUserAccounts` over an in-memory Db and a real session (cookie, CSRF token, Origin): anonymous 401, API key holding user-admin 403 `admin_session_required`, admin session 200
Tests[P-3]: apps/api/src/composition/integrations/mounted-routes.test.ts — P-3: 8 failed A4 logins write one locked throttle row keyed by `auth.subjectHash`; admin-session unlock through the built router returns 200 `cleared: true`, row count 0, `unlocked` event written; issue-link starts with `https://kb.example.org/knowledgebase/`
Tests[P-4]: apps/api/src/activity-health/watch-runs.test.ts apps/api/src/routes/health/watch-silence.test.ts apps/api/src/routes/health/health.test.ts apps/api/src/routes/watched-sources.test.ts — the consumers of the moved deps (unchanged files, unchanged results); scripts/lint-loc.mjs via lint:structure
Falsification[P-1]: delete the `userAccounts:` line in production.ts (per-mutation byte backup, restored, bytes equal, HEAD blob hash equal) -> P-1 "usable AUTH_CSRF_SECRET" test red (pass 5, fail 1); restored -> green.
Falsification[P-2]: remove `requireAuth(keyStore, ua.session)` from the `/admin` mount in user-accounts.ts (same discipline, HEAD-fidelity OK) -> P-2 and P-3 red (pass 4, fail 2: anonymous no longer 401); restored -> green.
Falsification[P-3]: three mutants in user-accounts.ts `buildUserAccounts`, each restored and HEAD-fidelity checked: `subjectHash: () => "mutant"` -> P-3 red (unlock clears a different key, throttle row survives); `publicOrigin: "https://evil.example"` -> P-3 red; `basePath: ""` -> P-3 red. Each leaves only P-3 failing (pass 5, fail 1).
Falsification[P-4]: not mutation-testable beyond the existing suites; behaviour identity is shown by the four consumer test files passing unchanged and by the moved blocks being byte-identical apart from `export` on `createMongoWatchStateReadDeps` (git diff -M of the removed and added hunks).

## Open points (declared, not defects)
1. **Runtime enablement still needs env and ops.** `AUTH_CSRF_SECRET` (32+ bytes), `USER_SIGNUP_TENANT=toc`, `APP_PUBLIC_ORIGIN`, `APP_BASE_PATH`, `TRUST_PROXY_HOPS` are plan items H-7/H-8 (A8, A9). This unit only makes production honour them; with none set behaviour is unchanged.
2. **`buildProductionDeps` logs one warn line per call** when AUTH_CSRF_SECRET is unset ("user accounts disabled: ..."); silent under `node --test` (LOG_LEVEL default), one line at API start in production.
3. **P-2/P-3 run over an in-memory Db double**, not real Mongo; the real-Mongo proofs for the stores remain `admin.mongo.test.ts`, `auth-service.mongo.test.ts`, `sessions.mongo.test.ts` (unchanged).
4. **ISS-UAADMIN-006** (from ua-admin-mount reviews) is not addressed here.
5. Test files in this repo are CRLF in the working tree and LF in the index; appended blocks were written LF and are normalised by git on add.
