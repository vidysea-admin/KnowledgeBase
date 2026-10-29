# Verdict - route-index-persist (coordinator A, blind dual check)

**Cycle checked:** 0
**VERDICT:** PASS
**Checked state:** fbede8f9 (base 8b665c4b; code fa6c2930, 0597a755, d72dcc4a)
**Policy-Version:** proportional-verification/2026-10-19.17 | **Tier:** H | **Dual:** coordinator A (no other verdict read)

## Evidence (all re-run by this checker; maker numbers not reused)
- route-index-persist.test.ts 18/18; route-store 21/21; route-router 20/20; bm25-router 16/16; search-cache 17/17 (one file per invocation, `timeout`). apps/api `tsc --noEmit` exit 0. `python schema/validate.py` PASS 55 schemas. `pnpm gen:types --check` OK.
- vectorless-routing.test.ts: 3 pass, 1 fail ("Compose requires an explicit database...", CRLF compose match). `docker-compose.yml` is not in the diff (0 changed lines vs base), so the failure is pre-existing and not caused by this unit.
- C1 persisted hit on cold start, tree not read: test "cold start ... tree is not read" green; M1 (never serve a hit) killed (3 fail).
- C2 stale stamp / damaged document never served and overwritten in place: M2 (fingerprint half of the stamp compare removed) killed (1 fail); maker's treeRevision half is covered by the indexRevision test.
- C3 tenancy: code read: `routeIndex()` is `scopedCollection` (filter gets `tenantId`, replacement stamped last); codec rejects wrong `_id`, `tenantId`, `schemaVersion`, any node `tenantId`. M3 (per-node tenant check removed) killed; M3b (`_id`/`tenantId` check removed) killed; M3c (write through the raw collection, no tenant in filter) killed (2 fail).
- C4 bounded read / best-effort write: M4 (read timer x1000) killed by the 1400 ms assertion guard (process then lingers on the timer, rc 124 from `timeout`, accepted). Failing read, hanging read, failing write, no-tree tests green. Router file untouched in the diff.
- C5 idempotent upsert: M5 (`upsert:false`) killed (9 fail).
- C6 schema-first / no bypass: schema, 3 fixtures, generated type regenerated clean; accessor goes through `scopedCollection`; `packages/db` has no write guard and `isProtectedWorkDbName` is not in the diff; writes use `deps.db ?? getDb()`. M7 (oversize guard off) killed; M8 (`persist` forced on) killed. Gate for writing into lkb_prod: `qa/gates/single-db-2026-10-29.md` (D-208/D-209).
- C7 hot layer: M6 (TTL check removed, warm index re-loads) killed (1 fail).
- C8 docs read (R1 row, section 3 row, unit list, endpoint caching and latency sections): accurate against the code (lazy refresh, 12 MB skip, bounded read).
- C9 cold-start table recorded in the manifest (4514 ms -> 19.6 ms at a simulated 4500 ms tree read, 0 tree reads); it is a fake-db simulation and the manifest says so. Not re-run (script not kept); the mechanism is evidenced by C1.
- Adversarial probe of `routeIndexFromDoc` (copy): NaN avgLen, float lens, out-of-range posting doc index, `$ne` object as tenantId, undefined treeRevision vs null, non-array node.children all return null (rebuild). A `__proto__` posting term is accepted but stored in a Map (harmless).
- Query-time controls unchanged and still reached on a persisted hit: `gate()` (tenant-scoped session lookup, `status.index==="done"`, `sessionVisible`) and `visibility.filterTurns`, so a stale routing node cannot surface turn text.

## Falsification hygiene
Copy of apps/api/src (junctions to the worktree's node_modules/packages/schema, junctions removed with `rmdir`, then the copy deleted). 9 mutants, each with its own byte backup, `cmp` restored and `git hash-object` == `HEAD:<file>` after every one (all OK). Bound tree never edited.

## PROPOSED-ISSUE (non-blocking, none written to the ledger)
PROPOSED-ISSUE: {"severity":"low","kind":"security-note","file":"apps/api/src/route/route-store.ts:93-110","title":"persisted stamp does not read WhatsApp candidate approval state or native-evidence resolver state","detail":"visibilityFingerprint projects whatsapp_candidates as _id/sourceId/sessionId only, so an approval revoked without an indexRevision bump leaves routing node titles/summaries in the persisted index until the next stamp change (in memory this was 60 s, persisted it is unbounded). Turn text is still protected by the per-request gate()/filterTurns, and node text reaches the step B model only through gate(index.sessionIds). Worth a regression test that a revoked WhatsApp session never appears in frontierRoot from a persisted hit.","fix_direction":"add candidate status (or a counter) to the stamp, or bump indexRevision on revocation"}
PROPOSED-ISSUE: {"severity":"low","kind":"robustness","file":"apps/api/src/route/route-store.ts:119","title":"12 MB size guard measures JSON bytes, not BSON bytes","detail":"Postings are nested small arrays; BSON array elements carry per-element key and type overhead, so BSON can be several times the JSON length and a document under the 12 MB JSON guard may still exceed 16 MB. The failure is harmless (replaceOne rejects, settle reports write-failed, request unaffected) but would rebuild from the tree on every cold start.","fix_direction":"measure with BSON.calculateObjectSize or lower the threshold; add a write-failed counter to metrics"}
PROPOSED-ISSUE: {"severity":"low","kind":"test-gap","file":"apps/api/src/route/route-index-persist.test.ts","title":"no test with a real Mongo or BSON round trip","detail":"Fake db uses structuredClone; undefined-valued fields in tree nodes (BSON stores them as null or drops them) and the real replaceOne upsert of a ~64 KB document are unverified. The manifest states this limit.","fix_direction":"one integration run against a scratch DB in the deployment unit"}

## Verdict
Every criterion C1-C9 evidenced; each changed criterion falsified and killed; no tenancy or data-write bypass found. No FAIL finding carries a reproducing command.

ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE lines only)
Metrics: start=2026-10-29T07:47:00Z end=2026-10-29T08:03:00Z wall_min=16 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=960 mutants=9 defects_unit=0 defects_6c=0 check_min=16
