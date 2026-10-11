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

---

# Cycle 1 verdict

VERDICT: FAIL
Cycle checked: 1
Commit checked: 77b4652 (lane/authtenant). Independent checker, security class. `git diff 5a55653 77b4652`: only apps/api/src/ask/ask-tenant-hostile.test.ts (new) and the manifest; no production file changed.

## Real or replica (point 1)
The route-level tests run the REAL `createAskRouter`, `requireScope`, `createSourceRequestDepsFor`, `createSourceHydrator`, `createAskArmsFor`, and the real `treeIndexRootFilter` (main-tree `@lkb/index`) and `scopedCollection` (main-tree `@lkb/db`), over a hand-written tenant-blind fake Db. The ONE replaced piece is `createMongoTreeStore().load` in apps/api/src/store.ts: `treeStore()` in the test is a hand copy. The maker's claim that the real store cannot take an injected Db is false: `node:test` `mock.module("mongodb", ...)` (with `--experimental-test-module-mocks`) lets the real `@lkb/db` `connect()`/`getDb()` and the real `createMongoTreeStore().load("tB")` run against a fake client. I ran it (temp test, deleted) and the real filter was `{"node_id":"tenant:tB","level":"tenant","tenantId":"tB"}`. So a regression in the real `load` is catchable and is not caught.

Production mutations (one at a time, per-mutation byte backup, finally-restore, 170 s timeout; test set = hostile + isolation + source-context + ask-arms + routes/ask + server + tree-index-root-filter-single-source tests):
| M | mutation | result | killed by |
|---|---|---|---|
| M3 | ask router reads tenant from body | killed | isolation "tenant-like body fields, query string and headers cannot override the key-derived tenant"; C6 arms-per-request |
| M4 | ask router reads tenant from x-tenant header | killed | same isolation test |
| M5 | router passes fixed "tA" to requestDepsFor | killed | hostile positive control, bypassed-tree cases |
| M6 | router passes String(tenant) to tree.load | killed | hostile route tests (undefined, null, number, operator objects) |
| M7 | hydrator turns query unscoped | killed | hostile positive control, hydrator cases |
| M8 | hydrator chunks query unscoped | killed | same |
| M9 | hydrator validTurn tenant check removed | killed | source-context "refuses malicious returned source row" (pre-existing) |
| M10, M11 | arms chunks / turns query unscoped | killed | C6 "tenant B arms return only tenant B session", hostile controls |
| M12, M13 | arms / hydrator bound to fixed tA in request deps | killed | hostile + isolation tests |
| M1 | real store.load filter drops node_id | killed ONLY by the source-text pin tree-index-root-filter-single-source.test.ts (counts `treeIndexRootFilter(` == 2) | text pin, not behaviour |
| M2 | real store.load ignores tenant | killed ONLY by the same text pin | text pin |
| **M14** | real store.load: `treeIndexRootFilter("tA")` (hard-coded tenant) | **SURVIVED** | none |
| **M15** | real store.load: operator-spread filter, node_id replaced by `$exists` | **SURVIVED** | none |
| **M16** | real store.load: `treeIndexRootFilter(String(tenantId).trim())` | **SURVIVED** | none |

M14 is a cross-tenant tree read (every tenant gets tA tree summaries) in real tenant-filtering code on the Ask path with a green suite: the ISS-078 shape. Per the brief that is FAIL-level (ISS-AUTHTENANT-004). Restored hashes equal HEAD blobs: store.ts d0f92105829df03935ed4d3427fbefabacbd08e1, routes/ask/ask.ts f70309dda39b52b4f980864d57b76e6332e18fd1, ask-arms.ts 542cf757cbbc491f8aa67d6091761e5dde63567b, ask/source-context.ts 408152ac14e72bb136f4ffaffba1b9ef23b3ef68. The maker's own two mutations were on the replica, so they proved the replica only. Not mutated (resolve to the MAIN tree from this lane, off limits): packages/index treeIndexRootFilter and packages/db tenantScope.

## The 15 skips and the post-merge run (point 2)
The skip condition `guardRefusesObjects` is a sound runtime probe (calls the resolved `scopedCollection` with `{$ne:null}`; true only if it throws), so the cases un-skip automatically after merge. But they do NOT all pass un-skipped. Simulated post-merge state (temp wrapper using `mock.module("@lkb/db", {...real, scopedCollection/withTenant from this lane tenantScope.ts})` then importing the hostile test; wrapper deleted): `tests 58 / pass 55 / fail 3 / skipped 0`. The 3 failures are the `valid tenant with NO data` (tNone) rows of bypassed-tree, arms and hydrator: `if (guardRefusesObjects) assert.equal(db.queries.length, 0)` is applied to a VALID tenant that legitimately queries (2 !== 0). Test bug, not a product defect, but the manifest merge condition ("expect skipped 0, fail 0") would fail on the main tree (ISS-AUTHTENANT-005). Under the new guard, with the tree store bypassed, "", whitespace, undefined, null, 5 and all five operator/array tenants give a clean 503 (no data, no stack, no query); tNone gives 200 with empty sources. No unhandled 500.

## 200 responses (point 3)
Old guard (this lane resolved db): whitespace and 5 give 200 with empty `sources.internal`; arms/hydrator queries did run with the raw value and returned 0 rows (old `!tenantId` guard passes them). Acceptable for this lane: no data, no sentinel; contract clause 3 binds the NEW accessor, which I observed refuse both with a clean 503. Not a breach.

## Vacuity (point 4)
Fixtures hold both sentinels in tree titles, turns and chunks; positive controls show A and B each retrieve exactly their own sentinel through the same app and every A query carries tenantId tA; `found()` searches the whole body text (headers not searched: low note); `loads` is asserted with deepEqual against the exact hostile value. M5-M8 and M10-M13 show those assertions can fail. Vacuity is acceptable above the tree store; the weakness is the tree store itself (M14-M16).

## D-015 (point 5), my own run
ISS-AUTHTENANT-001 (stub auth; "", undefined, {$ne:null}; POST /ask): 3/3 refused 404, tree.load received the raw value, no turns/chunks query, no model call. ISS-AUTHSCOPE-001 recorded cases (missing, null, "", 5; `RECORDED` in require-scope.test.ts): 4/4 refused 401 on GET /keys and /calendar/join-rules.

## Regression (point 6)
apps/api hostile + isolation + join-rules/*.test + routes/keys + server + single-source pin: `tests 138 / pass 123 / fail 0 / skipped 15`. packages/db all tests: `29 / 29`. tsc --noEmit apps/api exit 0, packages/db exit 0. `lint-dirsize: OK (112 dir(s) within budget)`. Non-blank lines: hostile 222, isolation 338 (budget 400).

## Required for cycle 2 (test-only)
1. Drive the REAL `createMongoTreeStore().load` through a hermetic fake (e.g. `mock.module("mongodb")`) over a two-tenant corpus, use it as the tree store in the route-level hostile table, assert A/B/hostile get own root or null; M14, M15, M16 must die; name the killing test in the manifest.
2. Fix the three tNone assertions so the un-skipped run is `skipped 0 / fail 0`, and verify with the post-merge simulation.

ISSUES-WRITTEN: ISS-AUTHTENANT-004 (high), ISS-AUTHTENANT-005 (high), in qa/issues.authtenant.jsonl. ISS-AUTHTENANT-001 NOT marked verified (route level proven; store level still a replica).

EXPLANATION: Route, hydrator and arms protections are now genuinely asserted and mutation-tested (all production mutations above the tree store killed). The unit still fails because the tree store, where a hostile tenant becomes a Mongo filter on the Ask path, is a test replica: a hard-coded tenant, operator-spread filter or String-coercion in the real `load` leaves the suite green, guarded only by a source-text pin. Separately the advertised post-merge check would itself fail 3 cases. Low notes: sentinel search skips headers; ask-tenant-isolation.test.ts is 338 lines.

If cycle 2 passes, merge conditions on the main tree: `cd apps/api && node --test --import tsx src/ask/ask-tenant-hostile.test.ts` must show `skipped 0, fail 0`; then the whole apps/api suite (only the environmental activity-health Python failure acceptable); packages/db tests.

---

# Cycle 2 (checker, independent re-derivation)

VERDICT: PASS
Cycle checked: 2
Commit checked: 29acb72 (lane/authtenant). `git diff 5a55653 29acb72 --stat`: tests, the new kit and qa files only; no production file changed since cycle 0.

## Is the store under test REAL (point 1)
Trace (`real tree store: tenant tB ...` and the route tests via `runAskWithAuth`): test -> `realTreeStore(db,loads).load(t)` -> PRODUCTION `createMongoTreeStore().load` (apps/api/src/store.ts:55) -> PRODUCTION `treeIndexRootFilter` (packages/index tree/build.ts:49) -> PRODUCTION `getDb()` set by the PRODUCTION `@lkb/db` `connect()` -> `MongoClient.prototype.db()` -> kit `clientDb.collection()` -> `BlindDb` `findOne(filter)`. Route tests also run the PRODUCTION `createAskRouter` (`req.auth!.tenantId` -> `tree.load`, `requestDepsFor`), `createSourceRequestDepsFor`, `createAskArmsFor`, `createSourceHydrator` and `scopedCollection` over the same recording fake. Patched: only `MongoClient.prototype.connect/db/close` (the driver; `new MongoClient(url)` merely parses the url), plus test-injected `db`, `embed`, `dispatch` and a stub `req.auth` middleware. Nothing in store.ts, tree/build.ts or the route is replaced.
The fake DOES evaluate the filter it receives (Mongo-subset matcher: equality, null-matches-missing, array equality, $ne/$gt/$in/$regex/$exists) and records it; it is tenant-blind only in that it adds no tenant of its own. So "returns only A" depends on the filter being right: a dropped filter argument returns the first root, a wrong collection returns nothing, both killed (N1, N2, N6).
The prototype patch is never restored (import-scoped). Containment: the package script `node --test` runs each file in its own process; I also ran hostile + isolation together with `activity-health/queue-reader`, `activity-health/router`, `indexing/session`, `whatsapp/store-mongo-snapshot` under `--test-isolation=process` AND `none`: identical (122 tests, 106 pass, 15 skipped, 1 fail), and the 1 failure is the activity-health router "Python first/reclaim" test, which fails the same way alone without the kit (environmental upload-queue timeout). No interference. Low note: the unrestored patch would leak if a future test imported the kit into a shared process with a Mongo-reliant test.

## Mutations (point 2): killer set = hostile + isolation only; per-mutation byte backup, restore in finally, `git hash-object` == `git rev-parse HEAD:<file>` after every one
Final hashes (all equal HEAD): store.ts d0f92105829df03935ed4d3427fbefabacbd08e1; packages/index tree/build.ts 6973bd34fdbb0caa08fe5c118c93c368d68c73c9; routes/ask/ask.ts f70309dda39b52b4f980864d57b76e6332e18fd1; ask/source-context.ts 408152ac14e72bb136f4ffaffba1b9ef23b3ef68; ask-arms.ts 542cf757cbbc491f8aa67d6091761e5dde63567b.

| id | mutation (site) | result | killers (examples) |
|---|---|---|---|
| M14 | store `treeIndexRootFilter("tA")` | KILLED | positive control; real tree store tB |
| M15 | store operator-spread, node_id -> `$exists` | KILLED | real tree store tA/tB; filter tests |
| M16 | store `String(tenantId).trim()` | KILLED | real tree store whitespace/undefined/null/number |
| M1 | store drops node_id | KILLED | real tree store tA/tB |
| M2 | store ignores tenant | KILLED | positive control, real tree store |
| N1 | `findOne()` filter dropped | KILLED | positive control, tB root test |
| N2 | queries `tree_index_v2` | KILLED | positive control |
| N3 | `tenantId.toLowerCase()` | KILLED | positive control |
| N4 | `tenantId:{$in:[tenant]}` | KILLED | real tree store (filter deepEqual) |
| N5 | tenantId conjunct removed, node_id kept (applied in store.ts: the lane's build.ts is not what `@lkb/index` resolves to) | KILLED | positive control, real tree store incl. `[tA]` |
| N6 | filter passed as options arg `findOne({}, filter)` | KILLED | positive control, real tree store |
| N7 | second unscoped tree_index query | KILLED | positive control, real tree store (exact one query) |
| N8 | `tenantId \|\| "tA"` fallback | KILLED | real tree store empty / undefined |
| N9 | route tenant from `x-tenant-id` header | KILLED | "HTTP /ask: tenant-like body fields, query string and headers cannot override" |
| N10 | route tenant from body | KILLED | same + legacy arms path |
| N11 | route `requestDepsFor("tB")` | KILLED | positive control, bypassed-tree cases |
| N12 | hydrator turns query unscoped | KILLED | positive control, bypassed-tree cases |
| N13 | arms chunks query unscoped | KILLED | positive control |
| N14 | arms turns query unscoped | KILLED | positive control |
| N15 | route loads tB for tA | KILLED | positive control, HTTP /ask as tenant A |

20/20 killed; no cross-tenant read or unscoped query survives the behavioural set.
What the source-text pin (`tree-index-root-filter-single-source.test.ts`) adds: run alone against the same 20 mutations it kills only M1, M2 and N1 (3/20). It is a redundant second line, not load-bearing.

## Array tenant `[tA]` (point 3)
Probe through the real store with auth bypassed: filter `{node_id:"tenant:tA",level:"tenant",tenantId:["tA"]}`. Against a stored string-tenant row: null (no row). The store does not use `scopedCollection`, so the old and new `@lkb/db` guards make no difference on this path (null under both); requireAuth refuses an array before the store in production. Safe by type-strictness of the `tenantId` conjunct, with one stated precondition: a hypothetical stored row `{tenantId:["tA"],node_id:"tenant:tA"}` WOULD match (probe returned the row). That row cannot legally exist: `schema/tree_index.schema.json` requires `tenantId` `type: string`, buildTree writes strings, and no caller can obtain an array auth tenant (requireAuth rejects it). No real path to data, so no new issue; the unvalidated `treeIndexRootFilter` is already ISS-AUTHTENANT-002 (medium, file-don't-fix). Test N5 plus the `[A]` real-store case pin the conjunct.

## Post-merge simulation (point 4), my own
Temp wrapper (deleted): `mock.module("@lkb/db", {...real, scopedCollection, withTenant from this lane's packages/db/src/lib/tenantScope.ts})`, then import of hostile and isolation, `node --test --experimental-test-module-mocks --import tsx`: guard probe `refuses operator objects: true`; tests 86 / pass 86 / fail 0 / skipped 0 (hostile 70 + isolation 16). Un-merged lane: `tests 86 / pass 71 / fail 0 / skipped 15`.

## D-015 by my own run (point 5)
- ISS-AUTHTENANT-001: 3/3 recorded cases ("", undefined, {$ne:null}) refused 404 through the REAL store; load received the raw value; no turns/chunks query; no model call.
- ISS-AUTHTENANT-004: recorded M14/M15/M16 3/3 killed, M1/M2 2/2 (5/5 behavioural), plus 15 of my own (20/20).
- ISS-AUTHTENANT-005: 3/3 recorded failing cases (tNone in bypassed-tree, arms, hydrator) pass in my simulation (86/86, skipped 0).
- ISS-AUTHSCOPE-001: 4/4 recorded cases (missing, null, "", 5) refused 401 (require-scope.test.ts green in the join-rules run).

## Regression and budgets (point 6)
apps/api (`src/ask/*.test.ts`, ask-arms, routes/ask/ask, server, join-rules/*, routes/keys, routes/calendar, tree-index-root-filter-single-source, auth): tests 201 / pass 186 / fail 0 / skipped 15 (the 15 operator-object cases awaiting the new guard). packages/db: 29 / 29. `tsc --noEmit -p tsconfig.json`: apps/api exit 0, packages/db exit 0. `lint-dirsize: OK (112 dir(s) within budget)`. `lint-loc` reports two violations, both pre-existing and untouched here (packages/index/src/pipeline/speakers-llm.ts 313, packages/meeting-bot/py/sb_join.py 1142). tenant-test-kit.ts is not named *.test.ts, so it takes the SOURCE budget (300 non-blank lines, structure.config.json testPatterns): 71, fine; hostile 198 and isolation 293 are under the 400 test budget. The kit is imported only by the two tenant tests (git grep); apps/api has no build step (runs under tsx) so it is unreachable from index.ts, but tsconfig `include: src/**/*.ts` typechecks it and a future tsc build would emit it to dist (inert unless imported). Low note.

## Issues
ISSUES-WRITTEN: none. Marked verified on my own evidence: ISS-AUTHTENANT-001, -004, -005. ISS-AUTHTENANT-002 (medium) and -003 (low) left open as they are.

EXPLANATION: The store is now the production code over a filter-evaluating recording fake; 20/20 mutations of the Ask read path's tenant handling die behaviourally, the text pin is redundant, and the simulated post-merge run is 86/86 with 0 skipped. Low notes: unrestored prototype patch (safe under per-file process isolation, shown by the isolation=none run); kit sits in production src and under the tsconfig include; lint-loc failures elsewhere are pre-existing.

Merge conditions (PASS): (1) merge so apps/api resolves `@lkb/db` to this lane's packages/db (auth.ts and tenantScope.ts land together; target branch codex/machine-migration-2026-10-09 has no changes to those paths since the merge base). (2) Post-merge `cd apps/api && node --test --import tsx src/ask/ask-tenant-hostile.test.ts src/ask/ask-tenant-isolation.test.ts` must show tests 86 / fail 0 / skipped 0 (`skipped 15` means the new guard is not in effect). (3) Full apps/api suite once (only the environmental activity-health Python failure acceptable) and packages/db tests. (4) Maker closes out the manifest; ISS-AUTHTENANT-002 stays open as medium.
