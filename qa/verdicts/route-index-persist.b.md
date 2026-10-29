# Verdict B — route-index-persist
Cycle checked: 0
Coordinator: B (blind dual check; the A verdict, checkpoint and evidence were not read)
Checked state: fbede8f9 (base 8b665c4b; code commits fa6c2930, 0597a755, d72dcc4a)
Policy-Version: proportional-verification/2026-10-19.17

Check plan: read the diff of the 3 code files + schema + accessor; re-run the route test files one per invocation under timeout; typecheck/validators; falsify one clause per criterion C1-C7 in a COPY of apps/api/src (junctions to node_modules/packages/schema, unlinked afterwards, bound tree never written); re-measure C9; adversarial pass on the tenancy and data-write paths.

VERDICT: PASS
SCOREBOARD: 9/9 criteria met, 3/3 invariants hold (tenancy, no production opt-in, router untouched)
TIER: L (new persisted tenant-scoped collection written by the API; dual triggers tenancy + prod-write cited in the manifest)

Evidence (all run by this checker, bound tree HEAD fbede8f9):
- node --test --import tsx, one file per invocation: route-index-persist 18/18, route-store 21/21, route-router 20/20, bm25-router 16/16, search-cache 17/17 (all exit 0).
- tsc --noEmit: apps/api exit 0, packages/db exit 0. `python schema/validate.py` PASS 55 schemas (route_index fixtures valid/invalid ok). `pnpm gen:types --check` OK 55 files.
- C1 read `route-store.ts` load(): persisted hit returns before `deps.tree.load`; tests "cold start ... tree is not read", "step A parity", "first request persists one document" pass.
- C2 `routeIndexFromDoc` rejects any fingerprint OR treeRevision difference and structural damage (bm25-router.ts new lines 90-122); stale path emits persisted-stale and overwrites by `_id`.
- C3 read AND write go through `routeIndex()` = `scopedCollection` (withTenant on filter, tenantId stamped last on the replacement, packages/db tenantScope.ts replaceOne); document and node tenant checks present; a write cannot touch another tenant's row (`_id` = tenantId, filter ANDs tenantId; a foreign `_id` collision would fail on duplicate key, not overwrite).
- C4 read budget = min(1000, half the time left) via `settle()` which never rejects; write is `void settle(...)` with 5 s cap and is not awaited; route-router.ts, composition/*, the DB guard and isProtectedWorkDbName are absent from `git diff 8b665c4b..HEAD --stat`.
- C5-C7, C8 (docs rows R1, section 3, unit list, endpoint Caching and Latency sections read in the diff), C9 below.

Falsifications (own byte backup per mutation, restored in a trap, `cmp` against the backup, then `git hash-object` equals `git rev-parse HEAD:<file>`; all 7 ended HEAD-fidelity OK). Chosen to differ from the maker's table:
| Id | Crit | edit (in copy) | killed by |
|---|---|---|---|
| m1 | C1 | deserialised bm25 postings replaced by an empty Map | cold start serves persisted index; step A parity (2 failed) |
| m2 | C2 | fingerprint half of the stamp comparison removed | visibility state change test (1 failed) |
| m3 | C3 | write through the raw collection (no tenant in filter) | first-request test + tenancy test (2 failed) |
| m4 | C4 | write awaited instead of best-effort | "failing route_index WRITE never fails the request" (1 failed) |
| m5 | C5 | postings emitted in random order (non-idempotent doc) | idempotent upsert test (1 failed) |
| m6 | C6 | `persist` forced on | persist:false disables the store (1 failed) |
| m7 | C7 | in-memory TTL check always expired | warm index touches neither route_index nor tree (1 failed) |
C9 re-measured in the copy (synthetic corpus, fake db, tree read simulated by sleep): before/after 23/14 ms at 0, 511/6 ms at 500, 2026/18 ms at 2000, tree reads 1 then 0. Matches the manifest's order of magnitude (real tree latency and a real Mongo round trip remain unmeasured; the manifest says so).

Adversarial notes (none blocking; no criterion names them):
PROPOSED-ISSUE: {"id":"P1","severity":"medium","class":"security-adjacent (not a cross-tenant leak)","title":"route_index stamp does not cover every input of the trusted tree","detail":"The stamp is visibilityFingerprint (sources, sessions, review heads, whatsapp candidates) + tree root indexRevision. The tree that is persisted comes from trustedTreeReads, whose eligibility also depends on session_pages and raw turns (trusted-readers.ts:111-118, indexing/eligible-tree.ts:73-91: transcript-mismatch, page-invalid, identity-invalid via turnDigest). A page/turn change that makes a session ineligible without touching those four collections or the tree root leaves the stamp equal, so the persisted node title/summary stays routable with no 60 s bound any more (before this unit the in-memory TTL bounded it). Mitigation present: route() still gates every session at request time (status.index done + sessionVisible, route-store.ts:148-155) and answer text is re-read from turns, so only routing text offered to step B can be stale.","fix_direction":"add a cheap session_pages revision/count digest (or a max updatedAt) to the stamp, or keep an upper bound on a persisted document's age (e.g. rebuild when builtAt is older than N minutes)."}
PROPOSED-ISSUE: {"id":"P2","severity":"low","title":"stamp read before tree is safe against forward drift but not against A->B->A flapping","detail":"If visibility goes S0 -> S1 -> S0 between the stamp read and the tree build, a document built from S1 data is stored under the S0 stamp and is then served as current. Needs a revert inside one build window; recoverable on the next stamp change.","fix_direction":"re-read the stamp after the build and skip the write when it moved."}
PROPOSED-ISSUE: {"id":"P3","severity":"low","title":"mutation M4 of the maker needs a timer-guard in the test, otherwise a hung process lingers","detail":"The 1400 ms assertion guard in 'a HANGING route_index read' leaves the abandoned read timer alive when the read budget mutates to 1e9; harmless in the product but the test run can outlive the assertion.","fix_direction":"none required; note only."}

FAILURES: none
CAPABILITY-COVERAGE: not-applicable (API and storage only, no screen; persona walk skipped per manifest)
LIVE-BROWSER: not-applicable (apps/api/src/route/*, packages/db, schema, docs)
ISSUES-WRITTEN: none (dual coordinator; PROPOSED-ISSUE lines above)
EXECUTOR: claude-opus-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every criterion is evidenced by tests I ran and by a falsification in a copy that the tests kill; tenancy and write paths hold (scoped accessor on both read and write, tenant checks on document and nodes, no production opt-in). P1 is a stamp-coverage gap bounded by the existing per-request session gate and is filed, not blocking, since C2 defines the stamp as fingerprint + indexRevision.
Metrics: start=2026-10-29T07:51:13Z end=2026-10-29T07:59:30Z wall_min=9 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=7 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=520 mutants=7 defects_unit=0 defects_6c=0 check_min=9
