# Manifest: run-watch-loc-split

Lane: WATCHSPLIT (branch lane/watchsplit, base 6c5d800)
Tier: 3 (roadmap/structure; ISS-367 high). ISS-367 STAYS OPEN (other stages still red, below).
Round cap: the run-watch seam has >=3 PASSed units; this is NOT a finding on the seam but a verbatim restructuring to clear the `loc` gate. No behaviour change; no defects fixed (none filed either; lane ledger untouched).
Status: ready-for-check
Fix cycle: 0

## Purpose
Bring `scripts/watch/run-watch.mjs` from 556 to <=300 non-blank lines (budget 300) by moving cohesive groups VERBATIM into new modules.

## Placement deviation (stated plainly)
The brief said new modules under `scripts/watch/lib/`. They sit BESIDE run-watch.mjs in `scripts/watch/` instead, because the moved code contains `resolveWatchRoot(import.meta.url)` (which derives the repo root from the file's own directory) and many dynamic `import("../../packages/...")` / `import("./lib/...")` specifiers. In `lib/` every one of those would need editing; beside run-watch.mjs they are byte-identical and resolve exactly as before. `scripts/watch/` now has 5 files (dirsize OK).

## Declaration map of the original run-watch.mjs (556 non-blank lines)
| Original lines | Declaration | Concern | Destination |
|---|---|---|---|
| 1-30 | header doc comment | - | run-watch.mjs |
| 31-40 | imports, `register()` | bootstrap | run-watch.mjs (imports re-pointed) |
| 42-77 | ROOT, TENANT, DRIVE_ROOT_FOLDER_ID, RECORDINGS_DIR, AUDIO_DIR, CALENDAR_CSV, CALENDAR_FIRST_YEAR, WATCH_DIR, LOCK_PATH, DRY_RUN, INGEST, REINGEST_IDX, REINGEST_DRIVE_ID, MONGODB_DB, MONTHS | configuration / root resolution | watch-config.mjs (`export` added to each `const`) |
| 79-105 | shouldAlertPollFailed, isImminentDate (already exported, pure) | alerting decisions | stay in run-watch.mjs (export surface unchanged) |
| 107-114 | comment | - | run-watch.mjs |
| 116-129 | runGws (uses execFile) | gws runner | watch-sources.mjs |
| 131-151 | loadIngestedDriveIds (ROOT, MONTHS, mainTreeCandidates) | manifest dedupe | watch-sources.mjs |
| 153-158 | findCurrentMonthFolder (DRIVE_ROOT_FOLDER_ID, MONTHS, runGws) | Drive polling | watch-sources.mjs |
| 160-353 | main (uses nearly all config, runGws, loadIngested..., store fns, ingestOneDriveFile, runReingest) | main loop | run-watch.mjs |
| 355-360 | loadSeenDriveIds (TENANT, MONGODB_DB) | state read | watch-store.mjs |
| 362-374 | readDriveWatchState (TENANT) | state read | watch-store.mjs |
| 376-399 | markHeartbeatFor (DRY_RUN, TENANT, MONGODB_DB, buildHeartbeatDoc) | heartbeat | watch-store.mjs |
| 401-412 | markDriveState (TENANT) | state write | watch-store.mjs |
| 414-562 | runReingest (config, runGws, findCurrentMonthFolder, markDriveState, ingest-chain fns) | --reingest path | watch-reingest.mjs |
| 564-578 | recordReport (TENANT) | report write | watch-store.mjs |
| 580-598 | entry guard + `main().then(...)` | CLI entry | run-watch.mjs (unchanged, last) |

## Module-level mutable state
There is NONE. Every module-level binding in the original is a `const` computed once at import (no `let`, no module-level mutable object; `calendarEvents`, `findings`, `errors`, `newDriveFiles` are locals inside `main`, which stays whole; `runReingest` receives `calendarEvents` as a parameter as before). So no binding can be duplicated: each const lives in exactly one module (watch-config.mjs) and is imported by value everywhere else.

## Initialisation order / import-time effects
Original import-time effects, in order: `import "dotenv/config"` -> `register()` -> consts (ROOT via resolveWatchRoot, argv scans, `process.env.MONGODB_DB`) -> function declarations -> entry guard.
Now: run-watch.mjs imports in the same order (`dotenv/config`, `tsx/esm/api`, then lib/ingest-chain, then watch-config, watch-sources, watch-store, watch-reingest). ES evaluation runs dependencies in source order, so `dotenv/config` is evaluated BEFORE watch-config.mjs reads `process.env.MONGODB_DB` (same relative order as before). The consts are computed once, in watch-config.mjs, as before (module instance is shared; no second evaluation). One difference: `register()` now runs after the consts instead of before them. The consts do no dynamic import()/.ts loading (only path/env/argv), so the order is not observable. The new modules contain only declarations and the config consts; no timers, signal handlers or calls. `main()` is started only from the unchanged entry guard at the end of run-watch.mjs; the `import.meta.url.endsWith(basename(process.argv[1]))` guard is unchanged. No module imports run-watch.mjs; the graph is acyclic (config <- sources <- reingest; config <- store <- reingest; run-watch imports all).
`import.meta.url` in watch-config.mjs is in the same directory as run-watch.mjs, so ROOT is identical (smoke below prints it).

## Line counts (non-blank, repo counter)
- run-watch.mjs: 556 -> 275
- watch-config.mjs 40, watch-sources.mjs 48, watch-store.mjs 74, watch-reingest.mjs 147 (all < 300)

## loc stage BEFORE (`node scripts/lint-loc.mjs`, the `loc` stage of `lint:structure`)
```
lint-loc: FAIL — 3 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:1142 (budget 300)
  scripts/watch/run-watch.mjs:556 (budget 300)
```
## loc stage AFTER
```
lint-loc: FAIL — 2 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:1142 (budget 300)
```
`node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (111 dir(s) within budget)` (before and after).

## Verbatim proof
Script: multiset comparison of non-blank lines, CR stripped; original = the pre-change run-watch.mjs; a new line matches an original line either exactly or after stripping a leading `export `.
- original non-blank lines: 556; non-blank lines across the 5 files: 584.
- lines identical except an added `export` keyword: 24 (the 15 config consts incl. REINGEST_IDX, which is exported though only used inside config, harmless; plus runGws, loadIngestedDriveIds, findCurrentMonthFolder, loadSeenDriveIds, readDriveWatchState, markHeartbeatFor, markDriveState, recordReport, runReingest).
- lines in new files not in the original: 30, ALL import lines or the 2-line header comment of each new file (none is code).
- original lines not found in any new file: 2, both import lines (`import { ingestOneDriveFile, decideReingestAction, assertIndexed } ...` and `import { resolveWatchRoot, mainTreeCandidates } ...`), re-split across modules. The `execFile` and `buildHeartbeatDoc` import lines moved unchanged. `git diff --numstat` for run-watch.mjs: +8/-305 (the 8 are new import lines).
=> zero changed lines other than `export` and `import`. CRLF working-tree line endings kept (index blob stays LF via autocrlf).

## Evidence
Baseline on the unmodified tree (`node --test <file>`, node v24.19.0), then after:
| file | before | after |
|---|---|---|
| scripts/watch/lib/digest.test.mjs | 3/3 | 3/3 |
| scripts/watch/lib/heartbeat.test.mjs | 16/16 | 16/16 |
| scripts/watch/lib/ingest-chain.test.mjs | 22/22 | 22/22 |
| scripts/watch/lib/lock.test.mjs | 6/6 | 6/6 |
| scripts/watch/lib/main-tree.test.mjs | 4/4 | 4/4 |
| scripts/watch/lib/session-skeleton.test.mjs | 14/14 | 14/14 |
| scripts/lib/transcript-provenance.test.mjs (imports watch/lib/session-skeleton) | 14/15 (1 fail) | 15/15 |
The transcript-provenance change (1 fail -> 0) is not explained by this unit (it imports only lib/session-skeleton.mjs, untouched); likely time/state dependent. Reported as observed, not claimed as an improvement. apps/api/src/routes/health.test.ts imports only lib/heartbeat.mjs (untouched) and was not run (CPU).
- `node --check` on run-watch.mjs, watch-config.mjs, watch-sources.mjs, watch-store.mjs, watch-reingest.mjs: all ok.
- Import smoke (throwaway script outside the repo; node_modules junction to the main tree, removed afterwards): all five modules import without starting the loop. Exports: watch-config AUDIO_DIR,CALENDAR_CSV,CALENDAR_FIRST_YEAR,DRIVE_ROOT_FOLDER_ID,DRY_RUN,INGEST,LOCK_PATH,MONGODB_DB,MONTHS,RECORDINGS_DIR,REINGEST_DRIVE_ID,REINGEST_IDX,ROOT,TENANT,WATCH_DIR; watch-sources findCurrentMonthFolder,loadIngestedDriveIds,runGws; watch-store loadSeenDriveIds,markDriveState,markHeartbeatFor,readDriveWatchState,recordReport; watch-reingest runReingest; run-watch isImminentDate,shouldAlertPollFailed (same export surface as before). Printed `ROOT C:\Users\product\Desktop\KnowledgeBase-lanes\watchsplit` (correct repo root).
- A free-identifier scan (40 moved/shared names, per file, against that file's imports and declarations) reported MISSING: [] for all five files.

## Not verified
- The watch service / `run-watch.mjs` was NOT run after the change (no `main()`, no network, no Drive/Gmail/Mongo, no `--dry-run`). A missing import on a rarely-hit branch (`--reingest`, `--ingest` failure path) would only show at run time; the identifier scan and import smoke reduce but do not remove that risk. The FIRST real run must be watched.
- ISS-316 (reingest reindex-only has no try/catch), ISS-356, ISS-357 describe behaviour that is kept byte-identical and is NOT fixed. ISS-316's line reference (~381-395) now points into watch-reingest.mjs.
- Still red in `lint:structure` `loc`: packages/index/src/pipeline/speakers-llm.ts:313 (another lane) and packages/meeting-bot/py/sb_join.py:1142 (needs a browser). Other `lint:structure` stages were not run here. ISS-367 remains open.
- `register()` now runs after the config consts (see initialisation analysis): argued unobservable, not tested.

Status: ready-for-check
Fix cycle: 0
