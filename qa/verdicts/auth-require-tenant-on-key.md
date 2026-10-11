# Verdict - auth-require-tenant-on-key

VERDICT: FAIL
Cycle checked: 0
Commit checked: 34e6747 (lane/authtenant, base 6677e1b). Independent checker, security class, full ceremony.

The security fix itself is correct and complete. FAIL is for one reason under the verdict rules: the edited isolation test no longer exercises anything below auth (ISS-AUTHTENANT-001). Repair is a test-only addition.

## Scope
`git show --stat 34e6747`: auth.ts (+11/-1), tenantScope.ts (+14/-1), require-scope.test.ts (+79), tenantScope.test.ts (+12), ask-tenant-isolation.test.ts (1 assertion, 404 -> 401), manifest. All diffs read.

## Operator-object finding: CONFIRMED (filter evidence; fake collection recording the filter)
Base 6677e1b `withTenant`/`coll()`, recorded filter on find, findOne, updateOne, deleteMany, countDocuments:
- {$ne:null} -> {"tenantId":{"$ne":null}}; {$gt:""}, {$exists:true}, {$in:["a","b"]}, {$regex:".*"} -> operator object under tenantId (all five verbs)
- array -> {"tenantId":["t1"]}; 5 -> 5; true -> true; " t1", "t1 ", "t\n", NUL, U+2028 passed through; Date -> ISO string; Proxy/toString-object -> {}
- undefined, null, "" -> coll() throws (old guard); withTenant(undefined) -> {} (no guard at all)
HEAD 34e6747: every one of those (plus bigint, symbol, function, RegExp, String wrapper, Proxy, Proxy(String), U+0085) THROWS `tenantId is required` from both coll() and withTenant; nothing reaches the driver. Valid ids (toc, tenant-1, tA, t, system, synthetic-capture, "a b", accented, inner NBSP) give {"tenantId":<id>}.

## Reachability of a non-string tenant (every caller)
- Express 5.2.1, `express.json()` only; default query parser is "simple", so `?tenantId[$ne]=` is a flat string, never an object. No handler reads a tenant from body, query, params or headers (every route uses req.auth!.tenantId; POST /keys ignores a body tenantId, tested; the ask test covers body/query/header overrides).
- req.auth.tenantId comes from a stored api_keys record (store.ts:47, unvalidated): a corrupted or hand-edited record could hold an object. This is the only path (ISS-AUTHSCOPE-001's). No client-reachable path found, so no standalone exploit issue.
- Constants and config: "system", "toc", WATCH_HEARTBEAT_TENANTS (trim+filter), UPLOAD_TENANT_ID (trimmed), LKB_TENANT_ID (regex-validated in pipeline/calendar/meeting-candidates), CLI --tenant (strings). No job-payload or webhook tenant: indexSession and whatsapp/ingest take req.auth.

## Guard coverage
packages/db/src: `coll()` (find, findOne, insertOne, insertMany, deleteMany, countDocuments, updateOne; no aggregate exposed) and `withTenant` guarded; collections/*.ts only call scopedCollection; no other builder in packages/db. Outside the package, hand-built unguarded tenant filters (fed by req.auth, env or CLI): store.ts api_keys (:210,222,234), tree_index via treeIndexRootFilter (packages/index build.ts:49; store.ts:61,141; indexing/session.ts:32,265; ANDed with node_id so an object cannot match), whatsapp/store.ts replaceOne/bulkWrite (:147,162,181), activity-health/queue-reader.ts:33, scripts/mint-key.mjs:42. Filed ISS-AUTHTENANT-002 (medium, defence in depth).

## Unscoped DB accesses
api_keys (auth by keyHash; keys routes filter by req.auth tenant); tree_index (above); /health cross-tenant counts by design (store.ts:261); whatsapp store (external DB keyed by ownerUserId resolved from the authenticated tenant via owner map); activity-health jobs by trimmed env tenant. Nothing queries tenant-owned data with a client-supplied tenant.

## requireAuth (HTTP probe, GET /keys, headers compared)
Unknown key, tenantId "", {$ne:null}, 5, missing: all 401, identical body `{"error":"unauthorized","message":"invalid or revoked API key"}` and identical header set; store.verify called for all (6 lookups, so the check is after the lookup); no log (test); good key "toc" 200. requireScope hardening intact. D-015: ISS-AUTHSCOPE-001 4/4 recorded cases (missing, null, "", 5) refused with 401 on GET /keys and GET /calendar/join-rules, handlers never called.

## Isolation-test ruling: WEAKENED (ISS-AUTHTENANT-001)
At 6677e1b a key with tenant ""/undefined reached /ask, the route called tree.load, got 404, and the test asserted no turns/chunks query and zero rows. Now requireAuth returns 401, the route never runs, and those assertions are vacuously true. Probe with auth bypassed (createAskRouter behind a stub middleware): tenant "", undefined and {$ne:null} each give 404 after tree.load receives the raw value, so route safety rests on the tree store alone and is no longer asserted. Arms (:203) and hydrator (:244) empty-tenant tests survive but do not cover the route or tree store. Required repair: an auth-bypassing route-level test.

## Integration gap (confirmed)
`import.meta.resolve("@lkb/db")` from apps/api => file:///C:/Users/product/Desktop/KnowledgeBase/packages/db/src/index.ts (MAIN tree). My probes imported this lane's tenantScope.ts directly. No caller passing a legitimate id newly breaks; only whitespace-padded or control-char ids (previously queried as odd strings) now throw; empty/undefined already threw. Stored keys with padded tenants would now 401. Recorded as ISS-AUTHTENANT-003 (low): run the apps/api suite once after merge.

## Commands (node 24.19.0, timeouts)
- require-scope.test.ts: tests 21 pass 21 fail 0
- packages/db `src/**/*.test.ts`: tests 29 pass 29 fail 0 (includes the new invalid-tenant test)
- apps/api `src/**/*.test.ts`: tests 387 pass 386 fail 1
- Failing test: `activity-health/router.test.ts:60` "actual producer -> Python ...". It spawns `<root>/.venv/Scripts/python.exe` (router.test.ts:136); the worktree has no .venv (the main tree does), so child.status is null (`null !== 0`). ENVIRONMENTAL, unrelated to auth.
- tsc --noEmit apps/api exit 0; packages/db exit 0. `lint-dirsize: OK (112 dir(s) within budget)`.

## Mutations (per-mutation byte backup, finally-restore, 120 s timeout; hash == HEAD verified after each)
| M | mutation | result |
|---|---|---|
| M1 | db guard back to `!tenantId` | killed (fail 1) |
| M2 | db guard coerces/accepts objects | killed (fail 1) |
| M3 | withTenant skips the guard | killed (fail 1) |
| M4 | db skips control-char rule | killed (fail 1) |
| M5 | auth accepts numeric tenant | killed (fail 2) |
| M6 | auth malformed-tenant 401 has a different message | killed (fail 1) |
| M7 | auth skips control-char rule | killed (fail 1) |
| M8 | auth guard removed | killed (fail 3) |

8/8 killed. HEAD fidelity: auth.ts 312fca5b75db14ee9cd95831b2717489df6b1124, tenantScope.ts 92604cbebefac1af7135fb9ea3b01bd093c90f28, both equal the HEAD blobs.

ISSUES-WRITTEN: ISS-AUTHTENANT-001 (high, fix required), ISS-AUTHTENANT-002 (medium, file-don't-fix), ISS-AUTHTENANT-003 (low), in qa/issues.authtenant.jsonl.
Recommended change (orchestrator): flip ISS-AUTHSCOPE-001 to fixed-by auth-require-tenant-on-key only once cycle 1 passes; not on this verdict.

EXPLANATION: Tenant validity at the auth and accessor layers is fixed and well mutation-tested; the operator-object hole was real but reachable only through a corrupted key record. The unit fails only because it turned the sole route-level empty-tenant test vacuous without replacing it. Cycle 1 needs one auth-bypassing route test; no source change.
