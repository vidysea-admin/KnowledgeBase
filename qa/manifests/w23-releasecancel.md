# w23-releasecancel: calendar cancellation stops pending, scheduled and launching captures

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w23-releasecancel.md
Fix cycle: 1
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w23-releasecancel (branch lane/w23-releasecancel)
Base: 4264418c7488d95e76bc0d86e3920efb0e0ccd72 (origin/master)
Candidate: the single commit on the branch tip (`git rev-parse lane/w23-releasecancel`)
Issues: ISS-WEBINARRELEASE-013 (cancel withdraws a scheduled launch), ISS-WEBINARRELEASE-014 (series review reflects later parent cancellation)

## Changed paths (packages/meeting-bot/src/calendar)
- state/schedule-withdraw.ts (new): withdraws saved launch jobs for cancelled occurrences/series (job file first, then one-off task, then dedup entry).
- state/schedule-dedup-state.ts: `ScheduledJob.recurringEventId`, `removeScheduled`.
- schedule-tick.ts: series-cancel marks still-listed occurrences cancelled; calls withdraw (not in dry-run); records `recurringEventId` on calendar jobs.
- scheduled-dispatch.ts: re-reads the saved job right before capture; absent = refusal.
- task-scheduler.ts: optional `TaskScheduler.cancelOnce` (`schtasks /delete`, idempotent).
- auto-record-policy.ts: `recurring-series` is no longer terminal in `projectWebinarInventory`; an unchanged series row is not rewritten.
- state/schedule-withdraw.test.ts (new): 6 tests.

## Contract
- D-178 ruling 3 / qa/contracts/calendar-unknown-tombstone.md clause 2: a real cancellation (known id or link+start) stops the launch. Unknown-tombstone reach logic is untouched.
- Withdrawal matches exactly: session key, or calendar source id (id-only tombstone), or `recurringEventId` for a cancelled non-instance event. An instance never matches a series.
- Not touched: join-rules router, opt-out code, qa/contracts, DECISIONS.

## Checks a checker should run (from packages/meeting-bot)
- `node --test --import tsx src/calendar/state/schedule-withdraw.test.ts` (6)
- Regression set: schedule-tick, scheduled-dispatch, task-scheduler, webinar-policy, state/schedule-state, schedule-state-safety, state-tenant-tag, schedule-tick-rules-integration, join-rules/join-rules-approved-trust-tick, autojoin/tick-and-watch (142 with the new file)
- tsc --noEmit for packages/meeting-bot and apps/api; `node scripts/lint-loc.mjs --all` (10 stages)
- D-015 floor: `node --test --import tsx --test-name-pattern=013 src/routes/calendar.test.ts` in apps/api

## Evidence
- New file 6/6; regression set 142/142; both tsc exit 0; lint-loc --all OK, 10 stages.
- ISS-WEBINARRELEASE-013: floor test 1/1 (apps/api resolves @lkb to the MAIN tree, so it measures main code, not this lane). The row's recorded cases are the adapter drop and the stale selector; the remaining gap it describes (a scheduled launch surviving a later cancel) is covered by tests 1, 2, 5 here.
- ISS-WEBINARRELEASE-014: row records one replay, not a case list; replayed in the last test as projection live then parent cancelled: 1/1.
- Mutations (D-020, per-mutation backup, pre/post hash equal): M1 drop dispatch recheck -> test 2 fails; M2 disable tick withdraw -> 3 fail; M3 instance cancels series -> 3 fail; M4 014 terminal list -> test 6 fails; M5 withdraw everything -> 4 fail. Logs in the scratchpad (rc-mut-*.log).

## Left open
- Gmail-only job for a meeting whose Calendar copy is cancelled by id only (no link/start) is not matched in the tick path; the reconcile path (linkedCalendar) covers it.
- A capture already past `record` is stopped by the pipeline's active-stop (activeWebinarStopReason), not by this change.
- The Windows `schtasks /delete` path is read-reviewed only (fake exec in tests), no real task created.

## Fix cycle 1 (checker verdict a9fb2e14 on 3648d62b)
- Withdrawal now matches only the saved job's OWN Calendar event id (raw feed rows with cancelled=true) or its `recurringEventId`; session-key matching through the selector's identity barrier is removed (ISS-TOMBSTONE-005). Gmail-sourced jobs are never withdrawn by the tick.
- New test: forged tombstones (link+start, start+title, id-only, foreign id with recurringEventId) leave all 3 jobs; the job's own cancelled event withdraws. Now 7 new tests; regression set 128/128 incl. them; tsc meeting-bot and api exit 0; lint-loc --all OK; 013 floor 1/1.
- Mutations M1-M5 plus M6 (withdraw on any tombstone) all fail the new file (failing tests: M1 1, M2 4, M3 4, M4 1, M5 5, M6 5); pre/post hashes equal.
- ISS-WEBINARRELEASE-013 id-only tombstone + stale Gmail invite in the tick path: NOT changed. Holding every unlinked Gmail row on any id-only tombstone is the contract's id-only tier (clause 2/4, bounded, in the reconcile path); doing it in the legacy tick would also trip clause 1 non-interference. Needs the owner to say the tick must use the reconcile path.
- Junctions: apps/api and meeting-bot do not import @lkb/meeting-bot (api has no such junction), so the 013 floor test cannot exercise lane code; no junction change made.
