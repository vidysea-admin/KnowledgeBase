# Verdict — structure-dupes-and-record-commands-loc
VERDICT: PASS
Cycle checked: 0
Scope: rename only (4db515a). ISS-367 STAYS OPEN: loc (4 violations), root and tracker stages are still red; dependencies is red only in this worktree (see below).

## Commands and results
- `git show --stat 4db515a`: 3 files, all packages/meeting-bot/src/calendar (join-rules.ts, join-rules.test.ts, join-rules-store.ts). Diff lines inspected: every changed line differs only by recordApproval -> recordRuleApproval (incl. 3 error-message prefixes, the `as applyApproval` import). No other difference.
- `git diff e7daf8d 465382a --stat`: those 3 files + qa/issues.structfix.jsonl + the manifest. No config, budget, lint script or allowlist touched. No alias/re-export of the old name.
- `rg recordApproval` (excl. node_modules, qa/): only apps/api/src/store.ts:15 (imports `recordApproval as recordSenderApproval` from the db package) and packages/db/src/collections/trusted-senders.ts:23. No meeting-bot hit, no other importer of the meeting-bot symbol.
- lane/t037api: `git diff --stat 536a56a lane/t037api -- packages/meeting-bot` is empty (its merge-base is 536a56a; the lane changes nothing in meeting-bot), so a merge keeps the renamed file. Its uses of `recordApproval` are a structural dep-interface member / method in apps/api/src/join-rules/{deps,router,test-store}.ts and router.test.ts, not an export. lint-dupes scans exported declarations; an interface member or object method is not one, and the stage reads OK. It never imports the meeting-bot function. Merging both does not break. (The `git grep` hits under packages/meeting-bot on that branch are just the old, unchanged base content.)
- `node scripts/lint-dupes.mjs`: `lint-dupes: OK (681 unique export(s), 27 unique schema $id(s))`
- `node scripts/lint-loc.mjs`: FAIL 4: speakers-llm.ts:313, sb_join.py:1142, record-commands.ts:304, scripts/watch/run-watch.mjs:556 (same as base).
- `node scripts/lint-dirsize.mjs`: OK (110 dir(s) within budget)
- dependency-cruiser: 327 errors, ALL `no-unresolvable-workspace-import` (e.g. apps/api -> @lkb/ai, express, mongodb); 0 other rule violations. apps/* have no node_modules in this worktree (only packages/core, db, meeting-bot junctions), so it is a worktree artefact, not a real violation; a three-file rename cannot add an edge.
- Tests (packages/meeting-bot, `node --test --import tsx`, timeout 170): join-rules, join-rules-store, trusted-sender, sender-authentication, send-now: tests 75, pass 75, fail 0.
- `tsc --noEmit -p tsconfig.json` (meeting-bot, timeout 180): exit 0, no output.

## Manifest accuracy
Claims only the rename as delivered; Fix 2 stated as not done with reason; BEFORE/AFTER stage numbers match my measurements; the dependencies 327 is reported as "not investigated" (explained above).

ISSUES-WRITTEN: none

EXPLANATION:
Rename is complete, pure, behaviour-preserving, turns dupes green and weakens no rule.
Note on the declined loc split (does not affect this verdict, follow-up recommendation): the maker's claim "no cohesive home" is too strong. packages/meeting-bot/src/capture/record-finalize.ts already exists (223 lines) as the extracted finalize body of record-commands.ts (its header says so). processRecordingArtifacts (record-commands.ts:207-228) and validateIndexProof (229-239), about 33 lines, are finalize-stage work (processArtifacts is injected into finalizeRecordingWith at line 303), and finalize already imports createHash/spawnSync/readFileSync/writeFileSync. Moving them there (with `export { ... } from "./record-finalize.js"` kept in record-commands.ts, since record-commands.test.ts imports validateIndexProof from it) would give ~258 lines there and ~271 in record-commands.ts, with no new file or folder, no dirsize impact and no Approver decision. A follow-up unit should do that; ISS-STRUCTFIX-001 (medium, asking for a new capture/finalize/ folder) therefore overstates the need for an Approver decision, and its fix_direction should be amended by the maker to this option. It is sensibly severitied as medium and its facts (30 files, browser/ contents, 304 LOC) are accurate. Not filed as a new issue, as it is an observation on an open one.
