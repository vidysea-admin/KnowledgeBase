# Verdict: iss-309-316-reingest-delete-safety

VERDICT: PASS
Cycle checked: 0
Commit checked: 45ef46b (lane/reingestsafe)
Scope: delete-then-rebuild with an in-memory snapshot and compensating restore. Not a transaction.

## EXPLANATION

- Counts re-run by me: reingest-swap.test.mjs 23/23, ingest-chain.test.mjs 22/22 (both imports are node:test, the lib, packages/index tree sources; no connection).
- Wiring, by reading `watch-reingest.mjs` line by line (the script was never executed, by me or the maker): the reindex-only branch and the delete-rebuild branch both run inside `withFailureRecorded`; the only old-session delete goes through `replaceSessionRows` using `scopedCollection(db, name)`. `grep deleteMany scripts/watch` finds calls only inside reingest-swap.mjs. No bypassing delete. The remaining direct `db.collection(...)` calls in the script are reads (findOne/countDocuments) carrying `tenantId` by hand.
- Types: the restore uses the in-memory snapshot from `find().toArray()`, i.e. real driver objects (ObjectId, Date, Binary, vectors) handed straight back to `insertMany`, so no type loss in the automatic restore. The file written by `writeSnapshot` is plain `JSON.stringify` (types lost) but nothing replays it (ISS-REINGESTSAFE-001, already open). Tenant: every call goes through the scoped accessor, which merges `tenantId` and rejects invalid tenants; restore strips and re-adds it. The tenant-isolation test passes; a mutation using another tenant on restore is killed.
- Fake vs real: the fake enforces the tenant merge the same way and supports exactly the operators used (`_id`, `$in`, dotted paths, deleteMany/insertMany/updateOne `$set`; the code uses no `$pull`). It stores plain clones, so it proves ordering and logic, not BSON behaviour.
- Failure handling: snapshot count check and write precede any delete (tested); restore failure is reported loudly with the snapshot path (tested); partial new rows are removed before re-insert; a pre-existing new-id session is protected. Concurrent reingest of one file is unguarded (ISS-REINGESTSAFE-005, low). The tree prune is a read-modify-write without revision check, but removes only the node for the old session id via `regenerate`, so a same-title different-session node is not touched.
- Snapshot file: written to `<repo>/data/reingest-snapshots/<driveFileId>-<ts>.json`, NOT gitignored, plain transcript text and vectors, removed only on full success; it stays after a failure whose restore worked. Filed as ISS-REINGESTSAFE-004 (medium). Add the gitignore line before the first live run.
- ISS-316: the row text is the missing mark-failed on the reindex-only branch; it covers exceptions, not abrupt termination, and is closed for that. A kill mid-run is ISS-REINGESTSAFE-001 (medium, open), which is the honest residual; a kill leaves the session deleted until a manual replay, and the replay file is not even type-faithful. I set ISS-316 and ISS-309 to fixed with notes stating this.
- Mutations (own harness, byte backup per mutation, restored in finally, 90 s timeout): 7/7 killed: skip snapshot write, delete before snapshot, swallow restore error, wrong tenant on restore insert, report success after failed rebuild, skip tree prune, skip partial cleanup. reingest-swap.mjs hash equals HEAD blob; harness deleted; `git status` clean before my edits; no snapshot files anywhere.
- Proven only against a fake: the whole restore, tenant isolation and tree prune logic ran against an in-memory stand-in for scopedCollection, never real MongoDB, the real driver, or the real watch-reingest.mjs.

ISSUES-WRITTEN: ISS-REINGESTSAFE-004 (medium), ISS-REINGESTSAFE-005 (low), in qa/issues.reingestsafe.jsonl
