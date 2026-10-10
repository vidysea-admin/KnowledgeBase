# Verdict - obs-windows-bot-child-extraction

VERDICT: PASS
Cycle checked: 0
Commit checked: ff71c5f (base 536a56a), branch lane/obsw

## 1. Pure move
Removed lines 257-336 of base obs-windows.ts vs the function body of bot-child.ts (de-indented 2 spaces):
`diff o4.txt n4.txt` -> `IDENTICAL_AFTER_DEINDENT` (80 lines each).
Non-identical lines in the whole commit (everything else is byte-identical):
- obs-windows.ts: removed `import { createInterface } from "node:readline";` (now in bot-child.ts)
- obs-windows.ts: added `import { startBotChild, type BotEvent } from "./browser/bot-child.js";`
- obs-windows.ts: `export interface BotEvent {...}` (4 lines) replaced by `export type { BotEvent };`
- obs-windows.ts: the 80-line block replaced by `const { child, exited } = await startBotChild(cfg, pyArgs, handle, log);`
- bot-child.ts: file header, imports (spawn, ChildProcess, createInterface), `BotEvent` interface (same 3 fields + index signature), `BotChildConfig` (python/onEvent/openStallMs/openCapMs), a local `const sleep` (same one-liner as obs-windows.ts:73), function wrapper/signature, `return { child, exited };`.
Closures: the moved code used only `cfg`, `handle`, `log`, `pyArgs`, `sleep`, `spawn`, `createInterface`, `BotEvent`. cfg/handle/log/pyArgs are passed; sleep is a stateless pure const (obs-windows keeps its own, still used at 142/271/290/299); no module-level mutable and no `this` was involved. Side-effect order unchanged: listeners attach synchronously after spawn inside the same function, before any await; timers/poll loop identical; kill-on-failure inside the helper; the caller's `try` starts after the helper returns exactly as before (base line 339 `const mutedByUs` followed the block). `child`/`exited` returned to the same `runs.set` use.

## 2. Public surface
Importers of obs-windows.ts: reconnect-gaps.ts, tab-browser.ts, telegram-alerts(.test).ts (BotEvent type), record-commands(.test).ts, obs-guard.test.ts, obs-windows.test.ts, browser-profile.test.ts. `export type { BotEvent }` preserves the name/shape. bot-child.ts imports only node:child_process and node:readline: no cycle. `tsc --noEmit -p tsconfig.json` (packages/meeting-bot): exit 0, no output.

## 3. Budgets
Non-blank lines of obs-windows.ts: base 365 -> 287 (budget 300). `node scripts/lint-loc.mjs` now: 7 violations (speakers-llm.ts:313, sb_join.py:1142, join-rules.ts:309, record-commands.ts:304, run-watch.mjs:558, run-pipeline.mjs:346, run-pipeline.test.mjs:434). Maker's base list was these 7 + obs-windows.ts:365; I verified obs-windows.ts base=365 and record-commands=304 / join-rules=309 independently. `lint-dirsize.mjs`: OK (109 dir(s) within budget). `git diff 536a56a ff71c5f --stat -- structure.config.json scripts` empty: no threshold edited.

## 4. Deviation (capture/browser/ vs capture/)
Base `git ls-tree` of capture/: 30 files + the browser/ dir; structure.config.json dirsize maxFiles 30 (overrides only scripts, apps/api/src). So capture/bot-child.ts would be file 31 and a new dirsize violation, which could only be cleared by a budget raise the ruling forbids. browser/ holds browser-profile.ts (+test): builds the Chrome profile args for the very bot child that bot-child.ts spawns (py/sb_join.py), so the placement is cohesive. View: it is within the ruling's intent and constraints (new file named bot-child.ts, only that file added, no budget raise, both counters green) but not its literal path text ("capture/bot-child.ts"). Honouring the literal path was impossible without breaking the other half of the ruling. Approver should be told of the path difference; I judge it acceptable and do not fail the unit on it.

## 5. Tests (cwd packages/meeting-bot, `timeout 240 node --test --import tsx src/capture/obs-windows.test.ts`; base = git archive of 536a56a in a scratch dir with node_modules junctions, outside the worktree)
Order: StartRecord, Connect, StopRecord | ISS-324: progress-open, wedged, cap, stderr | nospawn. P=pass F=fail
| run | S C St | open wedged cap stderr | nospawn | pass/fail |
| here1 | P P P | F F F F | P | 4/4 |
| here2 | P P P | P F F P | P | 6/2 |
| here3 | P P P | F F F F | P | 4/4 |
| base1 | P P P | F F F F | P | 4/4 |
| base2 | P P P | P P P F | P | 7/1 |
| base3 | P P P | F F P P | P | 6/2 |
The same four ISS-324 tests fail on both commits, with the same message: `bot browser did not open the page (no progress for 0s; last stage: spawned). child produced NO output` (or the equivalent assertion on it). Cause: these tests use openStallMs 400 (obs-windows.test.ts:226) and a real node child; on this CPU-loaded machine the child does not print `starting` within 400 ms, so the stall window fires at stage "spawned". Non-deterministic: base ran 7/1, 6/2, 4/4; here 6/2, 4/4, 4/4. Each of the four passes in some base run and fails in some base run; no test is deterministically broken by the move. here2 failed "wedged" where base2 passed it, but base1 and base3 also failed "wedged", so that is run-to-run load variance, not a regression. This is exactly ISS-360-OBSFLAKE (open, medium; actual 'no progress for 0s; last stage: spawned').
Other: obs-guard 9/9 pass; record-commands 18/18 pass; browser-profile 1 pass / 1 fail on BOTH commits (deterministic cwd artifact: path doubles to `packages\meeting-bot\packages\meeting-bot\py\tab-capture\manifest.json` ENOENT when run from packages/meeting-bot; unrelated to the move).
CAVEAT: no quiet-CPU green run of the four ISS-324 tests exists for this commit; the byte-identical body (point 1) is the evidence of preservation, not those tests.

## 6. Ledger
- ISS-324 (fixed): current code has the spawnFailed/error race, tail, stall/cap budget (now in bot-child.ts, identical). Its own checker_note says live proof outstanding: do NOT move to verified. No change.
- ISS-337 (fixed): `child.on("error", ...)` present at obs-windows.ts:124 in launchObsNormally. Fix is on this base. I did not run its dedicated test; recommend leaving status unchanged unless the orchestrator wants it verified.
- ISS-340 (high, open) and ISS-343 (medium, open): their closing condition (split landed / violation gone; ISS-340 fix_direction "close both together") is met on this branch: obs-windows.ts 365 -> 287, off the lint-loc list, gate answered (a). Recommend status "verified"/closed for both, fixed_date and verified_date 2026-10-10, verified_evidence "qa/verdicts/obs-windows-bot-child-extraction.md; lint-loc 7 violations without obs-windows.ts; ff71c5f", to be applied by the orchestrator at merge. Not edited here: the per-lane rule (D-019) has this lane write only to qa/issues.obsw.jsonl and main-ledger rows are merge-time orchestrator edits.

ISSUES-WRITTEN: none

EXPLANATION: The extraction is a verbatim move with all closed-over values passed or stateless; surface, types, cycles and both structure counters check out; no test passes on base and fails here deterministically. The four failing ISS-324 tests are the already-ledgered load flake ISS-360-OBSFLAKE, so no new issue is filed. Note for the Approver: the file sits at capture/browser/bot-child.ts, not the ruled capture/bot-child.ts, because capture/ is at its 30-file cap.
