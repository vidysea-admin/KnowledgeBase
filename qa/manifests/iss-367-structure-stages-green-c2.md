# Manifest — iss-367-structure-stages-green-c2
**Issues addressed:** ISS-367 (remaining red stages)
**Lane:** lane/iss367 (base 536a56a)
**Fix cycle:** 2
**Date:** 2026-10-10
**Tier:** 1 (QUEUE) — structure gate, no budget/config/allowlist change

## What changed (code only; no threshold, structure.config.json, .dependency-cruiser.cjs, allowlist touched)
- packages/meeting-bot/src/calendar/join-rules.ts 309 -> 280 LOC: pure normalisers (normalizeDomain/normalizeEmail/parseStrictEmail + DOMAIN_RE) moved verbatim into new join-rules-normalize.ts (39 lines), re-exported from join-rules.ts so callers/tests are unchanged.
- scripts/webinar/run-pipeline.mjs 346 -> 289 LOC: `safeText` and `createPipelineDeps` moved verbatim into new run-pipeline-deps.mjs (68 lines); run-pipeline.mjs imports them and re-exports createPipelineDeps.
- scripts/webinar/run-pipeline.test.mjs 434 -> 396 LOC: shared fixtures (NOW, event, fixture, withFixture, proof, completed) moved verbatim into new run-pipeline-fixtures.mjs (43 lines); no test body changed.
- docs/SNAPSHOT.md regenerated with the documented generator `node scripts/snapshot.mjs` (not hand-edited).

## BEFORE / AFTER per stage (each run alone, exit read directly)
| stage | BEFORE | AFTER |
|---|---|---|
| loc | exit 1, 8: speakers-llm.ts 313; sb_join.py 1142; join-rules.ts 309; obs-windows.ts 365; record-commands.ts 304; run-watch.mjs 558; run-pipeline.mjs 346; run-pipeline.test.mjs 434 | exit 1, 5: speakers-llm.ts 313; sb_join.py 1142; obs-windows.ts 365; record-commands.ts 304; run-watch.mjs 558 |
| dirsize | exit 0 | exit 0 |
| root | exit 1 (18 loose, budget 15) | exit 1 (unchanged) |
| dupes | exit 1 (recordApproval in db trusted-senders.ts + join-rules.ts) | exit 1 (unchanged) |
| migrations | 0 | 0 |
| codex-hooks | 0 | 0 |
| snapshot | exit 1 (104 lines differ) | exit 0 |
| lint-tests | not run alone (aggregate) | exit 0 |
| tracker (g1,g4) | exit 1, 6 G4 ambiguous-ref findings | exit 1 (unchanged) |
| dependencies | exit 0 (599 modules, no violations) | exit 0 |
Aggregate after: `lint:structure: FAIL (10 stages, 4 failed)` (loc, root, dupes, tracker).

## Evidence (commands run from the lane root, node 24 at codex runtime path)
- `node scripts/lint-loc.mjs --all` -> stage lines above, final `lint:structure: FAIL (10 stages, 4 failed)`.
- `node scripts/snapshot.mjs --check` -> `OK: docs/SNAPSHOT.md matches a fresh regeneration (135 lines, budget 200)`.
- `node --test --import tsx` (packages/meeting-bot) join-rules, join-rules-store, trusted-sender, sender-authentication, webinar-policy, schedule-state tests: `tests 84 / pass 84 / fail 0`.
- `node --test --import tsx scripts/webinar/{run-pipeline,source-discovery,calendar-attendance,start-calendar-attendance}.test.mjs`: `tests 70 / pass 70 / fail 0` (one earlier combined run, executed concurrently with other load, showed 69/1 fail; two isolated reruns and the combined rerun are 70/70; the failing test was not identified).
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/meeting-bot: exit 0.
- Note: without `--import tsx`, source-discovery.test.mjs fails with ERR_MODULE_NOT_FOUND on packages/core generated imports both before and after this change (verified via git stash).
- Lane node_modules are junctions into the main tree.

## D-015 replay of ISS-367's recorded reproductions
ISS-367: 4/4 replayed.
1. package.json lint:structure: now `node scripts/lint-loc.mjs --all` runner, no && chain -- holds.
2. Each stage separately: red stages were loc, root, dupes, snapshot, tracker; now loc, root, dupes, tracker (snapshot cleared). Original 5-red picture (dirsize) no longer present at this base.
3. `git ls-tree 2a0d5f7 apps/api/src/` = 31, HEAD = 31 (dirsize breach no longer exists; budget untouched).
4. `grep 'pre-existing failure' qa/manifests/iss-274-wire-web-fallback.md` line 139 -- historical provenance, unchanged, not claimed fixed.

## Left open
- loc: speakers-llm.ts 313 (packages/index speakers, other lane); obs-windows.ts 365 and record-commands.ts 304 (capture/, other lane); run-watch.mjs 558 (scripts/watch, other lane); sb_join.py 1142 (Python browser joiner; splitting needs a browser/live run to verify, separate unit).
- dupes `recordApproval`: only resolvable by renaming one export, and both call sites are out of lane (apps/api/src/store.ts imports `recordApproval as recordSenderApproval` from @lkb/db; join-rules-store.ts imports `recordApproval as applyApproval`). Not dodged with an `export {}` alias. Follow-up: rename join-rules.ts's to e.g. `recordJoinRuleApproval` and change the one import in join-rules-store.ts (and join-rules.test.ts).
- root: 18 loose root files vs budget 15. Fixing needs moving tracked root config files or raising the budget; Approver decision.
- tracker: 6 G4 findings cite bare ISS-001/002 in qa/manifests and qa/verdicts of other units; verdicts are not editable by the maker; needs qualification by their owners/checker.

Status: ready-for-check
Fix cycle: 2
