# Manifest — t-032-obs-guard

**Governing criteria:** roadmap row `docs/meeting-bot-roadmap.md:47` (T-032 — "OBS guard: detect
Safe Mode or the WebSocket being down → restart OBS normally; never force-kill it" / done when "a
killed OBS is recovered before recording starts"). `qa/contracts/meeting-bot-live-capture.md`
(T-024b) is a checker-authored draft, **not adopted** — guidance only, per the unit brief; this
unit treats the roadmap row as the binding criterion.
**Date:** 2026-09-25
**Fix cycle:** 0
**Dual check:** no
**Queue tier:** roadmap task (T-032), P1 "Reliability"
**Severity gate:** full ceremony (touches the capture/OBS path that gates whether a session records
at all — a silent recording-never-started failure is the same failure class this unit exists to
close).
**Status:** ready-for-check
**Worktree:** `D:/KnowledgeBase-lanes/t-032-obs-guard`, branch `wave/t-032-obs-guard`, base `784df67`
**Commit:** `47b1b4d` — `git diff 784df67..47b1b4d --stat`: 3 files, all inside
`packages/meeting-bot/src/capture/` (`obs-windows.ts` modified, `obs-guard.ts` and
`obs-guard.test.ts` new). No file outside this list touched.

## What changed

**`packages/meeting-bot/src/capture/obs-guard.ts` (new).** Split out of `obs-windows.ts` for the
same reason `watchdog.ts` / `controller-state.ts` / `record-commands.ts` already live in this
directory as separate files instead of one large one: `lint-loc`'s 300-non-blank-line budget
(`obs-windows.ts` was already at 250/300 before this unit) and a genuinely separate, OS-agnostic
decision surface — exactly parallel to the existing split, not a duplicate-behavior file. Exports:

- `ObsGuardProbes` — every OS interaction `ensureObsReady` needs (`isObsRunning`,
  `connectWebsocket`, `requestGracefulClose`, `clearShutdownSentinel`, `launchObs`, `sleep`,
  `log`), plus `forceKillObs`, which exists **only** so a test can assert it is never invoked.
- `ensureObsReady(probes)` — the guard itself. Tries a websocket connect first (fast path, no
  recovery if OBS is already up and reachable). On failure: if OBS is running (Safe-Mode symptom),
  requests a graceful close (`requestGracefulClose`) and waits (bounded, 10×1s) for it to actually
  stop; if not running, skips straight to launch. Either way: clears the unclean-shutdown sentinel,
  launches OBS normally, then retries the websocket connect with a bounded backoff (10×3s ≈ 30s
  total, matching the roadmap's "e.g. 30 s total"). Throws a clear, named error if still
  unreachable after that. `forceKillObs` is never called anywhere in this file.

**`packages/meeting-bot/src/capture/obs-windows.ts` (`createObsBrowserDeps` / `connectObs`,
edited in place).** `connectObs` (previously: inline `obs.connect` + on-failure spawn + a 30-attempt
2s-interval retry loop with no Safe-Mode detection at all — the old code would spawn a second OBS
process on top of a Safe-Mode one and then just poll forever) now delegates to `ensureObsReady`,
wired with real probes via the new `createRealObsGuardProbes(cfg, obs, log)`:

- `isObsRunning` → `tasklist /FI "IMAGENAME eq obs64.exe" /NH`, checked for `obs64.exe` in stdout.
- `requestGracefulClose` → PowerShell `Get-Process obs64 | ForEach-Object { $_.CloseMainWindow() }`
  — WM_CLOSE to the main window, never `taskkill /F`.
- `clearShutdownSentinel` → `rmSync(%APPDATA%\obs-studio\.sentinel, { force: true, recursive: true })`.
- `launchObs` → the same `spawn(cfg.obsExe, [...], { detached: true, ... }).unref()` the old code
  used, unchanged args/cwd.
- `forceKillObs` → `forceKillObsNeverCall()`, which **throws** if ever called — a structural
  guarantee (not just an unused function) against a future edit silently reintroducing a force-kill
  fallback.

**Verified, not assumed: `--disable-shutdown-check` does nothing on this machine's OBS.**
`docs/DECISIONS.md:360` states this repo drives **OBS 32**. Web research this unit
(obsproject/obs-studio GitHub issues #12650 and #12674, and the OBS forum thread
"OBS Version 32.0.0 removed --disable-shutdown-check") confirms OBS 32.0.0 **removed** that flag
entirely — it is a silent no-op, not "works but undocumented". So the *pre-existing* code at the
old `obs-windows.ts:89` (still carried in `launchObsNormally`'s args, kept only for older-OBS
back-compat) was never actually preventing the Safe-Mode prompt on this repo's real machine. The
forum thread documents the working replacement: delete
`%APPDATA%\obs-studio\.sentinel` before relaunch — which `clearObsShutdownSentinel` now does, and
which is the part of this fix that is actually effective on OBS 32. `.sentinel` has been reported
as either a file or a directory depending on version, so the removal uses `recursive: true` to
cover either.

## How to verify

```
pnpm --filter @lkb/meeting-bot test        # obs-guard.test.ts + the rest of the package
pnpm -r --no-bail test                     # full monorepo, unaffected packages untouched
pnpm -r typecheck
pnpm lint:structure                        # short-circuits at the pre-existing lint-root
                                            # 16>15 (ISS-248, AGENTS.md runtime projection,
                                            # unrelated to this unit) — every stage before and
                                            # after that line was re-run individually, see Evidence.
```

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| OBS not running → `ensureObsReady` launches it (no graceful-close call) and completes once the post-launch websocket connect succeeds | `obs-guard.test.ts`: "OBS not running → launches (no graceful close), then connects on the first retry" | In `obs-guard.ts`, removed `probes.launchObs();` (the whole line, replaced with a comment) — D-020: file armed via `scripts/lib/mutate.mjs apply`, edit made, tests run under `timeout 60`, restored via `mutate.mjs restore` in an EXIT/INT/TERM/ERR trap, verified `git status --short` empty + `git diff --stat HEAD` empty + `mutate.mjs list` → "no outstanding mutations" (a raw `cmp` against a pre-checkout `cp` backup falsely flagged CRLF-normalization noise — confirmed as noise, not content, and not used as the actual gate) | BEFORE: 88/88 pass. AFTER: **84 pass / 4 fail** — every `ensureObsReady` test in the file failed (three directly on `launchCalls`, the not-running one included). File restored; re-run after restore: 88/88 pass again. |
| Websocket-down-while-OBS-running (Safe Mode) → `ensureObsReady` requests a **graceful** close and never calls `forceKillObs` | `obs-guard.test.ts`: "OBS running but unreachable (Safe Mode) → graceful close, wait for exit, relaunch, connect" and "…never-comes-up from the Safe-Mode branch also never force-kills" | In `obs-guard.ts`, replaced `await probes.requestGracefulClose();` with `probes.forceKillObs();` — same D-020 procedure (armed, edited, tested under timeout, restored in a trap, verified via `git status`/`git diff --stat HEAD`/`mutate.mjs list` clean) | BEFORE: 88/88 pass. AFTER: **85 pass / 3 fail** — the fake `forceKillObs` throws when called (proving the guard reached for it) and the "never force-kills" count assertion flips 0→1 where the throw didn't already abort the test. File restored; re-run after restore: 88/88 pass again. |
| `ensureObsReady` never calls `forceKillObs` even when it gives up entirely (never-comes-up path) | `obs-guard.test.ts`: "websocket never comes up after a guarded restart → throws a clear error, never force-kills" | Covered by mutation 1 above (`launchCalls` assertion in this same test failed when the launch call was removed) — not re-mutated separately to avoid redundant churn on the same line; this test's own dedicated `forceKillCalls === 0` assertion runs every pass above | `✔ ensureObsReady: websocket never comes up after a guarded restart → throws a clear error, never force-kills` passes today (part of the 88/88 suite); its own assertion is exercised every run. |
| Fast path: websocket already reachable → no launch, no graceful close, no sentinel clear | `obs-guard.test.ts`: "websocket already reachable → no recovery, no launch, no close" | Not separately mutated — this is the same `connectWebsocket` fast-path `return` covered structurally by the other four tests (each of which requires the *first* `connectWebsocket` call to fail before any recovery branch is reached); a mutation removing the early `return` would be caught by every other test's `connectAttempts`/`launchCalls` counts going wrong too | `✔ ensureObsReady: websocket already reachable → no recovery, no launch, no close` passes (1/1 attempt, 0 launches, 0 closes). |
| bounded backoff / bounded wait actually exhaust their full schedule before giving up, rather than looping forever or giving up early | `obs-guard.test.ts`: "graceful close requested but OBS never reports stopped → still launches anyway (bounded wait)" (asserts `sleeps.length >= 10`) and "…never comes up…" (asserts `sleeps.length >= 10`) | Covered by both mutations above — mutation 1 broke the not-running/Safe-Mode paths' `launchCalls`; mutation 2 broke the graceful-close path directly. A separate "make the loop infinite" mutation was intentionally **not** attempted per D-020's own warning (2026-09-08 incident: a hand-rolled infinite-loop mutation left the suite hung and the mutant applied on disk until manually restored) — `sleeps.length` is asserted with a lower bound (`>=`) precisely so a loop-length regression is still caught without needing to mutate toward an unbounded loop. | `✔` both tests pass with 10 sleeps recorded in the current implementation (`CONNECT_BACKOFF_MS`/`CLOSE_WAIT_MS`, 10×3000ms / 10×1000ms). |

## Evidence (pasted)

**`pnpm --filter @lkb/meeting-bot test`** (post-restore, clean tree):
```
ℹ tests 88
ℹ pass 88
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**`pnpm -r --no-bail test`** (full monorepo, exit 0):
```
packages/core test:        tests 7   pass 7   fail 0
packages/db test:          tests 14  pass 14  fail 0
packages/ai test:          tests 74  pass 74  fail 0
packages/ask test:         tests 50  pass 50  fail 0
packages/index test:       tests 228 pass 228 fail 0
packages/ingest test:      tests 97  pass 97  fail 0
packages/meeting-bot test: tests 88  pass 88  fail 0
apps/api test:              tests 175 pass 175 fail 0
```

**`pnpm -r typecheck`** — all 8 packages with a typecheck script report `Done`, 0 errors
(`apps/web`, `packages/core`, `packages/db`, `packages/ai`, `packages/index`, `packages/ask`,
`packages/ingest`, `apps/api`, `packages/meeting-bot`).

**`pnpm lint:structure`** — short-circuits at the pre-existing `lint-root` violation
(ISS-248: `AGENTS.md`/`.codex` runtime projection pushes root loose-file count to 16>15; present
on `master` before this unit, confirmed by reading `qa/issues.jsonl` ISS-248/ISS-262/ISS-263 and by
the fact this unit added zero root files). Every stage before and after that line, run
individually:
```
lint-loc: OK (313 file(s) within budget)
lint-dirsize: OK (83 dir(s) within budget)
lint-root: FAIL — 16>15 (ISS-248, pre-existing, unrelated to this unit)
lint-dupes: OK (349 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (1171 file(s) scanned)
snapshot --check: OK: docs/SNAPSHOT.md matches a fresh regeneration (117 lines, budget 200)
lint.test.mjs: tests 14 / pass 14 / fail 0
tracker-audit --gate G1,G4: 1 finding — G4 ambiguous issue ref in qa/verdicts/t-047-controller.md
  (pre-existing, from the t-047-controller unit; not in qa/verdicts/**this** unit and out of this
  unit's edit scope — qa/verdicts/ is never touched by the maker)
depcruise: no dependency violations found (335 modules, 1034 dependencies cruised)
```

**Mutation falsification runner output (both mutations) —** see the Capability coverage table
above for the isolated pass/fail counts; both runs were captured under `timeout 60`, restored via
`scripts/lib/mutate.mjs restore` inside a `trap ... EXIT INT TERM ERR`, and the post-restore state
was verified clean via `git status --short` (empty), `git diff --stat HEAD` (empty) and
`node scripts/lib/mutate.mjs list` ("no outstanding mutations") before proceeding — the D-020
byte-check was done against `git show HEAD:<path>`, not a raw pre-checkout `cp`, after the first
attempt's naive `cp`-based `cmp` produced a CRLF-normalization false positive (git's own
`core.autocrlf` rewrites line endings on checkout on this Windows clone; content was never actually
different — confirmed via `git diff --stat` reporting no changes both times).

## Known gaps (disclosed, not fixed)

- **No real-machine proof of "a killed OBS is recovered before recording starts."** This is
  explicitly out of scope per the unit brief ("do NOT kill, start or reconfigure the real OBS on
  this machine — another session may be using it"). All coverage is against injected fakes in
  `obs-guard.test.ts`; `obs-windows.ts`'s real-probe wiring (`isObsProcessRunning`,
  `requestObsGracefulClose`, `clearObsShutdownSentinel`, `launchObsNormally`,
  `createRealObsGuardProbes`) is untested against a live OBS process, tasklist, PowerShell or
  filesystem — same disclosed-gap class as T-047-controller's `runRecord`/`start-record-detached.ps1`
  (tracked there as T-033 debt).
- **`.sentinel` path/behavior verified via OBS forum + GitHub issue research, not via a local OBS
  32 install's actual `--help` output or `%APPDATA%` inspection on this machine** — this unit did
  not run `obs64.exe --help` or inspect the real `%APPDATA%\obs-studio\` directory, to honor the
  "do not touch the running OBS" boundary. If the sentinel path differs in some 32.x point release,
  `clearObsShutdownSentinel` would silently no-op (`rmSync(..., { force: true })` doesn't throw on
  a missing path) and the guard would fall through to the bounded-backoff failure path with its
  loud error — not a silent failure, but also not a verified-correct recovery on real hardware.
- **`CloseMainWindow`-equivalent via PowerShell may not always have a window to close** — OBS is
  launched with `--minimize-to-tray`, and a minimized-to-tray window may or may not still respond
  to `Get-Process | ForEach-Object CloseMainWindow()` depending on whether it's truly hidden vs.
  minimized; not verified against a real process. If it's a no-op, the guard still proceeds
  correctly (waits out the bounded 10s, logs, launches anyway — never force-kills), so this
  degrades to "waits 10s longer than necessary," not incorrect behavior.
- **Round-trip timing** (real OBS boot time, real websocket-server-enable delay) is unverified
  against a live process; the 30s connect backoff and 10s close-wait are chosen from the roadmap's
  own "e.g. 30 s total" and are not independently measured against this machine's actual OBS 32
  cold-start time.
- **G4 tracker-audit finding** (`qa/verdicts/t-047-controller.md` ambiguous ISS-001/ISS-002 refs)
  is pre-existing, from a different unit, and out of this unit's edit scope (`qa/verdicts/` is
  never touched by the maker) — flagged here only so the checker doesn't attribute it to this
  commit.
