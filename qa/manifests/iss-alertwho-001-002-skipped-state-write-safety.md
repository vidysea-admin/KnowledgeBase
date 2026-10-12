# iss-alertwho-001-002-skipped-state-write-safety

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2-adjacent (open ledger issues ISS-ALERTWHO-001 medium, data-write class; ISS-ALERTWHO-002 low). Full ceremony (data write). Verdict by the checker only.
Lane: lane/alertwhofix (branched from lane/alertwho 8af6907c). Ledger rows in qa/issues.alertwho.jsonl NOT edited (status left to the checker).

## Files
- packages/meeting-bot/src/calendar/skipped-state.ts (atomic write, corrupt handling, lock, header doc)
- packages/meeting-bot/src/calendar/schedule-tick.ts (passes `onQuarantine` that logs a WARNING)
- packages/meeting-bot/src/alert-who-skipped-state.test.ts (new, 6 tests), packages/meeting-bot/src/skipped-state-writer.fixture.ts (child process for the race test)

## Design
- (a) Atomic: temp file `<file>.<uuid>.tmp` in the same dir (wx, 0600, fsync), then rename with the EPERM/EACCES/EBUSY retry. No exported helper exists (join-rules-store `writeAtomic` and schedule-state `writeWebinarOperationState` are private), so the same pattern is local. Temp file removed on failure.
- (b) Corrupt: precedent is split. schedule-state.json itself returns {} on unparseable (the same defect); join-rules-store, run-state-store and the job queue throw and keep the file. Followed the latter plus the lead's quarantine example. `readSkippedRecords` now THROWS `SkippedStateCorrupt` (never {}, never mutates; alert-who already reports a throwing read as "unreadable or corrupt (skipped)"). `recordSkipped` moves the bad file to `skipped-sessions.json.corrupt-<ts>-<id>` (never deleted), calls `onQuarantine`, tick logs a WARNING, and starts fresh. Rows inside the corrupt file are NOT merged back (not recoverable by this code); evidence is kept for the operator. A foreign/untagged-tenant file is still refused, not quarantined.
- (c) Concurrency: schedule-tick has NO run lock and no lock on schedule-state.json (Task Scheduler can overlap invocations), so it is not single-writer by construction. The read-modify-write now runs under the existing `acquireLock` (join-rules-store-lock.ts; wx lock file, stale takeover by dead pid) on `<stateDir>/skipped-sessions.lock`, with a lock-still-owned check right before the rename. Lock failure throws; the tick already catches and logs it.
- ISS-ALERTWHO-002: mode 0600 documented as POSIX-only (ignored on Windows) in the file header; recordedAt-preservation test added.

## Reproductions
- ISS-ALERTWHO-001 recorded scenario (4 rows, file truncated to 60 bytes, real tick; was 0 rows left): replayed with `runScheduleTickOnce`. Result now: the 60 damaged bytes are preserved byte-for-byte in a .corrupt- file (1/1), a WARNING is logged, the active file holds the tick's current row. The 4 historical rows themselves are NOT recoverable from a truncated file; that part of the loss remains (named, not hidden): 0/4 history rows restored, 4/4 bytes-of-evidence kept.
- ISS-ALERTWHO-002 surviving mutant (`recordedAt: nowIso`): now KILLED.

## Evidence
```
alert-who-skipped-state.test.ts  ℹ tests 6 ℹ pass 6 ℹ fail 0   (15 consecutive runs: 15/15 pass; includes 6 child processes x 4 writes, 24 rows all present)
alert-who-skipped 6/6, alert-who-production 4/4, alert-who-command 19/19, schedule-tick 14/14, schedule-state 18/18
tsc --noEmit -p packages/meeting-bot -> clean
```
Mutations (harness in worktree, byte backup per mutation restored in finally, deleted before commit; git hash == intended after each): M1 lock removed KILLED; M2 non-atomic direct write KILLED; M3 corrupt read returns {} KILLED; M4 recordedAt reset every tick KILLED; M5 corrupt file overwritten instead of quarantined KILLED. 5/5.

## Not verified / notes
No browser, MongoDB or network used. No Windows rename-lock contention test beyond the 6-process run. Tick now stops recording skipped rows only if the lock cannot be taken within 5 s (logged).
