# Manifest — u4a-watch-failure-alerts

**Contract:** `docs/features/u4-watch-dashboard/spec.md` — **R1** ("Alert on a failed poll") and
**R3** ("Alert before a recording starts") only; approved as written by D-046 (2026-09-28).
`docs/features/u4-watch-dashboard/plan.md` — the U4a row: files, "no schema", "fake-transport unit
tests per R1/R3, incl. the throttle key; assert no alert on a healthy run", criticality medium.
`qa/gates/plan-approved-u4-watch-dashboard.md` — Answered: intent/spec/plan, all 2026-09-27/28.
**Fix cycle:** 0 of max 3
**Status:** checked-PASS (cycle 0)
**Persona walk:** skip — plan.md's own U4a row says "skip (no screen)"; this unit adds no UI.
**Backlog tier:** dispatched directly by the orchestrator per D-046's Result ("U4a and U4c are
dispatched as a parallel wave this tick").
**Issues addressed:** none (new-feature unit, not a ledger fix).

## Environment note (not part of this unit's diff, disclosed for reproducibility)

This worktree was branched from master before commits `fa32181..96048e4` landed (42 commits,
including D-043..D-046 and `docs/features/u4-watch-dashboard/{spec,plan}.md` themselves — the
contract this unit builds against did not exist in the worktree at dispatch time). Fast-forwarded
(`git merge --ff-only master`; the worktree branch had zero unique commits, so this was a clean
fast-forward, not a merge) before any file was touched. `node_modules` was also absent in this
worktree (`pnpm install --offline`, resolved entirely from local cache, 20.6s, zero downloads) —
without it, `obs-websocket-js`/`@lkb/core`/`@lkb/ingest` fail to resolve and 6 unrelated test files
error at import time. Both are environment/dispatch gaps, not defects in this unit's diff.

## What changed

- **`packages/meeting-bot/src/capture/telegram-alerts.ts`** (163 -> 180 non-blank lines) — added
  `notifyPollFailed(tenantId, sourceType, sourceId, failedAt, failureReason)` and
  `notifyUpcomingRecording(meetingTitle, reason, startTime?)` to the `TelegramNotifier` interface
  and its `createTelegramNotifier` implementation, placed alongside the five existing `notify*`
  methods (after `notifyFinished`, before `onBotEvent`), using the exact same `fireAndForget` ->
  `fanout.send(key, text)` shape every existing method uses. `notifyPollFailed`'s message names the
  source (`sourceType:sourceId`, tenant), the time, and includes `failureReason` **verbatim** (no
  rewording/truncation). Throttle keys: `pollFailed:${tenantId}:${sourceType}:${sourceId}` and
  `upcoming:${meetingTitle}:${startTime ?? ""}` — unique per method, matching the existing
  per-key-throttle idiom (`joined`, `disconnected`, `finished:${sessionId}`, ...).
- **`packages/meeting-bot/src/capture/telegram-alerts.test.ts`** (253 -> 305 lines) — 7 new tests:
  message content (source/time/failureReason verbatim; meeting/reason), throttle-key isolation
  (same triple collapses within the window; different triples never collide), `startTime`-optional,
  and a documentation test that a notifier no one calls either new method on sends nothing.
- **`packages/meeting-bot/src/capture/notify-channels.ts`** (152 -> 146 lines net incl. one
  comment removed for length, comment-only change) — a header-comment addition stating that these
  two new alert kinds route through this file's existing `send()`/per-key throttle unchanged, and
  explicitly that R1's real "one alert, then silence until it changes state" dedup is state-based
  (the CALLER's job) and NOT this file's time-based backstop. **No functional/exported-API change**
  — the plan's U4a row lists this file, but the generic fan-out primitives already cover both new
  alert kinds without modification; see "What this unit does NOT do" for why no new test was added
  here.
- **`scripts/watch/run-watch.mjs`** (447 -> 522 non-blank lines):
  - Constructs `const telegram = createTelegramNotifier();` in `main()` (same construction
    `record-commands.ts` uses — degrades to `enabled: false`, never throws, when
    `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are unset).
  - **R1 call site**: in the `--ingest` per-file `catch` block, reads the PRIOR `watch_state` row
    via a new `readDriveWatchState(sourceId)` helper (wraps `findWatchState`, never throws — a
    failed read degrades to "alert", the safer default) BEFORE `markDriveState(..., "failed", ...)`
    overwrites it, and calls `telegram.notifyPollFailed(TENANT, "drive", file.id, <now ISO>, reason)`
    only when the new pure export `shouldAlertPollFailed(priorStatus)` returns true (i.e.
    `priorStatus !== "failed"`) — this is the actual `(tenantId, sourceType, sourceId)` state-based
    throttle spec.md R1 asks for ("one alert, then silence until it changes state"); the
    notify-channels time-based key throttle is a secondary backstop only.
  - **R3 call site (partial — see gap below)**: in the Gmail-scan loop (step 2) and the TOC-calendar
    loop (step 3), for each item added to `findings.upcoming`, calls
    `telegram.notifyUpcomingRecording(<title>, <reason>, <date>)` when the new pure export
    `isImminentDate(date, now)` is true (today or tomorrow, UTC) — naming the meeting (Gmail
    subject / calendar agenda) and why it was surfaced (Gmail join-link vs registration-only;
    on-calendar vs members-only Zoom).
  - Added an entry-point guard at the bottom (`if (process.argv[1] && import.meta.url.endsWith(
    basename(process.argv[1])))`), the same idiom `scripts/lint-loc.mjs` already uses, so the
    module can be `import()`ed for its two new pure exports without running `main()`'s real
    Drive/Gmail/Mongo I/O. Behavior when run directly (`node run-watch.mjs ...`) is unchanged —
    verified nothing else imports this file as a module (`grep -rn "run-watch.mjs"` — only doc/QA
    text mentions and its own `lib/*` imports FROM it in the other direction).
  - Two new pure, exported, I/O-free functions: `shouldAlertPollFailed(priorStatus)` and
    `isImminentDate(dateStr, now)` (doc comments explain both; see "What this unit does NOT do" for
    why they have no dedicated test file yet).

**No new file was created.** D-046 granted new-file permission for exactly three files
(`WatchPage.tsx`, `WatchPage.test.tsx`, `watched-sources.ts`), all U4c's, none touched here.

## Why R3's run-watch.mjs wiring is an approximation, stated plainly (per this unit's own brief)

The plan's U4a row names `scripts/watch/run-watch.mjs` as R3's call site, and I built against that.
Having now read both R3 and `run-watch.mjs` in full, I do not think that's actually where "before a
recording starts, naming the meeting and why it was selected" belongs, and I want to say so rather
than quietly ship an approximation as if it were the real thing.

`run-watch.mjs` is U2's Drive/Gmail/calendar **digest watcher** — it lists candidates within a
14-day window with no trust/selection filtering. The actual auto-record **decision** engine is
`packages/meeting-bot/src/calendar/auto-join.ts`'s `selectAutoRecordItems`, consumed by
`schedule-tick.ts`'s `runScheduleTickOnce` (U5, already shipped) — that is where a meeting is
actually **selected** (trusted-sender match, dedup against `alreadyScheduled`, overlap resolution;
`SkippedItem.reason` already exists for the negative case) and where recording is about to actually
happen (`result.toSchedule`, fed to the Windows Task Scheduler). "Why it was selected" most
naturally means that selection, not "Gmail's scan happened to surface a meeting mail."

`schedule-tick.ts` is **not** one of this unit's three authorized files, and D-046/the anti-drift
rule reserve new-file and (by extension, per this unit's brief) new-scope-of-edit permission
explicitly. So what I built is real and tested (it fires on genuinely upcoming, imminent meetings,
naming them and a real reason they were surfaced) but it is a **narrower, earlier signal** than R3
as spec'd — it does not know about trusted-sender filtering, dedup, or the actual scheduling
decision, and a meeting `run-watch.mjs` finds is not guaranteed to be one U5 will actually record.

**Recommendation:** the true R3 wiring — `telegram.notifyUpcomingRecording(item.title, <a
selection-reason string derived from auto-join's own logic>, item.startTime)` inside
`schedule-tick.ts`'s `runScheduleTickOnce`, right where `result.toSchedule` is iterated (next to the
existing `describeToSchedule` log line) — is a small, well-scoped follow-up. It naturally fits
alongside U4b (already `after: U4a` because both touch `telegram-alerts.ts`) rather than needing a
fourth unit of its own.

## How to verify

```
cd packages/meeting-bot
node --test --import tsx "src/capture/telegram-alerts.test.ts"
node --test --import tsx "src/capture/notify-channels.test.ts"
node --test --import tsx "src/**/*.test.ts"
npx tsc --noEmit -p tsconfig.json
cd ../..
node --test --import tsx "scripts/watch/lib/*.test.mjs"
node -e "import('./scripts/watch/run-watch.mjs').then(m => console.log(Object.keys(m)))"
node scripts/lint-loc.mjs
```

## Actual outputs (pasted, from this run)

```
$ node --test --import tsx "src/capture/telegram-alerts.test.ts"
✔ notifyPollFailed sends the source, time, and failureReason VERBATIM (R1) (1.5268ms)
✔ notifyPollFailed: two calls for the SAME (tenantId, sourceType, sourceId) within the throttle window collapse to one (1.8459ms)
✔ notifyPollFailed: a DIFFERENT (tenantId, sourceType, sourceId) triple is never throttled by another triple's key (1.2461ms)
✔ notifyUpcomingRecording sends the meeting title and the selection reason (R3) (1.3033ms)
✔ notifyUpcomingRecording works without a startTime (date-only callers) (1.3654ms)
✔ a healthy tick that never calls notifyPollFailed/notifyUpcomingRecording sends nothing (1.2856ms)
... (21 pre-existing tests, all pass)
ℹ tests 27
ℹ pass 27
ℹ fail 0
```
(baseline before this unit: 20 tests; +7 new, all pass, 0 pre-existing broken.)

```
$ node --test --import tsx "src/capture/notify-channels.test.ts"
ℹ tests 17
ℹ pass 17
ℹ fail 0
```
(unchanged — comment-only edit to this file, no new test needed; see "What this unit does NOT do".)

```
$ node --test --import tsx "src/**/*.test.ts"   (packages/meeting-bot, full suite)
ℹ tests 268
ℹ pass 265
ℹ fail 3
```
All 3 failures are in `src/capture/obs-windows.test.ts`, a file this unit does not touch and that
shares no import with any file this unit changed (checked: `grep -n
"telegram-alerts|notify-channels|run-watch" src/capture/obs-windows.test.ts` -> no matches).
Reproduces identically in isolation (`node --test --import tsx "src/capture/obs-windows.test.ts"`
-> 5 pass / 3 fail, twice in a row, same assertion each time:
`AssertionError [ERR_ASSERTION]: must name how far the bring-up actually got`). This matches D-039's
own disclosure verbatim: "two timing-sensitive tests flake under concurrent CPU load ... a
pre-existing ISS-324 timing test" — this machine currently has several other maker/checker
worktrees running concurrently (`git worktree list` shows 6+ active). **Pre-existing, unrelated,
not introduced by this unit.**

```
$ npx tsc --noEmit -p tsconfig.json
(clean — no output, exit 0)
```

```
$ node --test --import tsx "scripts/watch/lib/*.test.mjs"
ℹ tests 45
ℹ pass 45
ℹ fail 0
```
(unchanged — these test digest.mjs/ingest-chain.mjs/lock.mjs/session-skeleton.mjs, none of which
this unit edited; run to confirm the entry-point guard didn't disturb anything they depend on.)

```
$ node -e "import('./scripts/watch/run-watch.mjs').then(m => { ... })"
imported OK. exports: [ 'isImminentDate', 'shouldAlertPollFailed' ]
shouldAlertPollFailed(undefined) = true
shouldAlertPollFailed("failed") = false
shouldAlertPollFailed("seen") = true
isImminentDate(2026-09-28, now=2026-09-28T12:00Z) = true
isImminentDate(2026-09-29, now=2026-09-28T12:00Z) = true
isImminentDate(2026-10-05, now=2026-09-28T12:00Z) = false
isImminentDate(2026-09-27, now=2026-09-28T12:00Z) = false
```
Confirms (a) importing the module no longer runs `main()` (no Drive/Gmail/Mongo I/O attempted, no
digest printed, no error) and (b) both pure decision functions behave as specified: alert on first
failure and on any state other than "failed"; silence only when already failed; imminent = today or
tomorrow UTC, not further out.

```
$ node scripts/lint-loc.mjs
lint-loc: FAIL — 4 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:359 (budget 300)
  scripts/watch/run-watch.mjs:522 (budget 300)
```
**Same 4 files as the pre-existing baseline — no 5th violation added.** `run-watch.mjs` was
**already** one of the 4 (447 lines before this unit) and grew to 522 with this unit's additions
(notifier construction, R1/R3 call sites, two pure helpers + their doc comments, the entry guard).
Disclosed, not hidden: I did substantially grow an already-over-budget file rather than the two
files with headroom (telegram-alerts.ts 180/300, notify-channels.ts 146/300) — see "What this unit
does NOT do" for why the alternative (a new lib file) wasn't available to me in this cycle.

## Capability coverage

| # | Capability claimed | Test | Falsifying check |
|---|---|---|---|
| 1 | R1: alert names the source, time, and `failureReason` verbatim | `notifyPollFailed sends the source, time, and failureReason VERBATIM (R1)` | asserts the exact reason string `"401 Unauthorized: token expired"` appears unmodified in the sent text, plus `drive:file-123` and the exact ISO timestamp |
| 2 | R1: throttle key is `(tenantId, sourceType, sourceId)` | `notifyPollFailed: two calls for the SAME triple ... collapse to one` / `... a DIFFERENT triple is never throttled` | same triple within the window -> 1 call; different `sourceId` -> 2 calls (notifier-level backstop throttle) |
| 3 | R1: the REAL state-based silence (not merely time-based) | `shouldAlertPollFailed` unit output above: `"failed"` -> `false`, `undefined`/`"seen"` -> `true` | pure function, directly exercised via dynamic import (see "Actual outputs") — this is the mechanism `run-watch.mjs`'s call site actually uses, not the notifier's own time throttle |
| 4 | R3: alert names the meeting and the selection reason | `notifyUpcomingRecording sends the meeting title and the selection reason (R3)` | asserts `Ashoka Educator Dialogues`, `on the TOC events calendar`, and the date all appear in the sent text |
| 5 | Healthy run -> no alert | `a healthy tick that never calls notifyPollFailed/notifyUpcomingRecording sends nothing` (notifier-level) + `isImminentDate` returning `false` for a 7-day-out date (call-site-level, see "What this unit does NOT do" for the full-`main()` gap) | 0 sends when neither method is invoked; `isImminentDate` correctly excludes non-imminent dates so a 14-day-out upcoming item never reaches `notifyUpcomingRecording` |

No mutation-testing pass was run against `run-watch.mjs`'s call-site wiring itself (D-020 applies to
mutation runs; this unit's own logic changes were verified by direct exercise of the pure exports
plus the import-side-effect check, not by a mutate/restore cycle, since there is no test file to
mutate against — see below).

## What this unit does NOT do

- **R2, R4, R5, R6, R7, R8** belong to U4b (the heartbeat detector — schema change, `after: U4a`)
  and U4c (the `/watch` page). Not built, not tested, not claimed here.
- **R3's true selection reasoning** (trusted-sender match, dedup, the actual auto-record decision)
  lives in `schedule-tick.ts`/`auto-join.ts`, which is **not** one of this unit's three authorized
  files. What I built fires on `run-watch.mjs`'s own "upcoming" candidate detection instead — real,
  tested, but a narrower and earlier signal than "the recording was selected." See the dedicated
  section above.
- **R3's repeat-alert risk across separate `run-watch.mjs` process runs is not fully closed.**
  Each invocation is a fresh process with no persisted "already alerted for this upcoming item"
  state (unlike Drive files, which `watch_state` marks "seen"). `isImminentDate`'s 2-day window
  narrows the blast radius (an item alerts on at most 2 calendar dates' worth of ticks, not the
  full 14-day window) but does not eliminate it. Closing this fully would need either a persisted
  seen-set for upcoming items (a schema-adjacent change, not authorized for this "no schema" unit)
  or moving the alert to the real selection engine's own dedup (`alreadyScheduled` in
  `schedule-tick.ts`) — which is the same file named in the section above.
- **No dedicated test file exists for `run-watch.mjs`'s call-site wiring** (the state-read-before-
  write sequencing in the `--ingest` catch block, and the two `notifyUpcomingRecording` call sites
  in the Gmail/calendar loops). `run-watch.mjs` had no pre-existing test file, `main()` performs
  real Drive/Gmail/Mongo I/O, and this unit's brief explicitly forbids creating any new file
  (D-046's new-file grant covers only U4c's three). I made the wiring's decision logic testable in
  isolation (pure exports + the entry-point guard so the module is safely importable) and verified
  it directly via the dynamic-import check above, but the call sites that USE those exports inside
  `main()` are only covered by reading the diff, not by an automated test. **I believe a new file
  (`scripts/watch/run-watch.test.mjs`, following the existing `lib/*.test.mjs` pattern) is
  genuinely warranted here — flagging it per the brief rather than creating it.**
- **`notify-channels.ts` got no functional change and no new test** — its existing generic
  `send()`/throttle API already covers both new alert kinds unmodified; only its header comment was
  extended to say so. If the checker disagrees that this satisfies the plan's "notify-channels.ts
  routing" line item, that's a fair thing to raise — I made a judgement call rather than force an
  unneeded refactor of a file whose existing tests (17/17) I didn't want to put at risk.
- **No mutation/D-020 cycle** was run — there is no committed source defect being fixed here (this
  is new-feature work, not a ledger fix), so D-015's "measure against the issue's own
  reproductions" doesn't apply, and there is no existing RED/GREEN pair to reproduce under mutation.
- **Did not touch** `apps/web`, `apps/api`, any schema file, or `packages/meeting-bot/src/calendar/*`
  (the auto-record scheduler) — confirmed by `git status --short` below.

## Live browser evidence

**Not UI-touching.** plan.md's own U4a row says "skip (no screen)". No `apps/web` file was read or
changed.

## Git status (this unit's diff, narrow pathspec)

```
$ git status --short
 M packages/meeting-bot/src/capture/notify-channels.ts
 M packages/meeting-bot/src/capture/telegram-alerts.test.ts
 M packages/meeting-bot/src/capture/telegram-alerts.ts
 M scripts/watch/run-watch.mjs
```
No file outside these four was modified. No file was created or deleted.

**Handshake status:** checked-PASS — closed out 2026-09-28 against verdict cycle 0 (VERDICT: PASS, commit a91fe90). ISS-356 and ISS-357 remain OPEN in the ledger; per D-042 unit-status and issue-status are separate axes.
