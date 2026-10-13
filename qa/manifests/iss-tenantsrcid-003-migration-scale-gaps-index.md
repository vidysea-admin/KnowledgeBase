# iss-tenantsrcid-003-migration-scale-gaps-index

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: low-severity ledger issue ISS-TENANTSRCID-003, pulled by the orchestrator. Class: data write (migration over sources/sessions/gaps/media): FULL ceremony. Verdict by the checker only.
Lane: lane/tsrcid3. The ledger row (qa/issues.tenantsrcid.jsonl) is NOT edited here. Its owner-map clause was already resolved by D-138 (owner-config.ts rejects it); two parts remain and are fixed here.

## Scope
1. Scale: `migrations/20261012150000-tenant-scoped-source-ids.cjs` no longer does `sources.find({}).toArray()` / unbatched journal `toArray`. All three walks (pending-journal recovery, the sources pass, down()'s done-journal pass) go through `pages()`: `find({...filter, _id:{$type:"string",$gt:last}}).sort({_id:1}).limit(batchSize)`, resumed by `_id`. Default `BATCH_SIZE` = 500, overridable only through `migrate(db, log, {batchSize})` / `migrateDown(db, {batchSize})`. Semantics unchanged: same journal-first order, same per-row `moveSourceId`, same report shape; `up(db)` / `down(db)` still ignore migrate-mongo's second argument. The `$type:"string"` filter only excludes rows the loop already skipped untouched (non-string `_id`).
2. Index: `schema/index.json` gains `gaps`: `{tenantId:1}` and `{tenantId:1, sourceRef:1}` (`gaps` had no entry at all). New migration `migrations/20261013110000-gaps-source-ref-index.cjs` (same shape as speaker-suggestions) creates the collection if absent and applies those indexes. Its down() drops ONLY those two indexes, never the collection (gaps holds real rows). No new schema/ file (D-147 budget 40 untouched). NOT RUN anywhere.

## Files
migrations/20261012150000-tenant-scoped-source-ids.cjs (M), migrations/tenant-scoped-source-ids.migration.test.mjs (M: fake db now supports sort/limit/$type/$gt and records peak batch), migrations/20261013110000-gaps-source-ref-index.cjs (new), migrations/gaps-source-ref-index.migration.test.mjs (new), schema/index.json (M).

## Reproductions
The row records no corpus beyond "unbatched toArray" and "no gaps.sourceRef index"; both are exercised: ISS-TENANTSRCID-003: scale 1/1 (10k-row fixture, peak batch asserted), index 1/1 (declared + created). Owner-map clause: not re-done (D-138).

## Evidence (fake DBs only; no Mongo, no browser)
```
migrations/*.test.mjs (all 4 files, 21 tests)  ℹ tests 21 ℹ pass 21 ℹ fail 0
packages/ingest (all src/**/*.test.ts)         ℹ tests 340 ℹ pass 340 ℹ fail 0
schema/validate.py                             PASS: 29 collection schema(s) validated correctly.
```
New tests: 10k rows migrated with batchSize 250, peak find size <= 250, zero unbounded loads; default BATCH_SIZE (500) bound via up() on 1300 rows; 2000-row idempotent re-run is byte-identical, down() restores all 2000 within batch bound and is re-runnable; crash mid multi-page run repaired by next run; gaps declared tenantId-leading, up creates exactly the declared indexes, up idempotent, down drops indexes not the collection.
Mutation (harness inside the worktree, per-mutation byte backup, restored in finally, deleted before commit; hashes of the 3 touched files verified equal to the working copies afterwards): 6/6 killed. Remove `.limit` (3 fail), sources pass back to unbatched toArray (2 fail), stop after first page (4 fail), `gaps` removed from index.json (3 fail), gaps down drops the collection (1 fail), down() back to unbatched journal toArray (1 fail).

## Not delivered / not verified
Real Mongo: never touched; on a real server cursor `sort({_id:1})` uses the default _id index, assumed not measured. The 10k fake is O(n^2) in the fake itself (~33 s). The migration already ran once on lkb_staging as a no-op; the gaps index migration has not run anywhere.
