# t040-note-judge

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap T-040 follow-up; supersedes the rule-based negation approach per D-144). Class: generated-note acceptance gate (no data write path touched): FULL ceremony requested because it changes what ships as evidence.
Lane: lane/t040judge (base 2d262d39). Owner decision: D-144 (appended to docs/DECISIONS.md on main, Approved-by Umesh). Links: ISS-T040GEN-002/-006/-007/-008/-009/-010/-011/-012. No new ledger issues filed by this unit.

## What changed
- `packages/index/src/pipeline/notes/judge.ts` (new): `NoteJudge` (injectable, batch in, `{id, verdict: same|different|unsure, reason}` out), `judgeCandidates` (keeps only "same"; a note whose citation resolves to no source is "different" without a judge call), `JudgeSidecar` (dropped/unsure entries with reason, note excerpt, turn ids; plus judged/kept/dropped/unsure/calls, costUsd, input/output tokens, models; `writeJudgeSidecar`), a per-session `maxCostUsd` cap (notes after the cap are "unsure"), and `createLlmNoteJudge(complete)` (job kind `note-judge`, prompt focused on polarity/negation/retraction/question-as-statement/proposal-as-decision). Fail closed: judge throws, malformed reply, missing/duplicate id, invalid verdict => "unsure" => dropped.
- Wiring (opt-in): `summarizeSession` / `extractClaims` accept `noteJudge` (+ `judgeMaxCostUsd`) next to `dropUnverified`; the judge runs after the structural checks and the existing independent verdict step, on cited items, claims, answered Q&A answers (a non-same answer leaves the question unanswered) and late pending answers. The result carries `judgeSidecar` (also on a degraded page, so cost is never lost). Questions themselves are not judged (verbatim, no assertion).
- Retired/relaxed ONLY when a judge is injected: `sentenceSpanProblem(..., {judged:true})` skips the lexical `omits-qualifier` and `negated-by-reply` heuristics. Kept, deterministic: whole-sentence start/end edges (`starts-mid-sentence`, `ends-mid-sentence`), `is-question`, verifier min length/boundaries, citation existence, extractiveness, origin. With no judge injected, behaviour is byte-for-byte the previous behaviour (the default stays fail-safe; `dropUnverified` is still wired by no caller, ISS-T040GEN-005).
- `config/ai-routing.yaml`: new `note-judge: [claude-code, gemini]` (second model family vs the gemini-first generator; both providers already in the file). No existing route changed (pinned by a test).
- `scripts/eval-note-judge.mjs` (new): live eval with a mandatory `--max-cost-usd`; default is a dry run; NOT run here, no real model call made by this unit.

## Reproductions replayed (D-015), offline oracle judge: proves the wiring, not the model
Corpus `notes/judge-corpus.ts`: every recorded ISS-T040GEN-* attack transcribed verbatim (31 cases, 8 ids); the oracle labels each "different", plus 3 faithful controls labelled "same". Each case is run as a summary note AND as a claim, with the judge injected.
```
ISS-T040GEN-002: 2/2 refused as notes (judge 0, deterministic rule 2); 2/2 refused as claims
ISS-T040GEN-006: 5/5 (judge 0, rule 5); 5/5 claims
ISS-T040GEN-007: 2/2 (judge 0, rule 2); 2/2 claims
ISS-T040GEN-008: 6/6 (judge 0, rule 6); 6/6 claims
ISS-T040GEN-009: 6/6 (judge 1, rule 5); 6/6 claims
ISS-T040GEN-010: 4/4 (judge 4, rule 0); 4/4 claims
ISS-T040GEN-011: 3/3 (judge 3, rule 0); 3/3 claims
ISS-T040GEN-012: 3/3 (judge 3, rule 0); 3/3 claims
negative control, lax judge (everything "same"): 11/31 attacks ship -> those 11 (010/011/012 and one 009) rest entirely on the judge.
```
Not-an-attack ids with no cases: ISS-T040GEN-001 (recall), -003 (span cut), -004 (schema kind), -005 (caller not wired). ISS-T040GEN-012's row exists only in lane t040reject's ledger (not merged at the base); its three strings are copied from that row. The ledger rows' status is NOT changed here: -010/-011/-012 stay open until a real model is measured (live-eval script) and wired.

## Evidence
```
packages/index: node --test --import tsx judge.test.ts grounded-notes.test.ts summarize.test.ts claims.test.ts  ℹ tests 70  ℹ pass 70  ℹ fail 0
  (judge.test.ts: 10 tests: drop different/unsure + sidecar + cost; keep same, no judge = unchanged; missing citation rejected deterministically and never judged;
   throw/garbage/duplicate/invalid verdict fail closed; cost cap; Q&A answer; LLM adapter job kind + usage; corpus replay; lax-judge negative control; routing pin)
packages/ai: routing-config.test.ts router.test.ts  ℹ tests 11  ℹ pass 11  ℹ fail 0
tsc --noEmit -p packages/index/tsconfig.json  -> clean
node scripts/eval-note-judge.mjs -> DRY RUN, exit 0; node scripts/eval-note-judge.mjs --live -> refused (no cap), exit 2
```
All tests use fake judges and a fake generator: no network, browser, Mongo or provider. No mutation run.

## Not delivered / not verified
Judge accuracy on a real model is unmeasured (that is the live-eval script's job, run later within its cost cap). The judge is not wired into any production caller. Recall cost of relaxing the lexical rules is not measured (only meaningful with a real judge). packages/core and packages/ask untouched.
