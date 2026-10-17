# w23-spkscorer

Status: ready-for-check
Fix cycle: 1
Lane: lane/w23-spkscorer · Base: 3c99337f · Candidate: the lane HEAD commit "w23-spkscorer cycle 1" (cycle 0 was 9243679f, checker verdict 9b71e57a FAIL) · Tier: high (ISS-289, ISS-283), medium (ISS-290). Ledger rows NOT flipped.

## Finding at base
`qa/evidence/u2-4-phase3-precision-regate-2026-09-22/` already carried partial fixes from u2-4-phase3-resume-c2 (relational citation counter inline in `05-score.mjs`, `corpus-lock.mjs` wired into 04/05/09/10) and the w17-u24regate `suggest-score-lib.mjs`. That lib is gold-based (independent of the acceptance rule) but scores block claims only, not evidence citations, and has no run-completeness notion, so it does not by itself close ISS-289 or ISS-283; it does not touch ISS-290. It is reused (`blocksOf`, `personMatch`) rather than copied.

## Changes (all under qa/evidence/u2-4-phase3-precision-regate-2026-09-22/)
- NEW `citation-check.mjs` (ISS-289): the relational citation measure extracted from 05-score into a pure, tested module; imports no production predicate. Behaviour-identical to the inline code (relationalInvalid arrays equal on tags c2r/c3r/c6r with --raw-tag c1; cycle-0 default run gives 8, as before).
- NEW `bar4-stability.mjs` (ISS-283): bar 4 covers every pinned session; `stable`/`allStable` require all expected outer runs (1,2,3) and providerCalls == windows*3; adds `measurable`, `providerCallsExecuted/Expected`. Previously `stable` was true for any 2 identical runs and sessions with no run were dropped.
- `05-score.mjs`: uses both modules; bar4 summary gains `measurable` and call counts (existing fields kept).
- `01-block-stats.mjs` (ISS-290): measures the pinned, hash-verified corpus only; unpinned positional sessions are named on stderr by verifyCorpus. Reproduces 494 / 240 / 29 (was 496 / 242 / 30 over the live glob). `corpus-stats.json` re-emitted by it.
- NEW `scorer-independence.test.mjs`: 8 tests.

## D-015 (recorded reproductions replayed from recorded files)
- ISS-289: 2/2 recorded wrong citations flagged (leeds t088, spk:3 -> Jubin and spk:1 twin, taken from run-results.jsonl, real turns, gold-labels.json).
- ISS-283: recorded run-results.jsonl gives 957/2340 provider calls, 0/11 sessions complete, measurable false, allStable false (the ledger row's 957/2340 and run-2 4/11 reproduce). Live runs are NOT executed, so bar 4 stays unmeasured; ISS-283 is not closed by this unit.
- ISS-290: fixture replay of the row's shape (an ungolded positional session appears): 01-block-stats counts the pinned session only and names the other; a drifted pinned session is refused. Real data: 01 now prints `TOTAL positional: 494 | blocks: 240 | session/label pairs: 29`, the row's pinned figures. Left open: 02-dump-blocks, 03-dump-compact, 06-window-count still glob live (dump tools); verifyCorpus still only NOTEs unpinned sessions rather than failing (the row's fix_direction says fail loudly; that is a policy choice, left to the Approver).

## Checks a checker should run (repo root, node on PATH)
- `node --test qa/evidence/u2-4-phase3-precision-regate-2026-09-22/scorer-independence.test.mjs qa/evidence/u2-4-phase3-precision-regate-2026-09-22/corpus-lock.test.mjs qa/evidence/u2-4-phase3-precision-regate-2026-09-22/suggest-score-lib.test.mjs` -> tests 17, pass 17, fail 0.
- `node scripts/lint-loc.mjs --all` -> OK (10 stages, 0 failed).
- Mutations (each fails 2 of 7 in scorer-independence.test.mjs, restored byte-identical): M1 citation-check always-valid; M2 bar4 `complete = true`; M3 01-block-stats back to live glob.

## Fix cycle 1 (checker FAIL 9b71e57a)
- ISS-290: `verifyCorpus` now THROWS on an unpinned positional session (the row's fix_direction: fail loudly) instead of printing a note. 02-dump-blocks, 03-dump-compact and 06-window-count read only the pinned, hash-verified list, as 01 does. Consequence: on the current data/toc-migrated (6 unpinned positional sessions) 01, 02, 03, 04, 05, 06, 09 and 10 now refuse until those sessions are golded and pinned or removed; that follow-up is the Approver's, not done here.
- Tests: scorer-independence.test.mjs replaces the NOTE test with: unpinned session refused by verifyCorpus and 01/02/03; non-positional extra session is not unpinned; the REAL 11 pinned sessions copied to a temp cwd reproduce `TOTAL positional: 494 | blocks: 240 | session/label pairs: 29`. gold-labels.json and corpus.lock.json unchanged (empty diff).
- Run: `node --test` on scorer-independence, corpus-lock and suggest-score-lib tests -> tests 19, pass 19, fail 0.
- Mutation M4 (verifyCorpus notes instead of throwing) fails 1 test; restored, `git -c core.autocrlf=true hash-object` equals the pre-mutation blob.
