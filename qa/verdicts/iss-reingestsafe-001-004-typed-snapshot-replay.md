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

---

# Cycle 1

VERDICT: FAIL
Cycle checked: 1
Commit checked: bbf7ff2 (lane/reingestejson)
Cycle-0 history above is kept unchanged.

## EXPLANATION

- Cycle-0 findings are fixed. ISS-REINGESTEJSON-004 (sibling deletion by sourceId): I replayed it myself. Sibling session + turn + page + claim + chunk, injected failure at every mutating step 1..10: restore ok, sibling intact, all 7 collections byte-identical. Kill at every step 1..11 with the sibling, fresh process runs `recoverAll`: 11/11 sibling intact. ISS-REINGESTEJSON-005 (read-back untested): I replaced the read-back call in `writeSnapshotFile` with a no-op, so the check was off; 4 tests went red (truncated, emptied, content-altered, row-dropped, each asserting zero mutating calls). Removing the hash check: 2 red. Removing only the count check: 0 red, an equivalent mutant (the hash covers it). Restored; hash equal to HEAD each time.
- Tests re-run (fake plus temp dirs only): crash 49/49, snapshot 14/14, swap 23/23, ingest-chain 22/22, lock 6/6. Imports read: only `node:` modules, the fake, `packages/index` tree code; no Mongo, Drive or `.env`; `watch-reingest.mjs` and `run-watch.mjs` never run.
- FAIL reason (check 1, data write class, ISS-REINGESTEJSON-006, medium): the per-file lock is taken only by `--reingest`. `run-watch --ingest` uses `data/.watch.lock` and `--reingest` does not take that, so the two run concurrently by design. `ownedNewSessionIds` deletes every linked session outside the recorded pre-run set, so a session another writer creates after the manifest was written is judged "owned" and deleted. I built it twice: in-process (A1) and kill at step 8 plus recovery (A2): the concurrent session and its turn are gone, restore reported ok. Reachable when the watcher sees the file as new (no watch_state row or not in the month manifest; the code comments say the first live run hit exactly a missing row), and the window is the whole ingest (transcription up to 2 h). Narrower than cycle 0 but a live data-loss path in a data-write unit, and the discovery is avoidable: `resolveSessionIdForIngest` makes the only other id deterministic (`<correct>-<first 6 of file id>`), so planning that id instead of discovering would close it. Fix direction is in the ledger row.
- Check 2 (legacy manifest): a manifest with neither field deletes the correct id even when it pre-existed with data (B2: session and turn gone). A cycle-0-shaped manifest (preexistingSessionIds present, no plannedNewSessionIds, which is exactly what ed28168 wrote) keeps discovery enabled and deletes the sibling (B1). The maker's legacy test covers only the no-field shape. No such manifest exists outside tests (branch unmerged), so low: ISS-REINGESTEJSON-007.
- Harness/scratchpad check: no mutation harness or stray script in the worktree or main tree (`git status` clean, no `*harness*` file, no `*.snapshot.json`, no `data/reingest-snapshots`); every `reingest-*.mjs` and `watch-reingest.mjs` equals its HEAD blob (`git hash-object` vs `rev-parse HEAD:`). The maker's scratchpad harness is outside the repo (the session scratchpad); I could not confirm its content from inside the repo and did not execute anything from there. My own harness `reingestejson-c1-chk-harness.mjs` and test were inside the worktree, untracked, and deleted.
- Ledger rows NOT flipped (FAIL): ISS-REINGESTSAFE-001, -004, -005 stay open; ISS-REINGESTEJSON-004 and -005 are fixed in code but left open until the unit passes.
- Proven only against the in-memory BSON-bytes fake; never real MongoDB.

ISSUES-WRITTEN: ISS-REINGESTEJSON-006 (medium), ISS-REINGESTEJSON-007 (low), in qa/issues.reingestejson.jsonl
