# w23-onairbind: ISS-T045WORKER-002 OnAir session authority binding

Status: ready-for-check
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w23-onairbind (lane/w23-onairbind)
Base SHA: 3c99337fb64188bc5ed94b2f058ecf92c8823864

## Finding
Production binding already exists at base: `apps/api/src/source-intake/jobs/source-privacy.ts` (`approvedSourceSession`,
`sourceSessionStillApproved`) binds the cookie to LKB_ONAIR_SESSION_TENANT/ACCOUNT and an explicit per-event, per-actor
binding row, and `composition/integrations/source-jobs.ts` rechecks at enqueue, authorizeExecution and executeJob, and strips
the cookie otherwise. `privacy.test.ts` already replays the 4 filed ISS-T045WORKER-002 cases (4/4 at base).
No production code change was needed; this unit adds the requested negative matrix.

## Changed paths
- apps/api/src/source-intake/jobs/onair-binding.test.ts (new, 4 tests)
- qa/manifests/w23-onairbind.md

## Matrix (test names)
cross-tenant; unapproved event / unnamed actor / ambiguous duplicate grant; replayed authority (other event, other tenant,
forged authority fields) with zero worker calls; revoked/rotated authority after queueing (binding removed, actor removed,
approvalRef rotated, account changed, cookie rotated) plus passing control.

## Left open
Time-based expiry: the binding schema (exact keys, docs/t045-source-worker.md) has no expiry field. Adding one is a schema/policy
choice for Umesh; not decided here. Expiry-by-removal/rotation is covered and enforced fresh at every execution.

## Checks to run
cd apps/api; node --test --import tsx src/source-intake/jobs/onair-binding.test.ts src/source-intake/jobs/privacy.test.ts
tsc --noEmit -p apps/api/tsconfig.json (101 pre-existing environment errors, none in touched files); lint-loc --all: all stages exit=0

## Evidence
D-015 ISS-T045WORKER-002: 4/4 filed reproductions refuse with zero page/tool/provider (privacy.test.ts, 12 pass 2 skipped).
New tests: 4 pass. D-020 mutations on source-privacy.ts, each caught: drop actor check (1 fail), drop event check (2 fail),
drop tenant check (1 fail), loosen fresh-authority comparison (2 fail). HEAD hash after: e85100860b73... equals HEAD blob.
