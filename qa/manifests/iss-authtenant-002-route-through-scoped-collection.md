# iss-authtenant-002-route-through-scoped-collection

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2-adjacent (open ISS-AUTHTENANT-002, medium, tenancy class). Full ceremony. Lane: lane/authtenant2, ledger shard `qa/issues.authtenant2.jsonl`. ISS-AUTHTENANT-002 row status NOT changed here.

## Scope
Route hand-built `{tenantId}` Mongo access in apps/api/src through `scopedCollection` / `@lkb/db` accessors (validated tenant, merged into every filter). Prior verdict `qa/verdicts/tenant-filter-guards-outside-db.md`: 12/13 sites guarded, open one is `treeIndexRootFilter`. Not touched: routes/health.ts, indexing/vector-gap.ts, packages/ingest, packages/*.

## Converted (apps/api/src)
- store.ts: `api_keys` list/create/revoke (`apiKeysColl`), `tree_index` load and graph root (`treeIndexColl`, still fed by `treeIndexRootFilter`), jobs writer (`@lkb/db` `jobs(tenant)`).
- ingest-store.ts: sources/sessions/turns inserts via `@lkb/db` accessors.
- indexing/session.ts: `loadTreeRoot` via `scopedCollection`.
Existing assertValidTenantId guards kept (they run before any side effect).

## NOT converted - helper cannot express or deliberate (STOP, per case)
1. store.ts `api_keys.verify` findOne `{keyHash}`: DELIBERATE cross-tenant lookup; the tenant is derived from the key, so no tenant exists yet.
2. indexing/session.ts `tree_index.replaceOne(..., {upsert:true})`: helper has no replaceOne.
3. whatsapp/store.ts replaceOne x2 (sources, sessions) and `turns.bulkWrite`: helper has no replaceOne/bulkWrite.
4. activity-health/queue-reader.ts `jobs.find({tenantId,...})`: separate MongoClient from env config, not `getDb()`.
5. whatsapp/store.ts reads of the external WhatsApp DB (messages/people/groups/tracking): keyed by ownerUserId, not tenantId.
Adding replaceOne/bulkWrite to packages/db's helper is an API change outside this lane's brief; needs a decision.
packages/index `treeIndexRootFilter` itself still takes any string (callers in apps/api are now covered by the accessor); scripts/ callers not in scope.

## Evidence
- `apps/api` tsc --noEmit: exit 0.
- New `src/tenant-guards/scoped-routing.test.ts`: 18/18 pass (5 cross-tenant isolation tests with ids shared across tenants + 13-value hostile table over all converted sites, zero DB contact).
- Affected suites (ask, tenant-guards, indexing, server, whatsapp, routes, search-store, production, single-source): 478 pass, 0 fail.
- Replay of ISS-AUTHTENANT-002 recorded cases: row records `reproduction: n/a`; no attack strings. Replayed the 13-value hostile corpus the verdict used per converted site: 13/13 refused (new test) plus existing store-guards 13/13 unchanged and green.
- Mutations (byte backup per mutation, restored in finally, hash == pre-mutation blob each time): M1 revoke raw/unscoped KILLED; M2b tree load raw/unscoped KILLED (M2 same filter but still via accessor SURVIVED: equivalent, the accessor re-merges tenantId); M3 listKeys raw find KILLED; M4 ingest turns stamped tA KILLED; M5 jobs scoped tA KILLED; M6 indexSession root read tA KILLED; M7 graph root raw KILLED.
