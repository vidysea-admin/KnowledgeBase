# Manifest — u5-auto-record-scheduler

**Contract:** `qa/contracts/calendar-auto-join.md` (T-025) — extended, not amended by the maker (see
"Contract gaps disclosed to the checker" below; the maker never edits `qa/contracts/`).
**Goal task:** u5-auto-record-scheduler (docs/plan.md row 12; TASKS.md T-036/T-037/T-038)
**Date:** 2026-09-27
**Fix cycle:** 2 of max 3 (previous verdict: FAIL — `qa/verdicts/u5-auto-record-scheduler.md`, cycle 1)
**Dual check:** no (no `.goal/goal.json` task with `criticality: critical` matches this slug in
this worktree at build time — the row's own risk column reads "high (auto-triggers real
recordings — outward-facing risk)"; flagging for the checker to apply 7b if `.goal/goal.json`
disagrees).
**Persona walk:** skip (scheduler/CLI unit, no new screen — `docs/plan.md` row 12's own "UI/UX"
column reads "skip (scheduler, no new screen)").
**Issues addressed:** none (new unit, not a fix cycle on a filed issue)
**Executor:** claude-opus-subagent (this session)
**Executor rationale:** dispatched directly as a maker build subagent per the orchestrator's
brief; not a delegation-ledger pick.

## Policy this unit implements (authorization trail)
Umesh approved "U5 auto-record policy" first-hand twice, recorded in `qa/feedback-inbox.md`:
- 2026-09-26T23:54:34+05:30 — ticked "bot auto-joins meetings from trusted senders as you,
  without asking you each time" in a checker-session `AskUserQuestion`.
- 2026-09-26T23:56:41+05:30 — confirmed again in a maker session: "U5 fully automatic;
  registration forms stay human; real Telegram/WhatsApp sends still need their own approval."

This build changes no production data and sends nothing outward: it is pure selection logic +
an injectable/fakeable Windows-task wrapper, exercised only against fakes in this session (see
"Known gaps" — no real Windows Scheduled Task was created).

## Dependency facts (PARALLEL WAVES planning slot)
- **files:** `packages/meeting-bot/src/calendar/{auto-join.ts,auto-join.test.ts,auto-record-policy.ts,
  schedule-state.ts,schedule-state.test.ts,task-scheduler.ts,task-scheduler.test.ts,
  schedule-tick.ts,schedule-tick.test.ts}`, `packages/meeting-bot/src/cli.ts` (2-line addition only)
- **schema:** no (no new Mongo collection — see "Known gaps" for why a file-based dedup state was
  chosen instead)
- **surface:** new CLI subcommand `lkb schedule-tick [--dry-run]`; new exports from
  `@lkb/meeting-bot`'s `calendar/auto-join.js` (`selectAutoRecordItems`, types) and the two new
  sibling files
- **consumes:** `GET /meeting-candidates` (existing route, `gmail-meeting-candidates-approval.md`)
  over HTTP — never `@lkb/db` directly (dependency-cruiser: `meeting-bot -> ingest, core` only);
  `scripts/webinar/start-record-detached.ps1` (existing, unmodified) as the eventual scheduled
  command
- **runtime:** none reserved — no port, no DB, no browser. A real run would need `schtasks.exe`
  (Windows-only) and a reachable API server, neither touched in this build session.

## What changed
- `packages/meeting-bot/src/calendar/auto-join.ts:207` — new `selectAutoRecordItems(input)`: pure
  merge of calendar events + Gmail meeting-candidates into one decision (to-schedule vs skipped +
  reason). Types at `:57` (`AutoRecordCandidateInput`), `:73` (`AutoRecordItem`), `:84`
  (`SkipReason`), `:92` (`SkippedItem`). Original `selectEventsToAutoJoin` (T-025) is untouched.
- `packages/meeting-bot/src/calendar/auto-record-policy.ts` (new, 82 lines) — split out of
  auto-join.ts to clear the 300-LOC file budget (`structure.config.json`, same precedent as
  `record-finalize.ts`/`record-commands.ts`): `TrustedSenderConfig` (`:15`), `redactJoinLink`
  (`:25`), `isTrustedSender` (`:50`), `loadTrustedSenderConfig` (`:77`, reads
  `AUTO_RECORD_TRUSTED_EMAILS`/`AUTO_RECORD_TRUSTED_DOMAINS`, defaults to karunn@vidysea.com +
  theoutreachcollective.in/ashoka.edu.in/zoho.com/zoom.us per the unit brief). Re-exported from
  `auto-join.ts:20-24` so existing import paths keep working.
- `packages/meeting-bot/src/calendar/schedule-state.ts` (new, 59 lines) — file-based dedup state
  (`readScheduleState`/`readScheduledKeys`/`recordScheduled`, `:29,35,48,54`), mirroring
  `capture/controller-state.ts`'s read/write/remove-never-throws convention.
- `packages/meeting-bot/src/calendar/task-scheduler.ts` (new, 96 lines) — `createWindowsTaskScheduler`
  (`:72`), real-by-default via `child_process.execFile` (array args, never a shell string — no
  command-injection surface even though `-Title`/`-Url` are user/sender-controlled text) but
  injectable; `toLocalHHMM`/`toSchtasksDateTime` (`:47,53`) for the local-time format both
  `schtasks /st` and `lkb record --until` expect.
- `packages/meeting-bot/src/calendar/schedule-tick.ts` (new, 199 lines) — `runScheduleTickOnce`
  (the testable core), `createHttpCandidateLoader` (`:83`, `GET /meeting-candidates` over `fetch`,
  filtered client-side to `approved`/`auto_approved`, degrades to `[]` on any failure — never
  throws), `loadNoCalendarEvents` (no real Google Calendar credentials exist yet — calendar-
  auto-join.md's own disclosed non-goal, still true), `buildRealScheduleTickDeps` (`:118`, real
  wiring: `LKB_API_URL`/`LKB_API_KEY` env, `raw/webinars/` state dir), `runScheduleTick` (the CLI
  entrypoint).
- `packages/meeting-bot/src/cli.ts:48,165` — two-line addition: import + `schedule-tick` dispatch.
- Tests: `auto-join.test.ts` (+22 tests for `selectAutoRecordItems`/`isTrustedSender`/
  `loadTrustedSenderConfig`/`redactJoinLink`), `schedule-state.test.ts` (5 tests, real temp-dir
  filesystem I/O), `task-scheduler.test.ts` (5 tests, fake `execFile` — the real `schtasks.exe`
  binary is never invoked), `schedule-tick.test.ts` (9 tests: dry-run, real-with-fakes, dedup
  across two ticks, `createHttpCandidateLoader`'s failure contract via a stubbed global `fetch`).

## Real bugs found and fixed while building (disclosed, not scope creep)
1. **Config-trust could override an explicit human rejection.** First draft's `isTrustedSender`
   check ran independently of a candidate's `rejected` status, so a candidate a human had
   explicitly rejected could still auto-schedule if its sender domain happened to be on the config
   allowlist (e.g. `theoutreachcollective.in`). Caught by the "rejected candidate… never
   auto-scheduled" test failing red on the first real run (not written to pass — see red/green
   below). Fixed by adding `NormalizedItem.rejected` and checking it before the trust check
   (`auto-join.ts`, the loop inside `selectAutoRecordItems`) — a rejection is now final regardless
   of config trust.
2. **`-Until` was building a raw ISO string**, but `lkb record --until`/`start-record-detached.ps1
   -Until` (`record-commands.ts`'s `todayAt`) expects local `HH:mm`. Fixed by adding
   `toLocalHHMM` to `task-scheduler.ts` and using it in `schedule-tick.ts`'s `scheduleOnce` call —
   caught by reading `record-commands.ts` before wiring the args, not by a failing test (no test
   actually invokes the real launcher script in this session), so this is disclosed as read-time
   verification, not test-caught. The `schedule-tick.test.ts` "-Until must be local HH:mm, not raw
   ISO" assertion now guards the regression.

## Red before / green after (D-020-adjacent discipline — no mutation run here, so no
backup/restore needed, but the same "prove it actually moved" habit applies)
Before writing `selectAutoRecordItems`, `packages/meeting-bot/src/calendar/auto-join.ts` had only
`selectEventsToAutoJoin` — `selectAutoRecordItems`, `isTrustedSender`, `loadTrustedSenderConfig`,
`redactJoinLink`, `schedule-tick`, dedup state, and the Windows task scheduler did not exist at
all, so every new test below was failing (module not found / function undefined) before this
unit and is green after.

## How to verify (commands + expected)
- `cd packages/meeting-bot && npx tsc --noEmit -p tsconfig.json` → expect exit 0.
- `cd packages/meeting-bot && node --test --import tsx src/calendar/auto-join.test.ts src/calendar/schedule-state.test.ts src/calendar/task-scheduler.test.ts src/calendar/schedule-tick.test.ts` → expect `pass 49, fail 0`.
- `node scripts/lint-loc.mjs` (repo root) → expect the ONLY violations named are
  `packages/index/src/pipeline/speakers-llm.ts` and `scripts/watch/run-watch.mjs` (pre-existing,
  reproduced identically on this branch's base commit `58a9f4c`, neither file touched by this
  unit) — never a `calendar/*.ts` file.
- `npx depcruise --config .dependency-cruiser.cjs packages/meeting-bot` → expect "no dependency
  violations found".
- `cd packages/meeting-bot && npx tsx src/cli.ts schedule-tick --dry-run` → expect a clean exit,
  a line naming "LKB_API_KEY not set" (no key in this environment), `0 to schedule, 0 skipped`,
  and no error/stack trace.

## Actual outputs (from this session's own runs)
```
$ npx tsc --noEmit -p tsconfig.json
(no output — exit 0)

$ node --test --import tsx src/calendar/auto-join.test.ts src/calendar/schedule-state.test.ts src/calendar/task-scheduler.test.ts src/calendar/schedule-tick.test.ts
...
ℹ tests 49
ℹ suites 0
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 676.8913

$ node scripts/lint-loc.mjs
lint-loc: FAIL — 2 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  scripts/watch/run-watch.mjs:419 (budget 300)
(exit 1 — both pre-existing, reproduced identically on branch base 58a9f4c, neither is a file
this unit touches; confirmed via `git diff master -- <both files>` = empty from this worktree)

$ npx depcruise --config .dependency-cruiser.cjs packages/meeting-bot
✔ no dependency violations found (128 modules, 304 dependencies cruised)

$ npx tsx src/cli.ts schedule-tick --dry-run
[bot] schedule-tick: LKB_API_KEY not set — skipping Gmail candidates this tick (0 candidates)
[bot] schedule-tick: 0 to schedule, 0 skipped (0 calendar event(s), 0 candidate(s), now=2026-09-27T02:45:42.615Z)
[bot] schedule-tick: --dry-run — nothing scheduled, nothing written to state
```

## Capability coverage (each new claim -> its isolating falsification)
| Claim | Falsifying test |
|---|---|
| trusted-sender email/domain match | `isTrustedSender: exact email match`, `: domain match…`, `: explicit domain wins…`, `: neither given -> false` |
| env-config override of defaults | `loadTrustedSenderConfig: env overrides…` |
| join-token never logged | `redactJoinLink: strips a tk=…`, `schedule-tick: dry-run output never contains the raw join-link token` |
| registration-only never auto-joined | `selectAutoRecordItems: registrationOnly -> needs-registration` |
| rejected candidate never overridden by config trust | `selectAutoRecordItems: a rejected candidate is never auto-scheduled even from a trusted domain` |
| OBS one-at-a-time, earliest-start wins | `selectAutoRecordItems: overlap-lost — …earlier start wins` |
| overlap tie-break by duration | `selectAutoRecordItems: overlap tie-break — same start, longer duration wins` |
| dedup across ticks | `selectAutoRecordItems: a sessionKey already in alreadyScheduled -> duplicate-session`, `schedule-tick: a second tick after a real run doesn't re-schedule…` |
| dry-run never schedules/writes state | `schedule-tick: dry-run: … calls the scheduler zero times, writes no state` |
| -Until is local HH:mm, not ISO | `schedule-tick: real (non-dry-run) run: …-Until must be local HH:mm` |
| candidate loader never crashes the tick on a bad response/network error | `createHttpCandidateLoader: a non-2xx response degrades to []…`, `: a network throw degrades to []…` |
| real schtasks.exe is never invoked by this suite | every `task-scheduler.test.ts` case injects a fake `execFileFn`; `scheduleOnce never invokes the real schtasks.exe binary in this suite` names it explicitly |

## Planned first live proof (not run in this build session — see Known gaps)
Per the unit brief: the next TOC session with a join link (named example: 28 Sep "Scholarships
101" 18:00). A real `cli schedule-tick --dry-run` against the live API server (`LKB_API_KEY` set,
server reachable) should list it under "to schedule" if `GET /meeting-candidates` has an
`approved`/`auto_approved` row with a real `meetingUrl` and a start time within 5 minutes of the
run; if the row instead carries `registrationOnly: true` (or no `meetingUrl` at all), it must show
under "skip [needs-registration]"/"skip [no-join-link]" instead — never silently scheduled. This
build session had no dev API server running (`curl localhost:3300/health` — connection refused)
and did not start one, so this proof is **named for the checker/next tick to run for real**, not
claimed here.

## Known gaps (disclosed)
1. **No real Windows Scheduled Task was created in this build session** (explicit build-session
   constraint in the unit brief). `task-scheduler.ts`'s real path (`createWindowsTaskScheduler()`
   with no injected `execFileFn`) is read-reviewed and structurally isolated (array-args
   `execFile`, never a shell string) but has never actually been run against `schtasks.exe`.
   Every test injects a fake. The first real proof is the "planned first live proof" above, and it
   still needs a human comfortable with a real one-off Scheduled Task appearing.
2. **File-based dedup state, not a new Mongo collection.** `schedule-state.ts` writes
   `raw/webinars/schedule-state.json` — a single-machine, single-poller-instance file, matching
   `capture/controller-state.ts`'s own precedent. If a second poller instance or cross-machine
   visibility is ever needed this should become a Mongo collection (schema + migration, per repo
   convention) — flagged rather than silently built that way.
3. **Calendar events are always `[]` today.** No Google Calendar OAuth credentials exist
   (calendar-auto-join.md's own disclosed non-goal, still true) — `loadNoCalendarEvents` is the
   seam a real `CalendarClient` plugs into once they do. Every real candidate today comes from the
   Gmail meeting-candidates pipeline.
4. **Two new env keys invented, not found in any existing settings/config surface.**
   `AUTO_RECORD_TRUSTED_EMAILS`/`AUTO_RECORD_TRUSTED_DOMAINS` and `LKB_API_URL`/`LKB_API_KEY`.
   Checked `qa/contracts/web-settings-keys.md` (unrelated — API-key *management* UI, not a
   trusted-sender list), `.env`, `config/ai-routing.yaml`, and grepped the whole repo for
   `karunn`/`theoutreachcollective`/`TRUSTED_SENDER`/`schtasks` — none existed before this unit.
   `[ASSUMPTION]` flagged per this repo's Lab Protocol rule on unstated inputs.
5. **U6's recurring poller (Task Scheduler running `schedule-tick` every 5 minutes) is explicitly
   out of scope** (docs/plan.md: "U6 comes last"). Until it exists, `schedule-tick` only does
   anything when a human or another automation invokes it.
6. **The overlap-resolution rule is a straightforward earliest-start/longest-duration heuristic**,
   not a general interval-scheduling optimizer (e.g. it doesn't try to maximize total sessions
   captured across a whole cluster) — matches the unit brief's own description ("OBS records one
   at a time: pick earliest start then longest, log the loser") exactly, not a maker-chosen
   widening.
7. **This unit's manifest extends `qa/contracts/calendar-auto-join.md`'s scope** (candidates +
   dedup + overlap + scheduling, none of which that contract's 6 criteria cover) rather than
   editing it, per the brief and this repo's "the maker never edits qa/contracts/" rule. The
   checker may wish to formally amend/adopt an extension, the same path `meeting-bot-live-
   capture.md` and `gmail-meeting-candidates-approval.md` used.
8. **Master moved during this build** (branched at `58a9f4c`, master is now at `82c4185` per a
   `git rev-parse` taken mid-build) — other lanes landed concurrently. This worktree was not
   rebased/merged against the new master; the orchestrator's merge step (maker/SKILL.md PARALLEL
   WAVES §6) will need to re-verify against the merged tree. No conflict is expected (this unit's
   diff is confined to `packages/meeting-bot/src/calendar/*` + a 2-line `cli.ts` addition) but it
   was not verified against `82c4185` in this session.

## Fix cycle 2 (2026-09-27, checker FAIL at cycle 1 — ISS-317/318/319, ISS-320 note-only)

**Cause:** cycle 1's own tests never constructed a hostile title/url/sessionId, never checked
whether zoho.com/zoom.us should be trusted by default, and never constructed a midnight-crossing
session — so all three real defects (two security-class, uncapped per this repo's severity gate)
shipped past 49 green tests. Per D-015, each fix below re-runs the issue's own recorded
`fix_direction`, not a corpus this cycle chose itself.

### ISS-317 (high, security-class — never round-capped) — schtasks `/tr` command injection

**What changed:**
- `packages/meeting-bot/src/calendar/task-scheduler.ts:31-59` — new `JOB_KEY_RE`
  (`^[a-z0-9-]{1,64}$`), `deriveJobKey` (sanitizes a `sessionKey` to a safe job key or returns
  `null`), `buildTaskName`. `ScheduleOnceOptions` (`:66-77`) no longer takes `command`/`args`/
  `taskName` — only `jobKey`, `launcherPath`, `runAtIso`.
- `task-scheduler.ts:113-149` (`scheduleOnce`) — refuses (rejects the promise, never calls
  `execFileFn`) if `jobKey` fails `JOB_KEY_RE`; otherwise builds `/tr` as the exact fixed string
  `"powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "<launcherPath>" -Job "<jobKey>"` —
  no title/url/sessionId ever interpolated.
- `packages/meeting-bot/src/calendar/schedule-state.ts:62-108` — new `ScheduledJob` type +
  `writeScheduledJob`/`readScheduledJob`/`scheduledJobFilePath`, persisting `{url, until, title,
  sessionId}` to `<stateDir>/scheduled/<jobKey>.json` (under the already-gitignored
  `raw/webinars/` tree — confirmed via `.gitignore:67`, `raw/webinars/`, which ignores the whole
  subtree including `scheduled/`).
- `packages/meeting-bot/src/calendar/schedule-tick.ts:98-124` (real-schedule loop) — derives
  `jobKey` from `item.sessionKey`, refuses (logs + `continue`, never crashes the tick) if
  `deriveJobKey` returns `null`, writes the job file, then calls `scheduler.scheduleOnce({jobKey,
  launcherPath: RECORD_LAUNCHER, runAtIso: item.startTime})`. Removed the now-dead `taskNameFor`
  helper (`:133` in cycle 1).
- `scripts/webinar/start-record-detached.ps1` — added `-Job <jobKey>` param (`:34`); validates
  against the same `^[a-z0-9-]{1,64}$` shape again in PowerShell itself (belt-and-suspenders,
  `:41`) before reading `raw\webinars\scheduled\<jobKey>.json` and filling `$Url`/`$Until`/
  `$Title`/`$SessionId` from it when not already given directly (`:50-54`). `-Url`/`-Until`
  changed from `Mandatory=$true` to optional with an explicit post-merge check (`:57-61`) so both
  the direct-invocation and `-Job` paths keep working (existing usage unchanged, per the brief).
- Also fixes the checker's own aggravating-detail note (join-link token visible via `schtasks
  /query`): the URL is no longer a Task Scheduler argument at all.

**Tests (re-running ISS-317's own `fix_direction`, which named: quotes, backslash-quote, `&`,
`|`, `;`, `$(...)`, backticks, `%VAR%`, newline):**
- `task-scheduler.test.ts` — 12 parameterized hostile-`jobKey` cases (`evil"`, `a;rm -rf`,
  `$(whoami)`, `` `backtick` ``, `%VAR%`, `line\nbreak`, `a&b|c`, `-Command`, `UPPER-CASE`, `has
  space`, `""`, a 65-char string) each assert `scheduleOnce` **rejects and never calls
  `execFileFn`**; a fixed-shape assertion; a `deriveJobKey` sanitizer test covering the same 9
  hostile classes (asserts the *result*, if not `null`, always satisfies `JOB_KEY_RE`); an
  empty/whitespace/too-long → `null` test; and a standalone `CommandLineToArgvW`-rules re-parser
  (`parseWindowsCommandLine`, mirroring the checker's own technique) asserting the built `/tr`
  round-trips to exactly `["powershell.exe","-NoProfile","-ExecutionPolicy","Bypass","-File",
  launcherPath,"-Job",jobKey]` — no extra/merged/injected argument.
- `schedule-tick.test.ts` — a hostile-candidate test (title containing `"`, `&`, `|`, `;`,
  `$(...)`, backtick, `%VAR%`, newline, `-Command`; url containing `\"`) asserts the call the
  fake scheduler actually receives contains **none** of that text (only a validated `jobKey` +
  the fixed launcher path), while the job JSON file on disk correctly retains the real
  (hostile-but-now-harmless) title/url; plus a persistence round-trip test.
- **ISS-317: 15/15 new/updated test cases pass** (12 hostile-jobKey rejections + fixed-shape +
  argv-reparse + schedule-tick hostile-candidate containment); every hostile character class
  named in the issue's own `fix_direction` is exercised.
- PowerShell `-Job` mode dry-tested logically (never launched OBS/pnpm/schtasks — D-020 applies
  to real mutation runs, not applicable here since nothing is arm/restore): a standalone mirror
  of the resolution block (`C:\Users\Lenovo\AppData\Local\Temp\claude\...\scratchpad\
  test-job-mode.ps1`) against a fake job JSON confirmed the JSON round-trips to `$Url`/`$Until`/
  `$Title`/`$SessionId` correctly and a hostile `-Job` value (`evil"; rm -rf /`) is refused before
  any file read. The real script itself was syntax-checked with
  `[System.Management.Automation.Language.Parser]::ParseFile` (see Evidence) — this caught a real
  bug: an em-dash inside a live double-quoted string (not a comment) decodes under this box's
  non-UTF8 default codepage as a smart-quote character that prematurely terminates the string,
  corrupting the rest of the file. Fixed by using a plain ASCII `-` instead (`:42`); the header's
  `<# ... #>` block comment keeps its em-dashes safely, since comments are never tokenized as
  strings.

### ISS-318 (high, security-class — never round-capped) — default-trusted vendor domains

**What changed:** `packages/meeting-bot/src/calendar/auto-record-policy.ts:61-70` —
`DEFAULT_TRUSTED_SENDER_DOMAINS` is now `["theoutreachcollective.in", "ashoka.edu.in"]` (dropped
`zoho.com`/`zoom.us` — the platform vendors' own public, multi-tenant domains, never named in
Umesh's approval). `DEFAULT_TRUSTED_SENDER_EMAILS` gained `umeshsugara@vidysea.com` (the real
Gmail account the candidate pipeline reads, per `gws-gmail.ts`/`gmail-meeting-candidates-
approval.md` — a self-forwarded invite's `senderEmail` is that address). Env override
(`AUTO_RECORD_TRUSTED_EMAILS`/`AUTO_RECORD_TRUSTED_DOMAINS`) unchanged.

**Tests:** `auto-join.test.ts` — updated the existing defaults-assertion test to the new list;
added a test asserting `zoho.com`/`zoom.us` are absent from defaults; added a test running
`isTrustedSender` against the REAL `loadTrustedSenderConfig({})` output (not a hand-built
fixture) proving a stranger on `zoho.com`/`zoom.us` is now untrusted while the two genuine
partner domains + both named accounts remain trusted.
**ISS-318: 3/3 new/updated test cases pass** (defaults list, vendor-domain absence, real-config
behavioral check covering 6 assertions).

### ISS-319 (medium) — midnight-crossing `-Until` lands in the past

**What changed:**
- `packages/meeting-bot/src/capture/record-commands.ts:38-58` (`todayAt`, now exported) — accepts
  a full ISO datetime (`^\d{4}-\d{2}-\d{2}T`) and parses it directly, alongside the unchanged
  bare-`HH:MM` → today behavior. No caller of the bare-`HH:MM` form changes behavior.
- `packages/meeting-bot/src/calendar/schedule-tick.ts:104-110` — the job JSON's `until` field is
  now `item.endTime` (the candidate/event's own full ISO end datetime) instead of
  `toLocalHHMM(item.endTime)`. `toLocalHHMM` is no longer imported/used here (still exported and
  tested in `task-scheduler.test.ts` — `/st`/`/sd` still need local `HH:mm`/date, that part of
  ISS-319 doesn't apply to the Scheduled Task's own start time, only to `-Until`).
- `start-record-detached.ps1` forwards whatever string it has (bare `HH:MM` or full ISO) straight
  through to `pnpm cli record --until $Until` unchanged — no format-specific PowerShell logic
  needed since `todayAt` now handles both.

**Tests (re-running ISS-319's own reproduction — a 23:30-00:45 session):**
- `record-commands.test.ts` — `todayAt` bare-HH:mm unchanged baseline; full-ISO parses directly;
  the issue's own 23:30→+75min-crossing-midnight case asserts `end > start`; unparseable input
  still throws.
- `schedule-tick.test.ts` — a candidate with `startTime` 18:00Z/`endTime` 19:15Z (23:30/00:45 IST)
  asserts the persisted job file's `until` equals the full ISO `endTime` unchanged, and that
  `new Date(until) > new Date(startTime)`.
- **ISS-319: 6/6 new test cases pass** (4 in `record-commands.test.ts`, 2 in
  `schedule-tick.test.ts`), covering exactly the issue's own 23:30-00:45 shape.

### ISS-320 (low, note-only per the unit brief) — not fixed this cycle, no action taken.

### Evidence (commands + output, this session)
```
$ cd packages/meeting-bot && npx tsc --noEmit -p tsconfig.json
(no output — exit 0)

$ node --test --import tsx src/calendar/auto-join.test.ts src/calendar/schedule-state.test.ts \
    src/calendar/task-scheduler.test.ts src/calendar/schedule-tick.test.ts \
    src/capture/record-commands.test.ts
ℹ tests 82
ℹ pass 82
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0

$ npx tsx src/cli.ts schedule-tick --dry-run
[bot] schedule-tick: LKB_API_KEY not set — skipping Gmail candidates this tick (0 candidates)
[bot] schedule-tick: 0 to schedule, 0 skipped (0 calendar event(s), 0 candidate(s), now=...)
[bot] schedule-tick: --dry-run — nothing scheduled, nothing written to state

$ [PowerShell] [System.Management.Automation.Language.Parser]::ParseFile(
    'scripts\webinar\start-record-detached.ps1', [ref]$null, [ref]$errors)
OK (0 errors) — after the em-dash fix at :42; caught 7 cascading parse errors before that fix.
```
`lint-loc`/`depcruise`/full `pnpm -r test` were **not** re-run this cycle (RAM ~1.9GB, another
checker running concurrently, per this cycle's own dispatch constraint) — `UNVERIFIED-by-checker`
for those rows, same as cycle 1. Manually checked line counts instead: `task-scheduler.ts` 151,
`schedule-state.ts` 108, `schedule-tick.ts` 220, `auto-record-policy.ts` 92,
`record-commands.ts` 298 — all at/under the 300-LOC budget (`structure.config.json`), so no new
`lint-loc` violation is expected, but this is read-derived, not re-run.

### Diff scope
`git diff --stat` (lane, against the branch's own prior commit): 10 files, all inside
`packages/meeting-bot/src/calendar/*`, `packages/meeting-bot/src/capture/record-commands.ts`
(+`record-commands.test.ts`), and `scripts/webinar/start-record-detached.ps1` — exactly the files
named in the fix brief. No file outside that set touched; nothing deleted or renamed.

### Known gaps carried over from cycle 1 (unchanged)
No real Windows Scheduled Task created this session either (still a build-session constraint);
`-Job` mode is logic-dry-tested + syntax-checked, never run against real `schtasks.exe`/OBS.
Calendar events still always `[]`. Master-moved-during-build note from cycle 1 still applies —
not re-verified against the current tip in this session (targeted-tests scope).

**Status:** ready-for-check
