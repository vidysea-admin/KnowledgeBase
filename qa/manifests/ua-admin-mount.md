# Manifest — ua-admin-mount
**Contract:** none specific; the CORE-REQUEST recorded in `qa/manifests/ua-admin-api.md` (A6 open point 6): replace the `/admin` 503 placeholder with `createAdminRouter`. Scope `docs/features/user-accounts/plan.md` A6. Authorization: D-206.
**Goal task:** user-accounts A6 follow-through (integration of A4 + A6 after both dual PASS)
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/api/src/composition/integrations/user-accounts.ts:141
**Persona walk:** skip (no screen; composition wiring only)
**Issues addressed:** none
**Executor:** claude-opus (main maker; three-line change)
**Round:** one round, est 10 min, tier L by the auth trigger.

## Criteria
- M-1 `buildUserAccounts` builds `adminRouter` from `createAdminRouter` over `createMongoAdminStore(db)`, with `subjectHash` = the auth service's own `auth.subjectHash` (so unlock deletes exactly the A4 throttle row), `publicOrigin` = `APP_PUBLIC_ORIGIN`, `basePath` = `APP_BASE_PATH`; `mountUserAccounts` therefore serves the A6 routes instead of the 503 placeholder whenever user accounts are enabled.
- M-2 No regression in the A3/A4/A6 suites (principal, auth-router, auth-service, throttle, admin-router).
- M-3 `pnpm lint:structure` green; the `apps/api/src/user-accounts` directory budget raised 30 -> 34 with a stated reason (A4 and A6 were each within budget; merged they hold 34 files).

## What changed (base cdc61b36, head be587455)
- `apps/api/src/composition/integrations/user-accounts.ts`: imports `createAdminRouter`, `createMongoAdminStore`; builds and returns `adminRouter` (line 141); header comment updated.
- `apps/api/src/user-accounts/admin-router.test.ts`: one test `[A6 wiring]` asserting `buildUserAccounts(...)` returns a function `adminRouter`.
- `structure.config.json`: dirsize override `"apps/api/src/user-accounts": 34` plus its reason in `$comment`.

## Evidence
Pre-check[M-1]: be587455 node --test --import tsx apps/api/src/user-accounts/admin-router.test.ts -> 21 passed, 0 failed
Pre-check[M-2]: be587455 node --test --import tsx apps/api/src/user-accounts/principal.test.ts apps/api/src/user-accounts/auth-router.test.ts apps/api/src/user-accounts/auth-service.test.ts apps/api/src/user-accounts/throttle.test.ts -> 48 passed (9/15/17/7), 0 failed
Pre-check[M-3]: be587455 pnpm -s lint:structure -> ok, 10 stages incl. dirsize (scripts/lint-dirsize.mjs); tsc --noEmit on apps/api exit 0
Tests[M-1]: apps/api/src/user-accounts/admin-router.test.ts — holds the new [A6 wiring] test and the A6 router suite the wired router serves
Tests[M-2]: apps/api/src/user-accounts/principal.test.ts apps/api/src/user-accounts/auth-router.test.ts apps/api/src/user-accounts/auth-service.test.ts apps/api/src/user-accounts/throttle.test.ts — the importers of the edited composition module and the A3/A4 mounts it shares
Tests[M-3]: scripts/lint-dirsize.mjs — the budget stage the config change feeds
Falsification[M-1]: drop `adminRouter` from the returned runtime (per-mutation byte backup, restored, bytes equal) -> `[A6 wiring]` red by assertion; restored -> green.

## Open points (declared, not defects)
1. **`buildUserAccounts` has no production caller.** `composition/production.ts` never sets `ServerDeps.userAccounts`, so `/auth` and `/admin` are not mounted in production even with `AUTH_CSRF_SECRET` set. Enabling it is a separate unit (`ua-production-enable`): `production.ts` is at exactly its 300-line budget, so the one-line enablement needs headroom first. Queued in `qa/QUEUE.md`; needed before A9.
2. Real Mongo for the admin store is proven by A6's own `admin.mongo.test.ts` (both A6 checkers ran it); this unit adds no store code.
