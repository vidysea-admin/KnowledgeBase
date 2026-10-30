# Manifest — speaker-rules-split

Status: merged-no-check (test-lane) — test-only diff (4 files under packages/index/src/pipeline, all *.test.ts); 118 tests before, 118 after, names and assert lines identical
**Handshake status:** merged-no-check (test-lane) — test-only diff; no product file changed, no assertion deleted or weakened
**Contract:** none (QUEUE Wave 1 row W1-speaker-rules-split, W-S step 1, approved by Umesh 2026-10-28)
**Goal task:** none
**Date:** 2026-10-28
**Fix cycle:** 0 of max 2
Fix cycle: 0
**Dual check:** no (diff is test files only; no auth, tenancy, security or prod-write path touched, so no dual-trigger line applies)
**Issues addressed:** none (refactor of test layout only); filed ISS-SPEAKER-001 (low) in qa/issues.speaker.jsonl
**Executor:** claude-sonnet-subagent
**Executor rationale:** mechanical carve of one test file by line ranges, verified by name and assert diffs

## What changed
- packages/index/src/pipeline/speaker-name-rules.test.ts (358 -> 172 lines, edited in place): keeps what shares ISS_093_CORPUS: LLM-path replay, D-015 ledger-fidelity test, predicate replay. Header note records the split.
- packages/index/src/pipeline/speaker-name-rules-speaking.test.ts (new, 93 lines): ISS-098 recall x10, ISS-098 fall-through, ISS-110 recorded x2 and controls x5, ISS-104 clause-opening x3, ISS-104 larger construction.
- packages/index/src/pipeline/speaker-name-rules-handover.test.ts (new, 59 lines): the three ISS-255 tests.
- packages/index/src/pipeline/speaker-name-rules-closed-class.test.ts (new, 97 lines): ISS-104 closed-class sentinels x48, collision cost x1, collision bound x3.
- speaker-name-rules-place.test.ts untouched (175 lines, 52 tests). No product file changed. Carved from the original by line ranges (sed), not retyped; each new file carries its own copy of the 3 small helpers (turn, completion, replies), the same pattern the place file already uses.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (test-only split, 4 files, no behaviour change)
Round: 4 files, 3 criteria, est 40 min — mechanical carve plus name/assert diff
Base sha: 338d2178d6a327e036b12f9adc3bbb7e4ea1268d
Base / checked state: code sha 097cb9e4 (manifest committed after it)
Gate answers: none (no gate files touched)
Affected tests / full-suite trigger: the four speaker-name-rules*.test.ts files (place file unchanged, re-run at baseline 52/52); no safe-fallback trigger; no full suite run.
Tests[C1]: packages/index/src/pipeline/speaker-name-rules.test.ts, -speaking, -handover, -closed-class — union of test names equals the original 118 (sorted name diff empty)
Tests[C2]: same four files, each run standalone: 41 + 22 + 3 + 52 = 118 pass, 0 fail
Tests[C3]: packages/index/src/pipeline/speaker-name-rules.test.ts::"D-015: the corpus above is byte-faithful to ISS-104's own recorded reproductions" plus the ISS-093 corpus loop and predicate loop, all kept in one file with ISS_093_CORPUS
Falsification[C1]: copy (packages/index/src/mutcopy, deleted afterwards): added a row to ISS_093_CORPUS (a dropped or altered corpus row is the failure shape C1 guards) -> speaker-name-rules.test.ts red 1 fail (D-015 fidelity test); control green 41/41; restored, git hash-object copy = original = HEAD blob bd99ed43
Falsification[C2]: copy: product mutant removing the `cue !== "speaking" && cue !== "here" &&` exclusion in speaker-name-rules.ts -> speaking file red 6 fail of 22; product mutant isDiscourseOnly returns false -> closed-class file red 1 fail of 52, base file red 6 fail of 41; handover file: test-level mutant (first assertion inverted) -> red 1 fail of 3. Each restored with a per-mutation backup; git hash-object copy = original = HEAD (speaker-name-rules.ts ce43fc93, handover test 2a877c1d)
Falsification[C3]: same ISS_093_CORPUS row-addition mutant as C1 (the fidelity test is the C3 guard) and isDiscourseOnly -> false (6 of the corpus tests red in the base file)
Pre-check[C1]: 097cb9e4 diff <(sorted test names of original file at 338d2178, 118) <(sorted names across the 4 new files, 118) -> empty diff, IDENTICAL; assert lines: 25 in the original, 25 across the new files, sorted diff empty t=3 blobs=speaker-name-rules.test.ts:bd99ed4
Pre-check[C2]: 097cb9e4 node --test --import tsx packages/index/src/pipeline/speaker-name-rules-speaking.test.ts -> 22/22 pass, 0 fail t=7 blobs=speaker-name-rules-speaking.test.ts:a7e3368
Pre-check[C2b]: 097cb9e4 node --test --import tsx packages/index/src/pipeline/speaker-name-rules-handover.test.ts -> 3/3 pass, 0 fail t=6 blobs=speaker-name-rules-handover.test.ts:2a877c1
Pre-check[C2c]: 097cb9e4 node --test --import tsx packages/index/src/pipeline/speaker-name-rules-closed-class.test.ts -> 52/52 pass, 0 fail t=7 blobs=speaker-name-rules-closed-class.test.ts:c6e4d97
Pre-check[C2d]: 097cb9e4 tsc --noEmit -p packages/index/tsconfig.json -> clean (no output) t=60 blobs=speaker-name-rules.test.ts:bd99ed4
Pre-check[C3]: 097cb9e4 node --test --import tsx packages/index/src/pipeline/speaker-name-rules.test.ts -> 41 pass 0 fail, includes the D-015 fidelity test and 20/20 ISS-093 corpus rows refused at both the LLM path and the predicate t=7 blobs=speaker-name-rules.test.ts:bd99ed4
Metrics: builder_min=40 start=2026-10-28T00:00 end=2026-10-28T00:40 wall_min=40 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=2 mutations=6 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=6 defects_unit=0 defects_6c=0

mutant-cap-raise: the split creates 4 test files, each needs its own falsification, plus a retry on the handover file (two product-gate mutants survived, then the test-level mutant)

## Acceptance
- C1: every original test exists exactly once after the split (118 before, 118 after) and no assert line was dropped or edited (25 of 25).
- C2: each of the four files is green when run standalone, and typecheck is clean.
- C3: the ISS-093 corpus, its D-015 ledger-fidelity test and the predicate replay stay together, so the corpus cannot drift from the test that guards it.

## How to verify (commands + expected)
- From the worktree root, one invocation per file: `node --test --import tsx packages/index/src/pipeline/speaker-name-rules.test.ts` -> tests 41, pass 41. Same for -speaking (22), -handover (3), -closed-class (52). Place file unchanged: 52.
- `git diff --stat 338d2178 HEAD -- packages` shows only the four test files.

## Actual outputs
- Baseline (338d2178): speaker-name-rules.test.ts tests 118 pass 118; place file tests 52 pass 52.
- After: 41 + 22 + 3 + 52 = 118, all pass; sorted names identical to baseline; `grep -h "assert\."` line multiset identical (25 vs 25).

## D-015
No issue is fixed by this unit. The ISS-104 / ISS-093 recorded corpus (20 rows) is untouched and still asserted byte-faithful to the ledger row by the fidelity test: ISS-093 (= ISS-104): 20/20 refused through the LLM path and 20/20 at the predicate, unchanged.

## Findings worth the checker's attention
- Falsification note (pre-existing, filed as ISS-SPEAKER-001, low): deleting the ISS-255 handover gate in `hasNamingCue` (speaker-name-rules.ts:205-206), alone or with the `handover` variable stubbed, leaves the three handover tests green, because another layer also refuses that sentence. The handover file's C2 falsification is therefore test-level (inverted assertion), not a product mutant. Not a regression of this split; the original file had the same exposure.

## Capability coverage
Criterion C1 -> fidelity row-addition mutant. Criterion C2 -> speaking-exclusion mutant, isDiscourseOnly mutant, handover inverted assertion. Criterion C3 -> fidelity row-addition mutant, isDiscourseOnly mutant.

## Cleanup
Copy mutants lived in untracked packages/index/src/mutcopy (no node_modules or junctions inside, removed with rm -rf of that directory only); worktree status clean of it. Every touched copy file hashed equal to its original and HEAD blob after restore.
