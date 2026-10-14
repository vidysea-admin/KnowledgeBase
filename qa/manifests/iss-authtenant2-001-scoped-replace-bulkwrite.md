# iss-authtenant2-001-scoped-replace-bulkwrite

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: tenancy / data writes (open ledger issue ISS-AUTHTENANT2-001, medium; parent ISS-AUTHTENANT-002). Class: security (tenancy) + data write: FULL ceremony. Verdict by the checker only.
Lane: lane/scopedwrite (base 50508fa8). Ledger rows ISS-AUTHTENANT2-001 and ISS-AUTHTENANT-002 status NOT changed here. No new issues filed.
Ready for a checker verdict on ISS-AUTHTENANT-002 as well (all 13 originally listed sites converted or justified, table below). Maker does not flip it.

## What was wrong
`scopedCollection` (packages/db/src/lib/tenantScope.ts) had no replaceOne / bulkWrite, so four sites kept hand-built `{tenantId}` filters: tree_index replaceOne (indexing/session.ts), WhatsApp sources + sessions replaceOne and turns bulkWrite (whatsapp/store.ts).

## Change
- `replaceOne(filter, replacement, options?)`: filter = `withTenant`; replacement = `{ ...replacement, tenantId }` (tenant last, a caller value cannot win); upsert therefore matches only this tenant and inserts stamped.
- `bulkWrite(ops, options?)`: every op rewritten. insertOne document stamped; replaceOne filter merged + replacement stamped; updateOne/updateMany filter merged + update pinned; deleteOne/deleteMany filter merged. An unknown op type, an op with 0 or 2+ keys, or a non-object op throws BEFORE the driver is called (even with valid ops earlier in the array). Op fields other than filter/document/replacement/update (upsert, collation, hint, arrayFilters) are preserved.
- `pinUpdate` (applied to bulkWrite updates AND the existing `updateOne`): inside `$set`/`$setOnInsert` a `tenantId` key is OVERRIDDEN with the scoped tenant (existing callers pass the correct one, so their bodies are byte-identical; ISS-126/156 tests still pin it); any other mention (`$unset`, `$rename` from/to, `$inc`...) is dropped; an update that never mentions it passes through untouched; aggregation-pipeline (array) updates are refused. This closes a "move my row to tenant X" write that the previous `updateOne` allowed. Policy note: it changes `updateOne` behaviour only for callers that put a WRONG tenantId in an update, which no current caller does.
- Sites: session.ts tree_index write; whatsapp/store.ts sources replaceOne, sessions replaceOne, turns bulkWrite, and the legacy-source `findOne` added by tenantsrcid (was a hand-built `{_id, tenantId} as never`). `assertValidTenantId` at the top of `ingestGroup` is kept; the accessor re-asserts per write.
- `store-mongo-snapshot.test.ts` mocks `@lkb/db`; its mock now supplies the real `scopedCollection` (one import + one key). Nothing else in existing tests changed.
- Job-queue files (packages/core) not touched.

## ISS-AUTHTENANT-002: the 13 originally listed sites
| site | state |
|---|---|
| store.ts:61,141,210,222,234 (api_keys list/create/revoke, tree_index findOne x2) | converted by authtenant2 (merged) |
| indexing/session.ts:32 (tree_index read) | converted by authtenant2 |
| indexing/session.ts:265 (tree_index replaceOne) | converted HERE |
| whatsapp/store.ts:147,162,181 (replaceOne x2, bulkWrite) | converted HERE (+ legacy findOne) |
| packages/index/src/tree/build.ts:49 `treeIndexRootFilter` | justified: pure filter builder; every call site now passes it to a scoped accessor, which re-merges tenantId (the helper is also asserted by treeIndexRootFilter single-source test) |
| activity-health/queue-reader.ts:33 | justified (checker verdict s3): reads a separate upload-queue DB for ONE configured tenant (env UPLOAD_TENANT_ID), any other requested tenant throws before connect, rows re-checked; cannot serve several tenants |
| scripts/mint-key.mjs:42 deleteMany({tenantId,label}) | justified: operator CLI, tenant from argv (not a request), validated with assertValidTenantId before connecting; no request path |
Maker did not convert mint-key.mjs / queue-reader (outside the four sites assigned); the checker may disagree with the justification.

## Reproductions
ISS-AUTHTENANT2-001 row records `reproduction: n/a (no reachable path)`: no recorded attacks to replay. Corpus used: ids shared across tenants (A rows sitting on exactly the filter/_id B writes with), forged tenantId in replacement/insert/update, 6 hostile tenant values per method, 6 bad op shapes. ISS-AUTHTENANT2-001: 0/0 recorded.

## Evidence (node from toolchain; no browser/real Mongo; fakes evaluate equality filters)
```
packages/db  src/lib/tenantScope.write.test.ts + tenantScope.test.ts   ℹ tests 33   (package: tests 52 pass 52 fail 0)
apps/api     src/tenant-guards/scoped-write.test.ts                    ℹ tests 3 pass 3 fail 0
apps/api     full "src/**/*.test.ts"                                   ℹ tests 740 pass 739 fail 1
```
The 1 failure is activity-health/router.test.ts "actual producer -> Python...": ENV GAP, the worktree has no `.venv` (test spawns `<root>/.venv/Scripts/python.exe`). With `D2_FIXTURE_PYTHON=<main tree>/.venv/Scripts/python.exe` it passes 3/3. Unrelated to this change; passes in the main tree.
tsc --noEmit: packages/db clean; apps/api clean with a temporary tsconfig `paths` mapping @lkb/db to this worktree's source (file deleted before commit; @lkb/db otherwise resolves to the main tree, which lacks the new methods until merge, so apps/api runtime tests were also run with TSX_TSCONFIG_PATH pointing at that temp config).
Tests are per op type: insertOne/updateOne/updateMany/replaceOne/deleteOne/deleteMany each get a cross-tenant test (A byte-identical, forged tenant overridden), plus replaceOne (no-upsert, upsert, forged), update pinning (7 operator shapes), pipeline refusal, 6 bad-op shapes, hostile tenants. Site probes: tree_index (A's colliding root untouched, B's stamped), WhatsApp sources/sessions/turns (A rows on B's exact ids untouched, every write filter AND document carries B, `returned` 0 for each), legacy fallback does not adopt A's bare-hash source.

## Mutations (12/12 killed; harness `.mut-scopedwrite-lane.mjs`, untracked, deleted before commit; per-mutation byte backup, restore in finally, 120 s timeout per run, git hash-object == HEAD blob after each, no mismatch)
M1 bulkWrite deleteOne/deleteMany filter not merged (the "drop scope in one op type" mutation): KILLED (4 fail). M2 updateOne/updateMany filter not merged: KILLED (3). M3 replaceOne stamp order swapped: KILLED (2). M4 replaceOne filter raw: KILLED (3 db + 3 api). M5 bulkWrite insertOne stamp order: KILLED (1). M6 unknown op types accepted: KILLED (1). M7 bulkWrite replacement not stamped: KILLED (2). M8 pinUpdate stops overriding $set tenantId: KILLED (2). M9 session.ts tree_index raw unscoped write: KILLED (4). M10 WhatsApp turns bulkWrite on the wrong tenant: KILLED (3). M11 WhatsApp sessions replaceOne raw: KILLED (3). M12 legacy source findOne raw: KILLED (2).

## Not delivered / not verified
No real MongoDB: upsert behaviour is exercised against a fake (a real upsert with a colliding `_id` under another tenant would raise duplicate-key, not overwrite; ISS-TENANTSRCID-001 still covers the bare-hash session id). Multi-process tests: none added. Full monorepo suite not run (apps/api and packages/db only).
