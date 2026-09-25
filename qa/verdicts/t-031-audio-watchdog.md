# Verdict — t-031-audio-watchdog

**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** claude-sonnet-subagent (fresh context, dispatched Mode A unit check)
**Bound root:** D:/KnowledgeBase-lanes/t-031-audio-watchdog (branch wave/t-031-audio-watchdog, HEAD 8e862f5)
**Contract:** qa/contracts/meeting-bot-live-capture.md (T-024b, ADOPTED). Per the manifest's own framing
(and confirmed correct — T-031/watchdog is explicitly listed in the contract's "Non-goals for
T-024b" section), this unit is judged against **C10 (no regression)** plus the **roadmap row's own
"done when" criterion** (docs/meeting-bot-roadmap.md:46), not the numbered C1–C9.

## What I re-ran myself

- `pnpm --filter @lkb/meeting-bot test` → **141/141 pass**, matches manifest exactly.
- `python -m pytest packages/meeting-bot/py -q` → **20/20 pass**, matches manifest exactly.
- `pnpm -r typecheck` → all 9 workspaces "Done", matches manifest exactly.
- `pnpm -r test` (full suite, run once per memory constraint — first attempt piped through `tail`
  and silently lost the real exit code, a mistake on my part; re-ran capturing the exit code
  directly to a log file): **REAL_EXIT_CODE:0**, every workspace 0 failures — core 7/7, db 14/14,
  ai 74/74, ask 50/50, index 228/228, ingest 97/97, apps/api 175/175, meeting-bot 141/141. Matches
  the manifest's pasted counts exactly (apps/api 175, meeting-bot 141).
- `pnpm gen:types --check` → "OK: 24 generated type file(s) + index.ts match schema/", matches.
- `python schema/validate.py` → "PASS: 24 collection schema(s) validated correctly.", matches.
- `pnpm lint:structure` (full composite, not a subset) → **fails identically to the manifest's
  claim**: `lint-loc` OK, `lint-dirsize` OK, `lint-root` FAIL (16 loose root files vs budget 15,
  `AGENTS.md` the extra one) — composite halts there (it's `&&`-chained). Reproduced this same
  `lint-root` failure, byte-identical file list, on base commit 986fcd8 via a throwaway
  `git worktree add --detach` (removed after use) — confirms it is genuinely pre-existing (ISS-248),
  not caused by this unit.
- `node scripts/tracker-audit.mjs --gate g1,g4` (named in the manifest as supplementary C10
  evidence, run outside the composite since `lint-root` blocks the composite from reaching it) →
  **discrepancy found, see FAILURES.**
- `npx depcruise --config .dependency-cruiser.cjs packages apps workers` → clean, 345 modules/1078
  deps, no violations.

## Specific points judged

**1. C6 — OBS_WS_PASSWORD never logged.** Grepped `capture/*.ts` for every `console.log` /
`console.error` / thrown-error string. `record-commands.ts` reads it once from
`process.env.OBS_WS_PASSWORD`, throws only `"OBS_WS_PASSWORD missing from .env"` (the variable
name, never the value) if absent. `audio-watchdog.ts`'s `createRealLevelSource` connect-failure
`.catch()` logs only `e.message`/`String(e)` — never the error object, never the connect
arguments — matching the same pattern `watchdog.ts` already uses elsewhere in this repo. No leak
found. **Holds.**

**2. C2 — watchdog reload must share T-029's total MAX_CLICKS budget, not grant a fresh one.**
Read `sb_join.py`: the watchdog's new `--reload-file` branch calls the exact same
`apply_reload(clicks, now)` function T-029's own reload path calls, which is documented and coded
to return `clicks` **unchanged** (only widens `extra_click_until`). There IS a dedicated test
proving this holds across multiple reloads —
`test_total_clicks_capped_across_multiple_reloads` — which drives an exhausted initial window plus
3 reloads through `apply_reload()` and asserts total click events never exceed `MAX_CLICKS`
(would be up to `4×MAX_CLICKS` if a reload reset the counter). Since the watchdog's reload and
T-029's reload are literally the same function call, this test covers the combined case. **Holds,
and is test-proven, not just structurally true.**

**3. C3 — watchdog never touches mute state; obs-windows.ts unchanged behaviorally.** Diffed
`obs-windows.ts` line by line: the only changes are (a) exporting the already-existing
`AUDIO_INPUT` constant, (b) one header-comment reflow (2→1 lines), (c) `launch()`'s `pyArgs` gains
one extra `--reload-file <path>` argument (an optional, default-`None` argparse flag on the Python
side — adding it does not change behavior for any existing caller since only `launch()` calls
`sb_join.py`), and (d) a new `triggerReload(handle)` export that only writes a sentinel file. The
entire `prepareScene`/`unmute`/`SetInputMute` block is byte-for-byte untouched.
`audio-watchdog.ts`'s `AudioWatchdogDeps` has exactly 6 injected fields, none mute-shaped
(verified via the file's own `Object.keys(deps).sort()` assertion and a grep for
`Mute`/`mute` tokens — none outside doc comments). `pnpm lint:structure`'s `lint-loc` check
(non-blank-line budget, not raw `wc -l`) passes for `obs-windows.ts` at 330 raw / within its 300
non-blank-line budget. **Holds.**

**4. Lifecycle — stop() on every exit path, no leaks, meter failure non-blocking.**
`record-commands.ts`: `audioWatchdog.stop()` is called in the INNER `finally` (before
`joiner.stop()`) and again, idempotently, in the OUTER `finally` — covers normal end, thrown
error mid-run, and the stop-file path alike. `audio-watchdog.ts`'s own `stop()` unsubscribes the
level listener and cancels the tick, guarded by a `started` flag so a second call is a no-op
(test-covered: "stop() before start() is a safe no-op", "stop() is idempotent"). The OBS meter
connection (`createRealLevelSource`) is closed via `closeOnce()`, guarded against the
connect-before-unsubscribe race (test-covered: "unsubscribe before connect resolves still
disconnects exactly once"). A meter-connect failure only logs and returns — `subscribeLevel`
itself returns synchronously without awaiting `connect()`, so an unreachable OBS never blocks or
delays `runRecord()`. **Holds.**

**5. Semantics.** `tick()`: `if (silentForSec <= SILENT_TRIGGER_SEC) return;` — fires only when
strictly **greater than** 120s, matching the roadmap's "more than 2 min" and the contract's own
"strictly below" convention for the companion finalize-gate. `alarmed` gates one alert+reconnect
per stretch and re-arms only on a confirmed non-silent `onLevel()` reading — test-covered for both
halves. Threshold consistency: the live per-tick check reuses `record-finalize.ts`'s own
`isSilentCapture`/`SILENCE_MAX_DB` (-50dB) rather than a duplicated constant — one number, one
reasoning, as claimed. `mulToDb(0) = -Infinity`, always `< -50dB`, so a genuinely muted tab (0
multiplier from the first reading) trips the watchdog — test-covered directly
("a muted tab (0/-Infinity dB from the very start) still triggers the alert"). **Reload-file
staleness:** checked whether a leftover `--reload-file` sentinel from a prior run could cause a
spurious reload at the next start — it cannot: the path is `path.join(cfg.recordDir,
".reload-" + handle)` where `handle` is a fresh ISO-timestamp string generated fresh in every
`launch()` call, so a new run always polls a brand-new, never-yet-existing path; an old run's
unconsumed sentinel simply becomes an orphan file under `recordDir`, never read by a later run.
Not a defect, though it is a very minor unbounded resource accumulation (orphan `.reload-*`
sentinel files never get garbage-collected if a run dies before consuming its own) — too minor to
file (no user-facing or correctness impact; `recordDir` already accumulates other per-run
artifacts the same way). **Holds.**

**6. Process (D-020).** `git status` in the bound tree is clean, `git stash list` is empty, and
`git diff 986fcd8..HEAD --stat` matches the manifest's "What changed" list exactly (7 files, no
extra). The manifest's own account of (a) one mutation left briefly on disk during an early
attempt (a `trap ... EXIT INT TERM ERR` + `cd` combination that fired mid-script in the wrong
directory) and (b) reproducing the pre-existing lint-root/tracker-audit failures via `git stash` +
rerun inside the lane, is consistent with a tree that is now clean and byte-matches its own
"What changed" list — no leftover mutant, no lost stash. **No finding.**

**7. C10 re-run.** All primary regression commands (`pnpm -r typecheck`, both test suites,
`pnpm -r test`, `pnpm gen:types --check`, `python schema/validate.py`) reproduce exactly as the
manifest claims, with real numbers matching. `pnpm lint:structure` fails identically to base at
`lint-root` (byte-identical file list, confirmed via a throwaway detached worktree at 986fcd8).
**One discrepancy found:** `node scripts/tracker-audit.mjs --gate g1,g4`, run directly (the
composite never reaches it because `lint-root` halts the `&&` chain first), reports **4 findings
on HEAD**, not the 3 the manifest pastes. Reproducing the same command on base commit 986fcd8
(throwaway detached worktree, removed after use) gives exactly 3 — byte-identical to the
manifest's paste, confirming the manifest's own evidence was accurate *at the time it was taken*.
The 4th finding on HEAD is new: `G4 ambiguous issue ref: qa/manifests/t-031-audio-watchdog.md
cites ISS-001, ISS-002 bare...`. This manifest does not itself claim ISS-001/ISS-002 as its own —
it merely **quotes**, in its "Actual outputs" and "Known pre-existing failures" sections, the same
prior tracker-audit paste the manifest cites as pre-existing evidence for
`t-033-bot-tests.md`/`t-047-controller.md`. `tracker-audit.mjs`'s G4 check pattern-matches that
quoted text as if this manifest itself were making an ambiguous bare-ISS claim — a self-referential
false positive triggered by complying with C10's own exception clause (which requires quoting
prior findings verbatim). Not a functional regression in the watchdog feature; filed as
`ISS-T-031-1`, severity low, with a fix-direction (tighten the G4 pattern to skip quoted-evidence
blocks, or fence such quotes). See FAILURES below.

## Capability coverage — re-verified myself, all 9 rows

Copied the lane tree (excluding `.git`/`node_modules`) into a scratch dir outside the bound root,
junctioned `node_modules` back in (via PowerShell `New-Item -ItemType Junction`, later safely
unlinked with `(Get-Item $link).Delete()` — never `-Recurse`, so the lane's real `node_modules`
was never touched; verified intact afterward). Confirmed the copy green (`node --test` on
`audio-watchdog.test.ts`: 18/18 pass) before mutating. Re-ran every falsifying edit myself,
byte-backup + guarded run + restore + `cmp` for each (never `git checkout --`):

| # | capability | mutation applied | result |
|---|---|---|---|
| 1 | Silent <120s never alerts | `SILENT_TRIGGER_SEC = 120` → `60` | named test reddened (✔→✖), restore verified |
| 2 | Fires exactly once per silent stretch | deleted `alarmed = true;` in `tick()` | reddened, restored |
| 3 | Audio returning re-arms | deleted `alarmed = false;` in `onLevel()` | reddened, restored |
| 4 | stop() cancels tick + unsubscribes | deleted `cancelTick?.();` in `stop()` | reddened, restored |
| 5 | Silence-boundary honoured live | inverted `isSilentCapture` check in `onLevel()` | both named tests reddened, restored |
| 6 | `mulToDb(0) = -Infinity` | changed to `mul >= 0 ? ... (mul \|\| 1) : -Infinity` | reddened, restored |
| 7 | `peakMulFromLevels` reads PEAK (idx 1) | changed `channel[1]` → `channel[0]` | reddened, restored |
| 8 | `InputVolumeMeters` bit set on connect | removed the bit from `eventSubscriptions` | reddened, restored |
| 9 | `should_force_reload` is a real fs check | inverted the return (`not (...)`) | all 3 named pytest cases reddened (3 failed), restored |

Row 10 (C3 structural non-capability, "no isolating falsification — the escape hatch") judged as
written: `AudioWatchdogDeps` genuinely has no mute-shaped field to falsify; accepted as claimed,
not a dodge.

Each edit was a single-hunk change to a single file named in "What changed" (audio-watchdog.ts ×8,
sb_join.py ×1) — no `CONTRACT_MISMATCH` cells. Every restore verified byte-identical via `cmp`.
**9/9 rows reproduced independently, plus 1 accepted structural non-capability claim.**

## Diff scope (4c)

`git diff 986fcd8..HEAD --stat`: 7 files changed, 831 insertions(+), 5 deletions(-) — matches the
manifest's own list exactly (`audio-watchdog.ts` new, `audio-watchdog.test.ts` new,
`obs-windows.ts`, `record-commands.ts`, `sb_join.py`, `test_sb_join.py`, plus the manifest file
itself). No deleted/renamed function, export, route, test, or config key found anywhere in the
diff. No file touched outside "What changed". **Clean.**

## Live browser (Mode D)

**Not applicable.** Changed paths (`packages/meeting-bot/src/capture/*.ts`,
`packages/meeting-bot/py/*.py`) match none of the UI-surface globs
(`*.tsx|jsx|vue|svelte|html|css`, `apps/web/**`, `**/routes/**`, `**/pages/**`,
`**/components/**`) — confirmed via `git diff --stat` against those globs directly (empty match).
No indirect UI effect either (no retrieval/ranking/render-affecting change). Mode D correctly does
not apply.

## Known/disclosed gaps — judged as debt, not defects

The manifest discloses, and I confirm no attempt was made to fake, live-run evidence for: a real
OBS `InputVolumeMeters` event stream, a real SeleniumBase Chrome muting/unmuting a real webinar
tab, and `sb.uc_open_with_reconnect` actually reloading a live page. Per the dispatch's own HARD
RULES (no live Chrome/OBS/meeting run), this is correctly stated debt for a human-approved run, not
claimed as met. `createRealLevelSource` IS tested end-to-end against a fake `MeterClient` (connect
args, filtering, dB conversion, unsubscribe ordering) — the manifest's distinction between "wire
format unverified" (WebFetch-confirmed, not guessed) and "logic untested" (it is tested) is
accurate.

```
VERDICT: PASS
SCOREBOARD: 1/1 applicable contract criterion (C10) substantially met (1 low finding), roadmap "done when" criterion met
FAILURES (if any):
- [C10] sev: low · tracker-audit --gate g1,g4 reports 4 findings on HEAD, not the 3 the manifest's C10 evidence pastes — the 4th is a new, undisclosed, self-referential G4 hit caused by this unit's own manifest quoting a prior tracker-audit paste verbatim · fix direction: tighten tracker-audit.mjs's G4 pattern to skip text inside a manifest's own quoted-evidence sections, or fence such quotes · issue: ISS-T-031-1
CAPABILITY-COVERAGE: 9/9 rows reproduced (plus 1 accepted structural non-capability claim, C3)
LIVE-BROWSER: not-applicable (packages/meeting-bot/src/capture/**, packages/meeting-bot/py/** — no UI-surface glob match)
ISSUES-WRITTEN: ISS-T-031-1
EXECUTOR: claude-opus-subagent (checker: claude-sonnet-subagent)
EXPLANATION: A well-tested, well-isolated unit — every capability-coverage row independently reproduced, C2/C3/C6 all verified against the actual code (not just the manifest's prose), stop()/lifecycle correct on every exit path, semantics (>120s strictly, re-arm, muted-tab trip) all test-proven, and every primary regression command (typecheck, both test suites incl. a corrected full pnpm -r test run, gen:types, schema validate, lint-root's pre-existing failure) reproduces exactly. The one finding (ISS-T-031-1) is a low-severity, self-referential audit-tool artifact caused by the manifest complying with C10's own quoting requirement — not a defect in the watchdog feature itself. No security/tenancy/data-write surface touched.
```
