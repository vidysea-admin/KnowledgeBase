# Manifest — obs-windows-bot-child-extraction

**Contract:** qa/contracts/meeting-bot-live-capture.md (behaviour-preserving refactor; no criterion changes)
**Date:** 2026-10-10
**Fix cycle:** 0
**Issues addressed:** ISS-340 (high) — the obs-windows.ts C1 LOC violation; gate qa/gates/obs-windows-loc-split.md, ruling 2026-10-10: Approver (Umesh) APPROVED option (a), new file OK, no budget raise.
**Backlog tier:** 2 (open high, approved gate)
**Lane:** worktree `C:/Users/product/Desktop/KnowledgeBase-lanes/obsw`, branch `lane/obsw`, base 536a56a. Lane ledger: qa/issues.obsw.jsonl (no new issues filed).

## What changed
- NEW `packages/meeting-bot/src/capture/browser/bot-child.ts` (119 lines): `startBotChild(cfg, pyArgs, handle, log)` holds, verbatim, the former `launch()` lines 257-336: child spawn (PYTHONUNBUFFERED), exit/error promises, output tail ring buffer, progress tracking, stdout/stderr readline plumbing, stall/cap budget, the outcome race and the failure throw. Returns `{ child, exited }`. `BotEvent` interface moved here with a `BotChildConfig` slice (python, onEvent, openStallMs, openCapMs).
- `packages/meeting-bot/src/capture/obs-windows.ts`: the moved block replaced by one call; `BotEvent` re-exported (`export type { BotEvent }`); `createInterface` import dropped. 3 insertions, 86 deletions.

## DEVIATION to flag for the checker/Approver
The ruling names `capture/bot-child.ts`. That path makes `packages/meeting-bot/src/capture` 31 files against the C2 dirsize budget of 30 (it was exactly 30), i.e. adds a new lint-dirsize violation, which raising overrides would need a DECISIONS entry for. The file is therefore at `capture/browser/bot-child.ts` (that dir holds 2 files). Moving it to the ruled path is a `git mv` plus an import path edit, but needs a `dirsize.overrides` decision first.

## Evidence
Line counts (non-blank, repo counter `node scripts/lint-loc.mjs`): obs-windows.ts 365 -> under budget (absent from violation list; `wc -l` 399 -> 316 raw); bot-child.ts 119 raw, under budget.
- lint-loc BEFORE: 8 violations (speakers-llm.ts:313, sb_join.py:1142, join-rules.ts:309, obs-windows.ts:365, record-commands.ts:304, run-watch.mjs:558, run-pipeline.mjs:346, run-pipeline.test.mjs:434).
- lint-loc AFTER: 7 violations, the same list minus obs-windows.ts. None added.
- `node scripts/lint-dirsize.mjs` BEFORE: `OK (109 dir(s) within budget)`; AFTER (browser/ path): `OK (109 dir(s) within budget)`. (With the ruled capture/ path: `capture: 31 files (budget 30)`.)
- Moved-code check: sed of orig lines 257-336 (de-indented 2 spaces) vs the function body in bot-child.ts: `diff` empty (MOVED_IDENTICAL). Remaining diff of obs-windows.ts is exactly 3 added lines (import, `export type { BotEvent }`, the call).
- Tests (each under timeout, cwd packages/meeting-bot, `node --test --import tsx <file>`): obs-guard.test.ts 9/9 pass; record-commands.test.ts 18 pass 0 fail of 19; obs-windows.test.ts 4 pass / 4 fail, IDENTICAL 4/4 on base 536a56a across 3 runs each (the four ISS-324 launch() cases are timing-sensitive on the CPU-loaded shared machine: stall window ~0s; "no progress for 0s ... child produced NO output"); browser-profile.test.ts 1 pass / 1 fail, identical at base (path doubling from cwd). These failures are pre-existing, not caused by the move.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/meeting-bot): exit 0, no output.

## Not delivered
- ISS-324 / ISS-337 fixes: already on master (wave/live-record-repair merged as 3368454; no such branch exists locally or on origin). Nothing re-done. ISS-324/337 stay as-is in the ledger.
- The 4 timing-failing ISS-324 launch() tests were not made to pass on this loaded machine; their behaviour is unchanged vs base. Needs a quiet-CPU rerun to confirm green.
- No full suite, no monorepo build, no live capture / OBS / browser.
- ISS-340 status not edited (qa/issues.jsonl untouched by rule); checker/orchestrator closes it.

Status: ready-for-check
