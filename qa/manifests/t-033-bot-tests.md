# Manifest — t-033-bot-tests
**Contract:** qa/contracts/meeting-bot-live-capture.md (ADOPTED 2026-09-25) — closes C9 (test criterion);
also touches C3, C4, C5 (see below)
**Goal task:** T-033 (`.goal/goal.json`, criticality: low) — "Tests (fake OBS client failure paths,
audioPath) + /checker PASS for the phase-0 bot"; closes roadmap row U4.2
**Date:** 2026-09-25
**Fix cycle:** 0 of max 3
**Dual check:** no (goal task criticality is `low`, not `critical`)
**Issues addressed:** ISS-300 (structural erosion — record-commands.ts had no unit test; now has
record-commands.test.ts + record-finalize.test-via-record-commands.test.ts)
**Executor:** claude-sonnet-subagent
**Executor rationale:** test-authoring + narrow injection-seam work on an already-scoped contract;
no architecture decision needed beyond the seam shape (which the orchestrator specified directly).

## Continuation note (read before judging "What changed")
This unit picked up UNCOMMITTED partial work left by a builder that died mid-run (~03:30):
modified `obs-windows.ts`/`record-commands.ts`, untracked `obs-windows.test.ts` +
`fake-join-fixture.mjs`. That work was sound (the `ObsClientLike` injection seam, the fixture
child-process pattern) and was kept and finished, not restarted. One real defect in it was fixed:
`obs-windows.test.ts` called `deps.stop(sessionHandle)` directly, but `BrowserJoinerDeps.stop` is
typed optional — `pnpm -r typecheck` failed at `TS2722: Cannot invoke an object which is possibly
'undefined'`; fixed with an explicit `assert.ok(deps.stop, ...)` + non-null assertion rather than
widening the type.

Mid-unit, the orchestrator flagged that T-030 (sibling lane, `wave/t-030-telegram-alerts`,
883c7b2) also exports `finalizeRecording` and appends its own trailing `telegram`/`durationSec`
params to it — colliding with this unit's first-draft `overrides` param at the same position. Per
the orchestrator's instruction, the seam was reshaped: `finalizeRecording`'s param list is now
**never touched** by this unit at all (it stays exactly whatever shape the last merge left it in);
a same-body sibling function `finalizeRecordingWith(overrides, ...sameArgs)` carries the test seam
instead. `master` was then merged in (T-030 had meanwhile PASSed, merge 1649da9). The merge's
auto-resolution of the one real conflict (both branches rewrote the `finalizeRecording` block) was
**not trustworthy as-is** — it interleaved T-030's `telegram`/`durationSec` body statements into a
`finalizeRecordingWith` signature that didn't yet declare those params (would not have compiled).
Resolved by hand: `finalizeRecordingWith` now carries T-030's full param list too
(`telegram`/`durationSec`, defaulted exactly as T-030 shipped them) plus this unit's `overrides`
first param; `finalizeRecording` is an unmodified-signature thin delegator. `pnpm -r typecheck`
and the full `pnpm test` (123/123, including T-030's own 12 telegram-alerts tests) were re-run
clean on the merged tree.

That merge pushed `record-commands.ts` over the file's own 300-LOC budget (`lint-loc` FAIL at 324
non-blank lines vs budget 300 — the header comment's own stated reason `cli.ts` was originally
split). Fixed by moving `finalizeRecordingWith`/`isSilentCapture`/`FinalizeRecordingOverrides` +
their private ffmpeg-subprocess helpers into a new `record-finalize.ts` (115 non-blank lines);
`record-commands.ts` re-exports them so the test import path is unchanged, and drops to 227
non-blank lines. `pnpm -r typecheck` and `pnpm test` (123/123) re-confirmed clean after the split.

## What changed
- `packages/meeting-bot/src/capture/obs-windows.ts` — new exported `ObsClientLike` interface
  (minimal OBSWebSocket shape) + `ObsBrowserDepsOverrides` (`obs?`, `connectObs?`,
  `confirmBotWindow?`, all defaulting to today's real behaviour) on `createObsBrowserDeps`, so a
  test can inject a fake OBS client without a real OBS process, `Get-Process chrome` poll, or
  tasklist/powershell/obs64.exe recovery flow, while the real mute-restore / bot-Chrome-termination
  logic in `launch`/`stop` still runs. Two `.some()` callbacks got explicit param types
  (`{inputName?: string}` / `{sceneName?: string}`) since `obs.call()` is now typed `Promise<any>`
  through the interface. No behavior change for any in-repo caller (no overrides passed).
- `packages/meeting-bot/src/capture/obs-windows.test.ts` (new, 213 lines) — 3 tests: StartRecord
  rejecting, connect (OBS unreachable) rejecting, StopRecord rejecting. Each proves mutes restored
  are exactly the inputs THIS run muted (never ones already muted before the run, C3) and the bot
  Chrome (a real but tiny child process, not a mock) is confirmed terminated by PID liveness, not
  by spying on a private `child.kill()` call.
- `packages/meeting-bot/src/capture/fake-join-fixture.mjs` (new, 29 lines) — stands in for
  `py/sb_join.py` via the already-injectable `cfg.python`/`cfg.joinScript` fields; prints one
  `{event:"opened", pid}` JSON line then exits on its `--stop-file` signal (25ms poll, 10s safety
  net). Never imported by production code.
- `packages/meeting-bot/src/capture/record-finalize.ts` (new, 128 lines) — `finalizeRecordingWith`
  (the real finalize body, moved here to clear the LOC budget), `isSilentCapture` (extracted
  `maxDb < SILENCE_MAX_DB` predicate), `FinalizeRecordingOverrides` (`extractAudio?`,
  `measureVolume?`, `runTranscription?`, `repoRoot?` — all default to real ffmpeg/production
  behaviour). `repoRoot` is the only way a test avoids writing into the live repo tree.
- `packages/meeting-bot/src/capture/record-commands.ts` — `finalizeRecording`'s param list is
  UNCHANGED from what the T-030 merge left it (video, sessionId, title, platform, transcribe,
  gaps, telegram, durationSec); it now delegates to `finalizeRecordingWith({}, ...args)`.
  `runFinalize` gains one additive optional param, `overrides: RunFinalizeOverrides = { obs?:
  ObsClientLike }`, defaulting to a real `new OBSWebSocket()` — used only to inject a
  connect-rejecting fake for the "OBS unreachable" test, no real network attempt. Unused imports
  (`createHash`, `readFileSync`, `writeFileSync`, `gapsForSourceDoc`, `readTurnCount`, `toPosix`,
  `SILENCE_MAX_DB`) dropped after the move to record-finalize.ts.
- `packages/meeting-bot/src/capture/record-commands.test.ts` (new, 147 lines) — `isSilentCapture`
  boundary (-50 not silent, -50.1 silent, -49.9 not silent); `finalizeRecordingWith` silent-capture
  path (throws, source.json still written with `audioLevel.silent:true`, transcription never
  called); boundary-exact path (does not throw, `silent:false`, transcription runs); not-silent +
  `transcribe:false` never calls transcription; `runFinalize --stop-obs` with an injected
  connect-rejecting OBS client (rejects with the injected error message — proving a real rejected
  promise, not a swallowed/unhandled one — and never creates `data/toc-migrated/<sessionId>/`,
  i.e. `finalizeRecordingWith` is never reached after a failed connect).
- `scripts/lib/find-audio-file.mjs` / `find-audio-file.test.mjs` — **not touched this unit.**
  Already exists from `webinar-bot-live` fix cycle 1 (ISS-285/286/287, commit efef75f, predates
  this unit's base 7eb55f7) and already covers the `source.json.audioPath` branch C9 names.
  Re-verified green + capability-coverage-falsified below rather than re-authored.

## How to verify (commands + expected)
- `pnpm --filter @lkb/meeting-bot test` → expected: exit 0, `tests 123 / pass 123 / fail 0`
- `pnpm -r typecheck` → expected: exit 0, all 8 workspace projects `Done`
- `pnpm -r test` → expected: exit 0, `ℹ fail 0` in every one of the 8 packages with a test script
- `pnpm gen:types --check` → expected: `OK: 24 generated type file(s) + index.ts match schema/`
- `python schema/validate.py` → expected: `PASS: 24 collection schema(s) validated correctly.`
- `pnpm lint:structure` → expected: FAILS at `lint-root` — **pre-existing ISS-248** (untracked
  runtime `AGENTS.md` puts root at 16 loose files vs budget 15, reproduces identically on `master`
  HEAD c9959bf, nothing this unit touched). `lint-loc` itself passes (was the one sub-check this
  unit could have broken, since it added a file and grew another past 300 lines mid-cycle — fixed,
  see continuation note). Every stage AFTER the short-circuit re-run individually below.
- `node scripts/lint-dupes.mjs` / `node scripts/lint-migrations.mjs` / `node scripts/snapshot.mjs
  --check` / `node --test scripts/lint.test.mjs` / `npx depcruise --config .dependency-cruiser.cjs
  packages apps workers` → each expected exit 0.
- `node scripts/tracker-audit.mjs --gate g1,g4` → 3 findings, but **2 of 3 are pre-existing on
  `master` HEAD c9959bf itself** (verified: `git show c9959bf:.goal/goal.json` already has T-029
  and T-030 both `"status": "pending"` while `TASKS.md` already marks them `done` — this predates
  and is unrelated to this unit). The 3rd (G4, `qa/verdicts/t-047-controller.md` bare `ISS-001`/
  `ISS-002` refs) reproduces identically on `master` HEAD too (`node scripts/tracker-audit.mjs
  --gate g1,g4` on `D:/KnowledgeBase` gives exactly that one finding).

## Actual outputs (from maker's own run)
```
$ pnpm --filter @lkb/meeting-bot test
...
✔ obs-windows launch(): StartRecord rejecting restores exactly this run's mutes and terminates the bot Chrome (242.3698ms)
✔ obs-windows launch(): connect (OBS unreachable) rejecting touches no mutes and terminates the bot Chrome
✔ obs-windows stop(): StopRecord rejecting still restores this run's mutes and terminates the bot Chrome (117.8608ms)
✔ isSilentCapture: -50 dB (the boundary) is NOT silent, -50.1 dB IS (1.0965ms)
✔ finalizeRecordingWith: silent capture (-50.1 dB) throws, still writes source.json with audioLevel.silent:true, never transcribes
✔ finalizeRecordingWith: -50 dB exactly (the boundary) does NOT throw, source.json has audioLevel.silent:false, transcription runs
✔ finalizeRecordingWith: not silent and transcribe:false never calls runTranscription
✔ runFinalize --stop-obs: OBS unreachable rejects with a clear error and never creates a source.json (1.2176ms)
ℹ tests 123
ℹ pass 123
ℹ fail 0

$ pnpm -r typecheck
... all 8 projects: Done (exit 0)

$ pnpm -r test
packages/core test: ℹ fail 0
packages/db test: ℹ fail 0
packages/ai test: ℹ fail 0
packages/ask test: ℹ fail 0
packages/index test: ℹ fail 0
packages/ingest test: ℹ fail 0
apps/api test: ℹ fail 0
packages/meeting-bot test: ℹ fail 0

$ pnpm gen:types --check
OK: 24 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 24 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (322 file(s) within budget)
lint-dirsize: OK (83 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): ... AGENTS.md ...   [ISS-248, pre-existing]

$ node scripts/lint-dupes.mjs
lint-dupes: OK (365 unique export(s), 24 unique schema $id(s))

$ node scripts/lint-migrations.mjs
lint-migrations: OK (1190 file(s) scanned)

$ node scripts/snapshot.mjs --check
OK: docs/SNAPSHOT.md matches a fresh regeneration (117 lines, budget 200)

$ node --test scripts/lint.test.mjs
ℹ tests 14 / pass 14 / fail 0

$ node scripts/tracker-audit.mjs --gate g1,g4
tracker-audit --gate G1,G4: 3 finding(s)
  G1 status: T-029 is "pending" in goal.json but "done" in TASKS.md      [pre-existing on master c9959bf]
  G1 status: T-030 is "pending" in goal.json but "done" in TASKS.md      [pre-existing on master c9959bf]
  G4 ambiguous issue ref: qa/verdicts/t-047-controller.md cites ISS-001, ISS-002 bare  [pre-existing]

$ npx depcruise --config .dependency-cruiser.cjs packages apps workers
✔ no dependency violations found (343 modules, 1073 dependencies cruised)
```

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| `launch()`'s `StartRecord` failure restores exactly this run's mutes (never pre-muted inputs) and still terminates the bot Chrome | `obs-windows.test.ts:131` "StartRecord rejecting..." | `obs-windows.ts:282` comment out `await unmute(mutedByUs);` in `launch()`'s catch | BEFORE: `✔ obs-windows launch(): StartRecord rejecting restores exactly this run's mutes and terminates the bot Chrome (242.3698ms)`. AFTER: `✖ ...StartRecord rejecting... (191.2703ms)` / `AssertionError [ERR_ASSERTION]: Mic/Aux was not muted before the run — must be muted then restored (unmuted)` |
| `stop()`'s `StopRecord` failure still restores this run's mutes (via `finally`) and terminates the bot Chrome | `obs-windows.test.ts:188` "StopRecord rejecting..." | `obs-windows.ts:311` comment out `await unmute(run.mutedByUs);` in `stop()`'s finally | BEFORE: `✔ obs-windows stop(): StopRecord rejecting still restores this run's mutes and terminates the bot Chrome (117.8608ms)`. AFTER: `✖ ...StopRecord rejecting... (150.3645ms)` / `AssertionError [ERR_ASSERTION]: stop()'s finally must restore the mute even though StopRecord itself threw` |
| `isSilentCapture` is strict: AT `SILENCE_MAX_DB` (-50) is not silent, below it is | `record-commands.test.ts:28` "isSilentCapture: -50 dB..." | `record-finalize.ts:28` change `maxDb < SILENCE_MAX_DB` to `maxDb <= SILENCE_MAX_DB` | BEFORE: `✔ isSilentCapture: -50 dB (the boundary) is NOT silent, -50.1 dB IS (1.0965ms)`. AFTER: `✖ isSilentCapture: -50 dB (the boundary) is NOT silent, -50.1 dB IS` / `AssertionError [ERR_ASSERTION]: AT the boundary must not be silent` (a second test, `finalizeRecordingWith: -50 dB exactly...`, also reddened for the same reason — 2 failures from 1 mutation) |
| `runFinalize --stop-obs` propagates a real rejected-promise error when OBS is unreachable (never a swallowed/unhandled one), never writing `source.json` for that session | `record-commands.test.ts:121` "runFinalize --stop-obs: OBS unreachable..." | `record-commands.ts:217` change `await obs.connect(...)` to `await obs.connect(...).catch(() => {})` | BEFORE: `✔ runFinalize --stop-obs: OBS unreachable rejects with a clear error and never creates a source.json (1.2176ms)`. AFTER: `✖ ...OBS unreachable...` / `AssertionError [ERR_ASSERTION]: The input did not match the regular expression /OBS unreachable \(simulated, T-033\)/` |
| `findAudioFile`'s `source.json.audioPath` branch (pre-existing, `webinar-bot-live` fix cycle 1) returns/validates the bot-captured path, bypassing TOC basename matching | `find-audio-file.test.mjs:21`/`:40` "audioPath branch: ..." | `find-audio-file.mjs:19` change `if (source.audioPath)` to `if (false && source.audioPath)` | BEFORE: `ℹ tests 3 / pass 3 / fail 0`. AFTER: `ℹ tests 3 / pass 1 / fail 2` — both audioPath-branch tests red (`TypeError: Cannot read properties of undefined (reading 'split')` from the code falling through to the TOC-basename path with no `source.path` field), the TOC-fallback test stays green |

All 5 mutations applied to the committed tree, confirmed red for the named assertion, then
restored: `obs-windows.ts`/`record-commands.ts`/`find-audio-file.mjs` via `git checkout --`
(tracked, comparison to `HEAD` confirmed clean after); `record-finalize.ts` (new/uncommitted at
mutation time) reverted by hand via the same edit tool, diffed clean against the file as written.
Each mutation run was a single `pnpm test` / `node --test <file>` invocation under a bounded
`timeout` (200s/30s), no hand-rolled sed/mutation harness, no infinite-loop risk (D-020's concern
is about mutation harnesses that can leave a mutant applied — the near-miss during this unit was
exactly that: `git checkout --` on `record-commands.ts` at one point reverted BOTH a mutation and
this unit's own un-committed LOC-budget-split fix together, because that fix had not yet been
committed. Caught immediately by re-running `pnpm -r typecheck`/`pnpm test`, redone, and committed
before any further mutation testing — see continuation note above).

## Live browser evidence
Not UI-touching — no browser/frontend surface changed. Changed paths: `packages/meeting-bot/src/
capture/{obs-windows.ts,obs-windows.test.ts,fake-join-fixture.mjs,record-commands.ts,
record-commands.test.ts,record-finalize.ts}`. `obs-windows.test.ts` drives a real (but headless,
tiny) Node child process standing in for the bot browser — never an actual Chrome/webinar page.

## Status: ready-for-check
