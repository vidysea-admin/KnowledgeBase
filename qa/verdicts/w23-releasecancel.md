# Verdict: w23-releasecancel (ISS-WEBINARRELEASE-013, ISS-WEBINARRELEASE-014)

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 355cf2ba0395d29932f40a2523d5f210d9cb0ba8
Base: 4264418c7488d95e76bc0d86e3920efb0e0ccd72 (prior reviewed candidate 3648d62b)
Checker: independent (fresh context), 2026-10-18

Scope of PASS: the withdrawal unit (013 withdrawal part, 014). ISS-WEBINARRELEASE-013 itself is NOT closed (see Rows).

## Cycle 1 results
1. Outsider probe, rerun on 355cf2ba (the same fixture as cycle 0: schedule one webinar in its lead window, tick again with the live event plus one tombstone): link+title+start copy job kept; start+title only kept; id-only kept; free-text link kept; our own event id cancelled withdrawn. F1 fixed. Exit 0, log `rc/probe1.log`.
2. Spoof analysis. `matches()` (schedule-withdraw.ts) now trusts only (a) the saved job's own `dispatchPolicyV1.sourceId`, set when the job was written from the Calendar item we selected, compared with `e.id` of a raw feed row (`ownEvents`, schedule-tick.ts:144) that has `cancelled`; (b) `job.recurringEventId` against a cancelled non-instance row's id. Session keys and the selector's identity barrier no longer reach it. The feed is our own authenticated Calendar read (`/calendar/upcoming?discovery=1`), where ids come from our calendar. An outsider can copy link, start, title and organiser, but cannot give their own tombstone our event's id; only the organiser of the meeting can cancel that event, which is a genuine cancellation. A tombstone carrying a foreign `recurringEventId` is an instance and never joins `cancelledSeries`. Residual (note, not a finding): knowledge of our event id plus the ability to cancel it implies organiser control. A Gmail-sourced job is never withdrawn by the tick.
3. Test inventory. `git diff 3648d62b 355cf2ba --stat`: schedule-tick.ts (1 line), schedule-withdraw.ts, schedule-withdraw.test.ts (+1 test, 1 call updated), the manifest and my cycle-0 verdict. No other test file touched; grep of the diff for removed `test(`/`it(`/skip lines found none beyond the one reworked call. The maker's 142 -> 128 was a different file list in its own run; my cycle-0 list rerun on the candidate gives 143 = 142 + 1 new, 0 skipped, 0 todo.
4. Commands (lane, `timeout 600`): regression set (same 11 files as cycle 0) tests 143, pass 143, fail 0, skipped 0, exit 0 (`rc/reg1.log`); tsc packages/meeting-bot exit 0; tsc apps/api exit 0 (apps/api resolves `@lkb/*` to MAIN, so it does not type-check lane meeting-bot code; no api import of lane code exists). New file passes inside the set.
5. Own mutation (per-mutation byte backup, trap on INT/TERM/ERR, restore verified): `matches()` first condition replaced with `input.cancelledEventIds.length > 0` (withdraw on any tombstone). Applied; new file exit 1, 5 fail / 2 pass, including the new forged-tombstone test. Restore check with `-c core.autocrlf=true`: pre = HEAD:file = post = 42201deee3014ab2855e21defc1cce1845d53ea7; `git status` clean. Log `rc/mut1.log`.
6. ISS-013 left open: acceptable as non-blocking for this unit. The unit's purpose is withdrawal of a scheduled launch, which now works for the job's own cancelled event, its series, and never for look-alikes. The residual (id-only tombstone plus stale Gmail invite still schedules in the legacy tick path, F2 in the history below) needs a hold on unlinked Gmail rows. That hold exists in the bounded reconcile path and would breach contract clause 1 in the tick. It pre-dates this unit, is unchanged by it, and is an owner decision (route the tick through reconcile). It is not hidden: the row stays open.

## Rows
- ISS-WEBINARRELEASE-014: may flip to fixed/verified (test 6 replay on lane code passes; code read-verified).
- ISS-WEBINARRELEASE-013: stays OPEN; add a note that the scheduled-launch withdrawal part is verified (verdict cycle 1 on 355cf2ba) and the id-only tombstone plus Gmail invite tick gap remains.
- Maker may flip the manifest to checked-PASS.

ISSUES-WRITTEN: none
Metrics: checker tokens unknown (null); active time not clocked (about 10 minutes of tool time); ratio unverified.

---

# Superseded history: cycle 0 (candidate 3648d62b, FAIL)

## Prior header: w23-releasecancel (ISS-WEBINARRELEASE-013, ISS-WEBINARRELEASE-014)

Cycle-0 VERDICT: FAIL
Cycle-0 cycle checked: 0
Cycle-0 reviewed SHA: 3648d62b2d9c9b6b077cf85dd2f1a191c2b3136b
Base: 4264418c7488d95e76bc0d86e3920efb0e0ccd72
Checker: independent (fresh context), 2026-10-18

## Blocking finding F1 (security): an outsider's cancelled-invite tombstone withdraws our scheduled launch (ISS-TOMBSTONE-005 attack, new vector)

File: packages/meeting-bot/src/calendar/schedule-tick.ts:141-147 and packages/meeting-bot/src/calendar/state/schedule-withdraw.ts:23-26 (`matches`, first branch `c.sessionKey === job.sessionId`).

Cause: `withdrawCancelledLaunches` is fed every `result.skipped` row with reason "cancelled". In everyWebinar mode `selectAutoRecordItems` (auto-join.ts:151-166) spreads a `cancelled` barrier to every item sharing the meeting identity (link + start) and rewrites each item's sessionKey to that identity key. A stranger's cancelled invite that merely copies the scheduled meeting's link and start therefore turns our own live Calendar row and Gmail row into "cancelled" skips with the same session key as the saved job, and the job is deleted. The tick feed is the raw discovery feed (`/calendar/upcoming?discovery=1`, cancelled tombstones retained, gws-calendar.ts), so this is reachable in production. The tick path has no known/unknown distinction at all, so nothing tests for it. Contract clause 1 (calendar-unknown-tombstone.md) requires outcomes identical with and without tombstones that copy a trusted row's start, title or link; D-178 ruling 3 and clause 2 allow release only for real (known) cancellations.

Fixture (copy kept at scratchpad `rc/zz-checker-probe.test.ts`; not committed): schedule one webinar (link `https://zoom.us/j/123456789`, start 12:00Z) in its lead window, then tick again with the live event plus one tombstone, and check the job file.

| Tombstone | Job kept |
|---|---|
| outsider copies title + start + end + conference link (organizer evil@attacker.example, id evil1) | NO, job deleted (BLOCKING) |
| outsider copies title + start, no link | yes |
| outsider id-only, unknown id | yes |
| outsider copies link with meetingUrlSource "description" | yes |
| our own event id cancelled (real cancellation) | no, withdrawn (correct) |

Probe result: 4 pass / 1 fail by my assertion (the failing case is the link+start copy); exit 1; log `rc/probe.log`.

Fix direction: build the withdrawal input only from cancellations that are real. The ref's calendar `sourceId` must equal the job's own calendar event id (`job.dispatchPolicyV1.sourceId` with source "calendar"), or the ref must come from a stored/accepted occurrence (reconcile "known" cancellation). Do not match on `sessionKey` taken from identity-barrier skips. For a Gmail-sourced job, require a reconcile-linked known cancellation. Add a test with the link+start-copy tombstone above (and a tz-shifted/near-miss variant) that must leave the job in place, and verify it fails on the current code.

## Other findings

F2 (medium, ISS-WEBINARRELEASE-013 not closeable): an id-only tombstone plus a stale Gmail invite still schedules in the tick path. My lane-code replay of the row's scenario: with a cancelled calendar copy carrying url/start/end plus the stale Gmail invite, `toSchedule=0`, skipReasons `["cancelled","cancelled"]`, no job written (fixed). With an id-only tombstone (no link/start) plus the same Gmail invite, `toSchedule=1`, skipReasons `["cancelled"]`, job written (still open; the manifest lists this as left open). Contract clause 2 names id-only as a required shape. Log `rc/d015.log`, fixture `rc/zz-d015.test.ts`.

F3 (low note, not filed): if `unlinkSync` of the job file fails with a non-ENOENT error, the job and task survive and the dispatch recheck passes, so the launch proceeds. Ordering and partial failure otherwise hold, as in Order below.

## Order and partial failure (read-verified, plus test 2)
- Job file deleted first, then `cancelOnce`, then `removeScheduled`. Dispatch re-reads the job after rule evaluation and refuses if it is absent or its sessionId differs (scheduled-dispatch.ts:84-87), so a task whose delete failed refuses at launch (logged "will refuse at launch"). Test 2 covers withdrawal landing between the checks and capture.
- Dedup delete failure is caught by the per-job catch after the job and task are already gone; no second schedule happens. The stale dedup entry only blocks a later un-cancel; acceptable.
- A schtasks failure that is not "not found" rejects and is logged; "not found" is treated as success.

## D-015 (per row)
- ISS-WEBINARRELEASE-013: the maker's floor command (`--test-name-pattern=013`, apps/api calendar.test.ts) imports only apps/api code and the @lkb junction points at MAIN, so it says nothing about lane code. It ran 1/1 pass for me, exit 0. Lane-code replay of the row's recorded scenario is under F2: the url/start/end case is fixed, the id-only case is not. Row must stay open.
- ISS-WEBINARRELEASE-014: the row records one replay, not a case list. The lane test 6 replays it against lane code (live series, then parent cancelled -> reason "cancelled"; unchanged series not rewritten): passes. The code change (`recurring-series` no longer terminal) is read-verified. Substantively satisfied; the row may flip once F1 is fixed and re-checked, since both rows ship in the same unit.

## Commands (all from the lane; node from the codex runtime; each with `timeout 600`)
- New file `src/calendar/state/schedule-withdraw.test.ts`: 6/6 pass, exit 0 (`rc/new.log`).
- Regression set (10 files plus the new file): tests 142, pass 142, fail 0, exit 0 (`rc/reg.log`).
- `tsc --noEmit` packages/meeting-bot: exit 0. apps/api: exit 0, but apps/api resolves `@lkb/*` to the MAIN tree via junction, so it does not type-check against lane meeting-bot code.
- Mutation (own, per-mutation byte backup, trap on INT/TERM/ERR, restore verified): in `schedule-withdraw.ts` `matches()` returns true whenever any cancellation exists. Applied (exit 0); new test file ran exit 1: 4 failed (tests 1-4), 2 passed. Killed, but only by sibling-collateral tests; no test pins an outsider tombstone. Restore check with `-c core.autocrlf=true`: pre = HEAD:file = post = a3963fd0c9c2ddc6468bfc32f6557ca3c257671e. `git status` clean afterwards. Probe files were created and removed before commit.
- Not run: lint-loc, real schtasks, browsers, full suites.

## Ledger
ISSUES-WRITTEN: none (F1 and F2 are in-scope findings of this unit; the ledger rows stay open).
Ledger rows may NOT be flipped: ISS-WEBINARRELEASE-013 stays open (F1, F2); ISS-WEBINARRELEASE-014 waits for the cycle-1 PASS of this unit.

## Metrics
Checker tokens: unknown (null). Active time: not measured by a clock; about 25 minutes of tool time. Maker usage not supplied; ratio unverified.
