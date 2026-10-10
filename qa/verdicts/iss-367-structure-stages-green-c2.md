# Independent checker verdict — iss-367-structure-stages-green-c2

Date: 2026-10-10
Bound root: C:\Users\product\Desktop\KnowledgeBase-lanes\iss367 (lane/iss367, HEAD 5e2cfd7, base 536a56a)
Cycle checked: 2

VERDICT: PASS
SCOREBOARD: this cycle's changes are correct, behaviour-preserving and honestly reported; lint:structure remains RED (4 of 10 stages) and ISS-367 stays OPEN.
LIVE-BROWSER: not-applicable (lint/refactor only, no UI; browser-joiner wiring is import-identical, not executed)
ISSUES-WRITTEN: none
EXPLANATION: No rule was weakened, the three extractions are verbatim moves, tests are green, the snapshot is exact generator output. The only misstatement is the commit subject ("was 6"); the true baseline is 5 failing stages (the manifest body and its table already say 5). One 3-test failure in my first head run coincided with the C: drive reaching 0 bytes free (ENOSPC on tmpdir fixtures); 7 further head runs and 5 base runs were 70/70. Not a regression.

## 1. No rule weakened
- `git show --stat 5e2cfd7`: 8 files; none of structure.config.json, package.json, scripts/lint-*.mjs, .dependency-cruiser.cjs or any allowlist/ignore. `git diff 536a56a 5e2cfd7 --stat -- structure.config.json .dependency-cruiser.cjs package.json` printed nothing.
- New files keep the .ts/.mjs extensions the counter scans. No `export {x as y}` alias; the added export lists are plain re-exports (`export { normalizeDomain, normalizeEmail, parseStrictEmail } from ...`, `export {createPipelineDeps}`). Moved blocks keep their comments and are not compressed (diff read in full).

## 2. Moves are behaviour-preserving
- join-rules-normalize.ts: DOMAIN_RE, normalizeDomain, normalizeEmail, parseStrictEmail identical to the removed lines. Pure, no module state, imports nothing, so no cycle. Importers (auto-record-policy.ts, join-rules-store.ts + tests, sender-authentication.test.ts, trusted-sender.test.ts) resolve through the re-export; join-rules.ts imports normalizeDomain/normalizeEmail for its own use.
- run-pipeline-deps.mjs: safeText and createPipelineDeps character-identical to the removed code. ROOT is recomputed with the same expression from a file in the same directory (same value). `channel`/`channelInitialized` are per-call locals, so no shared module state. Same dependencies, same order, same env reads (LKB_API_URL, LKB_API_KEY, LKB_TENANT_ID, MONGO_WORK_DB, TELEGRAM_*). `register()` now runs in both modules (idempotent). run-pipeline.mjs re-exports createPipelineDeps, so importers are unchanged. Removed imports in run-pipeline.mjs match exactly what moved; remaining join/mkdirSync uses are still imported.
- run-pipeline-fixtures.mjs: NOW, event, fixture, withFixture, proof, completed moved verbatim. NOW is a const string, event is a factory, fixture() builds fresh root/deps/logs/calls per call: no exported mutable object, no shared state between tests. Test bodies untouched apart from the import block.

## 3. Stages, measured by me (each alone, exit read directly)
Head: `node scripts/lint-loc.mjs --all` (the `lint:structure` script). Base: detached temporary worktree at 536a56a outside the lanes folder, removed afterwards.

| stage | base 536a56a | head 5e2cfd7 |
|---|---|---|
| loc | exit 1, 8: speakers-llm.ts 313; sb_join.py 1142; join-rules.ts 309; obs-windows.ts 365; record-commands.ts 304; run-watch.mjs 558; run-pipeline.mjs 346; run-pipeline.test.mjs 434 (budget 400) | exit 1, 5: speakers-llm.ts 313; sb_join.py 1142; obs-windows.ts 365; record-commands.ts 304; run-watch.mjs 558 |
| dirsize | 0 (109 dirs OK) | 0 |
| root | 1 (18 loose, budget 15) | 1 (same 18) |
| dupes | 1 (recordApproval: db trusted-senders.ts + join-rules.ts) | 1 (same) |
| migrations | 0 (1971 files) | 0 (1975) |
| codex-hooks | 0 | 0 |
| snapshot --check | 1 (many lines differ) | 0 (OK, 135 lines, budget 200) |
| lint-tests | 0 (18/18) | 0 (18/18) |
| tracker g1,g4 | 1 (6 G4 findings) | 1 (same 6) |
| dependencies | 0 (598 modules) | 0 (599 modules) |

Failing stages: base = 5 (loc, root, dupes, snapshot, tracker); head = 4 (loc, root, dupes, tracker). Head aggregate: `lint:structure: FAIL (10 stages, 4 failed)`. The commit subject's "was 6" is wrong; 5 is right.

## 4. docs/SNAPSHOT.md
I ran `node scripts/snapshot.mjs` on the lane; `git status --short` and `git diff --stat` stayed empty, so the committed file is byte-identical to fresh generator output (not hand-edited). The generator reads ARCHITECTURE.md, schema/*.schema.json, docs/FEATURES.jsonl and the directory tree (the base run showed qa/ subdirectories such as checkpoints and packets that this lane lacks). It therefore goes stale when other lanes merge new directories or ledger rows; regenerate after merge (`--check` will show it).

## 5. Tests
- packages/meeting-bot, `node --test --import tsx` on join-rules, join-rules-store, sender-authentication, trusted-sender, webinar-policy, schedule-state, auto-join, schedule-tick tests: tests 131 / pass 131 / fail 0.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/meeting-bot: exit 0.
- scripts/webinar set (run-pipeline, source-discovery, calendar-attendance, start-calendar-attendance; `--import tsx`):

| run | head 5e2cfd7 | base 536a56a |
|---|---|---|
| 1 | 3 fail ("only explicit prerequisite reasons reopen...", "zero exit without index proof stays failed...", "overlapping webinar is explicit action required...") | 70/70 |
| 2-5 | 70/70 each | 70/70 each |
| extra 6-8 | 70/70 each | n/a |

Head run 1 coincided with the C: drive at 0 bytes free (Free read 0; every shell write failed with "No space left on device"; that log truncated at 4064 bytes). The tests write tmpdir fixtures, so ENOSPC explains it, and it matches the maker's one 69/1 under load. Everything with disk space available: head 7/7 at 70/70, base 5/5 at 70/70. My first base attempt failed with ERR_MODULE_NOT_FOUND (obs-websocket-js) because the temp worktree lacked per-package node_modules junctions; discarded as an environment artefact, then rerun with junctions. No shared mutable fixture state (point 2). No regression.

## 6. D-015 replay of ISS-367's recorded reproductions (by id)
ISS-367: 4 recorded reproductions replayed.
1. package.json lint:structure is `node scripts/lint-loc.mjs --all`, no && chain: holds (earlier cycles).
2. Each stage alone: originally red were loc, dirsize, root, snapshot, tracker. Now red: loc, root, dupes, tracker. Dirsize and snapshot green. Not closed.
3. apps/api/src 31 vs 32: dirsize passes, so the breach no longer exists at this base; I saw no D-017 entry settling it.
4. grep of iss-274 manifest line 139: historical provenance, unchanged, not claimable as fixed.
Closure: ISS-367 is NOT closed. Its fix_direction requires the remaining gate state to be settled, and four stages are still red, so it cannot close. This unit is partial progress (loc 8 to 5, snapshot green). I did not change ISS-367's status.

## 7. Items left open
- speakers-llm.ts (packages/index), obs-windows.ts and record-commands.ts (capture/), run-watch.mjs (scripts/watch): other lanes own them. Reason sound. Clears when those lanes' splits merge, or a separate unit takes them. (obs-windows.ts is 399 physical lines vs 365 counted, so the counter excludes some lines.)
- sb_join.py 1142: splitting a Python browser joiner needs a live browser run. Reason sound. Needs its own browser-verified unit or an Approver decision.
- recordApproval duplicate: reason only partly sound. apps/api/src/store.ts imports the DB one from @lkb/db and is unaffected. Every user of the join-rules one is inside packages/meeting-bot (join-rules.ts, join-rules-store.ts `as applyApproval`, join-rules.test.ts). A rename such as `recordJoinRuleApproval` is a single-package change and could be the next unit. Declining an alias dodge was right. Not a defect in this unit.
- root 18 loose vs 15: needs moving tracked root config files or a budget change, which is an Approver (Umesh) decision. Reason sound.
- tracker: six bare ISS-001/002 citations in qa/manifests (t-031, t-033, u3, u4b) and qa/verdicts (t-031, t-047). Verdicts are not maker-editable. Clears when owners qualify them as ISS-<LANE>-NNN. Reason sound.

## Hygiene
Temporary worktree removed (junctions removed with `cmd /c rmdir`, then `git worktree remove --force`); `git worktree list` no longer shows it. No source, test, manifest, ledger or enforcement-path file edited by me.
