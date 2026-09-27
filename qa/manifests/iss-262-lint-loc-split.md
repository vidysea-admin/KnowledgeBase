# Manifest — iss-262-lint-loc-split

**Contract:** qa/contracts/structure-lint.md (criterion 1: 400 LOC for `*.test.ts`)
**Goal task:** none (ISS-262, medium — QA-internal; U2.4 is the owning roadmap task, unblocked)
**Date:** 2026-09-21
**Fix cycle:** 0 of max 3
**Dual check:** no (no matching critical-criticality goal task)
**Issues addressed:** ISS-262 (medium, checker-sweep)
**Queue tier:** 1 (qa/QUEUE.md top row, 2026-09-21 sweep; round-cap check: 0 prior PASSes on the lint-loc seam)

## What changed
- `packages/index/src/pipeline/speakers-windows.test.ts` (NEW, 105 lines): the segment-aware
  window tests (`buildSpeakerWindows`, per-window degradation, empty-input) and the ISS-255
  cross-run agreement tests (2-of-3 voting, evidence merge) — moved VERBATIM from the parent,
  with a header naming the split and ISS-262.
- `packages/index/src/pipeline/speakers-llm.test.ts`: those five tests removed verbatim; a
  two-line pointer comment names the sibling file. All fabrication/refusal regression corpora
  (ISS-091/092/093/094/255 supersedes rows) stay here.

No production code touched. No test logic altered — tests moved verbatim.

## How to verify (commands + expected)
- `node scripts/lint-loc.mjs` → `lint-loc: OK (291 file(s) within budget)`, exit 0
- `pnpm --filter @lkb/index test` → 215 pass / 0 fail (215 tests incl. the 6 moved + 209 remaining)
- `pnpm -r test` → all packages pass (web 55, db 14, ai 74, ask 50, index 215, ingest 97, meeting-bot 40, api 173)
- `pnpm -r typecheck` → all Done, exit 0
- `pnpm lint:structure` → FAILS ONLY at the known pre-existing lint-root 16>15 (ISS-248,
  Approver budget entry pending — unchanged by this unit, ruled explicitly in the sweep); every
  stage that was previously unreachable past the short-circuit now runs green individually:
  lint-loc OK · lint-dirsize OK · lint-dupes OK (313 exports) · lint-migrations OK ·
  `snapshot --check` OK · `lint.test` 14/14 · tracker-audit G1,G4 OK ·
  `npx depcruise --config .dependency-cruiser.cjs packages apps workers` 0 violations (308 modules)
- `pnpm test:lint` → 76/76 pass, exit 0 ( catalogue integrity gate now passes on the committed tree)

## Actual outputs (from maker's own run)
- lint-loc before: `FAIL — packages/index/src/pipeline/speakers-llm.test.ts:444 (budget 400)`, exit 1
- lint-loc after: `OK (291 file(s) within budget)`, exit 0
- line counts: speakers-llm.test.ts 444 → 301; speakers-windows.test.ts = 105
- @lkb/index tests: 215 pass / 0 fail (re-run on the committed tree)
- pnpm -r test: exit 0, all packages (full counts above from the actual run)
- pnpm -r typecheck: exit 0
- pnpm test:lint: 76/76, exit 0
- unit commit: `7da0a41` (narrow pathspec: the two test files only)

## Live browser evidence
Not UI-touching — no surface changed: both changed paths are `packages/index/src/pipeline/*.test.ts`
(test files; no page, route, or component touched).

## Honest scope statement
- The moved tests run in the sibling file under the same package test runner (`node --test`
  via the package script); test count is unchanged at 215 for @lkb/index (6 moved + 209 kept,
  previously 215 across one file). Nothing was weakened: refusal corpora stay in the parent.
- `pnpm lint:structure` still exits 1 at HEAD via the pre-existing lint-root 16>15 violation
  (ISS-248) — an enforcement-path budget change awaiting Umesh's Approver entry, explicitly
  NOT self-authorized. This unit un-reds the lint-loc stage only, which is what it claimed.
- The catalogue integrity gate (`catalogue-cli.test.mjs`) refuses a dirty tree by design; the
  earlier local run failures were that gate working, not a defect — resolved by committing first,
  then re-verifying (76/76 recorded above).

## Status: checked-PASS (qa/verdicts/iss-262-lint-loc-split.md, Cycle checked: 0, commit baeb66f)

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
