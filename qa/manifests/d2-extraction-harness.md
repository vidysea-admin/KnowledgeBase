# Manifest — d2-extraction-harness
**Contract:** qa/contracts/extraction-scoring-harness.md
**Goal task:** none (wave lane D, item D2 harness half, D-227 plan)
**Date:** 2026-11-25
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no   ← offline scorer over local files: no auth, tenancy or data write is added or changed, nothing reaches a database or outside service (no `dual-trigger:` line applies)
**Persona walk:** skip (CLI and library function only; no UI surface changed)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one scorer function, one CLI mode, one thresholds file and tests; no external model was worthy.

## What changed
- packages/index/src/eval/extraction.ts:11-14 — optional gold fields on `ExtractionCase` (`goldTopics`, `predictedDecisions`, `decisionLabels`, `goldDecisions`, `noDecisionSession`, `secondLabels`); read only by the new scorer, `evaluateExtractionCase` untouched.
- packages/index/src/eval/extraction.ts:187-242 — `GoldMetricName`, `GOLD_METRICS` (kind and pinned definition per metric), `GoldMetric`, `GoldScore`, and `scoreGoldSet(cases)` (pools `evaluateExtractionCase` reports; absent input or zero denominator -> `measured: false`, `value: null`, a `reason`; second-reviewer agreement). Edited in place; `aggregateExtractionReports` and the replay path unchanged.
- scripts/eval-extraction.mjs:6-9 — header comment for gold mode and exit codes; :14 — import of `scoreGoldSet`, `GOLD_METRICS`.
- scripts/eval-extraction.mjs:135-178 — `parseThresholds` (validates `extraction-thresholds-v1`), `judgeGold` (bar vs metrics, verdict, exit code), `goldMain` (`--gold <path> [--thresholds <path>]`, read-only); :182 routes `args[0] === "--gold"` to it. Any other argument list reaches the original code path unchanged.
- data/eval/extraction-thresholds.json (NEW) — the contract's proposed numbers, `status: proposed`, all metrics `required: true`. Read by the script at run time; no number appears in code.
- packages/index/src/eval/extraction-gold.test.ts (NEW, 7 tests) and scripts/eval/gold/eval-extraction.test.mjs (NEW, 15 tests, run with `node --test`) — the C1-C4 tests with their falsifications, the C5 definition-format check, C6 replay regression, I1, I2. The script test sits in `scripts/eval/gold/` rather than beside the script because `scripts/` (34 of 34, override) and `scripts/eval/` (30 of 30) are at their loose-file budget; `lint-dirsize` stays OK.
- scripts/eval/gold/fixtures/synthetic-gold-export.json (NEW) — synthetic gold set in the review tooling's export shape (`format: extraction-authorized-export-v1`, `synthetic: true`, invented values). scripts/eval/gold/fixtures/replay-expected.json (NEW) — recorded stdout and exit code of the UNMODIFIED `--input` replay on a generated two-claim manifest (the test regenerates the inputs byte for byte).
- qa/contracts/extraction-scoring-harness.md (brought in by commit c67c9bbd from c32c8bbc, byte for byte, not edited).

Exporting tool cited for C1: `apps/api/src/extraction-review/router.ts` (`GET /extraction-review/export`) returning `ExtractionExport` from `apps/api/src/extraction-review/types.ts:33-37` (`format 'extraction-authorized-export-v1'`, `cases: ExtractionCase[]` carrying `labels`, `factLabels`, `entityLabels`, `expectedFacts`, `predictedEntities`). The script reads that file's `cases`. The export does NOT carry gold topic ids, decisions, reviewer ids or second labels; those are the optional per-case fields above. A real export without them yields `not-measured` for topics recall, the three decision metrics and reviewer agreement, never a number.

## Definitions (D2H-C5; one line per metric; proposals for Umesh's approval, not a maker choice)
All metrics are pooled across cases (sum of numerators over sum of denominators).
- fabricatedCitations (count): numerator = citations that do not resolve to a turn of the same tenant and session; denominator = all citations; stage = first available of persisted, filtered, parsed. Threshold compares the numerator.
- claimSupport: numerator = claims labelled `supported`; denominator = all labelled claims (an `uncertain` label counts against; omitted-fact labels are not claims).
- machineChecked: numerator = claims with no machine-check issue (citation, span, speaker, excerpt, owner); denominator = all claims of the same stage as fabricatedCitations.
- factCoverage: numerator = expected facts labelled `covered`; denominator = all expected facts; if any expected fact has no label the metric is `not-measured` (reason `unlabelled-expected-facts:N`), never silently covered.
- topicsPrecision: numerator = predicted topics labelled correct; denominator = labelled predicted topics.
- topicsRecall: numerator = gold topic ids that are present among predicted topic ids; denominator = gold topic ids.
- decisionsPrecision: numerator = predicted decisions labelled correct; denominator = labelled predicted decisions.
- decisionsRecall: numerator = gold decision ids that are present among predicted decision ids; denominator = gold decision ids.
- falseDecisions (count): numerator = predicted decisions on sessions marked `noDecisionSession`; denominator = number of such sessions. Threshold compares the numerator.
- reviewerAgreement (reported, not thresholded): numerator = double-labelled claims where the second status equals the first; denominator = double-labelled claims (a second label by a different `reviewerId` on a claim already labelled); measure = raw percent agreement, not chance-corrected.
Exit codes (gold mode): 0 no bar, or every thresholded metric meets its bar; 1 a measured metric misses; 2 invalid input, flags or thresholds file; 3 not-measurable (a required metric is not measured, or nothing thresholded was measured).

## Verification scope
Policy-Version: proportional-verification/2026-11-22.19
Tier: L (the diff lists qa/contracts/extraction-scoring-harness.md, which the policy floor sets at L; the brief said M and the lint floor wins), one checker
slow-plan: eight criteria each need a falsification run of two test files (about 1 min each) plus the contract-versus-brief points below; the round cannot be smaller without dropping a criterion
mutant-cap-raise: one named falsification per criterion was required (8 criteria D2H-C1..C6, I1, I2), each in a throwaway copy
Round: 6 files changed or added in code and tests plus 2 fixtures and 1 data file, 8 criteria, est 45 min — one library function, one CLI mode, one thresholds file, two test files
Base / checked state: base a9bbeb98; code HEAD 6a883fa0 (c67c9bbd contract, 72ac7f27 code, 83c70516 tests and fixtures, 6a883fa0 C5 definition-format test); worktree clean before the manifest commit. Branch `wave/d2-extraction-harness`.
Gate answers: none apply — the gates concern deploys and earlier merges; no gate names extraction.ts or the scoring CLI.
Affected tests / full-suite trigger: the two new test files; the existing consumers of `evaluateExtractionCase` re-run (corpus-reconcile.test.ts, topic-run-evidence.test.ts); no full-suite trigger. NOTE: `scripts/eval/gold/eval-extraction.test.mjs` is not listed in a root test script (package.json is outside this unit's ownership); run it directly.
Tests[D2H-C1]: packages/index/src/eval/extraction-gold.test.ts::"D2H-C1 scores every gold metric ..." and "D2H-C1 falsification ..."; scripts/eval/gold/eval-extraction.test.mjs::"C1: --gold reports every metric ..." and "C1 falsification ..." and "C1: an invalid gold set or flag combination fails closed" — covers the criterion directly, with its falsification
Tests[D2H-C2]: scripts/eval/gold/eval-extraction.test.mjs::"C2: the shipped proposed bar is labelled proposed ...", "C2 falsification: changing one number in the file flips the exit code", "C2: count metrics compare the count against max", "C2: approved bar met on non-synthetic gold ...", "C2: invalid thresholds files fail closed", "C2: without --thresholds the output states bar none ..." — covers the criterion directly, with its falsification
Tests[D2H-C3]: packages/index/src/eval/extraction-gold.test.ts::"D2H-C3 absent inputs are not-measured ..." and "D2H-C3 unlabelled expected facts ..."; scripts/eval/gold/eval-extraction.test.mjs::"C3: absent decision inputs ..." and "C3: a zero denominator ..." — covers the criterion directly, with its falsification
Tests[D2H-C4]: packages/index/src/eval/extraction-gold.test.ts::"D2H-C4 reviewer agreement ..." and "D2H-C4 falsification ..."; scripts/eval/gold/eval-extraction.test.mjs::"C4: double-labelled claims give agreement ..." — covers the criterion directly, with its falsification
Tests[D2H-C5]: scripts/eval/gold/eval-extraction.test.mjs::"C1: --gold reports every metric ..." (every metric's printed definition matches `numerator = ...; denominator = ...`); the definitions in this manifest restate `GOLD_METRICS` and are for the owner's approval — covers the criterion directly, with its falsification
Tests[D2H-C6]: scripts/eval/gold/eval-extraction.test.mjs::"C6: --input replay output is byte-identical to the recorded pre-change output" (stdout and exit code, plus the unchanged usage line for `--bogus` and for `--thresholds` without `--gold`); existing corpus-reconcile.test.ts and topic-run-evidence.test.ts re-run green — covers the criterion directly, with its falsification
Tests[D2H-I1]: scripts/eval/gold/eval-extraction.test.mjs::"I1: the script's imports are local-only ..." (import allow-list, no http/net/dotenv/process.env/fetch) — covers the criterion directly, with its falsification
Tests[D2H-I2]: scripts/eval/gold/eval-extraction.test.mjs::"I2: the gold set and thresholds file are byte-identical after a run" — covers the criterion directly, with its falsification
Sibling: apps/api/src/extraction-review/seed.ts:1 and scripts/eval/extraction-authorized-import.mjs:1 also call `evaluateExtractionCase`; neither is edited and the function body is unchanged.
Pre-check[D2H-C1]: 6a883fa0 node --test --import tsx packages/index/src/eval/extraction-gold.test.ts -> green: 7 passed, 0 failed t=1 blobs=packages/index/src/eval/extraction-gold.test.ts:f0e91d8,scripts/eval/gold/eval-extraction.test.mjs:73cd9ad
Pre-check[D2H-C1]: 6a883fa0 node --test scripts/eval/gold/eval-extraction.test.mjs -> green: 15 passed, 0 failed t=1 blobs=packages/index/src/eval/extraction-gold.test.ts:f0e91d8,scripts/eval/gold/eval-extraction.test.mjs:73cd9ad
Pre-check[D2H-C2]: 6a883fa0 node --test scripts/eval/gold/eval-extraction.test.mjs -> green: 15 passed, 0 failed t=1 blobs=packages/index/src/eval/extraction-gold.test.ts:f0e91d8,scripts/eval/gold/eval-extraction.test.mjs:73cd9ad
Pre-check[D2H-C3]: 6a883fa0 node --test --import tsx packages/index/src/eval/extraction-gold.test.ts -> green: 7 passed, 0 failed t=1 blobs=packages/index/src/eval/extraction-gold.test.ts:f0e91d8,scripts/eval/gold/eval-extraction.test.mjs:73cd9ad
Pre-check[D2H-C3]: 6a883fa0 node --test scripts/eval/gold/eval-extraction.test.mjs -> green: 15 passed, 0 failed t=1 blobs=packages/index/src/eval/extraction-gold.test.ts:f0e91d8,scripts/eval/gold/eval-extraction.test.mjs:73cd9ad
Pre-check[D2H-C4]: 6a883fa0 node --test --import tsx packages/index/src/eval/extraction-gold.test.ts -> green: 7 passed, 0 failed t=1 blobs=packages/index/src/eval/extraction-gold.test.ts:f0e91d8,scripts/eval/gold/eval-extraction.test.mjs:73cd9ad
Pre-check[D2H-C4]: 6a883fa0 node --test scripts/eval/gold/eval-extraction.test.mjs -> green: 15 passed, 0 failed t=1 blobs=packages/index/src/eval/extraction-gold.test.ts:f0e91d8,scripts/eval/gold/eval-extraction.test.mjs:73cd9ad
Pre-check[D2H-C5]: 6a883fa0 node --test scripts/eval/gold/eval-extraction.test.mjs -> green: 15 passed, 0 failed t=1 blobs=packages/index/src/eval/extraction-gold.test.ts:f0e91d8,scripts/eval/gold/eval-extraction.test.mjs:73cd9ad
Pre-check[D2H-C6]: 6a883fa0 node --test scripts/eval/gold/eval-extraction.test.mjs -> green: 15 passed, 0 failed t=1 blobs=packages/index/src/eval/extraction-gold.test.ts:f0e91d8,scripts/eval/gold/eval-extraction.test.mjs:73cd9ad
Pre-check[D2H-C6]: 6a883fa0 node --test --import tsx packages/index/src/eval/corpus-reconcile.test.ts packages/index/src/eval/topic-run-evidence.test.ts -> green: 16 passed, 0 failed t=1 blobs=packages/index/src/eval/corpus-reconcile.test.ts:904ba3a,packages/index/src/eval/topic-run-evidence.test.ts:1742d17
Pre-check[D2H-I1]: 6a883fa0 node --test scripts/eval/gold/eval-extraction.test.mjs -> green: 15 passed, 0 failed t=1 blobs=packages/index/src/eval/extraction-gold.test.ts:f0e91d8,scripts/eval/gold/eval-extraction.test.mjs:73cd9ad
Pre-check[D2H-I2]: 6a883fa0 node --test scripts/eval/gold/eval-extraction.test.mjs -> green: 15 passed, 0 failed t=1 blobs=packages/index/src/eval/extraction-gold.test.ts:f0e91d8,scripts/eval/gold/eval-extraction.test.mjs:73cd9ad
Metrics: start=2026-11-25T12:30:00Z end=2026-11-25T13:30:00Z wall_min=60 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=2 mutations=8 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=25 mutants=8 defects_unit=0 defects_6c=0

## How to verify (commands + expected)
- `node --test scripts/eval/gold/eval-extraction.test.mjs` (from the worktree root) -> expected: 15 tests pass.
- `node --test --import tsx src/eval/extraction-gold.test.ts src/eval/corpus-reconcile.test.ts src/eval/topic-run-evidence.test.ts` (from `packages/index`) -> expected: 23 tests pass.
- `node scripts/eval-extraction.mjs --gold scripts/eval/gold/fixtures/synthetic-gold-export.json --thresholds data/eval/extraction-thresholds.json` -> expected: JSON on stdout, `bar: "proposed"`, `verdict: "meets-proposed-bar"`, `acceptanceForG14: false`, `measurementOfRealCorpus: false`, exit 0. Without `--thresholds`: `bar: "none"`, `verdict: "no-bar"`.
- `node scripts/lint-dirsize.mjs` -> expected: OK. `node scripts/lint-loc.mjs` -> expected: one violation, `apps/api/src/answer-policy/answer-evidence.ts:509 (budget 300)`, which is in base a9bbeb98 and not in this diff (extraction.ts 242 lines, eval-extraction.mjs 189, both under 300).
- `tsc --noEmit -p tsconfig.json` (from `packages/index`) -> expected: no output.

## Actual outputs (from maker's own run)
```
packages/index: ℹ tests 23  ℹ pass 23  ℹ fail 0
scripts/eval/gold/eval-extraction.test.mjs: ℹ tests 15  ℹ pass 15  ℹ fail 0
lint-dirsize: OK (309 dir(s) within budget)
lint-loc: FAIL — 1 violation(s)  apps/api/src/answer-policy/answer-evidence.ts:509 (budget 300)   (pre-existing, not in this diff)
```
Red-first: the new tests were written before the implementation; `extraction-gold.test.ts` failed to load (`scoreGoldSet` not exported) before the function existed. The replay golden was recorded from the UNMODIFIED script before any script edit and passed unchanged after.

## Capability coverage (each new claim -> its isolating falsification)
Falsifications ran against a throwaway copy of the tracked tree at `C:/Users/Lenovo/AppData/Local/Temp/claude/6e9d41101c3c5a5b/3fb8d78b-cac7-406e-9e13-fe76f3d5cd42/scratchpad/d2-falsify/copy` (script `falsify.mjs`, 240 s timeout per run, the worktree was never mutated, no trap; each edit was applied to one file of the copy, the test run, the file written back from its in-memory original, and `git hash-object` compared with the worktree file: `restoredEqualsWorktree: true` for all 8). "Before" and "after" are the node test summaries of the named runs.
| Criterion | capability | check | falsifying edit | observed |
|---|---|---|---|---|
| D2H-C1 | fabricated-citation count comes from the citation resolver | extraction-gold.test.ts "D2H-C1 falsification" + CLI "C1 falsification" | extraction.ts: `add("fabricatedCitations", s.invalidCitationRate.numerator, ...)` -> `add("fabricatedCitations", 0, ...)` | before package 7 pass / CLI 15 pass; after package 6 pass 1 fail, CLI 13 pass 2 fail (numerator 1 expected, got 0) |
| D2H-C2 | the bar is read from the file, not code | CLI "C2 falsification: changing one number in the file flips the exit code" | eval-extraction.mjs: `m.value >= t.min` -> `m.value >= 0` | before 15 pass; after 14 pass 1 fail (the tight bar no longer exits 1) |
| D2H-C3 | zero denominator is not-measured | extraction-gold.test.ts "D2H-C3 absent inputs ..." + CLI C3 tests | extraction.ts: `reason \|\| !b ? {numerator: a` -> `reason ? {numerator: a` | before 7 / 15 pass; after package 5 pass 2 fail, CLI 12 pass 3 fail (`measured` true with `value` null) |
| D2H-C4 | agreement counts only exact status matches | extraction-gold.test.ts "D2H-C4 reviewer agreement" + CLI C4 | extraction.ts: `Number(l.status === f.status)` -> `1` | before 7 / 15 pass; after package 6 pass 1 fail, CLI 14 pass 1 fail (agreement 2/2 instead of 1/2) |
| D2H-C5 | every metric prints a pinned `numerator = ...; denominator = ...` definition | CLI "C1: --gold reports every metric ..." | extraction.ts: topicsRecall definition -> `"topic recall"` | before 15 pass; after 14 pass 1 fail |
| D2H-C6 | `--input` replay output unchanged | CLI "C6: --input replay output is byte-identical ..." | eval-extraction.mjs: replay `JSON.stringify(report, null, 2)` -> `null, 4` | before 15 pass; after 14 pass 1 fail |
| D2H-I1 | no network import in the script | CLI "I1: the script's imports are local-only" | eval-extraction.mjs: add `import "node:https";` | before 15 pass; after 14 pass 1 fail |
| D2H-I2 | the script never writes the gold set | CLI "I2: the gold set and thresholds file are byte-identical" | eval-extraction.mjs: after reading the gold file add `writeFileSync(resolve(args[1]), goldBytes + ' ')` | before 15 pass; after 14 pass 1 fail |
Also in the committed tests: C2 count metrics (max vs numerator), invalid-thresholds table (5 bad files exit 2), approved-bar acceptance only on non-synthetic gold, "nothing measured is never a pass".

## Contract and brief points the checker should see
- The brief says a not-approved bar "must yield not measurable, never a pass"; the contract (C2) says the run exits non-zero only on a miss and a proposed-bar run is labelled `bar: proposed` and never citable for G14. The contract wins: a proposed bar that every metric meets exits 0 with `verdict: "meets-proposed-bar"` (never the word `pass`) and `acceptanceForG14: false`; a miss is `misses-proposed-bar`, exit 1. Only an `approved` bar on non-synthetic gold can give `acceptanceForG14: true`.
- C3 says a not-measured metric fails the run only if the file marks it required. One addition: if no thresholded metric was measured at all, the run is `not-measurable` (exit 3) even when none is required, so an empty gold set can never read as a pass.
- The review tooling's export has no gold topic ids, decisions, reviewer ids or second labels (see "What changed"); the optional case fields are this unit's reading, to be confirmed with the export owner. All proposed thresholds are `required: true` in the shipped file; that is part of the proposal.
- No other contract point is unmet. `reviewerAgreement` has no threshold in the contract and none is invented.

## Live browser evidence
Not UI-touching — no surface changed. Changed paths: packages/index/src/eval/extraction.ts, packages/index/src/eval/extraction-gold.test.ts, scripts/eval-extraction.mjs, scripts/eval/gold/, data/eval/extraction-thresholds.json, qa/contracts/extraction-scoring-harness.md, qa/manifests/d2-extraction-harness.md.

## Status: checked-PASS (qa/verdicts/d2-extraction-harness.md, cycle 0, 2026-11-25)
