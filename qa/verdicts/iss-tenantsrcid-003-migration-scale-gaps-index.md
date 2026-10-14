# Verdict: iss-tenantsrcid-003-migration-scale-gaps-index

VERDICT: PASS
Cycle checked: 0
Commit checked: 790e5b60

EXPLANATION:
1. Editing an applied migration: safe. migrate-mongo keys on file name, so lkb_staging (no-op run) will not re-run it; semantics are unchanged (same journal-first order, moveSourceId, report shape). The journal document shape ({_id key, tenantId, oldId, newId, doc, state, at}) is byte-identical in the diff, so down() reverses databases migrated by the old version. up()/down() still ignore migrate-mongo's 2nd argument; migrateDown is a new extra export only.
2. Paging: _id-resume ($gt last) cannot skip or double-process. Moved rows get ids "<tenant>:<hash>"; they may sort ahead of the cursor and be revisited, but are skipped by `_id !== hash` (the check is the idempotency guard); rows behind the cursor are never revisited. Deletions do not shift a $gt cursor (unlike skip/offset). Checker-written Mongo-like fake (sorted _id, snapshot per page, ids rewritten mid-scan, tenants chosen so new ids sort before and after the cursor, batch 1/2/3/7/500, 60 rows): all migrated exactly once, no duplicates, rerun migrated 0, down restored all ids and references. Peak 250 vs 500: the test deliberately passes batchSize 250; a separate test binds the default BATCH_SIZE 500 through up(). Not a discrepancy.
3. Index migration: createCollection guarded, createIndex idempotent for identical specs, down drops only the two named indexes (errors swallowed) and never the collection, so data is intact. Reads schema/index.json, consistent with baseline (which also iterates index.json, so fresh DBs get the same indexes; idempotent). validate.py unaffected.
4. Evidence: migrations tests 21/21; packages/ingest 340/340; validate.py PASS 29 schemas. Mutations (harness in worktree, per-mutation byte backup, restore in finally, hash == HEAD blob, deleted): skip rows whose _id changes KILLED; gaps down drops collection KILLED; $gt->$gte KILLED (hang/timeout); cursor stuck KILLED (timeout); down journal filter done->pending KILLED; limit ignored KILLED. 6/6. (A 7th, index.json edit, did not apply textually; covered by the declared-index test.)
Notes (not backlog): not measured on a real Mongo; the maker's 10k fake test takes about 33 s.

ISSUES-WRITTEN: none
