# Verdict: iss-t057screen-001-status-counts-tenant-scope

VERDICT: PASS
Cycle checked: 0
Commit checked: 5c1f23b (lane/statusscope)
Scope: PASS means the new `GET /system-status` endpoint is tenant-safe and the manifest is honest. ISS-T057SCREEN-001 stays OPEN (ledger status untouched): `/health` still serves all-tenant counts unauthenticated and apps/web still calls it.

## EXPLANATION

- Isolation: tenant is `req.auth?.tenantId` only; no read of query/body/params/headers in the route. Auth gives a tenantId that `isValidTenantId` already vets (non-empty, trimmed, no control chars); a missing one is 401 in the route and, independently, `scopedCollection(...)(tenantId)` throws on an invalid id (assertValidTenantId), which the store turns into 503 `{db:"error",collections:{}}`. Every count is `scopedCollection(handle,name)(tenantId).countDocuments()` which merges `{tenantId}` via withTenant; no raw collection, no estimatedDocumentCount. Mounted after `requireAuth` and the rate limiter in server.ts; unwired default is `unavailableSystemStatusDeps` (503). The two-tenant test uses the real server, real keyStore fake, real route and real scopedCollection; only the Mongo handle is faked, and its fake counts by the filter it receives (so a dropped tenant filter changes the numbers: mutation 1).
- Scope: comparable read routes (/claims, /graph, /calendar/upcoming) use `requireScope`; `/system-status` needs only a valid key. It returns only the caller's own tenant counts, so this is not a disclosure. Low, note only (the manifest names it).
- Collections without tenantId: from schema/*.schema.json only `tenants` (keyed by `_id`, listed in schema/index.json) and `features_event` (not in index.json, not counted) lack it. So `tenants` reports 0 for every tenant. Safe but slightly misleading (a tenant's own row exists). Low; the web unit could omit or special-case it. Not filed.
- `/health` claim is TRUE. qa/contracts/health-route.md C2: "Counts are aggregate only ... `db.collection(name).countDocuments()` with no filter argument (a bare, unscoped count)"; C5: "Unauthenticated by design, mounted before `requireAuth`"; C1: "exactly `{db, collections}`"; tradeoff section: "Exposing 'collection X has N documents' to an unauthenticated caller is not a hard security bug ... but it does leak coarse business-volume signals". Unauthenticated `/health` discloses today: `db`, `collections` (one key per schema/index.json collection, value = ALL-tenant count), `watchSilent`, `watchUnreadable` (counts only). C1 is stale vs the route (extra watch fields; already noted in ISS-T057SCREEN-001). The Approver must rule on keeping the anonymous all-tenant `collections` field.
- Tests (own run, apps/api): system-status 8/8, health 19/19, server 8/8, fixture-store 3/3 (reported by maker; first three re-run and green; all four exit 0 in my runs), `tsc --noEmit -p tsconfig.json` exit 0.
- Mutations (5, harness `statusscope-chk`, per-mutation byte backup, restore in finally, deleted afterwards), all killed by system-status.test.ts: (1) drop scopedCollection for bare `collection(name).countDocuments()` 4 fail; (2) tenant from `req.query.tenantId` 2 fail; (3) router mounted before requireAuth 6 fail; (4) reader error answered 200 1 fail; (5) ping error reported `db:"ok"` 1 fail. 5/5 killed, 0 survivors.
- HEAD fidelity: `git hash-object` equals `git rev-parse HEAD:<file>` for system-status-store.ts, routes/system-status.ts, server.ts; `git status --porcelain` clean before this verdict was added.

ISSUES-WRITTEN: none

## Merge conditions
Safe to merge as a building block. Do not close ISS-T057SCREEN-001 until ISS-STATUSSCOPE-001 (web switch) lands and the Approver rules on `/health`.
