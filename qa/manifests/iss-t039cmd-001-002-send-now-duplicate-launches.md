# iss-t039cmd-001-002-send-now-duplicate-launches

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3-adjacent (T-039 completion; open medium issues ISS-T039CMD-001 and ISS-T039CMD-002). Class: data write (new state file) + the guard against a second browser join: FULL ceremony. Verdict by the checker only.
Lane: lane/t039dupes. Ledger shard `qa/issues.t039dupes.jsonl` (ISS-T039DUPES-001..003). Ledger rows ISS-T039CMD-001/-002 status NOT changed here.

## What was wrong
`readLiveJobs` read only operations.json + raw/webinars/scheduled/*.json. `runRecord` writes `.record-state.json` (pid, sessionId, platform, no meeting URL, one slot per record dir) and the tab status file (no URL); the poller's operation row has no URL. So a manual `lkb record`, a poller recording and an earlier send-now were invisible, and the API remembered only its own launches for 10 minutes.

## Design: one live-recording view, claimed at the single chokepoint
Every launch path ends in `cli.ts record` (manual, `lkb send-now`, the API's detached child, `launchControlledRecording` for the poller, `start-record-detached.ps1` for the Task Scheduler). No existing per-recording state carries the meeting identity, so a new store was needed (`record-commands.ts` is off limits, so the URL could not be added to `.record-state.json`; it is untouched).
- `packages/meeting-bot/src/live-recording/live-recording.ts` (new dir; capture/ and calendar/ are over budget). Store: `raw/webinars/live-recordings/<tenantId>/<sha256(meetingIdentity)[0..32]>.json` = tenant + the planner's own normalised `meetingIdentity` as the key. Entry: tenant, meetingKey, meetingUrl, sessionId, pid, processStartedAt, until, startedAt.
- Claim is atomic: temp file then `linkSync` (EEXIST for the loser), so two starters cannot both win and a reader never sees a half-written file.
- Liveness (reuses `controller-state`'s `getProcessStartTime` + `controllerMatchesIdentity`; same pid + OS start time approach as the job-queue lock): live = pid exists (only ESRCH is death) AND start time not proven different (PID reuse) AND now <= until + 10 min. A dead entry never blocks and is replaced by the next claim. Release deletes only our own entry (pid + sessionId).
- `live-recording/claimed-record.ts`: `runClaimedRecord` claims, refuses with a clear error when a LIVE holder exists (runRecord never starts), releases in `finally`. A link with no meeting identity, or bad flags, is not claimed (runRecord validates as before). If the view cannot be WRITTEN it warns and records anyway (bookkeeping must not cost a recording); the reader is the strict side.
- `cli.ts` (+2 lines): `record` goes through `claimedRecordWithDefaults`. `send-now-command.ts`: `defaultSendNowDeps.runRecord` goes through it too; new `readAllLiveJobs` = scheduler jobs + `readLiveRecordings`.
- `scripts/webinar/send-now-host.ts` (adapter edited ONLY because it builds its own reader): `readAllLiveJobs` + `liveRecordingDir(root)`. Same 409 (`duplicate-live-job`) / 503 (`live-jobs-unreadable`) as before.
- Fail direction: `readLiveRecordings` THROWS on non-JSON, wrong shape, other-tenant tag, or a stray file; send-now then says "cannot tell whether a bot is already in this meeting (...); nothing was launched" (CLI exit 1, API 503). Missing dir = no recordings.

## Reproductions replayed verbatim (live-recording.test.ts, fakes only)
- ISS-T039CMD-001: `send-now <meet> --until 15:00`, then the same command again: 2nd refused (exit 1, "already queued, joining or recording for this meeting"), launched once; after release a third is accepted. Also a manual `record <meet> --until 15:00` and three spellings (case, authuser param, trailing slash): 3/3 refused, a different meeting not blocked. Result: ISS-T039CMD-001: 1/1 recorded reproduction refused (+3/3 spellings).
- ISS-T039CMD-002: poller launch args (`record <zoom url> --backend tab --until <ISO> --session-id webinar-1 --title ... --transcribe --process-video --index`), operations row `recording` with NO URL and NO scheduled file; send-now with the regional zoom link refused; accepted after the recorder exits. Result: ISS-T039CMD-002: 1/1.
Neither ledger row records a larger corpus than these steps.

## Evidence (node from the toolchain; nothing launched: no Chrome/OBS/real CLI)
```
packages/meeting-bot/src/live-recording/live-recording.test.ts  ℹ tests 12 ℹ pass 12 ℹ fail 0
scripts/webinar/send-now-live-recordings.test.ts                ℹ tests 4  ℹ pass 4  ℹ fail 0   (real createSendNowDeps reader: 409 / 503 / dead holder / other tenant)
packages/meeting-bot/src/send-now-command.test.ts               ℹ tests 10 ℹ pass 10 ;  send-now.test.ts ℹ tests 28 ℹ pass 28
scripts/webinar/send-now-host.test.ts                           ℹ tests 12 ℹ pass 11 ℹ fail 1  -> PRE-EXISTING at 9e24d1f (same in the main tree), ISS-T039DUPES-002
tsc --noEmit -p packages/meeting-bot -> clean; send-now-host.ts + new test with --strict -> clean
```
Cases: manual+send-now, poller+send-now, two send-now (sequential, and racing at claim), stale (dead pid, reused pid, past until+grace; start time unknown trusts the pid), dead holder replaced, release only own entry, tenant isolation, unreadable (4 shapes) with the CLI message, record-path refusal / release on error / unwritable view warns.
Mutation (inside the worktree, hash-verified, backup restored in finally, no mismatch): 6/6 killed (liveness dropped, start-time check dropped, parse errors swallowed, held-claim refusal removed (crashed rather than failed an assertion), release removed, recordings omitted from readAllLiveJobs).

## Not delivered / not verified
Real `cli.ts record`, Chrome, OBS: never run. Recordings running before deploy have no entry (ISS-T039DUPES-001). Plan-to-claim window (ISS-T039DUPES-003). Full suite not run. The view is per repo root (one machine), not shared across machines.
