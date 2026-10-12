# t039-send-now-api-endpoint

**Handshake status:** checked-PASS
Fix cycle: 1
Tier: 3 (next unblocked roadmap task, T-039). Class: auth scope + operator URL that drives a browser join: FULL ceremony. Verdict by the checker only.
Lane: lane/sendnowapi. Ledger shard `qa/issues.sendnowapi.jsonl` (ISS-SENDNOWAPI-001..005).
Authority: Approver (Umesh) ruling 2026-10-12 - create a new dedicated API key scope named exactly `send-now` for this endpoint (the DECISIONS entry is being appended in parallel; cite the ruling, not an entry id).
Round cap: planner (PASS cycle 2) and command (PASS cycle 0) PASSes name the send-now seam; this is the third unit; the cap applies to non-security findings only and this unit is security-class.

## Scope: the API half of T-039. T-039 is NOT complete
Web button, shared duplicate state, status endpoint and the 60 s measurement are not delivered.

## Route
`POST /calendar/send-now`, body `{ meetingUrl: string, until: string }` (`until` = HH:MM or ISO, because `runRecord` requires `--until`; no default invented).
- 202 `{ jobId, status: "launching", meetingKey, platform }` - the launcher process started and survived 2 s; the bot has NOT joined.
- 400 bad body / extra field (incl. a body `tenantId`) / planner refusal (reason + message) / bad `until`; 403 missing `send-now` scope or host captures for another tenant; 409 live job already covers the meeting; 502 launcher failed to start; 503 live-job state unreadable, planner threw, or no adapter injected.
- Scope: exact-match `requireScope("send-now")`; a key with only `calendar` (or `join-rules`, near-miss strings) gets 403. Tenant only from `req.auth.tenantId`.

## Files
- `apps/api/src/join-rules/send-now.ts` (new): router, structural `SendNowDeps` (`plan`, `launch`), `unavailableSendNowRouter`. In the existing `join-rules/` dir (11 -> 13 files, budget 30).
- `apps/api/src/routes/calendar.ts` (+5): optional `CalendarReadDeps.sendNow`; mounts the router, or the 503 router when absent. **server.ts is NOT edited** (the dep rides on `CalendarReadDeps`), so there is nothing to conflict with the apilogger lane.
- `scripts/webinar/send-now-host.ts` (new): the real adapter. `plan` = tenant check -> `until` check -> strict `readLiveJobs` -> `planSendNow` (the link-safety validator: https only, no credentials/port/redirect, platform allow-list, meeting identity). `launch` = `spawn(node, ["--import","tsx",cli.ts,"record",url,"--until",...,"--tenant",...,"--session-id",jobId])`, detached, no shell, output to `raw/webinars/<jobId>.log`, rejects if the child errors or exits within `livenessMs`.
- `scripts/webinar/join-rules-api-host.ts` (+3 lines): the one production wiring point, `calendar: { ...prod.calendar, sendNow: createSendNowDeps() }`. `composition/production.ts` is not edited: apps/* cannot import packages/meeting-bot, and this script is where join-rules is wired the same way. `apps/api/src/index.ts` therefore still answers 503 (ISS-SENDNOWAPI-004).
- `scripts/mint-key.mjs` (+2): `"send-now"` appended to `ALL_SCOPES`. Not added to any seed key, test default or existing key (ISS-SENDNOWAPI-001 flags that this puts it on the live-verify key).
- Tests: `apps/api/src/join-rules/send-now.test.ts` (12), `scripts/webinar/send-now-host.test.ts` (9).

## Duplicate protection - what it can and cannot see
Sees: task-scheduler jobs via `readLiveJobs` (operations.json + `scheduled/*.json`; unreadable state = 503, never "no jobs"); launches made by THIS API process in the last 10 min (incl. concurrent requests: one in-flight slot per tenant+meetingKey; a failed launch is not remembered).
**Still blind: a manual `lkb record` / `send-now` CLI launch and poller-launched recordings leave no readable trace. ISS-T039CMD-001 and ISS-T039CMD-002 REMAIN OPEN, unfixed here.** Restarting the API forgets its own memory (ISS-SENDNOWAPI-002). The tab-capture lock is the last guard.

## Evidence (node from the toolchain; nothing launched except `node argv-dump-fixture.mjs`)
```
node --test --import tsx apps/api/src/join-rules/send-now.test.ts      -> ℹ tests 12  ℹ pass 12  ℹ fail 0
node --test --import tsx scripts/webinar/send-now-host.test.ts         -> ℹ tests 9   ℹ pass 9   ℹ fail 0
node --test ... routes/calendar.test.ts join-rules/router.test.ts join-rules/scope-write.test.ts server.test.ts scripts/webinar/join-rules-host.test.ts -> ℹ tests 58 ℹ pass 58 ℹ fail 0
apps/api: tsc --noEmit -p tsconfig.json -> exit 0.  scripts/webinar/send-now-host.ts + test: tsc --strict (no project covers scripts) -> clean.
lint-dirsize: 3 violations, all pre-existing dirs I added no file to (packages/meeting-bot/src/calendar 31, apps/api/src 32, apps/api/src/routes 32).  lint-loc: only packages/meeting-bot/py/sb_join.py (pre-existing).
```
Test coverage: 403 without scope (read key, near-miss scopes) / 401 no key / 202 with; tenant from key only, extra or tenant body field 400, tenant A launch not a duplicate for B; 12 malformed bodies; hostile links through the REAL planner (http, look-alike host, javascript:, credentials never echoed, redirect param, port, bare host); duplicate (planner, own launch, expiry, two concurrent requests -> one launch); launcher failure 502 without leaking cause and retry allowed; unreadable state 503 (fake reader and real reader over a corrupt scheduled file); no adapter 503; real spawn of the argv fixture (argv fidelity, log file, job id shape), dead-at-once launcher and missing binary -> 502; `send-now` appears once in mint-key's `ALL_SCOPES`.

## Not delivered / not verified
Real CLI, Chrome, OBS, a meeting: never run. The 60 s join clause: not measured. No mutation run. Full suite not run. `mint-key.mjs` not executed (needs Mongo). The wiring in `join-rules-api-host.ts` is typechecked only, not started. Router logs body-parser JSON errors to the console in tests (existing behaviour).

## Fix cycle 1 (maker; checker verdict d5dfee7 PASS cycle 0 left ISS-SENDNOWAPI-001 and -005 open; ledger status NOT changed here)

### ISS-SENDNOWAPI-001 - send-now is no longer on default keys
- `scripts/lib/mint-scopes.mjs` (new, pure, + `.d.mts`): `DEFAULT_SCOPES` = the pre-T-039 14 scopes, unchanged; `WRITE_SCOPES = ["send-now"]`; `scopesFromArgv(argv)` returns the defaults plus any scope named with `--with-scope send-now`. An unknown/typo'd name, `keys`, `join-rules`, or a bare flag throws, and `mint-key.mjs` exits 1 before connecting. `mint-key.mjs` no longer has `ALL_SCOPES`; it mints `scopesFromArgv(process.argv.slice(2))`.
- "Mirror join-rules": I could not mirror anything. `mint-key.mjs` never handled `join-rules` (it is not mintable by this script at all; grep finds no mention). I applied the contract rule (t037 item 10, read-only: no key holds the dedicated write scope unless issued deliberately) directly: explicit request only. The checker should confirm this reading.
- Existing keys, seed keys and fixtures: untouched. Test (`send-now.test.ts` minting test, rewritten): default and unrelated flags -> exactly the 14 defaults; `--with-scope send-now` (also repeated) -> defaults + send-now; 6 refusal cases.

### ISS-SENDNOWAPI-005 - `until` is validated as a real time
- `untilProblem(until, now)` in `scripts/webinar/send-now-host.ts`, called in `plan()` after the existing `todayAt` check and before the live-job read, so a 400 `invalid-until` happens before any spawn. Rules: HH:MM needs hour 0-23 and minute 0-59 (the old `todayAt` rolled 25:00/99:99 into the next day); ISO needs a UTC offset (`Z` or +hh:mm), a real calendar date (V8 rolls 2026-02-30 to March, so it is checked explicitly), seconds/minutes/hours in range, no trailing text; then `until` must be after now (an HH:MM already passed today is refused as past) and at most 24 h ahead.
- Source of the bounds: past = `runRecord` already throws "--until must be in the future" (record-commands.ts:101), so this refuses it early. **Upper bound: no existing bound found** (planSendNow, send-now-command and runRecord bound only the lower side), so 24 h (`MAX_UNTIL_AHEAD_MS`) is **my assumption; checker please confirm or set another cap**.
- Tests (`send-now-host.test.ts`, 9 -> 12): `untilProblem` table (16 bad values incl. 25:00, 24:00, 99:99, 12:60, impossible ISO clock, trailing text, 2099, 2000; exact-now and earlier-today refused; boundaries just inside/outside 24 h); route-level 400 with no log file/spawn for 25:00, 09:00, 2000, 2099, one second ago, then a valid `18:00` still 202; Feb-29 rollover case. Test clock `NOW` is now local 10:00 so `"18:00"` is time-zone independent; the one scheduled-job fixture date moved to 2026-10-13 for the same reason.

### Evidence (node from the toolchain; nothing launched except `node argv-dump-fixture.mjs`)
```
node --test --import tsx apps/api/src/join-rules/send-now.test.ts   -> ℹ tests 12  ℹ pass 12  ℹ fail 0
node --test --import tsx scripts/webinar/send-now-host.test.ts      -> ℹ tests 12  ℹ pass 12  ℹ fail 0
apps/api: tsc --noEmit -p tsconfig.json -> 2 errors, both PRE-EXISTING at the base commit (src/indexing/session.ts:161, src/routes/brain.test.ts:139; same 2 with my changes stashed); none in files touched here.
scripts/webinar/send-now-host.ts + test: tsc --strict -> clean.
```
Mutations (harness inside the worktree, deleted; per-mutation byte backup restored in `finally`; blob hash == pre-run verified): M1 no past check KILLED; M2 no 24 h cap KILLED; M3 hour limit 23->24 KILLED; M4 plan() skips untilProblem KILLED; M5 send-now in default scopes KILLED; M6 no scope-name validation KILLED; M7 calendar-date check dropped (first attempt SURVIVED because Feb 30 is already past on the test clock) -> added the 2026-02-29 test, re-mutated by deleting the check line: KILLED. 7 of 7 killed after the added test.

### Still not done
Not run: mint-key.mjs itself (needs Mongo), real CLI/Chrome/OBS, full suite. ISS-SENDNOWAPI-002/-003/-004 and the T-039 remainder are unchanged.
