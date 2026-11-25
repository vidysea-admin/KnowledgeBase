# Manifest — d4-pairwise-judge
**Contract:** qa/contracts/pairwise-answer-judge.md (D4J-C1, C2, C3, C4, C5, C6; invariants D4J-I1, I2; brought in unchanged from c32c8bbc)
**Goal task:** D4 (judge part)
**Date:** 2026-11-25
**Fix cycle:** 0
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (plan section 8)
**Executor rationale:** one-file evaluation script plus its test; no product runtime path.

## What changed
- the adopted contract file named on the Contract line — copied from c32c8bbc by `git checkout c32c8bbc -- <file>`, never edited (commit 5d03f8a0).
- `scripts/eval/llm-eval.mjs` (header comment, imports) — pairwise is opt-in, runs only with `--pairwise`; `existsSync` imported; nothing removed.
- `scripts/eval/llm-eval.mjs` (appended pairwise block, after `rankSessionsLlm`) — `buildPairwisePrompt`, `parsePairwiseChoice`, `judgePair`, `runPairwise`, `wilsonInterval`, `formatPairwiseSummary`, `loadPairwiseItems`/`validatePairwiseItems`, `runPairwiseFile`, `createPairwiseJudge`, `parsePairwiseArgs`, `pairwiseMain`, and a guard that runs only when the file is executed with `--pairwise`. Model access is the existing `createEvalComplete` -> `complete(job)` seam; no new client or provider.
- Follow-up after the contract (commit 29e85be2), the places where the earlier D4J-a..d reading differed:
  - tie/inconsistent/error are separate buckets and all excluded from the win-rate denominator (A + B); the denominator text and the combined precedence rule (error > inconsistent > A/B > tie) are in the report and the printed summary (C4);
  - `lowDecisive` label per judge and combined, plus `disagreementRate` (C4, C6);
  - two judges must have distinct model ids, `judgeModels`/`answerModels`/`judgeIsAnsweringModel` reported (C3);
  - the report carries a note that verbatim answer text is unscrubbed and style cues can unblind a judge (C1);
  - `--llm` is required, `--max-calls` is the TOTAL and the run is refused when items x judges x 2 exceeds it; Ollama judge is created before Gemini (C5);
  - running the script with no `--pairwise` does nothing, as before (I1); an existing output file is refused before any judge call (I2).
- `scripts/eval/llm-eval.test.mjs` — the 10 pre-existing tests untouched; 22 pairwise tests appended (13 earlier, edited where behaviour was aligned to the contract, plus 9 contract tests named D4J-C1..I2).

## Verification scope
Policy-Version: proportional-verification/2026-11-22.19
Tier: M (evaluation script; no product runtime path, no auth, no data write)
Round: 2 files, 8 criteria, est 25 min — follow-up alignment to the adopted contract; stub judges only
Base / checked state: base a9bbeb98; contract commit 5d03f8a0; code commit 29e85be2; test blob 5ad1c20
Gate answers: none — grep of qa/gates/*.md for "llm-eval", "championship", "judge" found no `Answered:` line about this script.
Affected tests / full-suite trigger: scripts/eval/llm-eval.test.mjs (32 tests); importers: scripts/eval/human-calibration.test.mjs, scripts/eval/t022-offline-review.test.mjs. No full suite.
Tests[C1]: scripts/eval/llm-eval.test.mjs::"D4J-C1 ... swapping which side holds which text gives the same prompt body; answer text stays verbatim", "D4J-C1 ... the report notes that style cues ...", "pairwise blind prompt ..." — no id/source/session/speaker/side field reaches the prompt; sides swapped gives an identical prompt; text verbatim
Tests[C2]: "pairwise: a position-biased judge ...", "... prose instead of a choice ...", "... call that throws ...", "... one order parses and the other is prose ...", "D4J-C2 ... an empty reply is an error and is not retried", "pairwise reply parsing ..." — both orders must agree; failed, empty or unparseable reply is `error`; no retry
Tests[C3]: "D4J-C3 ... two judges must have distinct model ids ...", "pairwise flags ..." — same model under two names refused (library and CLI); judge models and answering models named; overlap flagged
Tests[C4]: "pairwise: two judges agree ...", "pairwise: judges disagree ...", "pairwise wilson interval ...", "pairwise file mode ...", "pairwise: an empty item list ...", "D4J-C4 ... excluded from the win-rate denominator ...", "D4J-C4 ... low-decisive; disagreement rate ..." — counts, Wilson 95% CI with method, denominator and combined rule named, low-decisive label
Tests[C5]: "D4J-C5 pairwise flags: --llm is required; the cap is the total ...", "pairwise flags ...", "pairwise real-judge seam ..." — `--llm` and total `--max-calls` required; 3 items x 2 judges x 2 = 12 planned calls refused at cap 11 before anything is created; cap-before-call on the judge seam
Tests[C6]: scripts/eval/llm-eval.test.mjs (whole file, 32 tests) — 10 pre-existing green and unchanged; always-first stub -> every item inconsistent, zero decided, win rate undefined; follow-the-better stub gives A/B in both orders; erroring stub gives `error` counts; disagreeing stubs give a disagreement rate; swap test for prompt text. No pairwise test uses a transport or network.
Tests[I1]: "D4J-I1 pairwise: running the script directly without --pairwise does nothing, as before" — child process, empty output, exit 0
Tests[I2]: "D4J-I2 pairwise: an existing output file is never overwritten, and the refusal happens before any judge call"
Falsification[C1]: golden "D4J-C1 ... swapping which side holds which text ..." green@29e85be2, red on a copy that trims the answer text; golden "D4J-C1 ... style cues" red on a copy without the note
Falsification[C2]: golden "pairwise: a position-biased judge" green@29e85be2, red on a copy whose verdict is `orders[0]` (recorded in the first round, behaviour unchanged; re-run on this SHA)
Falsification[C3]: golden "D4J-C3 ... distinct model ids" green@29e85be2, red on a copy with the model-id comparison removed
Falsification[C4]: golden "D4J-C4 ... excluded from the win-rate denominator" green@29e85be2, red on a copy whose denominator also counts inconsistent
Falsification[C5]: golden "D4J-C5 ... total ..." green@29e85be2, red on a copy that multiplies the cap by 99 in the planned-call check
Falsification[C6]: the C2 and C4 mutants also redden "pairwise: a position-biased judge" (always-first stub, zero decided, undefined win rate)
Falsification[I1]: golden "D4J-I1" green@29e85be2, red on a copy whose guard no longer requires `--pairwise` (prints usage, exit 2)
Falsification[I2]: golden "D4J-I2" green@29e85be2, red on a copy without the existing-file refusal
Pre-check[C1]: 29e85be2 node --test --test-name-pattern "D4J-C1|pairwise blind prompt" scripts/eval/llm-eval.test.mjs -> PASS exit 0 (3 tests) t=1 blobs=scripts/eval/llm-eval.test.mjs:5ad1c20
Pre-check[C2]: 29e85be2 node --test --test-name-pattern "position-biased|prose|throws|one order|D4J-C2|pairwise reply parsing" scripts/eval/llm-eval.test.mjs -> PASS exit 0 (6 tests) t=1 blobs=scripts/eval/llm-eval.test.mjs:5ad1c20
Pre-check[C3]: 29e85be2 node --test --test-name-pattern "D4J-C3|pairwise flags" scripts/eval/llm-eval.test.mjs -> PASS exit 0 (3 tests) t=1 blobs=scripts/eval/llm-eval.test.mjs:5ad1c20
Pre-check[C4]: 29e85be2 node --test --test-name-pattern "judges agree|judges disagree|wilson|file mode|empty item|D4J-C4" scripts/eval/llm-eval.test.mjs -> PASS exit 0 (7 tests) t=1 blobs=scripts/eval/llm-eval.test.mjs:5ad1c20
Pre-check[C5]: 29e85be2 node --test --test-name-pattern "D4J-C5|pairwise flags|real-judge" scripts/eval/llm-eval.test.mjs -> PASS exit 0 (3 tests) t=1 blobs=scripts/eval/llm-eval.test.mjs:5ad1c20
Pre-check[C6]: 29e85be2 node --test scripts/eval/llm-eval.test.mjs -> PASS exit 0 (32 of 32 tests) t=2 blobs=scripts/eval/llm-eval.test.mjs:5ad1c20
Pre-check[I1]: 29e85be2 node --test --test-name-pattern "D4J-I1" scripts/eval/llm-eval.test.mjs -> PASS exit 0 (1 test) t=1 blobs=scripts/eval/llm-eval.test.mjs:5ad1c20
Pre-check[I2]: 29e85be2 node --test --test-name-pattern "D4J-I2" scripts/eval/llm-eval.test.mjs -> PASS exit 0 (1 test) t=1 blobs=scripts/eval/llm-eval.test.mjs:5ad1c20
mutant-cap-raise: the contract has 8 ids (6 criteria, 2 invariants) and the brief requires one named falsification per changed criterion
Metrics: start=2026-11-25T11:55:00+05:30 end=2026-11-25T13:10:00+05:30 wall_min=75 agent_min=unavailable blocked_min=4 suite_runs=0 repeat_runs=0 mutations=12 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=2 mutants=12 defects_unit=0 defects_6c=0

Design notes for the checker (decisions the contract left open):
- Judge-level `tie` is always 0, because a judge may only answer A or B; an explicit "tie" reply is unparseable and so `error`. At combined level `tie` = both judges decisive but on opposite sides.
- Combined win rate = A / (A + B) over items where both judges chose the same side; opposite-side items are `tie` and excluded from the denominator (stated in the output). Judge-level win rate = A / (A + B) per judge.
- Wilson score interval, z = 1.96, chosen for small n; every number is null (printed "undefined") when A + B = 0. Low-decisive = fewer than half the items decided (A + B < n / 2), false for an empty list.
- Agreement rate = same side, over items where both judges are decisive; disagreement rate is its complement over the same items. Inconsistency rate = inconsistent / (items - errors), per judge and pooled.
- After the first order of a pair fails, the second call is not made; nothing is ever retried.
- `--max-calls` is the total for the run. Each judge is created with a cap of items x 2 so the total cannot exceed it; the Ollama judge is created and run first, Gemini last (D-164 order; both providers are the existing two, no new one).
- Answering models: from `--answer-model-a/-b` or a top-level `answerModels` in the items file; only the report sees them, never a prompt.
- A re-run with the same `--out` is refused; the default `--out` is dated, so two default runs on one day need an explicit `--out`.

## How to verify (commands + expected)
- `node --test scripts/eval/llm-eval.test.mjs` (worktree root) -> expected: tests 32, pass 32, fail 0
- `node --test scripts/eval/human-calibration.test.mjs` and `node --test scripts/eval/t022-offline-review.test.mjs` -> expected: fail 0
- `node scripts/eval/llm-eval.mjs` -> expected: no output, exit 0

## Actual outputs (from maker's own run, on 29e85be2)
```
$ node --test scripts/eval/llm-eval.test.mjs
ℹ tests 32   ℹ pass 32   ℹ fail 0     t=2
(10 pre-existing tests, 22 pairwise tests incl. D4J-C1, C2, C3, C4 x2, C5, I1, I2)
$ node --test scripts/eval/human-calibration.test.mjs    -> ℹ pass 4  ℹ fail 0
$ node --test scripts/eval/t022-offline-review.test.mjs  -> ℹ pass 2  ℹ fail 0
$ node scripts/eval/llm-eval.mjs                         -> (no output) exit=0

Falsification, throwaway copies under %TEMP%/falsify2-* (tsx register line stripped in the copy; worktree never edited), pattern "pairwise|D4J", 22 tests:
C1 verbatim   before pass 22 fail 0  after pass 21 fail 1  ✖ D4J-C1 ... swapping which side holds which text ...
C1 notes      before pass 22 fail 0  after pass 21 fail 1  ✖ D4J-C1 ... style cues ...
C2            before pass 22 fail 0  after pass 19 fail 3  ✖ pairwise: a position-biased judge (and two D4J-C4 tests)
C3            before pass 22 fail 0  after pass 21 fail 1  ✖ D4J-C3 ... distinct model ids
C4 denominator before pass 22 fail 0 after pass 20 fail 2  ✖ position-biased; ✖ D4J-C4 ... excluded from the win-rate denominator
C5 cap        before pass 22 fail 0  after pass 21 fail 1  ✖ D4J-C5 ... the cap is the total
I1            before pass 22 fail 0  after pass 21 fail 1  ✖ D4J-I1 ... does nothing, as before
I2            before pass 22 fail 0  after pass 21 fail 1  ✖ D4J-I2 ... never overwritten
```

## Capability coverage (each new claim -> its isolating falsification)
| Criterion | capability | the check that covers it | the falsifying edit | observed |
|---|---|---|---|---|
| C1 | blind prompt, answer text verbatim, unblinding caveat reported | "D4J-C1 ... same prompt body ...", "D4J-C1 ... style cues", "pairwise blind prompt" | trim the answer text / drop the note | green before, red after: the named D4J-C1 test (22 -> 21 pass) |
| C2 | order swap; A/B only when both orders agree; error never a win, no retry | "pairwise: a position-biased judge", "D4J-C2 ..." | verdict from the first order only | green before, red after: position-biased counts deepEqual (22 -> 19 pass) |
| C3 | two distinct judge model ids; answering model named, overlap flagged | "D4J-C3 ..." | remove the model-id comparison | green before, red after: D4J-C3 (22 -> 21 pass) |
| C4 | counts, Wilson CI, denominator A+B with inconsistent/error excluded, combined rule, low-decisive | "D4J-C4 ..." (2 tests) | denominator also counts inconsistent | green before, red after: D4J-C4 excluded-denominator (22 -> 20 pass) |
| C5 | `--llm` and total `--max-calls` gate; refusal over items x judges x 2 | "D4J-C5 ..." | multiply the cap by 99 in the planned-call check | green before, red after: D4J-C5 (22 -> 21 pass) |
| C6 | stub judges, no network, existing tests unchanged | whole test file | the C2 and C4 mutants (always-first stub test) | red after on the position-biased test |
| I1 | no `--pairwise`: script does nothing | "D4J-I1 ..." | guard no longer requires `--pairwise` | green before, red after (22 -> 21 pass) |
| I2 | output file never overwritten | "D4J-I2 ..." | remove the existing-file refusal | green before, red after (22 -> 21 pass) |

## Operator steps (not run)
No model was called and nothing was written under data/. Needs `OLLAMA_API_KEY` and `GEMINI_API_KEY` in the environment, and the owner's spend approval for this use (D-164 covers Ollama Cloud, then Gemini). Offline checks cannot show that real model replies come back in the `{"winner": 1|2}` form the parser accepts; a 2-item smoke run with a cap of 8 would show it. For the 92 pairs (a JSON file `{"answerModels": {"A": "<id>", "B": "human"}, "items": [{id, question, answerA, answerB}, ...]}`, sides assigned blind by whoever builds it, the side key kept out of the file):
```
node scripts/eval/llm-eval.mjs --pairwise <items.json> --llm --judge-1 ollama:<model-1> --judge-2 gemini:<model-2> --max-calls 368 --out data/eval/results/pairwise-<date>.json
```
92 items x 2 judges x 2 orders = 368 planned calls; the run is refused if `--max-calls` is lower. Choosing the judge models is out of scope (the contract); the two ids must differ.

## Live browser evidence
Not UI-touching — no surface changed (changed paths: scripts/eval/llm-eval.mjs, scripts/eval/llm-eval.test.mjs, the contract copy, this manifest).

## Status: checked-PASS (qa/verdicts/d4-pairwise-judge.md, cycle 0, 2026-11-25)
