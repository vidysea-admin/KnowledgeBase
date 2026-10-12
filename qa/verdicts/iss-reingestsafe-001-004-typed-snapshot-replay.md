# Verdict: iss-reingestsafe-001-004-typed-snapshot-replay

VERDICT: FAIL
Cycle checked: 0
Commit checked: ed28168 (lane/reingestejson)
Scope: typed EJSON snapshot, startup crash recovery, per-tenant per-file lock for `--reingest`. Not a transaction.

## EXPLANATION

- Counts re-run by me (fake + temp dirs only, `node --test --import tsx`): crash 27/27, snapshot 14/14, swap 23/23, ingest-chain+lock 28/28.
- Fake fidelity: `reingest-fake.mjs` stores BSON-serialized bytes (`enc` on every write, `dec` on every read) and compares byte-wise (`same` via BSON serialize); the tenant is merged into every filter like scopedCollection; recovery and `restoreOldRows` call only `scoped(coll)(tenant)`. Reads decode with driver defaults, so int64/integral-double typing is not exercised (ISS-REINGESTEJSON-002, already filed).
- FAIL reason (data write class, ISS-REINGESTEJSON-004, high): partial-row cleanup removes every session with `sourceId == gdrive-<file>` except the old id and the correct id. A sibling fork of the same Drive file that existed before is not in the snapshot and is deleted unrecoverably. I built it: sibling session + turn + chunk, ingest failed at step 8, restore reported "restored and verified", all three sibling rows gone. This now runs automatically at every startup from leftover snapshots. Other sessions and other tenants are not touched (tenant merged by the accessor; the o1 other-tenant row survives; removing the tenant merge in the fake is killed).
- Step 11 / marker: the marker is written only after `ingest()` returns (awaited writes) and before the tree prune; a marker write failure restores the old data. Moving the marker before ingest is killed. Kill before the marker leaves complete new rows that get replaced by the old (consistent, ISS-REINGESTEJSON-001). Whether the real `ingestOneDriveFile` returns only after all its writes are durable is not testable here.
- Lock: liveness is `process.kill(pid,0)` plus 6 h staleness by mtime. A reused pid makes a dead lock look live (fails closed, refusal not corruption) for at most 6 h; a run longer than 6 h could be stolen. Not blocking forever. Named in ISS-REINGESTEJSON-003.
- Startup (`watch-reingest.mjs`, read line by line, never run): `runReingest` connects, then `recoverAll` over ALL snapshots of the tenant (not only this file), locked ones skipped, before any derivation; a recovery failure throws and stops the run. The per-file lock is then taken; the only deletes sit in `replaceSessionRows`, after the snapshot write and verify. No delete path before the verified snapshot. `.gitignore` covers `data/reingest-snapshots/`.
- Mutations (own harness `.reingestejson-chk-harness.mjs`, untracked, deleted; per-mutation byte backup restored in `finally`; sha1 equal before/after each): delete snapshot after failed restore KILLED; recovery/fake without tenant filter KILLED; marker before ingest KILLED; skip read-back verify SURVIVED (ISS-REINGESTEJSON-005, medium: the "verified before the first delete" claim is untested). swap/snapshot/fake hash equals HEAD blob, both trees clean, no snapshot files anywhere.
- Rows not flipped: ISS-REINGESTSAFE-001/-004/-005 stay as they are until -004 above is fixed.
- Proven only against a fake: every recovery, restore and tenant check ran against an in-memory BSON-bytes stand-in for scopedCollection, never real MongoDB, the real driver, or the real watch-reingest.mjs.

ISSUES-WRITTEN: ISS-REINGESTEJSON-004 (high), ISS-REINGESTEJSON-005 (medium), in qa/issues.reingestejson.jsonl
