# Contract — ask-condition-fidelity (unit F1, waiver defect, D-227)

> Status: adopted by /checker 2026-11-25. Authority: D-227; plan section 7 lane A F1; D-219 (excerpts that split sentences), D-215, D-217. Scope: `packages/ask/src/answer.ts`, `packages/ask/src/ask-v2.ts`,
> `apps/api/src/answer-policy/answer-evidence.ts`. Extends `ask-fast-rag.md` and `answer-policies-vectorless.md`; neither is weakened.
> Owner's words: cause as far as the code shows is that the school-specific condition is lost between excerpt hydration and answer generation; "Feed the full speaker turn as the evidence unit ...; add a gate in
> `answer-evidence.ts`: when the cited turn carries a condition and the answer drops it, hold the answer"; check (launch row G03): "The 14 archived UC probes and the checker's failing cases in
> `qa/verdicts/kb-ask-web-grounding-repair.md` pass; one live UC retest".

## Criteria
- **[F1-C1] Whole turn as evidence unit.** The text given to answer generation for a cited turn is the complete speaker turn, never a fragment that cuts a sentence or drops the clause carrying a condition. If a
  size cap applies, it is named in the manifest, is applied at turn boundaries only, and a single turn over the cap is held, not truncated mid-sentence. The citation's speaker and start/end time are unchanged.
- **[F1-C2] Condition gate.** When a cited turn states a rule with a scope or condition (a school, program, year, test, nationality, eligibility restriction) and the answer states the rule without it, the answer is
  held through the existing hold path, with a reason. An answer that keeps the condition (verbatim or paraphrased) is not held; an answer citing an unconditional turn is not held. The manifest names the
  detection method (deterministic rule, model check, or both) and its false-hold controls: at least one paraphrased-condition answer and one unconditional-turn answer pass.
- **[F1-C3] Held means withheld.** A held answer's content is absent from the public response and from released stored history; the earlier failure was an answer that reached public allow and remained in history
  (cycle-3 verdict of `kb-ask-web-grounding-repair.md`). Tests assert both.
- **[F1-C4] Budget preserved.** The default path still makes at most two LLM calls in total (`ask-fast-rag.md` [C1]); evidence digests and bindings of answers that carry no condition are unchanged (`answer-policies-vectorless.md` 1).
- **[F1-C5] Recorded corpus is the floor (D-015).** A standing regression test re-runs VERBATIM, from recorded inputs: (a) the 14 archived UC probes, and (b) every failing case of the cycle-3 FAIL in
  `qa/verdicts/kb-ask-web-grounding-repair.md`. The manifest reports the count against each corpus by id, e.g. `UC probes: 14/14`, and names any case left open with its reason; it never substitutes a corpus the
  author wrote this cycle. The manifest pins the archive path and hash of the 14 probes and the path of each reproduced failing case. The cycle-3 verdict records its two failing classes (distinct source wording
  that bypassed scope protection; an SAT sentence that lost an adjacent eligibility restriction) in prose; the maker reconstructs them from the cycle-3 delivery log named there and lists each with the evidence
  of where its input was recovered; a class whose input cannot be recovered is named with its reason, and such a class keeps the unit open.
- **[F1-C6] Live retest is G03.** The one live UC retest on the deployed revision is launch row G03 (`go-live-acceptance.md`) and is not repeated here; it runs only after F1-C1..C5 are green (deterministic before live).

## Invariants
- **[F1-I1]** Tenant isolation, source separation and the vectorless Ask boundary unchanged (`ask-fast-rag.md` [I1]; `answer-policies-vectorless.md` 3).
- **[F1-I2]** No change to what the user sees for an answer that passes the gate except the better-preserved condition.

## Out of scope
Rewording prompts only (`def9078d` already did that and was insufficient). Consent (D-210).

## Amendment log
- 2026-11-25 · routine · created. Maker reading [F1-a]->C1 (added the over-cap rule: hold, never truncate), [F1-b]->C2+C3 (tightened: detection method named with false-hold controls; held content must not reach history),
  [F1-c]->C5 (tightened: corpus pinned by path/hash, prose-only failing cases must be reconstructed or the unit stays open); added C4 (budget) and C6 (live retest = G03) · folds inbox "unit-level checks for wave 1" (D-227)
