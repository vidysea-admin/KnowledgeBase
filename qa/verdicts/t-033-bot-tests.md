# Verdict — t-033-bot-tests

**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** fresh claude-sonnet-subagent, Mode A unit check
**Bound project root:** `D:\KnowledgeBase-lanes\t-033-bot-tests` (branch `wave/t-033-bot-tests`, HEAD `8df765e4fa056fc690fba16c7534baf4f3b21fe7`, tree clean — matches the dispatch exactly)
**Contract:** `qa/contracts/meeting-bot-live-capture.md` (T-024b, ADOPTED 2026-09-25) — unit claims C9, touches C3/C4/C5/C10
**Diff base:** `c9959bf` (current master at dispatch time; lane merged master at `094dcea`)

## What I re-ran myself

- `pnpm --filter @lkb/meeting-bot test` in the bound tree → **123/123 pass**, incl. all 8 new tests
  (`obs-windows.test.ts` x3, `record-commands.test.ts` x5). Matches the manifest's pasted output
  verbatim, including per-test names and pass count.
- `pnpm -r typecheck` → all 10 scoped workspace projects `Done`, exit 0.
- `pnpm -r test` → 8/8 packages, `fail 0` each.
- `pnpm gen:types --check` → `OK: 24 generated type file(s) + index.ts match schema/`.
- `python schema/validate.py` → `PASS: 24 collection schema(s) validated correctly.`
- `pnpm lint:structure` → **FAIL at lint-root** (16 loose files vs budget 15, ISS-248) exactly as
  the manifest states, short-circuiting the `&&` chain. Re-ran every downstream sub-check
  individually: `lint-dupes` OK, `lint-migrations` OK (1191 files — manifest said 1190, off-by-one
  from repo drift between the manifest's run and mine, immaterial), `snapshot.mjs --check` OK,
  `lint.test.mjs` 14/14 pass, `tracker-audit --gate g1,g4` → same 3 findings verbatim, `depcruise`
  → 0 violations (343 modules). All match the manifest's individually-pasted output.
- **Pre-existing-failure claim, independently verified**: created a throwaway `git worktree add
  --detach <scratch> c9959bf` (removed after use, never touched the bound tree). On that worktree,
  `node scripts/lint-root.mjs` reproduces the identical 16-loose-files FAIL, and
  `node scripts/tracker-audit.mjs --gate g1,g4` reproduces the identical 3 findings, byte-for-byte.
  Both of C10's named exceptions are real and pre-existing on the unit's own base commit — the
  carve-out in the contract's C10 text applies cleanly.

## Point 1 — source changes in a "tests" unit

Confirmed by reading `obs-windows.ts`, `record-commands.ts`, `record-finalize.ts` in full (not
just the diff):

- `ObsClientLike` / `ObsBrowserDepsOverrides` (obs-windows.ts) and `RunFinalizeOverrides`
  (record-commands.ts) are additive, all-optional, all-default-to-real-behaviour seams. No in-repo
  caller passes overrides (`runRecord` calls `createObsBrowserDeps(cfg)` with no 2nd arg; `cli.ts`
  calls `runFinalize(rest)` with no 2nd arg) — zero behaviour change for real callers, confirmed by
  reading every call site, not just trusting the manifest's claim.
- `finalizeRecording`'s param list in `record-commands.ts` is byte-identical to what T-030 left it
  (`video, sessionId, title, platform, transcribe, gaps, telegram, durationSec`) and its
  `telegram.notifyFinished(...)` call survived intact inside `finalizeRecordingWith` in the new
  file, verbatim (title/sessionId/durationSec/gapCount/transcriptPath/turnCount all present).
- C4's silence gate: `isSilentCapture` in `record-finalize.ts:27-29` is `maxDb < SILENCE_MAX_DB`
  (strict), the write to `source.json` (with `audioLevel.silent`) happens at line 112, and the
  `throw` on `silent` is the *next* statement at line 115-117 — write-before-throw is preserved
  exactly as C4 requires, in the moved body.
- **The `record-finalize.ts` split is a justified LOC-budget extraction, not duplicate-module
  drift.** `record-commands.ts` was already at the 300-LOC budget's edge; this repo has an
  established, documented pattern of exactly this kind of split (`controller-state.ts`/
  `watchdog.ts` were split out of `obs-windows.ts` before this unit; `record-commands.ts`'s own
  header cites `cli.ts`'s own prior split for the identical reason). The split re-exports through
  `record-commands.ts` so the public import surface (`./record-commands.js`) is unchanged for
  every existing caller and test. `pnpm lint-dupes` (0 duplicate exports) and `depcruise` (0
  violations) both confirm no drift was introduced.

## Point 2 — D-020 mutation-run safety

The manifest itself discloses restoring mutations via `git checkout --` rather than the
byte-backup + trap(timeout/interrupt/error) + `cmp` scheme D-020 requires, and further discloses a
near-miss where that exact restore method reverted both a mutation and the unit's own uncommitted
work together. **This is a genuine process-rule breach**, independent of outcome: D-020 says "must"
for both the timeout wrap (which the manifest did do — 200s/30s) and the backup/trap/cmp restore
(which it did not). I verified no damage shipped (HEAD 8df765e's tree is clean and matches; the
5 mutated files read back exactly as the manifest's own post-mutation diffs describe, confirmed
during my own capability-coverage reproduction below) — but per the dispatch's own instruction,
process-rule breaches are findings even with no shipped damage. Filed **ISS-T-033-1** (medium;
medium severity per this repo's severity gate, since no auth/tenancy/data-write surface was
touched and no damage shipped — ledger entry only, not a blocker).

## Point 3 — C9 completeness

- **SILENCE_MAX_DB boundary**: `isSilentCapture(-50) === false`, `isSilentCapture(-50.1) === true`,
  `isSilentCapture(-49.9) === false` — all three asserted and passing, both as the pure-function
  test and end-to-end through `finalizeRecordingWith`.
- **OBS-failure paths**: all three (StartRecord/connect/StopRecord rejecting) exist, pass, and —
  verified by my own falsification below — each one specifically proves "restored mutes are
  EXACTLY this run's mutes" (a fake OBS client with a pre-muted `Desktop Audio` input proves it is
  never touched) and that the bot-Chrome child process is confirmed terminated by real PID
  liveness (`process.kill(pid, 0)`), not a mocked `child.kill()` spy.
- **`find-audio-file.mjs` audioPath branch**: confirmed this file was NOT touched by this unit
  (`git diff c9959bf..HEAD` shows zero changes to `scripts/lib/find-audio-file.mjs` or its test);
  the existing `find-audio-file.test.mjs` (3 tests, from `webinar-bot-live` fix cycle 1,
  commit efef75f) already covers it and passes. Re-verified green and independently falsified
  (below) — the manifest's claim that this was "already covered, not re-authored" holds.
- **`--stop-obs` with OBS unreachable**: read the full `runFinalize` body. When `overrides.obs`'s
  (or the real `OBSWebSocket`'s) `connect()` rejects, the function throws immediately — the only
  statement in the whole function that can create/write `source.json` is the final
  `finalizeRecording(...)` call, which is never reached. So "never corrupts or overwrites a valid
  source.json" holds **structurally** (there is no path from a failed connect to that write), not
  merely by the one test's absence-check — confirmed by reading the code, not just running the test.

## Point 4 — capability coverage (re-run myself, throwaway copies, never the bound tree)

Built one throwaway copy of the lane tree (`tar`, excluding `.git`/`node_modules`) in a scratch dir
outside the bound root, then 5 row-specific copies from it, each junction-linking every
`node_modules` directory (root + each pnpm workspace package) from the bound tree so `pnpm`'s
workspace resolution works without a fresh install. All 5 rows: GREEN-before confirmed **in the
copy** (never taking step-3's bound-tree run as the "before" line), then the manifest's own
single-hunk falsifying edit applied, re-run, confirmed RED for the **named** assertion, never a
parse/import-level cascade failure.

| row | GREEN-before | falsifying edit applied | RED-after — assertion that fired |
|---|---|---|---|
| StartRecord rejecting → exact-mutes-restored | 3/3 pass | `obs-windows.ts:282` unmute commented out | `AssertionError: Mic/Aux was not muted before the run — must be muted then restored (unmuted)` — exact match |
| StopRecord rejecting → exact-mutes-restored | 3/3 pass | `obs-windows.ts:311` unmute commented out | `AssertionError: stop()'s finally must restore the mute even though StopRecord itself threw` — exact match |
| isSilentCapture boundary strictness | 5/5 pass | `record-finalize.ts:28` `<` → `<=` | 2 reds (as the manifest predicted): `AssertionError: AT the boundary must not be silent`, plus the boundary-exact `finalizeRecordingWith` test now throws `recording is silent (max -50 dB)` |
| `runFinalize --stop-obs` OBS-unreachable propagation | 5/5 pass | `record-commands.ts:217` `.connect(...)` → `.connect(...).catch(()=>{})` | Assertion fails because the error changed from the injected `OBS unreachable (simulated, T-033)` to `must not be called — connect() must fail first` — proves the swallow let execution proceed past the failed connect, exactly the propagation bug this row targets |
| `find-audio-file.mjs` audioPath branch (pre-existing, not touched this unit) | 3/3 pass | `find-audio-file.mjs:19` `if (source.audioPath)` → `if (false && source.audioPath)` | 1 pass / 2 fail — both audioPath tests red with the exact predicted `TypeError: Cannot read properties of undefined (reading 'split')` fallthrough; TOC-fallback test stays green |

All 5 falsifying-edit cells were single-hunk edits to a single file named in the manifest's "What
changed" (the audioPath-branch row names `find-audio-file.mjs`, which the manifest explicitly
discusses there even though this unit didn't modify it) — no `CONTRACT_MISMATCH` cells.

**CAPABILITY-COVERAGE: 5/5 rows reproduced.**

### Incidental finding from this reproduction — ISS-T-033-2

Re-running `obs-windows.test.ts` alone, 4 separate times (2 GREEN-before, 2 AFTER-mutation), the 3
tests always pass/fail correctly within ~500ms combined, but **the node process itself did not
exit for ~120 seconds every single time** (`duration_ms` 120618–120987 across all 4 runs, and this
matches the manifest's own pasted full-suite run: 123 individually-fast tests totaling
`duration_ms 120987.9156`). Root cause, read directly: `launch()`'s
`Promise.race([openedP, exited, sleep(120_000)...])` never clears the `sleep(120_000)` timer once
the race resolves via `openedP`, so it keeps the event loop alive for the full 120s on every call.
This is pre-existing code (webinar-bot-live, not introduced by t-033) newly exercised by these
tests — harmless in production (a real recording session already runs far longer than 120s) but it
adds ~2 minutes of dead time to this test file specifically, and to the whole `pnpm --filter
@lkb/meeting-bot test` run. Filed **ISS-T-033-2** (medium; not a criterion violation — C9 only
requires tests exist and pass, which they do — filed as a ledger finding, non-blocking).

## Point 5 — diff scope (step 4c)

`git diff c9959bf..HEAD --stat`: 7 files touched (`fake-join-fixture.mjs` new,
`obs-windows.test.ts` new, `obs-windows.ts` modified, `record-commands.test.ts` new,
`record-commands.ts` modified, `record-finalize.ts` new, the manifest itself). No existing
function/export/test/route/config key was deleted or renamed outside what the manifest itself
documents moving (and re-exports for compatibility). No file outside "What changed" was touched.
Clean.

## Ledger

- **ISS-300** (structural erosion — record-commands.ts had no test): this unit is exactly its own
  named `fix_direction`, verifiably delivered and independently re-run — moved `open → fixed`.
- **ISS-T-033-1** (medium, new): D-020 mutation-restore process breach — see Point 2.
- **ISS-T-033-2** (medium, new): dangling 120s timer in `launch()` — see Point 4.

## Mode D / UI surface

Changed paths are all under `packages/meeting-bot/src/capture/**` — Node/TS backend capture
plumbing and its own tests, no `apps/web`, no route, no rendered surface. Per D-024 (gate on
changed file paths), **Mode D does not apply**. `obs-windows.test.ts` drives a real but tiny Node
child process (the fixture) standing in for the bot browser — never an actual browser/webinar page
— consistent with the manifest's own statement.

## Verdict

Every criterion this unit claims or touches (C3, C4, C5, C9, C10) is evidenced directly by
commands I re-ran myself or code I read myself — not by trusting the manifest's pasted output.
Both new findings are process/efficiency issues, not criterion violations, and neither blocks PASS
under this repo's severity gate (medium, no auth/tenancy/data-write surface, no shipped damage).

```
VERDICT: PASS
SCOREBOARD: 5/5 criteria met (C3, C4, C5, C9, C10), 0/0 invariants (contract has no separate [I*] list)
FAILURES (if any): none
CAPABILITY-COVERAGE: 5/5 rows reproduced
LIVE-BROWSER: not-applicable (changed paths: packages/meeting-bot/src/capture/{obs-windows.ts,obs-windows.test.ts,fake-join-fixture.mjs,record-commands.ts,record-commands.test.ts,record-finalize.ts} — no UI surface, Mode D not gated per D-024)
ISSUES-WRITTEN: ISS-T-033-1, ISS-T-033-2 (both new, medium) ; ISS-300 (open -> fixed)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent) — self != executor, no ANTHROPIC_BASE_URL override
EXPLANATION: All 5 verify commands re-run clean (123/123 meeting-bot tests, repo-wide typecheck/test/gen:types/schema clean, lint:structure's one FAIL and tracker-audit's 3 findings independently reproduced as pre-existing on base commit c9959bf via a throwaway worktree). Capability-coverage 5/5 falsified in throwaway copies outside the bound tree, each reddening for the exact named assertion. Two medium, non-blocking process/efficiency findings filed (D-020 restore-method breach; a pre-existing 120s dangling timer in launch() newly exercised by these tests). ISS-300, the issue this unit targeted, is verifiably closed.
```
