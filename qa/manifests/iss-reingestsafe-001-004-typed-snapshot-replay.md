# iss-reingestsafe-001-004-typed-snapshot-replay

**Handshake status:** ready-for-check
Fix cycle: 1
Tier: 2-equivalent (open medium ledger issues ISS-REINGESTSAFE-001 and -004, data-write class: full ceremony), pulled by the Approver's dispatch.
Lane: lane/reingestejson. Ledger for this lane: qa/issues.reingestejson.jsonl, ids ISS-REINGESTEJSON-NNN (3 filed, all low). Existing ledger rows in qa/issues.reingestsafe.jsonl untouched (the checker changes their status).

## Scope
Only `scripts/watch/` (lib + tests + `watch-reingest.mjs`); no new entry under `scripts/` itself. `packages/*`, `apps/*` read, not changed.
- NEW `lib/reingest-snapshot.mjs` (173 lines): EJSON canonical serializer, atomic write, manifest + content hash, read-back verification, `.committed` marker, snapshot listing, per-tenant/per-file lock. `mongodb`'s `BSON` is resolved from `packages/db` (already installed; pnpm does not hoist it to the repo root); nothing installed.
- NEW `lib/reingest-recover.mjs` (81): startup recovery (`recoverAll`, `recoverSnapshot`), the hooks injected into `replaceSessionRows` (`snapshotHooks`), `withReingestLock`.
- `lib/reingest-swap.mjs`: `restoreOldRows` exported; it now also restores the `tree_index` root node and VERIFIES (row counts + content hash) what it wrote. `replaceSessionRows` snapshots the tree root, writes the snapshot through the injected hook, calls `commitSnapshot` after ingest, `discardSnapshot` after success or after a verified restore. All db access is still `scoped(name)(tenant)` = `scopedCollection`; no hand-built filter.
- `watch-reingest.mjs`: after connecting and BEFORE any Drive call or decision, `recoverAll` for the tenant; then the rest of the run inside `withReingestLock` for tenant + driveFileId. The plain `JSON.stringify` writer is removed.
- NEW `lib/reingest-fake.mjs` (test support) replaces the local fake in `reingest-swap.test.mjs`: documents are stored as BSON bytes (serialize on write, deserialize on read), duplicate `_id` per tenant rejected, `killAt` makes the process die (every later call throws `Kill`). The existing 23 tests are kept; seeds extended with Date, ObjectId, Decimal128, Binary(float32 vector).
- NEW `lib/reingest-snapshot.test.mjs` (14 tests), `lib/reingest-crash.test.mjs` (27 tests).

## Guarantee now given, exactly
Delete-then-rebuild, still NOT a transaction, but a process kill at ANY point is healed at the next start.
1. **Serializer:** MongoDB Extended JSON, canonical mode (`EJSON.stringify(v, { relaxed: false })`). JS numbers are first mapped to the type the driver would store (int32-range integer -> Int32, else Double), so replayed rows re-serialise to the same BSON bytes.
2. **Before the first delete:** file `<dir>/<tenant>/<driveFileId>.snapshot.json` = `{ manifest, treeRoot, rows }`. Manifest = format, tenant, driveFileId, old/correct session id, preexisting session ids, collections, per-collection row counts, sha256 over all rows (row-order and key-order independent), createdAt, pid. Written to a temp file, fsynced, renamed; then READ BACK and verified (counts + hash) before the function returns, so nothing is deleted on an unreadable snapshot. An existing snapshot for the same tenant + file is never overwritten (the run refuses: recover first).
3. **Commit marker** `<driveFileId>.committed` (atomic) is written right after `ingest()` returns. If it cannot be written the old data is restored instead (no unsafe commit).
4. **Startup recovery** (`recoverAll`, called by `runReingest` right after connect, before decisions), per leftover snapshot and under that file's lock: marker present -> finish the tree prune, keep the new data, remove the snapshot; no marker -> remove partial new rows linked to this Drive file (tenant-scoped, only rows absent before the run), re-insert the snapshot rows, restore the tree root children, VERIFY counts and content hash against the snapshot, then delete the snapshot. Any failure throws `RECOVERY FAILED ...; the snapshot is KEPT at <path>` and the run stops. Corrupt or foreign-tenant snapshots are refused untouched.
5. **Cleanup:** snapshot removed after a successful reingest and after a successful, verified in-memory restore. Kept (and named in the error) only when the restore itself failed; kept as `committed` when only the tree prune failed (the next start finishes it). Temp files of a never-completed write are swept by `listSnapshots`.
6. **Location:** default stays `<repo>/data/reingest-snapshots`. The `.gitignore` entry `data/reingest-snapshots/` already existed at HEAD (line 70) and is unchanged; a test asserts it. `REINGEST_SNAPSHOT_DIR` moves the directory outside the repo. Per-tenant subdirectory; tenant and file names are validated against path traversal. Files are created 0600 / dirs 0700 (no effect on Windows).
7. **Concurrency (ISS-REINGESTSAFE-005, fell out cheaply):** exclusive `.lock` per tenant + file holding pid + time. A live holder is refused (`another reingest of <id> is already running (pid ...)`); a dead pid or a lock older than 6 h is taken over by an atomic rename-steal. Recovery skips a file whose lock is held by a live run.

## NOT proven / NOT covered
- **Everything above is proven only against the in-memory BSON-bytes fake and the real filesystem. Never against a real MongoDB** (hard rule). `watch-reingest.mjs` was syntax-checked (`node --check`) but never run; `run-watch.mjs` never run; no Drive/Gmail. Driver behaviours the fake cannot show are named in ISS-REINGESTEJSON-002 (int64 / integral-double typing after the driver's default value promotion).
- A kill between `ingest()` returning and the marker write restores the OLD data (consistent, wasted work): ISS-REINGESTEJSON-001. Local `data/toc-migrated` dirs are not reconciled by recovery, and pid reuse can keep a dead lock looking live until 6 h: ISS-REINGESTEJSON-003. Still open from the earlier unit: concurrent readers see the session missing during the window; ISS-REINGESTSAFE-002.

## Evidence (node v24.19.0 off PATH, `timeout` around each, from the worktree root, `node --test --import tsx <file>`)
- `reingest-crash.test.mjs` -> `tests 27, pass 27, fail 0`
- `reingest-snapshot.test.mjs` -> `tests 14, pass 14, fail 0`
- `reingest-swap.test.mjs` -> `tests 23, pass 23, fail 0` (the pre-existing 23, now on the BSON fake with typed seeds)
- `ingest-chain.test.mjs` + `lock.test.mjs` (neighbours) -> `tests 28, pass 28, fail 0`.
- `node --check` on every changed `.mjs`: ok. lint-loc: only the pre-existing `packages/meeting-bot/py/sb_join.py:1142`; lint-dirsize: only pre-existing `packages/meeting-bot/src/calendar`, `apps/api/src`, `apps/api/src/routes` (scripts/watch/lib now 19 files of 30); lint-dupes OK.
- Snapshot files: tests use `os.tmpdir()` temp dirs removed in `after`; `data/reingest-snapshots` does not exist in the worktree afterwards.

### Type round trip through the EJSON file (BSON bytes of original vs replayed row equal, plus class checks)
ObjectId (as `_id` and as a field), Date (incl. milliseconds and pre-1970), Decimal128 (34-digit and 1E+6111), Binary subtype 9 float32 vector (values equal), Binary subtype 0 and 4 (UUID), 3072-element double array, Int32, Double, Long above 2^53 (exact), Timestamp, RegExp, NaN, Infinity, nested arrays and objects, null, non-ASCII / NUL / emoji text: all byte-identical. Control: the previous `JSON.parse(JSON.stringify(rows))` turns the Date into a string and changes the bytes of the session and chunk rows (a test asserts it).

### Crash replay (kill -9 before mutating step N of 11: 6 deletes, 4 ingest writes, 1 tree update)
N = 1..11, each: snapshot present at the kill; the killed process really left the DB changed (N>1); a fresh fake built from the dead process's bytes then runs `recoverAll`. N=1..10 -> all 6 session collections plus `tree_index` byte-identical to the pre-reingest state, another tenant's rows untouched. N=11 (marker written, tree prune not done) -> new session kept, old node pruned, snapshot removed. 11/11 pass. Also: kill before the commit marker (old data restored), kill mid snapshot write (nothing deleted, stray temp swept), kill DURING recovery at every step then recover again (converges byte-exact), restore failure keeps the snapshot with its path in the error, a corrupting store is caught by the verify step, a lost tree node is restored, a pre-existing NEW session survives recovery, a corrupt or foreign snapshot is refused with zero DB calls.

### D-015 count against each ledger row's recorded reproduction
- `ISS-REINGESTSAFE-001: 2/2` recorded observations reproduced and fixed: (a) "plain JSON, Dates/ObjectIds become strings" -> EJSON file round-trips them (types test + control); (b) "kill -9 / power loss mid-run leaves rows deleted and a snapshot on disk, no code replays it" -> kill at each of the 11 steps is recovered automatically at the next start (11/11). Fix directions 2 (Mongo transaction) and 3 (write-new-then-swap, needs a `schema/` change) are NOT taken; direction 1 (EJSON replay) is, as an automatic startup step rather than a manual script.
- `ISS-REINGESTSAFE-004: 4/4`: (a) full transcript/vectors as plain JSON -> typed EJSON, per-tenant dir, 0600 (not enforced on Windows); (b) "NOT gitignored" -> already ignored at HEAD, test asserts the line, and `REINGEST_SNAPSHOT_DIR` allows an out-of-repo location; (c) "file stays after a failure whose restore succeeded" -> removed after every verified restore (injected failure at steps 1..10: 10/10 leave no file); (d) "tree-prune failure leaves it" -> kept deliberately as `committed`, completed and removed by the next start (test). Left open, named: during a run the snapshot is on disk by design (it is what recovery needs).
- `ISS-REINGESTSAFE-005` (low, not asked to close): single-run lock implemented and tested (second run refused, dead-pid lock taken over, live lock skipped by recovery). Status is the checker's to change.

## Mutations (29; harness `.reingestejson-mut-harness.mjs`, untracked, deleted; byte backup per mutation restored in `finally`; sha1 of the file checked equal to its pre-mutation hash after each; 240 s timeout per run)
28 KILLED, 1 SURVIVED as an equivalent mutant: removing the row-count comparison in the `restoreOldRows` verify step (the content-hash comparison right after it fails whenever the count differs, so the count line only sharpens the message). One initial survivor (tree-prune error dropping `e.snapshotRef`) was killed by a new assertion, re-run: KILLED. Killed: untyped numbers, relaxed EJSON, plain JSON file, constant hash, no rename hook, snapshot overwrite allowed, orphan marker kept, live lock stolen, dead lock never stolen, orphan markers kept, unsafe names, count check off on read, recovery ignoring the marker, prune skipped, failed restore tolerated, snapshot not removed after restore, recovery without lock, second run not refused, tenant check removed, no commit marker, snapshot kept after ok restore, snapshot kept after success, snapshot discarded after failed restore, content verification off, tree node not restored, preexisting ids forgotten, tree root not snapshotted, tree-prune error without ref. After the run the three changed lib modules are byte-identical (`cmp`) to backups taken before it.

---

## Fix cycle 1 (maker, responding to qa/verdicts/iss-reingestsafe-001-004-typed-snapshot-replay.md, FAIL cycle 0)

Cycle-0 sections above are kept as history. Ledger statuses unchanged (the checker flips them).

### ISS-REINGESTEJSON-004 (high, the FAIL): restore/recovery no longer deletes by sourceId
**Design.** Deletion scope is now the set of sessions THIS run created, decided from ids recorded in the snapshot manifest BEFORE the first delete (`replaceSessionRows`, `reingest-swap.mjs`):
- `manifest.preexistingSessionIds` = every session already linked to `gdrive-<file>` (the old one AND any sibling fork) plus the correct id when it already exists.
- `manifest.plannedNewSessionIds` = `[correctSessionId]` when it did not exist (the id the ingest is about to create).
- `ownedNewSessionIds()` (new, exported): deletion set = planned ids not pre-existing, plus sessions linked now whose id is NOT in the recorded pre-run set (catches an ingest that writes under another id). A recorded pre-run id is never returned. A legacy manifest without the new fields deletes only `correctSessionId` (no discovery). Recovery passes `manifest.plannedNewSessionIds` (`reingest-recover.mjs`). Partial rows of a planned id are removed even when its session row was never written. The snapshot is written (and read back) before any delete, so the manifest is complete before the first mutating call (asserted).
- Sibling rows are never in the snapshot and are never deleted; the shared `sources` row is still re-created from the snapshot/ingest as before.
- Changed files: `lib/reingest-swap.mjs`, `lib/reingest-recover.mjs`, `lib/reingest-snapshot.mjs` (manifest field; `hook("after-rename", path)` fault-injection point), `lib/reingest-crash.test.mjs`.

**Replay of the checker's reproduction, verbatim** (sibling `dup-fork` with sourceId `gdrive-<same file>`, turn, page, claim, chunk; ingest fails at step 8): result "RESTORED ... and verified", sibling session/turn/page/claim/chunk all still present, all 7 collections byte-identical to the pre-reingest state. Before the fix this same case lost all three rows (cycle-0 verdict).
**Kill at every step with the sibling present** (kill -9 before mutating step N = 1..11, fresh process runs `recoverAll`): 11/11 leave the sibling's five rows intact; N=1..10 restore everything byte-exact, N=11 keeps the new data. Plus: partial new session with turns but no session row (in-process failure and kill + recovery) removed, sibling kept; ingest writing an unplanned id is cleaned up, sibling kept; legacy manifest keeps the sibling; manifest content asserted before the first mutating call.

### ISS-REINGESTEJSON-005 (medium): read-back is now tested
`atomicWrite` calls `hook("after-rename", path)` right after the rename (fault-injection point, no-op in production). Four tests corrupt the stored file at that point (truncated to 500 bytes, emptied, a row's text changed so JSON stays valid but the hash differs, a row dropped so the count differs) and assert: `replaceSessionRows` rejects with "snapshot ... is unreadable/corrupt", `store.calls` is `[]` (zero mutating calls), the DB is byte-identical to the original, no snapshot or temp file is left.

### ISS-REINGESTEJSON-003 (low): NOT changed
Reusing an OS process start time for the lock is not trivial here (needs a per-OS lookup and a lock-file format change); left open as filed.

### Evidence (node v24.19.0, `timeout` around each, `node --test --import tsx <file>` from the worktree root)
- `reingest-crash.test.mjs` -> tests 49, pass 49, fail 0 (27 -> 49: +11 sibling kill steps, +checker replay, +manifest, +partial session, +unplanned id, +owned ids, +legacy manifest, +planned-id kill, +4 read-back corruptions)
- `reingest-snapshot.test.mjs` -> tests 14, pass 14; `reingest-swap.test.mjs` -> tests 23, pass 23
- neighbours `ingest-chain.test.mjs` 22/22 and `lock.test.mjs` 6/6
- `node --check` on all `lib/reingest-*.mjs`: ok. No `data/reingest-snapshots` in the worktree afterwards.

### Mutations (harness "reingestejson-c1", untracked in the scratchpad, not in the repo; per-mutation byte backup restored in `finally`; sha1 equal after each; 240 s timeout; all three reingest suites run per mutation)
8 mutations, 8 KILLED (one initial survivor, "recovery drops planned ids", killed by the added kill-before-session-row recovery test): read-back skipped (4 failing), delete-by-sourceId = cycle-0 behaviour (16), owned ids ignore the pre-run set (16), planned ids ignored (2), pre-run set only the correct id (14), unplanned discovery off (2), recovery drops planned ids (1 after the new test), after-rename hook removed (4).

### Not proven
Still only the in-memory BSON-bytes fake and the real filesystem; never a real MongoDB, Drive, or `watch-reingest.mjs`/`run-watch.mjs` (never run). Concurrent writers other than this lock-protected run creating a session linked to the same file during the window are out of scope.
