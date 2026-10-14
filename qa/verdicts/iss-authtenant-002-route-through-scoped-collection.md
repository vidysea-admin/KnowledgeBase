# Verdict - iss-authtenant-002-route-through-scoped-collection
VERDICT: PASS
Cycle checked: 0
Commit checked: d74874f9 (lane/authtenant2). Security class (tenancy), full ceremony.

## EXPLANATION
PASS at the unit's stated scope. No tenant-B-reachable unscoped site was found. ISS-AUTHTENANT-002 is NOT closed: 5 hand-built sites remain by design (ISS-AUTHTENANT2-001, plus the cross-tenant verify and the two external-DB sites), so the row stays open.

### 1. Full classification of apps/api/src (non-test) collection access
Grep of every find/findOne/insert*/update*/replaceOne/delete*/aggregate/bulkWrite/countDocuments/distinct/findOneAndUpdate, plus every `.collection(`/`getDb()`/`appDb()`/`MongoClient`, including multi-line chains. No aggregate, distinct or findOneAndUpdate exists.
- SCOPED (scopedCollection / @lkb/db accessor): store.ts api_keys list/create/revoke, tree_index load, graph root, jobs writer, sessions/session_pages/claims/turns/graph_edges reads; ingest-store.ts sources/sessions/turns inserts; indexing/session.ts tree_index read, chunks/claims/session_pages/sessions; promote-entities, vector-gap; ask-arms, ask/source-context, search-store, jobs/store, system-status-store (all via scopedCollection).
- DELIBERATELY UNSCOPED, justified: store.ts:48 api_keys.verify {keyHash} (tenant does not exist yet); activity-health/queue-reader.ts (own client, single configured tenant, see 3); whatsapp/store.ts external-DB reads keyed by ownerUserId (owner resolved from the authenticated tenant via resolveOwner, never client-supplied).
- HAND-BUILT {tenantId} FILTER, helper cannot express (filed ISS-AUTHTENANT2-001): indexing/session.ts:282 tree_index.replaceOne; whatsapp/store.ts:148, 163 replaceOne, :180 bulkWrite. All behind assertValidTenantId, filter and replacement carry tenantId, tenant is req.auth-derived. Tenant B cannot overwrite A's row (filter includes B). Residual: whatsapp source/session/turn _ids are bare hashes (T045TENANTID-001), so a colliding _id under another tenant would raise a duplicate-key error on upsert, not a read or overwrite. Not a disclosure.
- MISSED: none.

### 2. api_keys.verify
Safe. The returned tenantId comes from the stored key record; requireAuth then re-validates it (isValidTenantId) and sets req.auth. No handler reads a tenant from header, query, body or params (grep clean); X-LKB-Tenant is only ever a response header (brain.ts:177). Mutation M7 (auth takes tenant from x-lkb-tenant) SURVIVED the suites, so that property is true by code but unasserted (see ISSUES).

### 3. queue-reader
One deployment serves exactly one tenant: config is UPLOAD_TENANT_ID from env, any other requested tenant throws before connect; rows are re-checked against the configured tenant. It cannot serve several tenants. Multi-tenant use would need new config, so it is an operational limit, not a leak.

### 4. Converted inserts
tenantId is stamped by the helper as `{ ...doc, tenantId }` (tenantId last), so a caller-supplied doc tenantId cannot win; reads use `{ ...filter, tenantId }`. createKey no longer passes tenantId at all.

### 5. Cross-tenant probes
scoped-routing.test.ts (18 tests) over the filter-evaluating BlindDb with ids shared across tenants: B cannot list/revoke/overwrite A's keys, B gets no A tree or graph root, job and ingest rows land only under B, A's rows byte-identical, 13 hostile tenant values refused with zero DB contact. No real MongoDB.

### 6. Mutations (per-mutation byte backup, restore in finally, timeout, git hash-object == HEAD blob after each; harness untracked and deleted)
| id | mutation | result |
|---|---|---|
| M1 | listKeys raw find | KILLED (2 fail) |
| M2 | revokeKey raw collection | KILLED (1 fail) |
| M3 | ingest turns stamped "tA" | KILLED (2) |
| M4 | jobs writer scoped to "tA" | KILLED (2) |
| M5 | tree load raw findOne({}) | KILLED (7) |
| M6 | session.ts root read raw findOne({}) | KILLED (2) |
| M7 | auth.ts tenant from x-lkb-tenant header | SURVIVED (not equivalent: unasserted) |
| M8 | helper insertOne order `{tenantId, ...doc}` | SURVIVED (no current caller supplies a conflicting doc tenantId; unasserted) |
| M9 | graph root raw findOne({}) | KILLED (2) |
7 killed, 2 survived, both filed low as test gaps. Not a FAIL: neither is a reachable path at HEAD.

### 7. Evidence
tsc --noEmit (apps/api) exit 0. scoped-routing + store-guards + caller-visible: 139 pass, 0 fail. ask, indexing, whatsapp, routes, server, search-store, production, single-source: 340 pass, 0 fail. Manifest claim of 478 not re-derived; my superset subsets are green. The ledger row records `reproduction: n/a`, so there are no recorded attacks to replay; the 13-value hostile table is the verdict corpus and passes 13/13 per site.

### ingest-store.ts lines changed by this lane (for the tenantsrcid integrator)
Exactly four single-line hunks: line 12 (import: drops getDb, adds sources/sessions/turns accessors), 43 (`sourcesColl(tenantId).insertOne(source)`), 56 (`sessionsColl(tenantId).insertOne(session)`), 67 (`turnsColl(tenantId).insertMany(turnDocs)`). Nothing else in the file.

ISSUES-WRITTEN: ISS-AUTHTENANT2-002 (low, test gap: no test pins that auth ignores X-LKB-Tenant and that insertOne ignores a doc-supplied tenantId). Low, file-only, not a unit.
