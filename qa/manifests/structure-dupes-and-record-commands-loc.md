# Manifest — structure-dupes-and-record-commands-loc
**Issues addressed:** ISS-367 (dupes stage fixed; loc entry record-commands.ts NOT fixed, see Fix 2)
**Lane:** lane/structfix (base e7daf8d). Tier 3-equivalent: high issue ISS-367, behaviour-preserving.
**Fix cycle:** 0

## BEFORE (each stage run alone)
- `node scripts/lint-dupes.mjs`: exit 1, `export 'recordApproval' declared in packages/db/src/collections/trusted-senders.ts, packages/meeting-bot/src/calendar/join-rules.ts`
- `node scripts/lint-loc.mjs`: FAIL 4: speakers-llm.ts:313, sb_join.py:1142, record-commands.ts:304, scripts/watch/run-watch.mjs:556 (the brief said 5; this base has 4, obs-windows.ts is already under budget)

## Fix 1 (commit 4db515a): dupes
Rename meeting-bot `recordApproval` -> `recordRuleApproval` (sibling is `recordOptOut`; store uses `recordTenantApproval`; `rg recordRuleApproval` found no prior use). No alias export of the old name. The error-message prefixes inside the function were renamed too.
Files: packages/meeting-bot/src/calendar/join-rules.ts, join-rules.test.ts, join-rules-store.ts (import `recordRuleApproval as applyApproval`). `rg recordApproval` shows no other meeting-bot user (apps/api/src/store.ts imports the @lkb/db one, untouched). No index re-export exists.
lane/t037api claim: join-rules-store.ts exports `recordTenantApproval` / `recordTenantOptOut` (lines 115, 124), neither renamed; a test deep-importing those is unaffected.

## Fix 2: record-commands.ts loc — STOPPED, nothing changed
capture/ has 30 files (at the 30 budget) plus one subfolder, capture/browser/ (bot-child.ts = sb_join.py child process; browser-profile.ts = Chrome profile args). Candidate groups (arg helpers lines 24-51; processRecordingArtifacts + validateIndexProof lines 207-239) are not browser concerns, so no cohesive home; a new top-level file would breach dirsize. Filed ISS-STRUCTFIX-001 (qa/issues.structfix.jsonl). No budget raised.

## AFTER
- `node scripts/lint-dupes.mjs`: `lint-dupes: OK (681 unique export(s), 27 unique schema $id(s))`
- `node scripts/lint-loc.mjs`: FAIL 4, unchanged (record-commands.ts:304 remains)
- `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (110 dir(s) within budget)`
- `node scripts/lint-loc.mjs --all`: stages loc 1, dirsize 0, root 1, dupes 0, migrations 0, codex-hooks 0, snapshot 0, lint-tests 0, tracker 1, dependencies 327 (3 red besides dependencies).

## Evidence
- `node --test --import tsx src/calendar/join-rules.test.ts join-rules-store.test.ts trusted-sender.test.ts sender-authentication.test.ts src/send-now.test.ts` (in packages/meeting-bot): tests 75, pass 75, fail 0.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/meeting-bot): exit 0.
- No capture tests run (no capture file changed).
- Only package touched: meeting-bot.

## Remains red in lint:structure
loc (4: speakers-llm, sb_join.py, record-commands, run-watch: other lanes / Approver), root (18 loose files vs 15: Approver decision), tracker (G4 findings), dependencies exit 327 (observed in this worktree via junctioned node_modules; not investigated, unchanged by this unit).

Status: checked-PASS
Checked: qa/verdicts/structure-dupes-and-record-commands-loc.md (cycle 0, f3d5ea5)
Fix cycle: 0
