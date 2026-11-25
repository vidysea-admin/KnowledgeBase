# Manifest — d4-pairwise-judge
**Contract:** none (plan unit D4, judge part, lane D; acceptance text approved by the owner in D-227; criteria ids D4J-a..D4J-d are the maker's reading of it)
**Goal task:** D4 (judge part)
**Date:** 2026-11-25
**Fix cycle:** 0
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (plan section 8)
**Executor rationale:** one-file evaluation script plus its test; no product runtime path.

## What changed
- `scripts/eval/llm-eval.mjs:11-13` — imports widened (`readFileSync`, `pathToFileURL`); nothing removed.
- `scripts/eval/llm-eval.mjs:177-` (appended, after `rankSessionsLlm`) — pairwise answer judge:
  `buildPairwisePrompt` (blind: reads only question/answerA/answerB, positions "Answer 1"/"Answer 2"),
  `parsePairwiseChoice`, `judgePair` (two orders, A/B only when both agree, else `inconsistent`; a throw or unparseable reply is `error`),
  `runPairwise` (two judges, per-judge and combined counts, agreement, inconsistency), `wilsonInterval` (95%, method named in output),
  `formatPairwiseSummary`, `loadPairwiseItems`/`validatePairwiseItems`, `runPairwiseFile` (items JSON in, report JSON out via the existing `writeResults`),
  `createPairwiseJudge` (wraps the EXISTING `complete(job)` seam, same `evaluator` job kind and same `capHit` cap-before-call rule),
  `parsePairwiseArgs` (each judge validated by the unchanged `parseLlmArgs`), `pairwiseMain` + a run-only-when-executed-directly guard.
- `scripts/eval/llm-eval.test.mjs:123-` (appended) — 13 tests, stub judges only. The existing 10 tests are untouched.
- No new module, no new client; model access is `createEvalComplete` as before. Existing exports and modes are unchanged.

## Verification scope
Policy-Version: proportional-verification/2026-11-22.19
Tier: M (evaluation script; no product runtime path, no auth, no data write)
Round: 2 files, 4 criteria, est 30 min — one script plus its test; stub judges; falsification in throwaway copies
Base / checked state: base a9bbeb98; code commit 96724caf; worktree clean on that SHA
Gate answers: none — grep of D:/KnowledgeBase/qa/gates/*.md for "llm-eval", "championship", "judge" found no `Answered:` line about this script (only unrelated uses of the word "judged").
Affected tests / full-suite trigger: scripts/eval/llm-eval.test.mjs (23 tests); importers of llm-eval.mjs run as well: scripts/eval/human-calibration.test.mjs, scripts/eval/t022-offline-review.test.mjs. No full suite, none needed.
Tests[D4J-a]: scripts/eval/llm-eval.test.mjs::"pairwise blind prompt: only the question and 'Answer 1'/'Answer 2'; no id, source, session, speaker or side label" — leak markers in id/source/sessionId/speakerName/side never reach either order's prompt; position of answerA flips with `swapped`
Tests[D4J-b]: scripts/eval/llm-eval.test.mjs::"pairwise: two judges agree ...", "pairwise: judges disagree ...", "pairwise: a position-biased judge ...", "pairwise: a judge that answers in prose ...", "pairwise: a judge call that throws ...", "pairwise: one order parses and the other is prose ..." — each (item, judge) is asked twice in opposite orders; A/B only on agreement; prose/throw is `error`
Tests[D4J-c]: scripts/eval/llm-eval.test.mjs::"pairwise: two judges agree ..." (counts, win rate 0.75, Wilson 95% bounds, method string, agreement, inconsistency), "pairwise wilson interval ...", "pairwise file mode ..." (report JSON on disk plus printed summary), "pairwise: an empty item list ..."
Tests[D4J-d]: scripts/eval/llm-eval.test.mjs::"pairwise: a position-biased judge (always answer 1) ..." (100% inconsistent, win rate null, not 0.5), plus the 10 pre-existing tests green unchanged; all stub judges, no transport and no network in any pairwise test
Falsification[D4J-a]: golden "pairwise blind prompt" green@96724caf, red on a copy whose prompt adds `Ref ${item.id}` (AssertionError: SESSION-0042)
Falsification[D4J-b]: golden "pairwise: a position-biased judge" green@96724caf, red on a copy whose verdict is `orders[0]` (no agreement check)
Falsification[D4J-c]: golden "pairwise: judges disagree" green@96724caf, red on a copy whose combined win-rate denominator also counts ties
Falsification[D4J-d]: golden "pairwise: a position-biased judge" green@96724caf, red on a copy whose n=0 interval returns rate 0.5 (also reddens 4 other tests that assert undefined rates)
Pre-check[D4J-a]: 96724caf node --test --test-name-pattern "pairwise blind prompt" scripts/eval/llm-eval.test.mjs -> PASS exit 0 (1 test) t=1 blobs=scripts/eval/llm-eval.test.mjs:aa76faf
Pre-check[D4J-b]: 96724caf node --test --test-name-pattern "position-biased|judges agree|judges disagree|prose|throws|one order" scripts/eval/llm-eval.test.mjs -> PASS exit 0 (7 tests) t=1 blobs=scripts/eval/llm-eval.test.mjs:aa76faf
Pre-check[D4J-c]: 96724caf node --test --test-name-pattern "judges agree|judges disagree|wilson|file mode|empty item" scripts/eval/llm-eval.test.mjs -> PASS exit 0 (5 tests) t=1 blobs=scripts/eval/llm-eval.test.mjs:aa76faf
Pre-check[D4J-d]: 96724caf node --test scripts/eval/llm-eval.test.mjs -> PASS exit 0 (23 of 23 tests) t=2 blobs=scripts/eval/llm-eval.test.mjs:aa76faf
mutant-cap-raise: the unit brief requires exactly one named falsification per criterion, 4 criteria
Metrics: start=2026-11-25T11:55:00+05:30 end=2026-11-25T12:45:00+05:30 wall_min=50 agent_min=unavailable blocked_min=4 suite_runs=0 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=2 mutants=4 defects_unit=0 defects_6c=0

Design notes for the checker (decisions the criteria text left open):
- `tie` equals the inconsistent count at judge level, because a judge may answer only A or B (an explicit "tie" reply is unparseable, so `error`). At combined level `tie` = any non-error item without a unanimous A or B, so it also includes two judges choosing opposite sides; `inconsistent` there = items where either judge was position-inconsistent (a subset of `tie`).
- Win rate = A / (A + B), over decided items only; Wilson score interval, z = 1.96; all numbers are null (printed "undefined") when A + B = 0.
- Agreement rate = items where both judges are decisive and choose the same side, over items where both are decisive. Inconsistency rate = inconsistent / (items - errors), per judge and pooled.
- After the first order of a pair errors, the second call is not made (saves spend); the pair is `error`.
- The answers text itself is not scrubbed: if an answer quotes a speaker name or says "as the expert", the judge sees it. Building the items file blind is the producer's job (the 92-answer unit).

## How to verify (commands + expected)
- `node --test scripts/eval/llm-eval.test.mjs` (from the worktree root) -> expected: tests 23, pass 23, fail 0
- `node --test scripts/eval/human-calibration.test.mjs` and `node --test scripts/eval/t022-offline-review.test.mjs` -> expected: fail 0
- `node scripts/eval/llm-eval.mjs` -> expected: usage line, exit 2 (importing the module never starts a run)

## Actual outputs (from maker's own run)
```
$ node --test scripts/eval/llm-eval.test.mjs        (on 96724caf; node_modules from pnpm install --frozen-lockfile --prefer-offline, run once)
✔ flags: without --llm nothing is enabled; --llm needs a model and a cap
... (the 9 other pre-existing tests pass)
✔ pairwise: two judges agree - A wins 3 of 4, each (item,judge) asked twice in opposite orders, CI named
✔ pairwise: judges disagree - opposite preferences give A vs B per judge, a combined tie, agreement 0
✔ pairwise: a position-biased judge (always answer 1) is 100% inconsistent, win rate undefined (never 50%)
✔ pairwise: a judge that answers in prose instead of a choice is an error, never a win for either side
✔ pairwise: a judge call that throws is an error for that item only, and the run completes
✔ pairwise: one order parses and the other is prose - error, not inconsistent and not a win
✔ pairwise: an empty item list gives zero counts and undefined rates, makes no judge call, and does not throw
✔ pairwise blind prompt: only the question and 'Answer 1'/'Answer 2'; no id, source, session, speaker or side label
✔ pairwise reply parsing: JSON winner 1 or 2 only; prose, tie, out-of-range and missing are undefined
✔ pairwise wilson interval: known values, n=0 undefined, bounds stay within [0,1]
✔ pairwise file mode: reads items JSON, writes the report JSON with the method and prints a summary; bad items are refused
✔ pairwise flags: needs a file, two provider:model judges and a call cap; reuses the --llm validation
✔ pairwise real-judge seam: createPairwiseJudge sends the blind prompt through the existing complete(job), counts calls, honours the cap
ℹ tests 23   ℹ pass 23   ℹ fail 0     t=2

$ node --test scripts/eval/human-calibration.test.mjs     -> ℹ tests 10  ℹ pass 4  ℹ fail 0
$ node --test scripts/eval/t022-offline-review.test.mjs   -> ℹ tests 10  ℹ pass 2  ℹ fail 0
$ node scripts/eval/llm-eval.mjs                          -> usage: node scripts/eval/llm-eval.mjs --pairwise <items.json> ...   exit=2

Before the change (base, no pnpm install yet): 5 of the 10 pre-existing tests failed with ERR_MODULE_NOT_FOUND '@lkb/ai'
(the worktree had no node_modules). After the install: 10 of 10 pass. The pairwise tests never touch @lkb/ai.

Falsification, each in a throwaway copy under %TEMP%/falsify-* (tsx register line stripped in the copy; worktree never edited); same node ids:
D4J-a  before: pass 13 fail 0   after: pass 12 fail 1   ✖ pairwise blind prompt ...   AssertionError: SESSION-0042
D4J-b  before: pass 13 fail 0   after: pass 12 fail 1   ✖ pairwise: a position-biased judge ...   deepStrictEqual on counts
D4J-c  before: pass 13 fail 0   after: pass 11 fail 2   ✖ pairwise: judges disagree ... (and position-biased)   strictEqual rate null
D4J-d  before: pass 13 fail 0   after: pass 8  fail 5   ✖ pairwise: a position-biased judge ... (and 4 more asserting undefined rates)
```

## Capability coverage (each new claim -> its isolating falsification)
| Criterion | capability | the check that covers it | the falsifying edit | observed |
|---|---|---|---|---|
| D4J-a | the prompt is blind: only question and "Answer 1"/"Answer 2" | test "pairwise blind prompt" | prompt template also prints `item.id` | green before (13/13 pairwise-pattern tests), red after: `AssertionError: SESSION-0042` |
| D4J-b | order swap; A/B only when both orders agree, else inconsistent | test "pairwise: a position-biased judge" | verdict taken from the first order only | green before, red after: counts deepEqual fails (A/B instead of inconsistent) |
| D4J-c | win rate over decided items (A+B), Wilson 95% CI, undefined when none | test "pairwise: judges disagree" | denominator also counts ties | green before, red after: `rate` strictEqual null fails |
| D4J-d | position-biased judge -> win rate undefined, not 50% | test "pairwise: a position-biased judge" | n=0 interval returns 0.5 | green before, red after: win-rate null assertion fails |

## Operator steps (not run)
No model was called and nothing was written under data/. When the 92 pairs exist (a JSON file of `{id, question, answerA, answerB}`, sides assigned blind by whoever builds it, keeping the side key out of the file):
```
node scripts/eval/llm-eval.mjs --pairwise <items.json> --judge-1 ollama:<model-1> --judge-2 gemini:<model-2> --max-calls 184 --out data/eval/results/pairwise-<date>.json
```
Needs `OLLAMA_API_KEY` and `GEMINI_API_KEY` in the environment (not read from files here). 92 items x 2 orders = 184 calls per judge, 368 in all; `--max-calls` applies per judge and the run is refused if it is below 184. Spend approval for a real run is the owner's (D-164 covers Ollama Cloud then Gemini; confirm for this use). Judge models must differ from the model that wrote the AI answers where possible.

## Live browser evidence
Not UI-touching — no surface changed (changed paths: scripts/eval/llm-eval.mjs, scripts/eval/llm-eval.test.mjs).

## Status: ready-for-check
