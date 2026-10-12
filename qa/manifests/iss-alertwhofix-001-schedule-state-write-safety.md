# iss-alertwhofix-001-schedule-state-write-safety

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 2 (ISS-ALERTWHOFIX-001, medium, data-write class). Full ceremony. Verdict by the checker only.
Lane: lane/schedstatesafe (branched from lane/alertwhofix 52cc01bd).

## Files
- packages/meeting-bot/src/calendar/schedule-state.ts (atomic write, lock, ScheduleStateCorrupt, quarantine, loadScheduledKeysForTick)
- packages/meeting-bot/src/calendar/schedule-tick.ts (tolerant dedup read; dedup write failure logged, never aborts the tick)
- packages/meeting-bot/src/calendar/skipped-state.ts (one word: `writeAtomic` exported for reuse)
- packages/meeting-bot/src/calendar/schedule-state.test.ts (corrupt-read test updated: now throws, file untouched)
- packages/meeting-bot/src/calendar/schedule-state-safety.test.ts (new, 10 tests), packages/meeting-bot/src/sched-state-writer.fixture.ts (child process)

## Design and the corrupt-file decision
- recordScheduled: lock schedule-state.lock around read-modify-write, temp+fsync+rename via the shared writeAtomic, lockStillOwned checked before rename. A corrupt file is moved to schedule-state.json.corrupt-<ts>-<id> (never deleted), WARNING logged.
- readScheduleState throws ScheduleStateCorrupt (parse failure, non-object, non-object `entries`); never mutates. Tenant refusal (untagged / foreign) is unchanged and still fails closed.
- TICK DECISION: a corrupt file does not stop joining. The tick quarantines it (under the lock; dry-run only warns and touches nothing), logs a WARNING, and proceeds with an EMPTY dedup set. If the quarantine itself fails (lock timeout, rename error) it warns and still proceeds. A failed recordScheduled after the task was created is logged and does not abort the tick.
- Why empty is safe (no policy question raised): (1) behaviour is unchanged from before (corrupt already read as {}); it is now loud and evidence-keeping. (2) A re-selected session reuses the same deterministic jobKey (task name lkb-autorecord-<jobKey>, `schtasks /create /f`) and the same scheduled/<jobKey>.json, so it is replaced, not duplicated (test "corruption cannot cause a second JOB"). (3) Opt-out / join-rules vetoes run in enforceJoinRules from their own store after the dedup read, so an empty dedup set cannot re-join an opted-out meeting; D-060 tombstones live in the webinar operations state, a different file. Residual: a session whose task already RAN and is still inside the selection window could be scheduled once more; this existed before the change.

## Reproductions
- ISS-ALERTWHOFIX-001 (recorded case: corrupt file silently reset on the next recordScheduled; replayed in the ALERTWHO-001 shape, 4 rows truncated to 60 bytes, real tick): 1/1. Damaged bytes kept 1/1, WARNING 1/1, tick scheduled 1/1. The 4 history rows are unrecoverable from a truncated file (named, not hidden).

## Evidence
```
schedule-state-safety.test.ts: 10 tests, 15 consecutive runs 15/15 pass (6 child processes x 4 writes, 24 rows each time)
11 corrupt shapes x (read throws+untouched, write quarantines byte-identical, tick still schedules): all pass
affected: schedule-state-safety + schedule-state + schedule-tick + alert-who-skipped-state + alert-who-skipped + key-tenant: tests 62, pass 62, fail 0
tsc --noEmit -p packages/meeting-bot: clean
```
Mutations 6/6 KILLED (M1 non-atomic write, M2 lock removed, M3 silent reset in recordScheduled, M4 read returns {} on corrupt, M5 tick uses strict read, M6 dedup-write failure aborts tick); byte backup per mutation restored in finally; harness deleted before commit.

## Not verified / notes
- state-tenant-tag.test.ts: 1 test ("the tick refuses ... schedules nothing", untagged-job case) fails at base 52cc01bd too (verified with this lane stashed): recordSkipped writes an empty skipped-sessions.json. Filed ISS-SCHEDSTATESAFE-001 (low), not fixed. The other 8 state-tenant-tag tests pass.
- No browser, MongoDB or network. No real schtasks call. No Windows rename-lock test beyond the 6-process run.
