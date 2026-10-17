# Verdict — run-watch-loc-split

**Cycle checked:** 0
**Date:** 2026-10-10
**Commit under check:** 84fa438 (base 6c5d800), lane/watchsplit

## VERDICT: PASS

ISSUES-WRITTEN: none

## What I re-ran (all by me, node v24.19.0, no service started, no network)

### 1. Verbatim proof (independent script: strip leading `export `, trim trailing whitespace; line-set and per-function block compare)
- Base lines missing at HEAD (2, both re-split imports):
  `import { ingestOneDriveFile, decideReingestAction, assertIndexed } from "./lib/ingest-chain.mjs";`
  `import { resolveWatchRoot, mainTreeCandidates } from "./lib/main-tree.mjs";`
- HEAD-only lines: 30, ALL imports, the multi-line config import block in run-watch.mjs, or file-header comments. Zero code statements.
- Block compare, each function body as an ordered block: runGws, loadIngestedDriveIds, findCurrentMonthFolder (watch-sources); loadSeenDriveIds, readDriveWatchState, markHeartbeatFor, markDriveState, recordReport (watch-store); runReingest (134 lines, watch-reingest); main (194 lines, run-watch): all IDENTICAL.
- All 15 base top-level `const` lines are in watch-config.mjs, same order.
- Free-identifier scan: every identifier used is imported or defined in its file (run-watch.mjs: all 30 used names imported).

### 2. Module-level state
Only `const` bindings. No module-level `let`/`var`. No `.push/.set/.add` on module names (the single `.add` is on a function-local Set in loadIngestedDriveIds); no mutation of MONTHS; no timers, `process.on`, caches or counters. Each binding exists once (config constants only in watch-config.mjs). No moved expression depends on the file name: the only name-dependent code is the entry guard `import.meta.url.endsWith(basename(process.argv[1]))`, which stayed in run-watch.mjs. `import.meta.url` is used once, in watch-config (`resolveWatchRoot`).

### 3. resolveWatchRoot (goes up two directories from the calling file's dirname)
Evaluated from each module URL (LKB_MAIN_TREE_ROOT unset): run-watch, watch-config, watch-sources, watch-store, watch-reingest all give `C:\Users\product\Desktop\KnowledgeBase-lanes\watchsplit`. Identical. All `../../packages/...`, `../../apps/...` and `./lib/...` specifiers are textually unchanged and the files sit in the same directory, so they resolve identically.

### 4. Evaluation order (probe: throwaway copy in scratchpad with stub dotenv/tsx and a console.log on module entry; lane files untouched)
```
[1] dotenv/config evaluated
[R-mod] tsx/esm/api evaluated
[eval] watch-config
[eval] watch-sources
[eval] watch-store
[eval] ingest-chain
[eval] watch-reingest
[body] before register
[R] register() called
[body] after register
MONGODB_DB seen by watch-config: FROM-DOTENV
```
dotenv/config is import 3 of run-watch.mjs and precedes the `./watch-config.mjs` import, so ES depth-first evaluation runs dotenv first; watch-config's `process.env.MONGODB_DB` read sees the dotenv value. No new module is reachable from anything imported before dotenv. (ingest-chain logs after watch-store because its dependency chain, transcript-provenance -> webinar/session-rows, evaluates first; not new, no config dependence.)

`register()` is `tsx/esm/api` `register`, a loader-hook registration needed for dynamic `import()` of `.ts` sources. In base AND in HEAD it is a body statement of run-watch.mjs, so it always ran AFTER every hoisted static import; the only change is that it now also runs after the config constants (in base it ran before them). Static imports of the four new modules: node builtins, `./lib/main-tree.mjs`, `./lib/heartbeat.mjs`, `./lib/ingest-chain.mjs` (-> `../../lib/transcript-provenance.mjs`, `session-skeleton.mjs`) and each other. All plain `.mjs`; none imports a `.ts` file, tsx, or needs the loader. All `.ts` / `packages/*` imports remain dynamic `await import(...)` inside functions, executed after `register()`. The config's top-level code (join, resolveWatchRoot, process.argv, process.env) does not need the loader, so the reordering is unobservable.

### 5. Import graph (no cycles)
- run-watch -> dotenv/config, tsx/esm/api, lib/ingest-chain, watch-config, watch-sources, watch-store, watch-reingest
- watch-config -> lib/main-tree
- watch-sources -> lib/main-tree, watch-config
- watch-store -> lib/heartbeat, watch-config
- watch-reingest -> lib/ingest-chain, watch-config, watch-sources, watch-store

Nothing imports run-watch.mjs (main-tree.test.mjs only builds its URL for `resolveWatchRoot`; still passes).

### 6. Budgets
```
lint-loc: FAIL - 2 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:1142 (budget 300)
lint-dirsize: OK (111 dir(s) within budget)
lint-dupes: OK (707 unique export(s), 27 unique schema $id(s))
```
run-watch.mjs is no longer listed; nothing was added. scripts/watch/ now has 5 files (global dirsize budget 30; lib/ has 12). **ISS-367 stays open**: the two loc files above, the root budget and the tracker-audit findings remain, and the other lint:structure stages were not run here.

### 7. Tests and syntax (each under `timeout 100`, 3 runs each)
| test | result (x3) |
|---|---|
| scripts/watch/lib/digest.test.mjs | 3/3 |
| heartbeat.test.mjs | 16/16 |
| ingest-chain.test.mjs | 22/22 |
| lock.test.mjs | 6/6 |
| main-tree.test.mjs | 4/4 |
| session-skeleton.test.mjs | 14/14 |
| scripts/lib/transcript-provenance.test.mjs, no node_modules | 14/15, same failure 3 of 3 |
| same, with node_modules junction to main tree | 15/15, 3 of 3 |

`node --check` OK on all five files. Import smoke of the four new modules (real files, not run-watch): imported cleanly, expected exports, 0 active handles or timers, exited in about 1.8 s, `git status` clean.

transcript-provenance "unexplained change" settled: not a flake and unrelated to this unit. The failing test is `real seed dry-run rejects unbound corpus before any database connection`; it spawns `scripts/seed-toc.mjs`, which dies with `ERR_MODULE_NOT_FOUND: Cannot find package 'dotenv'` when the worktree has no `node_modules`, so the expected message `derived provenance absent` never appears. The presence of the node_modules junction is the whole difference. (ffmpeg is not involved.) Junction removed afterwards with `rmdir`.

### 8. Importers of run-watch.mjs
No script, package.json entry or test imports it as a module; main-tree.test.mjs only references its path. `shouldAlertPollFailed` and `isImminentDate` are still exported (probe confirmed). Other mentions are comments and docs.

### 9. Manifest honesty
Manifest line 87 states the watch service / run-watch.mjs was NOT run after the change and that the first real run must be watched. Confirmed. I did not run it either; residual risk is a rarely hit branch (`--reingest`, `--ingest` failure path), covered statically by the identifier scan.

ISS-316, ISS-356, ISS-357: not judged. Moved code is byte-identical, so the behaviour they describe is unchanged.

EXPLANATION: The move is verbatim apart from imports, exports and headers; there is no split mutable state; dotenv still precedes the config read; no new static import needs the tsx loader. No defects found. ISS-367 remains open.
