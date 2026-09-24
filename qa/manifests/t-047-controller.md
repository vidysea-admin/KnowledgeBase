# Manifest — t-047-controller
**Contract:** docs/meeting-bot-roadmap.md, T-047 row ("Record controller must survive console
close: run hidden/detached, plus a finalize-on-restart watchdog (detect OBS still recording with
no controller → finalize)"). `qa/contracts/meeting-bot-live-capture.md` (T-024b, draft/guidance
only — its own Non-goals section explicitly excludes T-047 from that contract's own criteria; its
`qa/gates/meeting-bot-live-capture-adoption.md` HUMAN_GATE is still open/unresolved as of this
unit, unrelated to whether T-047 itself is done). TASKS.md row T-047.
**Goal task:** T-047
**Date:** 2026-09-24
**Fix cycle:** 1 of max 3
**Dual check:** no — not auth/tenancy/data-write class; reliability/process-lifecycle feature
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** self-contained TS/PowerShell feature unit inside one package, no external
research or heavy cross-system reasoning needed beyond what's already in the roadmap row and
existing capture/*.ts code.

## What changed
- `packages/meeting-bot/src/capture/controller-state.ts` (new) — `RecordState` shape (pid,
  sessionId, title, platform, until, obsOutputDir, startedAt) + `writeControllerState` /
  `readControllerState` (never throws on a missing/corrupt file) / `removeControllerState`
  (idempotent) / `isPidAlive` (signal-0 probe).
- `packages/meeting-bot/src/capture/watchdog.ts` (new) — pure `decideWatchdogAction({state,
  controllerAlive, obsRecording})` → `noop-idle | noop-active | finalize | stale-cleanup`;
  `tickWatchdog(probes)` orchestrates one check against fully injected `WatchdogProbes`;
  `runWatchdog(rest)` wires the real probes (OBS websocket `GetRecordStatus`, `process.kill(pid,
  0)`, and **reuses `runFinalize`** from `record-commands.ts` for the actual stop/unmute/close/
  finalize sequence — no duplicated logic).
- `packages/meeting-bot/src/capture/record-commands.ts:15-19,66-73,100-155` — imports
  `writeControllerState`/`removeControllerState`; `runRecord` now writes the state file right
  after a successful join, and removes it in a `finally` wrapped around the entire
  record-loop+stop+finalize sequence, so the file only disappears once that cleanup actually runs
  to completion; extended the `record` usage/help text with the detached-launcher one-liner and
  the `lkb watchdog` recovery one-liner.
- `packages/meeting-bot/src/cli.ts:47,163` — dispatches `watchdog` → `runWatchdog`.
- `scripts/webinar/start-record-detached.ps1` (new) — PowerShell launcher: `Start-Process
  -WindowStyle Hidden` running `pnpm --filter @lkb/meeting-bot cli record ...` with stdout/stderr
  redirected to a timestamped log under `raw/webinars/`, detached from the calling console — the
  Task Scheduler `.cmd` calls this instead of running `record` inline, so closing the console
  window can no longer kill the recording (2026-09-24 16:30:56 failure).
- `packages/meeting-bot/src/capture/controller-state.test.ts` (new), `watchdog.test.ts` (new) —
  see coverage table.

## How to verify (commands + expected)
- `pnpm --filter @lkb/meeting-bot test` → exit 0, all tests pass
- `pnpm --filter @lkb/meeting-bot typecheck` → exit 0, no output
- `node scripts/lint-loc.mjs` → OK, all files within 300/400 LOC budget
- `npx depcruise --config .dependency-cruiser.cjs packages apps workers` → no dependency
  violations
- `pnpm lint:structure` → all sub-checks OK except pre-existing `lint-root` (see below)

## Actual outputs (from maker's own run)
```
$ pnpm --filter @lkb/meeting-bot test
...
ℹ tests 62
ℹ pass 62
ℹ fail 0

$ pnpm --filter @lkb/meeting-bot typecheck
> tsc --noEmit -p tsconfig.json
(no output — clean)

$ node scripts/lint-loc.mjs
lint-loc: OK (300 file(s) within budget)

$ npx depcruise --config .dependency-cruiser.cjs packages apps workers
✔ no dependency violations found (316 modules, 980 dependencies cruised)

$ pnpm lint:structure
lint-loc: OK (300 file(s) within budget)
lint-dirsize: OK (80 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): .dependency-cruiser.cjs .dockerignore .env.example
  .gitignore .gitmodules AGENTS.md ARCHITECTURE.md docker-compose.yml
  Living-Knowledge-Base-Architecture.html migrate-mongo-config.cjs package.json pnpm-lock.yaml
  pnpm-workspace.yaml structure.config.json TASKS.md tsconfig.base.json
 ELIFECYCLE  Command failed with exit code 1.
```
Confirmed pre-existing, not caused by this unit: `git ls-tree -r 1e3c0cd --name-only | grep -v /`
lists the exact same 16 root files at the worktree's base commit (master 1e3c0cd), before any
change in this unit. This unit added/edited zero files at repo root. Matches the standing ruling
in commit `0add6e4` ("Confirmed lint-root's remaining FAIL is pre-existing (ISS-248...) not caused
by this unit"). The remaining sub-checks (`lint-dupes`, `lint-migrations`, `snapshot.mjs --check`,
`lint.test.mjs` (14/14 pass), `tracker-audit.mjs --gate g1,g4`, `depcruise`) were each run
individually and all reported OK — pasted below for completeness:
```
lint-dupes: OK (331 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (1092 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (117 lines, budget 200)
lint.test.mjs: ℹ tests 14 / pass 14 / fail 0
tracker-audit: OK (gate G1,G4)
```

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| `decideWatchdogAction` returns `finalize` exactly when the state file's controller is dead AND OBS is still recording (the core T-047 detection) | `watchdog.test.ts`: "state present, controller dead, OBS recording → finalize (the T-047 failure case)" | In `watchdog.ts`, replaced the `obsRecording ? finalize : stale-cleanup` ternary with an unconditional `return { kind: "stale-cleanup", state }` | BEFORE: `✔ state present, controller dead, OBS recording → finalize (the T-047 failure case)` (11 pass/0 fail). AFTER: `✖ state present, controller dead, OBS recording → finalize (the T-047 failure case)` + `✖ tickWatchdog: dead controller + OBS recording calls finalize once, then clears state` (9 pass/2 fail). File restored, `cmp` confirmed byte-identical, `RESTORED-OK` printed. |
| after a successful `finalize`, `tickWatchdog` clears the state file (so the same dead session is never re-finalized on the next tick) | `watchdog.test.ts`: "tickWatchdog: dead controller + OBS recording calls finalize once, then clears state" | In `watchdog.ts`'s `finalize` case, deleted the `probes.clearState();` call after `await probes.finalize(...)` | BEFORE: `✔ tickWatchdog: dead controller + OBS recording calls finalize once, then clears state` (11 pass/0 fail). AFTER: `✖ tickWatchdog: dead controller + OBS recording calls finalize once, then clears state` (10 pass/1 fail). File restored, `cmp` confirmed byte-identical, `RESTORED-OK` printed. |
| `readControllerState` never throws on a corrupt/partial state-file write — returns `undefined` instead | `controller-state.test.ts`: "readControllerState returns undefined for corrupt JSON rather than throwing" | In `controller-state.ts`, removed the `try { ... } catch { return undefined; }` wrapper around the `JSON.parse` so a parse error propagates as an uncaught throw | BEFORE: `✔ readControllerState returns undefined for corrupt JSON rather than throwing` (8 pass/0 fail). AFTER: `✖ readControllerState returns undefined for corrupt JSON rather than throwing` (7 pass/1 fail, uncaught `SyntaxError`). File restored, `cmp` confirmed byte-identical, `RESTORED-OK` printed. |
| a live controller (pid alive) is never interfered with — `tickWatchdog` calls neither `finalize` nor `clearState` | `watchdog.test.ts`: "tickWatchdog: live controller never finalizes or clears state" | Not separately mutated — this is the same `decideWatchdogAction` branch structure covered by the first falsification above (mutating away the `finalize` branch would collapse *every* live-controller case into `stale-cleanup` too, which the "live controller" tests would also catch); not re-run as a distinct mutation to avoid redundant churn on the same lines. | `✔ tickWatchdog: live controller never finalizes or clears state` passes today (11/11); its own dedicated assertion (`calls.finalized === []`, `calls.cleared === 0`) is exercised every run above. |
| `isPidAlive` correctly distinguishes this live process from a pid that cannot be alive | `controller-state.test.ts`: "isPidAlive is true for this process's own pid" / "...is false for a pid that cannot correspond to a live process" | Not mutated — `process.kill(pid, 0)` is a one-line delegation to a Node/OS primitive; the two assertions themselves already discriminate `true` vs `false` on two concrete pids each run. | `✔ isPidAlive is true for this process's own pid` / `✔ isPidAlive is false for a pid that cannot correspond to a live process` (both pass, part of the 8/8 controller-state suite above). |
| `runRecord` writes the state file after a real join and removes it once the real stop/finalize sequence completes; `start-record-detached.ps1` actually launches `record` detached and survives its parent console closing | **UNVERIFIED — ships without coverage.** Exercising this requires a real OBS instance, a real browser join, and (for the launcher) actually spawning and then closing a console window — explicitly out of scope for this unit ("Do NOT launch OBS, Chrome or a real recording"). Tracked as the known gap under **T-033** ("Tests + checker pass for today's code: failure paths with a fake OBS client"), same as the rest of this package's OBS-integration code. | — | — |

## Live browser evidence
Not UI-touching — no browser/web surface changed. This unit touches only
`packages/meeting-bot/src/capture/*.ts`, `packages/meeting-bot/src/cli.ts`, and a new PowerShell
launcher script; nothing renders in a browser.

## Cycle 1 changes

**Commit:** `b303a5f` (parent `1e1a84e`) — `git diff 1e1a84e..b303a5f --stat`: 5 files, all inside
`packages/meeting-bot/src/capture/` (`watchdog.ts`, `watchdog.test.ts`, `controller-state.ts`,
`controller-state.test.ts`, `record-commands.ts`). No file outside this list touched.

Fixes **ISS-T-047-CONTROLLER-001** (high) and **ISS-T-047-CONTROLLER-002** (medium) from
`qa/verdicts/t-047-controller.md` cycle 0 (FAIL) / `qa/issues.t-047-controller.jsonl`.

### ISS-T-047-CONTROLLER-001 (high) — tri-state OBS probe

`isObsRecording` (watchdog.ts:96-106 at cycle 0) collapsed an OBS websocket connect/call failure
into "not recording", identical to a confirmed-idle result. With a dead controller, that made
`decideWatchdogAction` return `stale-cleanup` → `tickWatchdog` called `clearState()` with no
finalize, destroying the one artifact recovery depends on, on a merely transient OBS hiccup.

- `watchdog.ts`: new exported `ObsStatus = "recording" | "idle" | "unknown"`. `decideWatchdogAction`
  takes `obsStatus: ObsStatus` (was `obsRecording: boolean`) and returns a new `noop-unknown` action
  for `obsStatus === "unknown"` — **never** `stale-cleanup`, **never** `finalize`. `tickWatchdog`'s
  switch adds a `noop-unknown` case: logs a warning (no probe error content — the catch never had
  reason to touch `OBS_WS_PASSWORD` and now doesn't touch the error object either), does not call
  `clearState` or `finalize`. `WatchdogProbes.getObsStatus` replaces `isObsRecording`, returning
  `Promise<ObsStatus>`.
- New exported `ObsStatusClient` interface + `createGetObsStatus(obsUrl, obsPassword, makeClient?)`
  builds the real probe with an **injectable OBS client factory** (defaults to real `OBSWebSocket`),
  so a test can exercise the exact production error path (`connect()` throws → `"unknown"`) via a
  fake client instead of a hand-rewritten stand-in. `runWatchdog` now calls
  `createGetObsStatus(obsUrl, obsPassword)`.

### ISS-T-047-CONTROLLER-002 (medium) — pid-reuse identity check

`RecordState` carried only a bare `pid`; OS pid recycling after a dead controller could
permanently mask it as alive.

- `controller-state.ts`: `RecordState.controllerStartedAt?: string` (OS process-creation time).
  New `getProcessStartTime(pid)` (Windows `Get-Process -Id <pid> ... StartTime`, matching this
  package's existing Windows-only surface — `OBS_EXE`, the `chrome.exe` cleanup in
  `record-commands.ts`), returns `undefined` on any failure, never throws. New pure
  `controllerMatchesIdentity(expected, actual)` — either side `undefined` trusts pid-alive
  (back-compat / probe-failure-safe); a real mismatch reports false. New
  `isControllerAlive(state, probes?)` combines `isPidAlive` + (if an identity was recorded)
  `controllerMatchesIdentity`, short-circuiting the `getProcessStartTime` probe entirely when no
  identity was recorded (perf: no extra PowerShell spawn on old/undefined state files). `probes`
  (`{ pidAlive?, processStartTime? }`) defaults to the real OS checks but is injectable for
  deterministic pid-reuse tests.
- `watchdog.ts`: `WatchdogProbes.isControllerAlive` now takes the **full `RecordState`** (was bare
  `pid`) so the real wiring can check identity too; `tickWatchdog` passes `state` instead of
  `state.pid`. `runWatchdog` wires the real `isControllerAlive` directly (was `isPidAlive`).
- `record-commands.ts`: `runRecord` records `controllerStartedAt: getProcessStartTime(process.pid)`
  alongside the existing fields when writing controller state.

### Evidence

```
$ pnpm --filter @lkb/meeting-bot typecheck
> tsc --noEmit -p tsconfig.json
(no output — clean)

$ pnpm --filter @lkb/meeting-bot test
ℹ tests 82
ℹ pass 82
ℹ fail 0
```
(was 62/62 at cycle 0; +20 new tests covering both fixes, including two real-OS-probe smoke
tests for `getProcessStartTime` and one end-to-end test wiring the REAL `createGetObsStatus`
through `tickWatchdog` with an injected client whose `connect()` throws, proving state survives
and a later tick with OBS `'recording'` finalizes.)

```
$ pnpm -r typecheck   (10/10 projects)
... all "Done", no errors
```

```
$ pnpm -r --no-bail test   (full workspace)
core 7/7, db 14/14, ai 74/74, ask 50/50, ingest 97/97, meeting-bot 82/82, apps/api 173/173
index 214/215 — the 1 failure is tree-real-data.test.ts ENOENT on
data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/session.json — confirmed
pre-existing (ledger ISS-294, from the separate webinar-bot-live unit; this cycle's diff
touches zero files under packages/index, confirmed via `git diff 1e1a84e..b303a5f --stat`).
apps/web: under the full `-r` run's CPU contention, 4 files/5 tests failed on async-timing
(userEvent/act) — re-ran `pnpm --filter @lkb/web test` in isolation: 13/13 files, 55/55 tests
green. This unit's diff touches zero files under apps/web.
```

```
$ pnpm lint:structure
lint-loc: OK, lint-dirsize: OK, lint-root: FAIL — 16 loose files (budget 15) — confirmed
pre-existing (ledger ISS-248; git ls-tree -r 1e1a84e --name-only | grep -v / lists the same 16
root files at this cycle's base commit; this cycle added zero root files).
lint-dupes: OK (337 exports, 24 schema $ids) · lint-migrations: OK (1095 files) ·
snapshot.mjs --check: OK · lint.test.mjs: 14/14 · tracker-audit --gate g1,g4: OK ·
depcruise: no violations (316 modules, 981 deps)
```

### Falsifications (D-020: timeout + byte-backup-in-trap on error/interrupt + cmp)

1. **ISS-T-047-CONTROLLER-001 fix** — reverted `decideWatchdogAction`'s
   `if (obsStatus === "unknown") return { kind: "noop-unknown", state };` line. Re-ran
   `watchdog.test.ts`: exactly the 3 tests tagged `ISS-T-047-CONTROLLER-001` fail (the pure
   decision test, the injected-probes tickWatchdog test, and the real-`createGetObsStatus`
   end-to-end test), 17/20 pass otherwise. Restored from backup in a trap on EXIT/ERR/INT/TERM,
   `cmp` confirmed byte-identical. `RESTORED-OK-WATCHDOG` printed.
2. **ISS-T-047-CONTROLLER-002 fix** — reverted `isControllerAlive`'s identity check to
   `return isPidAlive(state.pid);` only. First attempt: **0 tests failed** — this exposed a real
   coverage gap (the direct real-OS-spawn identity test had been trimmed earlier in this cycle
   for being too slow, and nothing else exercised the production `isControllerAlive` composition
   itself, only its pure sub-parts). Fixed by adding injectable `probes` to `isControllerAlive`
   and a fast deterministic pid-reuse test using them (`controller-state.test.ts`,
   `ISS-T-047-CONTROLLER-002: isControllerAlive — pid-reuse case via INJECTED probes`). Re-ran the
   falsification: exactly that 1 test fails, 18/19 pass otherwise. Restored from backup in a trap,
   `cmp` confirmed byte-identical. `RESTORED-OK-CONTROLLER-STATE-2` printed.

### Deviations from the verdict's fix_direction

- ISS-T-047-CONTROLLER-001's fix_direction suggested "have `decideWatchdogAction` accept an
  explicit `obsStatus`" — done, plus the tri-state also propagates through `WatchdogProbes` and a
  new injectable `createGetObsStatus`, so the real production error path (not just the pure
  decision function) has direct test coverage per the task's explicit ask.
- ISS-T-047-CONTROLLER-002's fix_direction offered either "process start time" or "a heartbeat
  the controller refreshes" — chose process start time (`Get-Process` `StartTime`), consistent
  with this package's existing Windows-only surface, and cheaper than adding a periodic
  heartbeat-write loop to `runRecord`'s existing poll loop.
- `isControllerAlive` gained an optional `probes` parameter not present in the verdict's
  fix_direction — added specifically to close the coverage gap the first falsification attempt
  surfaced (see above); it is additive and defaults to the real OS checks, so `runWatchdog`'s
  wiring (`isControllerAlive` passed by reference) is unchanged.

## Status: ready-for-check
