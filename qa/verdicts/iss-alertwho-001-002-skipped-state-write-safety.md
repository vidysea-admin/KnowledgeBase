# Verdict: iss-alertwho-001-002-skipped-state-write-safety

VERDICT: PASS
Cycle checked: 0
Commit checked: 460f237f (on lane/alertwho 8af6907c)

EXPLANATION:
- Atomic write: temp (wx, fsync) in same dir, rename over target with EPERM/EACCES/EBUSY retry (3 s), temp unlinked in finally. Same pattern as schedule-state writeWebinarOperationState. Correct on Windows.
- Lock: existing acquireLock (join-rules-store-lock), own file skipped-sessions.lock; stale dead-pid takeover inherited. schedule-state.json takes no lock, so no deadlock. lockStillOwned checked before rename. Child-process race test (6 procs x 4 writes) 15/15 runs, 24 rows each time.
- Corrupt file does NOT block the tick: recordSkipped runs inside try/catch in schedule-tick, before the schedule loop; a corrupt file is quarantined and the write proceeds, a lock/other failure is logged and joining continues. Worst case is a 5 s lock wait.
- Sensitivity: warning and .corrupt-<ts>-<uuid8> name carry only a timestamp and random id; no tenant, title or URL.
- Replay: ISS-ALERTWHO-001 (4 rows, truncated 60 bytes, real tick): damaged bytes kept 1/1, WARNING logged, active file has the tick row; the 4 history rows themselves are unrecoverable (maker named this honestly). ISS-ALERTWHO-002: recordedAt mutant now killed; 0600 POSIX-only caveat documented.
- Mutations 5/5 KILLED (non-atomic, drop lock, reset on corrupt, recordedAt reset, no quarantine); each restored in finally and git hash-object == HEAD blob; harness deleted.
- Suites: tsc clean; alert-who-skipped-state 6/6 (x15), alert-who-skipped 6/6, alert-who-production 4/4, alert-who-command 19/19, schedule-tick 14/14, schedule-state 18/18.
- Minor notes (not issues): the quarantine renameSync is not wrapped in the EPERM retry (failure is caught and logged by the tick); M1 is killed by the crash-seam test rather than a torn-write test.
- Sibling defect CONFIRMED at lane HEAD: schedule-state.json is still non-atomic (writeFileSync in recordScheduled) and readScheduleState returns {} on unparseable JSON. Filed as ISS-ALERTWHOFIX-001 (not fixed).

ISSUES-WRITTEN: ISS-ALERTWHOFIX-001 (medium, in qa/issues.alertwhofix.jsonl)
Ledger status: ISS-ALERTWHO-001 and ISS-ALERTWHO-002 verified fixed by this unit (rows not edited).
