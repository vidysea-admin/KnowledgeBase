# Verdict - d4-pairwise-judge
VERDICT: PASS
Cycle checked: 0
Policy-Version: proportional-verification/2026-11-22.19
TIER: L (floor from `tick.mjs --route a9bbeb98..69c9ef19`: rule "contracts", the range contains qa/contracts/pairwise-answer-judge.md; dual:false). The manifest said M, so a `tier-below-floor` low row was filed. Single checker, no dual trigger.
Base a9bbeb98 (merge-base with release/kb-golive verified). Head 69c9ef19, code 29e85be2.

## Check plan
- Contract identity: `git diff c32c8bbc 69c9ef19 -- qa/contracts/pairwise-answer-judge.md` is empty (0 bytes). No maker edit of the contract.
- Signals: logic changed (affected tests plus the falsification floor); LLM-judge prompt (no live model call allowed, so the prompt was read and its blindness tested through stub judges); no UI, no data artifact, no security/auth/tenancy/prod-write. Product diff is `scripts/eval/llm-eval.mjs` and its test only. One check type, so no sub-checkers (SERIAL: run one test node at a time, low memory).
- Diff-scope read (4c): whole-unit diff read. Changed files: llm-eval.mjs (+281/-3), llm-eval.test.mjs (+307, no removed lines, the 10 pre-existing tests untouched), the contract copy and the manifest. Nothing outside that scope.

## Evidence (re-run by me on 69c9ef19, bound tree clean)
- `node --test scripts/eval/llm-eval.test.mjs`: tests 32, pass 32, fail 0.
- Importers: human-calibration.test.mjs pass 4 fail 0; t022-offline-review.test.mjs pass 2 fail 0. eval-recall.mjs, eval-calibration.mjs and derived-drafts.mjs import only existing exports. The new bottom guard needs `--pairwise` AND argv[1] to be this file, so importing it never starts a run.
- `node scripts/eval/llm-eval.mjs`: no output, exit 0 (I1).
- No network, no model call, no pnpm install.

## Criteria (code read at HEAD, each also hit by a named test)
- C1 PASS. `buildPairwisePrompt` reads only question, answerA and answerB; id and any other field are never forwarded; the system prompt is generic; answer text is verbatim. The report `notes` carry the unscrubbed / style-cue caveat. Tests: D4J-C1 swap (same body), D4J-C1 notes, "pairwise blind prompt".
- C2 PASS. `judgePair` asks swapped=false then true; A or B only when both orders map to the same underlying side, else `inconsistent`; a throw, empty or unparseable reply is `error`, the second call is skipped, no retry. Tests: position-biased, prose, throws, one-order-prose, D4J-C2 empty reply, reply parsing.
- C3 PASS. `runPairwise` refuses anything but two judges, equal names, or equal model ids (same model under two names refused); the CLI path refuses equal ids too. The report names judgeModels, answerModels and judgeIsAnsweringModel, plus a note. Tests: D4J-C3, pairwise flags.
- C4 PASS. Per judge and combined counts A/B/tie/inconsistent/error; Wilson 95% (z 1.96) with the method string; the denominator text and the combined precedence rule are in the report and the printed summary; agreement, disagreement and inconsistency rates; `lowDecisive` when (A+B)*2 < n; n=0 gives null (undefined), never 50%. Tests: agree, disagree, wilson, file mode, empty list, D4J-C4 x2.
- C5 PASS. `parsePairwiseArgs` requires `--llm`, both judges and `--max-calls` (total), and reuses the unchanged `parseLlmArgs` validation. `pairwiseMain` refuses when items x judges x 2 > max-calls before any judge or client is created. Judges are created Ollama first, Gemini last (stable sort), each capped at items x 2, and the cap is checked before each call in `createPairwiseJudge`. No new provider. Tests: D4J-C5, pairwise flags, real-judge seam. Provider order is verified by code read only; no test pins it.
- C6 PASS. Stub-judge tests only, none uses a transport: always-first stub gives every item inconsistent, zero decided, undefined win rate; better-answer stub gives A/B in both orders; erroring stub gives error counts; disagreeing stubs give a disagreement rate; the swap test shows the same prompt body. The 10 pre-existing tests are untouched and green.
- I1 PASS. The guard runs only with `--pairwise`; the no-arg run is silent, exit 0; D4J-I1 child-process test.
- I2 PASS. `runPairwiseFile` and `pairwiseMain` both refuse an existing output path before any judge call; D4J-I2.

## Falsification and capability coverage
Method: two files copied to a scratch dir outside the bound root, node_modules junctioned, one copy per mutant; the bound tree was never edited. Green-before in the copy: `node --test --test-name-pattern "pairwise|D4J"` gave 22/22 pass. Each row is a single-hunk edit to llm-eval.mjs (a file in "What changed"):
| row | edit | after (of 22) | assertion that fired |
|---|---|---|---|
| C1 verbatim | `.trim()` on both answer texts | 21 pass / 1 fail | D4J-C1 swap ... answer text stays verbatim |
| C1 notes | PAIRWISE_NOTES = [] | 21/1 | D4J-C1 style-cues note |
| C2 | verdict = orders[0] | 19/3 | position-biased judge (+2 D4J-C4) |
| C3 | model-id comparison removed | 21/1 | D4J-C3 distinct model ids |
| C4 | denominator += inconsistent | 20/2 | D4J-C4 excluded-from-denominator (+ position-biased) |
| C5 | cap check `maxCalls * 99` | 21/1 | D4J-C5 cap is the total |
| I1 | guard no longer requires --pairwise | 21/1 | D4J-I1 |
| I2 | existing-file refusal removed in runPairwiseFile | 21/1 | D4J-I2 |
C6 is covered by the C2 and C4 reds (always-first stub, zero decided, undefined rate). Every claimed capability has a row and every edit went red on the test named for it. 9 edits in total; the manifest cites `mutant-cap-raise`. HEAD fidelity: `git hash-object` equals `git rev-parse HEAD:<file>` for both changed files; `git status` was clean before my verdict files.

## Not evidenced (stated)
Real model replies were not tried (no spend, no network, per the dispatch). The `{"winner": 1|2}` reply form against real Ollama or Gemini is the operator's 2-item smoke run in the manifest, not acceptance evidence here.

## Notes (EXPLANATION, not blocking)
- Wording: the `judgePair` doc comment says a disagreement is "counted as a tie"; the code and the contract keep `inconsistent` as its own bucket. Low.
- Manifest Tier M is below the L route floor (ISS-D4PAIRWISEJUDGE-001, low, type tier-below-floor).

ISSUES-WRITTEN: ISS-D4PAIRWISEJUDGE-001 (low, process; qa/issues.D4PAIRWISEJUDGE.jsonl)
full-suite trigger: none (no security/auth/tenancy, no prod write; script and its test only). Pre-push set: llm-eval.test.mjs plus the two importer tests plus a collect check.
HUMAN_GATE-REQUEST: none
Metrics: start=2026-11-25T12:20:00+05:30 end=2026-11-25T12:45:00+05:30 wall_min=25 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=1500 mutants=9 defects_unit=0 defects_6c=0
