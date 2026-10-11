# iss-309-316-reingest-delete-safety

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3-equivalent unit pulled by the Approver's dispatch (open ledger issues ISS-309 and ISS-316, both medium but data-write class: full ceremony).
Lane: lane/reingestsafe. Ledger for this lane: qa/issues.reingestsafe.jsonl, ids ISS-REINGESTSAFE-NNN (3 filed, all open). Existing ledger rows untouched (the checker changes ISS-309/316 status).

## Scope
Only `scripts/watch/` (one package/area; both issues live in `watch-reingest.mjs`). `packages/*` and `apps/*` are read, not changed.
- NEW `lib/reingest-swap.mjs`: `replaceSessionRows`, `pruneTreeOfSession`, `withFailureRecorded`, `oldRowFilters`. No db handle: all access is `scoped(name)(tenant)`, injected; production passes `scopedCollection(db, name)` from `packages/db/src/lib/tenantScope.js` (tenant merged into every count/find/delete/insert/update; no hand-built tenant filter anywhere in the new code).
- `watch-reingest.mjs`: the delete+ingest block now goes through `replaceSessionRows`; the reindex-only branch (ISS-316's literal row) is wrapped in `withFailureRecorded`; the old `data/toc-migrated/<old>` dir is removed only AFTER success (it used to be removed before the re-ingest).
- NEW `lib/reingest-swap.test.mjs` (23 tests, in-memory fake of scopedCollection; real `buildTree`/`regenerate`).

## Guarantee now given, exactly
**Delete-then-rebuild with a pre-delete snapshot, a compensating restore and honest failure. It is NOT a transaction and NOT write-new-then-swap** (swap is impossible without a schema change: old and new session share `sources._id = gdrive-<fileId>`, the E11000 that ISS-314 documented).
1. Snapshot of every old row (sources, sessions, turns, session_pages, claims, chunks) is read, its row counts checked against `countDocuments`, and written to `data/reingest-snapshots/<fileId>-<ts>.json` BEFORE the first delete. If the snapshot cannot be written or counts disagree, nothing is deleted and the run fails.
2. Any throw after the first delete (a delete, ingest, assertIndexed, anything): rows left by the failed attempt are removed (only rows linked to this Drive file's source and not present before), the in-memory snapshot is re-inserted, the thrown error says `RESTORED` or `RESTORE INCOMPLETE ... snapshot <path>`, and `watch_state` is marked `failed` with that reason. Never reported as success.
3. Success: old per-session rows are gone, the old session's node is pruned from the tenant's `tree_index` root via the repo's `regenerate` (root document itself is kept: it is one document per tenant holding every session). If that prune fails the run is reported failed (`phase: tree-prune`), the new session is NOT rolled back.
4. ISS-316 literal: reindex-only failures (buildIndexer / assertIndexed / success write) now mark `failed` with the reason and rethrow.

NOT covered (also ISS-REINGESTSAFE-001..003): process kill / power loss between first delete and end (snapshot file is JSON, Dates become strings, no replay script; recovery is by hand); no isolation for concurrent readers, who can see the session missing during the window; the local `data/toc-migrated/<new>` files of a failed attempt are not cleaned; topic nodes in untouched years keep the old id in `sessionRefs`; the same-id branch (old == correct id, no deletes) is unchanged; real Mongo, the real `buildIndexer` and `ingestOneDriveFile` were NOT exercised (no DB connection allowed).

## Evidence (node v24 off PATH, `timeout` around each, one file at a time, from the worktree root)
- `node --test --import tsx scripts/watch/lib/reingest-swap.test.mjs` -> `tests 23, pass 23, fail 0` (imports only node:test/assert, the lib, packages/index tree sources; no DB, no network).
- `node --test --import tsx scripts/watch/lib/ingest-chain.test.mjs` (pure, neighbouring) -> `tests 22, pass 22, fail 0`.
- `node --check scripts/watch/watch-reingest.mjs` -> ok; a dynamic import of `packages/index/src/index.ts` and `tenantScope.js` under tsx resolves `regenerate`, `treeIndexRootFilter`, `scopedCollection` (the paths watch-reingest uses).
- Typecheck: N/A, `.mjs` under `scripts/` is in no tsconfig. `lint-loc` only violation `packages/meeting-bot/py/sb_join.py:1142` (pre-existing); `lint-dirsize` apps/api/src 32 files and apps/api/src/routes 32 files (pre-existing, untouched by this unit); `lint-dupes` OK.
- Not run, and why: `watch-reingest.mjs` itself (opens a real Mongo connection via `connect(process.env.MONGODB_URL)`), `run-watch.mjs` (Drive, Gmail, Mongo).

### D-015 count against each ledger row's recorded reproduction
- `ISS-309: 2/2` recorded observations reproduced and fixed: (a) sessions/turns/session_pages/claims/chunks counts for old session `2026-09-25-infocu` go to 0 (test "old session's per-session counts go to 0 AND its node is gone"); (b) the tree_index state that stayed after delete: the root document count stays 1 by design, the old session NODE is now absent (before the fix the same fixture still lists it: mutation "no tree prune" is killed). Left open, named: the cited log `qa/watch/reingest-2026-09-24-in-focus.log` is not in the repo, so the original numbers could not be replayed from it, only from the row's text (ISS-REINGESTSAFE-003).
- `ISS-316: 3/3`: (a) buildIndexer throws -> `failed` recorded with reason, rethrown; (b) assertIndexed throws -> same; (c) recorder itself failing does not mask the original error. Plus, the task's broader property, an injected failure at EACH of the 10 mutating steps after the first (6 deletes, 4 ingest writes): 10/10 old data byte-for-byte restored and failure reported; ingest throwing after partial writes; restore failing; snapshot unwritable (zero deletes). Note: the row describes the reindex-only branch; the delete branch DID already have a try/catch around ingest (it marked failed) but the deleted rows were never restored: that is the data-loss half fixed here.

## Mutations (11; harness `.reingestsafe-mut-harness.mjs`, untracked, deleted; byte backup per mutation restored in `finally`; 90 s timeout per run)
First run 8 killed, 3 survived (partial source row not removed; pre-existing-session guard; snapshot count check). Three tests were added; second run 11 KILLED, 0 SURVIVED: no tree prune; no restore; snapshot failure tolerated; partial source kept; partial sessions kept; restore skips chunks; restore always reports ok; pre-existing guard dropped; tree-prune error swallowed; recorder swallows original error; count mismatch ignored. After the run `git hash-object scripts/watch/lib/reingest-swap.mjs` = `9a8a2af5a32842427b07663ed5b5ef69d88b8df3`, equal to the pre-run blob; harness file removed.
