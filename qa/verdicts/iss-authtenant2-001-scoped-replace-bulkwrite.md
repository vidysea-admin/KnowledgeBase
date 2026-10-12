# Verdict - iss-authtenant2-001-scoped-replace-bulkwrite
VERDICT: PASS
Cycle checked: 0
Commit checked: 062dc3bd (code 1b481a4d, lane/scopedwrite, base 50508fa8). Security class (tenancy + data write), full ceremony.

## EXPLANATION
No bypass of the tenant pinning found. ISS-AUTHTENANT2-001 is fixed. ISS-AUTHTENANT-002 can be flipped to verified (judgment in section 4); I have not edited the ledger rows.

### 1. Bypass probes (recording fake over scopedCollection, no DB)
- Dotted `$set {"tenantId.x"}`: dropped. `$rename {tenantId:..}` and `{a:"tenantId"}`: dropped. `$unset tenantId`: dropped. `$set`+`$setOnInsert` tenantId "A": both overridden to B.
- `$rename {a:"tenantId.x"}` passes through, but the server rejects it (tenantId is a string); not a mutation.
- Pipeline update refused in updateOne and in bulkWrite updateOne (0 driver calls).
- Filter with `$or`/`$expr`/own `tenantId:"A"`: top-level `tenantId` forced to B, so the clause is ANDed; upsert inserts from the B equality. arrayFilters preserved, irrelevant to tenantId.
- Replacement carrying `tenantId:"A"` or another tenant's `_id`: tenant stamped B last. A foreign `_id` can only collide, and a collision raises duplicate-key (upsert) or an immutable-_id error; neither reads nor overwrites A. null/array replacement is harmless (stamped).
- bulkWrite: unknown op, multi-key op, null, string, `{}`, inherited-key op, all rejected before any driver call even when a valid op precedes them (7/7). updateMany/deleteMany/replaceOne/insertOne inside bulkWrite are all merged/stamped (verified in output).
- Two low findings, filed not fixed (ISS-SCOPEDWRITE-001): pinUpdate drops any value equal to the string "tenantId", and a mixed doc `{$set:{a:1}, tenantId:"A"}` is passed through (server rejects it). Not exploitable.

### 2. Stricter updateOne vs callers
Every updateOne/bulkWrite/replaceOne caller across apps, packages and scripts was read: all use `$set` (some with `tenantId` = the scoped tenant, byte-identical after pinning, e.g. promote-entities, vector-gap) or `$addToSet`/`$setOnInsert` of non-tenant data. No `$unset`, `$rename`, `$inc`, `$push` or pipeline use anywhere. No caller semantics broken.

### 3. Unconverted sites
- treeIndexRootFilter: pure builder; the only consumers pass it to scoped accessors (session.ts, store.ts) which re-merge tenantId. Sound.
- queue-reader: separate DB, single env tenant, other tenants throw. Sound (as in the prior verdict).
- mint-key.mjs: operator CLI, argv tenant validated, no request path. Sound.
- Grep of `.collection(`/`getDb()`/`appDb()` in apps/api/src non-test: remaining raw uses are store.ts:48 api_keys verify (pre-tenant lookup), queue-reader, and the WhatsApp external-DB reads keyed by the auth-resolved owner. Nothing else hand-built. Outside apps/api, operator scripts (seed-demo-server, toc-recovery-import, toc-embedding-backfill, reingest-swap rootFilter) use raw collections; they are CLI scope, not request paths, and outside the ledger row's area.

### 4. ISS-AUTHTENANT-002
All 13 listed sites are converted or soundly justified; the prior verdict's open residue (5 hand-built sites) is the ISS-AUTHTENANT2-001 set, now converted and covered by cross-tenant tests and killed mutations. Recommend status verified. Caveat for the integrator: apps/api resolves @lkb/db to the MAIN tree in worktrees, so apps/api needs the merge (or a paths mapping) to run.

### 5. Mutations (harness untracked in worktree, deleted; per-mutation byte backup, restore in finally, 150 s timeout, git hash-object == HEAD blob after each: all true)
M1 keep non-$set tenantId mentions KILLED(1); M2 $setOnInsert unpinned KILLED(1); M3 pipeline allowed KILLED(1); M4 bulk updateOne/updateMany filter unscoped KILLED(3); M5 unknown op accepted KILLED(1); M6 multi-key op accepted KILLED(1); M7 dotted path not dropped SURVIVED (unasserted, ISS-SCOPEDWRITE-002); M8 bulk insertOne unstamped KILLED(2); M9 bulk deleteMany unscoped KILLED(4); M10 updateOne unpinned KILLED(2); M11 replaceOne stamp order KILLED(2); M12 WhatsApp turns bulkWrite wrong tenant KILLED(2). 11 killed, 1 survived (low test gap, code correct).

### 6. Evidence
- tsc --noEmit packages/db: exit 0. apps/api: exit 0 with a temporary tsconfig paths mapping @lkb/db to this worktree (deleted).
- packages/db full: tests 52, pass 52, fail 0.
- apps/api full (TSX_TSCONFIG_PATH to the mapping, D2_FIXTURE_PYTHON=main .venv): tests 740, pass 739, fail 1 in run 2 and 3; the failure was usage.test.ts "a hanging write does not delay the response" (timing, file untouched by this lane; 14/14 pass in 3 isolated reruns). The first full run showed 45 failures only because @lkb/db resolved to the main tree before the mapping was correct. Python fixture test passes.
- Ledger reproductions: both rows record `reproduction: n/a`, so 0/0 recorded; the 6 bad-op and hostile-tenant corpus passes.

ISSUES-WRITTEN: ISS-SCOPEDWRITE-001 (low, pinUpdate edge cases), ISS-SCOPEDWRITE-002 (low, dotted-path test gap). Both low, file-only, not units.
