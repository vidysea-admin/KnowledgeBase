# Verdict — d2-extraction-harness (Mode A, cycle 0)
Date: 2026-11-25 · Bound root: D:/KnowledgeBase/.worktrees/d2-extraction-harness · Branch wave/d2-extraction-harness · Head 8190a0a2 · Base a9bbeb98 (= `git merge-base HEAD release/kb-golive`, verified)
Cycle checked: 0
Policy: proportional-verification/2026-11-22.19 (manifest pin equals the dispatch pin; no difference)
Contract: qa/contracts/extraction-scoring-harness.md, byte for byte the c32c8bbc version (`ed501202...` on both sides, checked with `git rev-parse`). Contract criteria D2H-C1..C6, I1, I2 confirmed in the file itself.

## Check plan (step 0)
- Diff: one library function, one CLI mode, one JSON thresholds file, two test files, two fixtures, the brought-in contract. No UI, no auth, no tenancy, no write path, no network. No `qa/adapter.json` in the root, so the default coding adapter applies.
- Floor recompute: `tick.mjs --route a9bbeb98..8190a0a2 --root <bound root>` printed `floor: L, dual: false`, with a single rule fired (`qa/contracts/` in the diff). Tier L, one checker; no dual trigger. The manifest's tier is equal to the floor.
- Routed checks: scoped affected tests; 8 falsifications in throwaway copies; step 4c diff scope; data-artifact read of the thresholds file and fixtures (metric definitions are part of the claim under D2H-C5); independent CLI probes; differential replay against the base. No persona walk, no Mode D (no UI path changed). One independent check type with SERIAL execution (memory is tight), so no sub-checkers were spawned: `SERIAL: no spawn needed, one test process at a time`.

TIER: L (floor from `qa/contracts/extraction-scoring-harness.md` in the diff; no product-code trigger raised it)

## Evidence (re-run by me, never pasted)
- `node --test scripts/eval/gold/eval-extraction.test.mjs` -> 15 pass, 0 fail.
- `node --test --import tsx` on extraction-gold.test.ts + corpus-reconcile.test.ts + topic-run-evidence.test.ts -> 23 pass, 0 fail (the existing consumers of `evaluateExtractionCase` stay green; function body unchanged).
- `tsc --noEmit -p packages/index/tsconfig.json` -> exit 0; `lint-dirsize` -> OK.
- CLI as the manifest says: `--gold <fixture> --thresholds data/eval/extraction-thresholds.json` -> `bar: proposed`, `verdict: meets-proposed-bar`, `acceptanceForG14: false`, `measurementOfRealCorpus: false`, exit 0; without `--thresholds` -> `bar: none`, `verdict: no-bar`, exit 0.
- Own probes on variants of the fixture (scratch, outside the bound root; evidence in qa/evidence/d2-extraction-harness/): a missing cited turn -> fabricatedCitations 1/4 and machineChecked 0.75 miss, exit 1; an `unsupported` label -> claimSupport 0.75 misses, exit 1; a predicted decision on a no-decision session -> falseDecisions 1 misses, exit 1; decision inputs removed -> three metrics `not-measured` (value null, reason set), exit 3, never 0 or 100; one expected fact unlabelled -> factCoverage `not-measured` (`unlabelled-expected-facts:2`), exit 3; `synthetic` removed from the gold -> `measurementOfRealCorpus: true`; approved bar with real gold -> `acceptanceForG14: true`; approved bar with the synthetic gold -> `acceptanceForG14: false`.
- Replay regression differential: the same `--input` manifest run through the base script (git archive of a9bbeb98) and the HEAD script gives byte-identical stdout (`cmp`), and equals `replay-expected.json`. The diff to the replay path is the one added `--gold` route line.
- Exporting tool cited for C1 verified: `ExtractionExport` in apps/api/src/extraction-review/types.ts:33-37 (`format 'extraction-authorized-export-v1'`, `cases: ExtractionCase[]`), route `GET /extraction-review/export` at router.ts:23.

## Criteria
- D2H-C1 met: every metric prints numerator, denominator, value, `measured`; synthetic fixture labelled (`synthetic: true`, `measurementOfRealCorpus: false`); no `--gold` path unchanged (differential above).
- D2H-C2 met: bar read from the file (`status` printed as `bar:`); thresholds file ships `proposed`; no number in code (only `GOLD_METRICS` kinds); the C2 falsification test changes a number and the exit code flips; `bar: none` and `no-bar` without the flag.
- D2H-C3 met: absent input or zero denominator gives `not-measured`, `value: null`; fails the run only for a `required` metric, with exit 3 and the metric's `reason`. See note 1.
- D2H-C4 met: agreement numerator/denominator, `doubleLabelled` count and the measure string; `not-measured` with no second labels.
- D2H-C5 met: the manifest has one definition line per metric (plus the reviewerAgreement line) and they match `GOLD_METRICS` and the code I read at extraction.ts:187-242 (pooled sums; factCoverage numerator `seenFacts - omitted` equals the covered labels; machineChecked `rows - affectedClaims`; recall counts gold ids found among predicted ids). The CLI prints every definition and a test pins the `numerator = ...; denominator = ...` format.
- D2H-C6 met: 15 + 23 tests green; replay byte-identical.
- D2H-I1 met: the script's imports are `node:*`, the local eval module and `tsx/esm/api`; no network, db, dotenv, `process.env` or fetch in the gold path (read at eval-extraction.mjs:135-181).
- D2H-I2 met: the gold path only calls `readFileSync`/`statSync`; the I2 test shows byte-identical files.

## Capability coverage (step 4b): 8/8 rows reproduced
Each row ran in its own copy built from `git archive HEAD` (post-change state, not a baseline), with junctions to the bound tree's node_modules, a single named test selection, green before the edit in the copy, then red after a single-hunk single-file edit (each `from` string occurred exactly once; the copy's file blob equalled the HEAD blob before the edit). The bound tree was never edited (`git status` clean, the product file blobs equal HEAD).
| Row | Before (in the copy) | After the edit | Assertion that fired |
|---|---|---|---|
| D2H-C1 extraction.ts fabricated numerator -> 0 | package 1/1 pass, CLI 1/1 pass | both red | `expected: [1, 4]` in the C1 falsification tests |
| D2H-C2 eval-extraction.mjs `m.value >= t.min` -> `>= 0` | 1/1 pass | red | exit code expected 1 in "C2 falsification: changing one number" |
| D2H-C3 extraction.ts `reason \|\| !b ?` -> `reason ?` | package 2/2, CLI 2/2 | package 1 fail, CLI 2 fail | `topicsRecall`/`decisionsPrecision` expected `measured: false` |
| D2H-C4 extraction.ts `Number(status === f.status)` -> `1` | 1/1, 1/1 | both red | agreement `[1, 2, 2, 0.5]` expected |
| D2H-C5 extraction.ts topicsRecall definition -> "topic recall" | 1/1 | red | "D2H-C5 pinned definition for topicsRecall" |
| D2H-C6 eval-extraction.mjs replay indent 2 -> 4 | 1/1 | red | stdout not byte-identical to the recorded output |
| D2H-I1 add `import "node:https"` | 1/1 | red | the import allow-list assertion |
| D2H-I2 add a `writeFileSync` of the gold file | 1/1 | red | sha of gold file changed |
Raw result: qa/evidence/d2-extraction-harness/checker-falsification-result.json. No cell was a shell command, a conftest/fixture edit or multi-file edit, so no CONTRACT_MISMATCH. The manifest claims no capability that lacks a row.

## Diff scope (step 4c)
`git diff a9bbeb98 --name-status`: 8 added and 2 modified files, no file deleted or renamed. The two modified files (extraction.ts, eval-extraction.mjs) only gain lines, except the header comment line and the import line that now names `scoreGoldSet`, `GOLD_METRICS`. Every changed path is listed in the manifest's "What changed". `evaluateExtractionCase` and `aggregateExtractionReports` are unchanged.

## Notes (EXPLANATION material, not ledger rows)
1. C3 says a not-measured metric fails the run "only if" the file marks it required. The code also exits 3 when no thresholded metric was measured at all, even with none required. The manifest discloses this; it protects the "never a pass on an empty set" intent and does not occur with the shipped file (all required). Strictly it is wider than the contract sentence, so the owner may want that line amended at the next contract sweep.
2. `acceptanceForG14` is true for an approved bar on any gold file that lacks `synthetic: true`; it does not read `humanGoldVerified`, and the real export always carries `humanGoldVerified: false` (types.ts:36). The contract does not ask for that gate; stated here so the G14 owner knows approval of the bar is the only gate in the tool.
3. `scripts/eval/gold/eval-extraction.test.mjs` is not wired into any root test script (the manifest says so). Judged low, not a finding against the criteria.
4. The export carries no gold topic ids, decisions, reviewer ids or second labels, so a real export gives `not-measured` for those metrics until that data is supplied (manifest says the same).

VERDICT: PASS
SCOREBOARD: 6/6 criteria met, 2/2 invariants hold
TIER: L (floor from qa/contracts/extraction-scoring-harness.md in the diff, `tick.mjs --route` floor L, dual false)
FAILURES: none
CAPABILITY-COVERAGE: 8/8 rows reproduced
LIVE-BROWSER: not-applicable (no UI path changed: packages/index/src/eval/extraction.ts, scripts/eval-extraction.mjs, data/eval/extraction-thresholds.json, tests and fixtures)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every criterion and invariant is evidenced by my own runs: 38 affected tests green, replay byte-identical to the base, each metric moved by a targeted probe, and all 8 falsifications red in the intended assertion in isolated copies. Note 1 (exit 3 on a wholly unmeasured bar) is a disclosed, safe widening of C3; notes 2 to 4 are observations for the owner.
HUMAN_GATE-REQUEST: none required for the merge; the proposed thresholds and the C5 definitions still need Umesh's approval before any run can count for G14 (contract out-of-scope item).
Metrics: start=2026-11-25T07:48:58Z end=2026-11-25T07:56:00Z wall_min=7 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=8 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=420 mutants=0 defects_unit=0 defects_6c=0
