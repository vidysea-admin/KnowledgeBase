# iss-t057screen-001-status-counts-tenant-scope

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2-equivalent (security class: tenancy / cross-tenant read; fixes ISS-T057SCREEN-001, severity medium but security class so full ceremony).
Lane: lane/statusscope. Ledger for this lane: qa/issues.statusscope.jsonl (ISS-STATUSSCOPE-001).

## Scope (one package: apps/api)
- `src/routes/system-status.ts` (new): `GET /system-status`, mounted AFTER `requireAuth` and the rate limiter in `server.ts`. Tenant = `req.auth.tenantId` only (never query/body/header). Body rebuilt as `{db, collections}`. Reader failure -> 503 `{db:"error",collections:{}}`; no reader wired (`unavailableSystemStatusDeps`, default) -> fail closed 503.
- `src/system-status-store.ts` (new): `createMongoSystemStatusDeps(db?, names?)`: every count is `scopedCollection(db,name)(tenantId).countDocuments()` (withTenant-merged); ping failure -> `{db:"error",collections:{}}`. Collection names from `schema/index.json` as `/health` does.
- `src/server.ts`: optional `ServerDeps.systemStatus`, mount. `src/composition/production.ts`: wires the Mongo deps.
- Not changed: `/health` (unauthenticated, service-wide counts; contract health-route.md) and apps/web.

## Evidence (apps/api, node off PATH, one file at a time)
- `node --test --import tsx src/routes/system-status.test.ts` -> `tests 8, pass 8, fail 0`.
- `... src/routes/health.test.ts` -> `tests 19, pass 19, fail 0`; `... src/server.test.ts` -> `tests 8, pass 8, fail 0`; `... src/jobs/fixture-store.test.ts` -> `tests 3, pass 3, fail 0` (covers buildProductionDeps).
- `node C:\...\KnowledgeBase\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` (apps/api, worktree packages) -> exit 0, no output.
- Two-tenant test: fake db holds A: sessions 3, claims 2; B: sessions 11, claims 40. A's key -> `{sessions:3,claims:2}`, B's -> `{11,40}`; every recorded count filter is exactly `{tenantId:"A"}`; `?tenantId=B` + `x-tenant-id: B` with A's key still returns A's counts; no key / bad key -> 401 with no counts.

### Reproduction count per issue id
- ISS-T057SCREEN-001: the ledger row records 2 reproductions, both source greps. #1 (`sed -n '60,80p' apps/api/src/server.ts`, /health mounted before requireAuth) is asserted by the test and remains TRUE by design (contract C5): 0/1 closed, named OPEN. #2 (`grep -n apiFetch apps/web/src/pages/system-status/statusClient.ts`) is in apps/web, not edited: 0/1 closed, named OPEN (filed as ISS-STATUSSCOPE-001). What IS closed: the exposure path itself, i.e. a tenant-scoped authenticated endpoint exists and is proven (two-tenant 8/8), but the page keeps showing all-tenant counts until the web unit switches it. Do not mark the issue fixed on this unit alone.

## Assumptions (fail-closed choices)
- Chose a NEW authenticated route rather than changing `/health`, because `/health` is an unauthenticated ops probe frozen by contract (C1/C2/C5) and changing it needs the Approver.
- Collections without a `tenantId` field count 0 for every tenant (scopedCollection filter), not their total.
- `/system-status` omits watchSilent/watchUnreadable (those are service-wide; not tenant data).

## NOT covered
- apps/web switch to `/system-status` (second package) and the dead 403 branch / Authorization header on /health.
- Whether `/health` keeps anonymous all-tenant counts (Approver decision).
- Real Mongo: tests use a fake db; no mutation run was done (no harness), so the scoping assertions are unmutated.
- `/system-status` has no scope requirement beyond a valid key (any valid key sees its own tenant's counts).
