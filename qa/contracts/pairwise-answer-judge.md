# Contract — pairwise-answer-judge (unit D4, D-227)

> Status: adopted by /checker 2026-11-25. Authority: D-227; plan section 7 lane D D4; D-164 (spend and provider order for opt-in LLM eval). Scope: `scripts/eval/llm-eval.mjs` (new pairwise mode) and its tests.
> Owner's words: "two model judges, blind and order-swapped (`scripts/eval/llm-eval.mjs` extended with a pairwise prompt); output = win rate with a confidence interval."
> Path note (D-237, 2026-11-25; the owner's words above are not reworded): on branch `release/kb-golive`, after the structure-lint repair, the pairwise judge and its command line live in `scripts/eval/pairwise/pairwise-judge.mjs`, which imports one way from `../llm-eval.mjs`; `scripts/eval/llm-eval.mjs` keeps the base evaluation only. Wherever a line of this contract says `scripts/eval/llm-eval.mjs` for the pairwise code (the Scope line, the owner's words, the D4J-I1 wording "`llm-eval.mjs` behaves exactly as today" read as: the base evaluation is unchanged), it means the new path on that branch. The criteria themselves do not change. The move exists only on `release/kb-golive` until it merges, so the old path stays true on every other branch; the repair's own checks are in `structure-lint-repair.md` (SL-3, SL-4).
> Feeds launch row G16 (`go-live-acceptance.md`). Not `evaluator-calibration.md` (that is the node-relevance scorer).

## Criteria
- **[D4J-C1] Pairwise input.** A pairwise mode takes items `{id, question, answerA, answerB}`. The judge prompt carries no field, label, header or metadata that says which side is the AI or the human, and no
  provenance (system name, run id). Answer text is passed verbatim, unscrubbed: names, session titles and citations inside an answer are content under judgement, not provenance. The report notes that
  style cues in verbatim text can unblind a judge; it does not strip them.
- **[D4J-C2] Order swap.** Every (item, judge) is asked twice with the sides swapped. The result is A or B only when both orders agree on the same underlying answer; otherwise `inconsistent`. A failed, empty
  or unparseable reply is `error`, never a win and never silently retried into a win.
- **[D4J-C3] Two judges.** At least two judges of distinct model ids are required and named in the output; one model run twice is refused. The output also names the model that wrote answerA/answerB when
  supplied, and flags a judge identical to an answering model (reported, not a failure).
- **[D4J-C4] Output.** Per judge and combined: counts A / B / tie / inconsistent / error; win rate of side A with a 95% confidence interval and the interval method named (valid for small n); the judges'
  agreement rate; the position-inconsistency rate. The denominator of the win rate is stated in the output: A+B over items decided by both orders; inconsistent and error items are excluded from numerator
  and denominator and reported separately. The `combined` rule is named in the output. A run where fewer than half the items are decided is labelled low-decisive.
- **[D4J-C5] Spend and provider path.** Pairwise mode uses the existing opt-in gate (`--llm`, a required `--max-calls`, provider order Ollama Cloud first, Gemini last, D-164) and refuses to start when the
  planned calls (items x judges x 2) exceed the cap. No new provider, and no content is sent anywhere without that gate.
- **[D4J-C6] Tests, no network.** Existing modes and tests are unchanged and green. New tests use stub judges, with no network: a stub that always prefers the first position yields every item `inconsistent`
  and zero decided; a stub that follows the better answer yields A/B correctly in both orders; a stub that errors yields `error` counts; two stubs that disagree yield a disagreement rate. A test proves the prompt
  text contains no side identity (swap sides, same prompt body).

## Invariants
- **[D4J-I1]** Without the pairwise flag, `llm-eval.mjs` behaves exactly as today; neither `eval-recall.mjs` nor other scripts touch it unless `--llm` (header of the file).
- **[D4J-I2]** Results never overwrite a prior run's output file silently.

## Out of scope
Choosing the judge models; the 92 questions and baselines themselves (row G16 owns them). Consent (D-210).

## Amendment log
- 2026-11-25 · routine · created. Maker reading [D4J-a]->C1 (REJECTED hiding source name, session id and speaker name inside answer text: scrubbing alters the content being judged, including speaker attribution;
  blindness is about who wrote the side), [D4J-b]->C2, [D4J-c]->C4 (tightened: denominator and combined rule stated; the maker's "inconsistent counted as a tie" conflicted with reporting both, so they are separate and
  excluded from the win rate), [D4J-d]->C6 (tightened: named stub behaviours); added C3 (two distinct judge models, the owner's wording) and C5 (D-164 spend gate) · folds inbox "unit-level checks for wave 1" (D-227)
- 2026-11-25 · routine · path note added under the owner's words: the pairwise judge moves to `scripts/eval/pairwise/pairwise-judge.mjs` on branch `release/kb-golive` (D-237); no criterion and no owner quote changed · folds inbox "structure-lint repair" item 1
