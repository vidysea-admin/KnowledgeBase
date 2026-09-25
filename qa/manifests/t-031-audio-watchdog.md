# Manifest — t-031-audio-watchdog

**Contract:** qa/contracts/meeting-bot-live-capture.md (T-024b, ADOPTED 2026-09-25; T-031's own
scope — live audio watchdog — is explicitly listed as OUT of this contract's phase-1 scope in its
"Non-goals" section, alongside T-029/T-030/T-032/T-047; this unit implements a roadmap row, not a
contract criterion, and is judged against C10 (no regression) plus the roadmap row itself)
**Goal task:** none (no `.goal/goal.json` at this root)
**Date:** 2026-09-25
**Fix cycle:** 0 of max 3
**Dual check:** no
**Issues addressed:** none
**Executor:** claude-opus-subagent (orchestrator-dispatched maker build subagent)
**Executor rationale:** heavy/cross-file unit (new module + obs-windows.ts + sb_join.py + record-commands.ts wiring, LOC-budget-constrained); dispatched directly by the orchestrator, not delegated to an Ollama lane.

## Roadmap row (docs/meeting-bot-roadmap.md:46, TASKS.md T-031)
"Live audio watchdog (OBS level meters): no signal for more than 2 min while the session is live
→ alert + reconnect. Done when: a muted tab triggers the alert."

## What changed
- `packages/meeting-bot/src/capture/audio-watchdog.ts` (NEW, 234 lines) — the watchdog itself.
  - `createAudioWatchdog(deps)`: pure silence-duration state machine. Tracks `lastAudibleAt`
    (reset on every non-silent meter reading), fires `notifySilence(durationSec)` +
    `reconnect()` exactly once per continuous silent stretch >`SILENT_TRIGGER_SEC` (120s), gated
    by a single `alarmed` flag that also re-arms on the next confirmed non-silent reading (no
    separate timer-cooldown — see the file's own header comment for why that would be dead code).
    Clock (`now`), meter source (`subscribeLevel`), ticker (`scheduleTick`), notifier and
    reconnect trigger are all injected.
  - `createRealLevelSource(cfg, makeClient)`: real OBS wiring — a SEPARATE obs-websocket-js
    connection (obs-websocket supports multiple concurrent clients) from obs-windows.ts's own
    scene/recording-control client, specifically so this unit never has to touch obs-windows.ts's
    already-tight 300-LOC budget for the meter-reading logic itself. Subscribes to the
    `InputVolumeMeters` high-volume event (`EventSubscription.All | InputVolumeMeters`), filters
    by `inputName` (the bot's own per-process capture, `AUDIO_INPUT`), converts the OBS protocol's
    `inputLevelsMul` (`[magnitude, peak, peakUnaffected]` per channel, linear multiplier — verified
    against `obsproject/obs-websocket`'s `Obs_VolumeMeter.cpp` via WebFetch, not guessed) to dB via
    `mulToDb` (`peakMulFromLevels` takes the max index-1 peak across channels).
  - Fixed a race during development (not shipped): calling the returned unsubscribe before
    `connect()` resolves used to leak the connection (the pending `.then()` would still register
    the listener and never close it) — a `stopped`/`closed`-guarded `closeOnce()` fixes it; caught
    by this unit's own tests before it ever reached a manifest.
- `packages/meeting-bot/src/capture/obs-windows.ts` — minimal touch, kept the file inside its
  300-LOC budget (was 298/300 before this unit — see amendments below):
  - `AUDIO_INPUT` constant exported (was module-private) so record-commands.ts's wiring and
    `createRealLevelSource` use the exact same input name, never a duplicated string literal.
  - `launch()`'s `pyArgs` now also passes `--reload-file <path.join(cfg.recordDir, '.reload-' + handle)>`
    to `sb_join.py` — see the new control channel below.
  - The returned object gains `triggerReload(handle)`: writes that same reload-file sentinel.
  - One header-comment line merged (2→1 lines) to stay inside the LOC budget after these additions
    — no meaning removed, purely a line-count reflow.
- `packages/meeting-bot/py/sb_join.py`:
  - **New controller→bot command channel (T-031's own smallest addition, per the brief's explicit
    allowance):** `--reload-file` (optional, default None) — a sentinel file sb_join.py polls
    every loop tick (already polls every 2s), mirroring the existing `--stop-file` pattern. When
    present, it force-reloads/rejoins (`sb.uc_open_with_reconnect` + `apply_reload`) and deletes
    the sentinel, **independently of T-029's own DOM-banner reconnect detection** — a muted-but-
    still-connected tab shows no "trying to reconnect" banner at all, so T-029's `ReconnectState`
    can never catch this failure mode on its own. This path never touches `reconnect`
    (T-029's `ReconnectState` instance) — no gap is recorded, because silence is not necessarily a
    connectivity gap (the whole "muted tab" case: the page is fine, the audio just isn't there).
  - `should_force_reload(reload_file)`: the pure predicate factored out for unit-testability
    (same reasoning as `click_gate`/`apply_reload`/`detect_trouble`'s own extraction) — a real
    `os.path.exists` check against a real temp file, no Selenium needed.
- `packages/meeting-bot/src/capture/record-commands.ts` (227→249 non-blank lines, budget 300):
  - Imports `createAudioWatchdog`/`createRealLevelSource` and `AUDIO_INPUT`.
  - `runRecord()` builds and `.start()`s the watchdog right after `joiner.join()` returns a
    `sessionHandle` (needed for `bot.triggerReload(sessionHandle)`), wired to real
    `Date.now()`/`setInterval`/telegram's own `notifySilence`/`bot.triggerReload`.
  - `.stop()` is called in the INNER `finally` (recording-loop teardown, before `joiner.stop()` —
    no more reconnects once we're already tearing down) AND, idempotently, in the OUTER `finally`
    (belt-and-suspenders if the inner try/finally is never reached, e.g. `writeControllerState`
    throwing) — every exit path stops it, per the no-dangling-timer requirement.

## How to verify (commands + expected)
- `pnpm --filter @lkb/meeting-bot test` → all pass, exit 0
- `python -m pytest packages/meeting-bot/py -q` → all pass, exit 0
- `pnpm -r typecheck` → all packages "Done", exit 0
- `pnpm -r test` → all workspaces "Done", exit 0
- `pnpm gen:types --check` → "OK: 24 generated type file(s) + index.ts match schema/"
- `python schema/validate.py` → "PASS: 24 collection schema(s) validated correctly."
- `pnpm lint:structure` → every sub-check OK **except `lint-root`** (ISS-248, pre-existing,
  reproduced identically on base commit 986fcd8 — see "Known pre-existing failures" below)

## Actual outputs (from maker's own run)
```
$ pnpm --filter @lkb/meeting-bot test
...
ℹ tests 141
ℹ pass 141
ℹ fail 0
ℹ duration_ms 120882.6172

$ python -m pytest packages/meeting-bot/py -q
....................                                                     [100%]
20 passed in 0.15s

$ pnpm -r typecheck
packages/core typecheck: Done
apps/web typecheck: Done
packages/db typecheck: Done
packages/ai typecheck: Done
packages/ask typecheck: Done
packages/ingest typecheck: Done
packages/index typecheck: Done
packages/meeting-bot typecheck: Done
apps/api typecheck: Done

$ pnpm -r test   (exit code 0)
apps/api test: ℹ pass 175, ℹ fail 0
packages/meeting-bot test: ℹ tests 141, ℹ pass 141, ℹ fail 0
(and all other workspaces: Done, no failures)

$ pnpm gen:types --check
OK: 24 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 24 collection schema(s) validated correctly.

$ node scripts/lint-loc.mjs
lint-loc: OK (324 file(s) within budget)

$ node scripts/lint-root.mjs
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): ... AGENTS.md ...
  (identical on base commit 986fcd8 — verified via `git stash` + rerun, see below)

$ npx depcruise --config .dependency-cruiser.cjs packages apps workers
✔ no dependency violations found (345 modules, 1078 dependencies cruised)

$ node scripts/tracker-audit.mjs --gate g1,g4
tracker-audit --gate G1,G4: 3 finding(s)  (exit 1)
  G1 status: T-033 is "pending" in goal.json but "done" in TASKS.md
  G4 ambiguous issue ref: qa/manifests/t-033-bot-tests.md cites ISS-001, ISS-002 bare...
  G4 ambiguous issue ref: qa/verdicts/t-047-controller.md cites ISS-001, ISS-002 bare...
  (identical on base commit 986fcd8 — verified via `git stash` + rerun; pre-existing T-033/T-047
  bookkeeping, unrelated to this unit)
```

## Known pre-existing failures (C10, named per the contract's own exception clause)
- **ISS-248** (`lint-root`): root has 16 loose tracked files against a 15-file budget
  (`AGENTS.md` is the extra one, per the contract's own amendment log 2026-09-24). Reproduced
  byte-identical via `git stash` (reverting every change this unit made) + rerunning
  `node scripts/lint-root.mjs` on base commit `986fcd8` — same 16-file list, same violation.
- **`tracker-audit --gate g1,g4`**: 3 pre-existing findings about T-033/T-047 bookkeeping
  (goal.json vs TASKS.md status drift, ambiguous bare `ISS-001`/`ISS-002` refs from before the
  per-lane ledger convention). Also reproduced identically via the same `git stash` + rerun —
  unrelated to T-031, not touched by this unit's files.
- Neither is part of `pnpm lint:structure`'s or the contract's list of commands this unit could
  have caused to regress; both are named here per D-020's neighbor rule (C10: "a failure
  reproduced identically on the unit's base commit... must be named with its issue id").

## Capability coverage (each new claim -> its isolating falsification)
All falsifications used the D-020 pattern: byte backup (`cp` to a scratch path) before mutating,
mutant test run guarded with `|| true` so a failing test's non-zero exit can never abort the
script before restore, then `cp` the backup back and `cmp -s` to verify byte-identity — **never**
`git checkout --` (that exact shortcut was filed as ISS-T-033-1 last unit). One early attempt used
`trap ... EXIT INT TERM ERR` combined with a `cd`+`;` sequence; the trap fired mid-script with the
wrong working directory and the restore `cp` failed silently until caught by hand — every row
below was re-run with absolute/repo-root-relative paths and no `cd`, and each restore was verified
green (`RESTORED_OK` + a `cmp` diff of zero) before moving to the next row.

| capability | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| Silent <SILENT_TRIGGER_SEC (120s) never alerts | `audio-watchdog.test.ts`: "silent for 119s -> no alert, no reconnect" | `sed` changed `SILENT_TRIGGER_SEC = 120` -> `= 60` | Before: `✔ silent for 119s -> no alert, no reconnect`. After: `✖ silent for 119s -> no alert, no reconnect` (and `✖ a non-silent level just above the threshold...`) |
| Silent >120s fires exactly ONE alert + ONE reconnect, never repeats while still silent | "alarmed stretch never fires twice while still silent" | Deleted the `alarmed = true;` line inside `tick()` | Before: `✔ alarmed stretch never fires twice...`. After: `✖ alarmed stretch never fires twice...` |
| Audio returning re-arms; a later silent stretch fires again | "audio returning re-arms ..., and a second silent stretch fires a second alert + reconnect" | Deleted the `alarmed = false;` line inside `onLevel()` | Before: `✔ audio returning re-arms...`. After: `✖ audio returning re-arms...` |
| stop() cancels the tick and unsubscribes the level listener | "stop() cancels the tick and unsubscribes the level listener exactly once" | Deleted `cancelTick?.();` inside `stop()` | Before: `✔ stop() cancels the tick...`. After: `✖ stop() cancels the tick...` |
| Silence boundary (-50dB strictly-below, matching record-finalize.ts's own contract-aligned amendment) is honoured on the live per-tick reading | "a non-silent level just above the threshold..." + "a level just below the threshold..." | Inverted `if (isSilentCapture(levelDb)) return;` to `if (!isSilentCapture(levelDb)) return;` in `onLevel()` | Before: both `✔`. After: both `✖` |
| `mulToDb(0)` maps to `-Infinity` (the muted-tab/digital-silence case) | "mulToDb: 0 -> -Infinity, 1.0 -> 0dB, 0.5 -> ~-6.02dB" | Changed `mul > 0 ? 20*log10(mul) : -Infinity` to `mul >= 0 ? 20*log10(mul \|\| 1) : -Infinity` | Before: `✔ mulToDb: 0 -> -Infinity...`. After: `✖ mulToDb: 0 -> -Infinity...` (the "muted tab" integration test itself stayed green under this same mutant — it computes its own input via `mulToDb(0)` at t=0, before any clock advance, so the mutation is insensitive there; the direct unit test above is the isolating one) |
| `peakMulFromLevels` reads the per-channel PEAK (index 1, `Obs_VolumeMeter.cpp`), not magnitude (index 0) | "peakMulFromLevels takes the max peak (index 1) across channels" | Changed `channel[1]` to `channel[0]` | Before: `✔ peakMulFromLevels takes the max peak...`. After: `✖ peakMulFromLevels takes the max peak...` |
| `createRealLevelSource` connects with the `InputVolumeMeters` high-volume bit set (opt-in, off by default in obs-websocket) | "createRealLevelSource connects with the InputVolumeMeters subscription bit set" | Changed `EventSubscription.All \| EventSubscription.InputVolumeMeters` to `EventSubscription.All` | Before: `✔ createRealLevelSource connects with the InputVolumeMeters subscription bit set`. After: `✖ createRealLevelSource connects with the InputVolumeMeters subscription bit set` |
| `should_force_reload` (sb_join.py, the new control-channel predicate) is a real filesystem check, not a stub | `test_sb_join.py`'s 3 `test_should_force_reload_*` tests | `return bool(reload_file) and os.path.exists(reload_file)` -> `return not (...)` | Before: `3 passed`. After: `3 failed` (pasted above) |
| C3 — the watchdog never touches mute state | "C3: the watchdog's dependency surface has no mute-shaped field" | `NO ISOLATING FALSIFICATION — structural non-capability.` `AudioWatchdogDeps` has exactly 6 fields (`now`/`subscribeLevel`/`scheduleTick`/`notifySilence`/`reconnect`/`log`), none mute-shaped, asserted directly via `Object.keys(deps).sort()`; grep-confirmed no `Mute`/`mute` token anywhere in `audio-watchdog.ts` outside this doc comment. There is no mute-affecting code path to falsify — an added capability would be dead code invented only to be falsified, which the escape hatch exists to avoid. |

## Live browser evidence
**Not UI-touching — no surface changed.** Changed/added paths, none match the UI-surface glob
(`*.tsx|jsx|vue|svelte|html|css`, `apps/web/**`, `**/routes/**`, `**/pages/**`, `**/components/**`):
- `packages/meeting-bot/src/capture/audio-watchdog.ts` (new)
- `packages/meeting-bot/src/capture/audio-watchdog.test.ts` (new)
- `packages/meeting-bot/src/capture/obs-windows.ts`
- `packages/meeting-bot/src/capture/record-commands.ts`
- `packages/meeting-bot/py/sb_join.py`
- `packages/meeting-bot/py/test_sb_join.py`

## Known gaps (stated, not hidden)
- **HARD RULE compliance:** no real Telegram send anywhere in this unit's tests (every
  `notifySilence`/`notifyRecovered` call in `audio-watchdog.test.ts` is a plain fake pushing to an
  array); no live Chrome/OBS run against a real meeting.
- **The real "muted tab on a live meeting" check is a human-approved live run** — this unit cannot
  and does not claim to have exercised: (a) a real OBS `InputVolumeMeters` event stream, (b) a real
  SeleniumBase Chrome actually muting/unmuting a real webinar tab, or (c) `sb.uc_open_with_reconnect`
  actually reloading a live page from the new `--reload-file` branch in `sb_join.py` (that call is
  identical to T-029's own untested-at-unit-level reload call — same gap class, not a new one this
  unit introduces). `createRealLevelSource` IS tested end-to-end against a fake `MeterClient`
  (connect args, event filtering, dB conversion, unsubscribe/disconnect ordering) — only the actual
  OBS protocol wire format is unverified beyond the WebFetch-confirmed field shapes cited above.
- The `inputLevelsMul` field shape (`[magnitude, peak, peakUnaffected]`, linear multiplier) is
  documented from `obsproject/obs-websocket`'s `Obs_VolumeMeter.cpp` (fetched, not guessed — the
  obs-websocket-js 5.0.8 package itself types `inputs` only as `JsonObject[]`, no stricter shape).
  If a future obs-websocket protocol revision changes this shape, `peakMulFromLevels` degrades
  safely (returns `undefined` for any channel where index 1 isn't a finite number, and the
  watchdog's own "no meter data = fail loud" design still fires after 120s either way).

## Status: checked-PASS — qa/verdicts/t-031-audio-watchdog.md (Cycle checked: 0, 4c87be0); merged to master bf653fe; meeting-bot 141/141 + pytest 20/20 + pnpm -r typecheck clean on merged tree; debt ISS-T-031-1 (low, tracker-audit G4 self-reference); live muted-tab-on-real-meeting check pending human-approved run
