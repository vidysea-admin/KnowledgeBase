# Contract — ask-condition-fidelity (unit F1, waiver defect, D-227)

> Status: adopted by /checker 2026-11-25. Authority: D-227; plan section 7 lane A F1; D-219 (excerpts that split sentences), D-215, D-217. Scope: `packages/ask/src/answer.ts`, `packages/ask/src/ask-v2.ts`,
> `apps/api/src/answer-policy/answer-evidence.ts`; the F1B section adds `apps/api/src/ask/source-context.ts` and `packages/ask/src/ask-graph.ts`. Extends `ask-fast-rag.md` and `answer-policies-vectorless.md`; neither is weakened.
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
- **[F1-C6] Live retest is G03.** The one live UC retest on the deployed revision is launch row G03 (`go-live-acceptance.md`) and is not repeated here; it runs only after F1-C1..C5 AND the follow-up unit's F1B-C1..C5 below are green (deterministic before live). F1-C1..C5 alone cannot release an answer on the deployed app: the production hydrator still hands generation 1024-byte slices (ISS-F1WAIVERCONDITION-001).

## Invariants
- **[F1-I1]** Tenant isolation, source separation and the vectorless Ask boundary unchanged (`ask-fast-rag.md` [I1]; `answer-policies-vectorless.md` 3).
- **[F1-I2]** No change to what the user sees for an answer that passes the gate except the better-preserved condition.

## Follow-up unit f1-whole-turn-hydration (F1B) - SOURCE: MAKER-DERIVED
> Proposed by the maker (inbox entry "unit-level checks for the follow-up unit f1-whole-turn-hydration") from the plan (D-227 section 4 row 3), the verdict `qa/verdicts/f1-waiver-condition.md` on branch
> `wave/f1-waiver-condition` (6/6 PASS at commit dbf3dd1a; its HUMAN_GATE-REQUEST: land CORE-REQUEST-1 before row G03, or accept that the live retest shows a hold on t042) and two code reviews. Not Umesh's words.
> Ledger (a shard of the union, `ledger-shard-union-readers.md`): `qa/issues.F1WAIVERCONDITION.jsonl` on that branch, ISS-F1WAIVERCONDITION-001 and -002 (high), -005 (medium, covered by F1B-C4).
> Scope: branch off `wave/f1-waiver-condition`; `apps/api/src/ask/source-context.ts` (hydrator), `packages/ask/src/ask-graph.ts` (deep answer node), `packages/ask/src/ask-v2.ts` only where the deep path is wired,
> `apps/api/src/answer-policy/answer-evidence.ts` only for F1B-C4, and their existing tests. No new source file (edit in place; a new module needs Umesh to name the target file first).
- **[F1B-C1] Whole turns from the hydrator.** For every cited turn the hydrator returns `liveTurns: [{ sessionId, turnId, text }]` (the `SourceHydration.liveTurns` shape the F1 branch already consumes) where `text` equals
  the stored turn text byte for byte, next to the existing slices (which stay). A turn over the per-turn cap (16 KiB, `TURN_EVIDENCE_LIMITS.turnBytes`) is left out of `liveTurns`, never cut, and an answer that cites
  a turn absent from `liveTurns` is HELD (F1-C1), never judged on its slices. Test: a stored 3,000-byte turn comes back whole; a 20,000-byte turn is absent from `liveTurns`; an answer citing both is held.
- **[F1B-C2] Fast Ask through the real hydrator.** Real hydrator, fake model, the archived t042 turn (over 1024 bytes): an answer that keeps the school-specific condition is released; one that drops it is held for
  review. The released case is held at the branch point (the base commit the manifest names), so the test is red there (falsification).
- **[F1B-C3] Deep Ask.** The deep answer node gives generation whole turns and applies the same hold when a cited turn is incomplete (absent from `liveTurns`) or its condition is dropped, with no additional LLM call
  on the default fast path (F1-C4). The 14 archived UC probes of F1-C5 replayed in deep mode are reported as n/14 against the recorded corpus, probe by probe, in BOTH fast and deep mode; each probe is compared
  with its RECORDED expected outcome, not merely deep against fast (two wrong modes would agree). Any divergence is named with its reason and keeps the unit open (D-015).
- **[F1B-C4] One judgment, on whole turns.** When `liveTurns` is present the release check in `answer-evidence.ts` judges the whole turns and does not run again on slices. An answer with `web_used` sources is still
  checked, never skipped, on its internal sources only (web sources are not turns and are excluded from the condition judgment). One test for each; they close ISS-F1WAIVERCONDITION-005.
- **[F1B-C5] Recorded reproductions are the floor (D-015).** The unit's regression test re-runs the `repro` recorded for ISS-F1WAIVERCONDITION-001 and -002 as written in the ledger. The ledger `repro` fields are
  prose scenarios, so the manifest quotes each verbatim, pins the ledger file's path and hash, and names the test that encodes it; it reports the count by issue id (-001 1/1; -002 n/14 as in F1B-C3; -005 per F1B-C4).
  An additional corpus is welcome and never substitutes the ledger's.
- **[F1B-I1] Tenancy (never capped).** `liveTurns` is built from the turn read the hydrator already makes, under the tenant and visibility of the caller: no new query, no new collection read (the hydrator test counts
  store reads and shows the same number as at the branch point). A two-tenant test shows a turn of tenant B never appears in the `liveTurns` of tenant A, and a turn the caller may not see (withheld/private) never
  appears. If the builder needs a new read, the unit is tenancy-class: dual check with a cited `dual-trigger` line.
- **[F1B-I2]** The F1 tests (F1-C1..C5) and the 27-file affected set of `f1-waiver-condition` stay green; the manifest lists that set by path.
- **[F1B-I3]** Over-cap evidence is held, never truncated (unchanged).
- **[F1B-I4]** No live model call and no read of or write to `lkb_prod` in this unit's tests. The live UC retest is launch row G03 and needs a yes from Umesh (D-218).
- **Filed, not built here** (stop rule of the plan): detector misses (bare "if/when", numeric thresholds, time limits, institution names not of the form "X School", Hinglish and Devanagari) and false holds
  (idiomatic "only", negations, quoted questions) are ISS-F1WAIVERCONDITION-003 and -004 (medium; need a labelled condition set and a measured miss and false-hold rate before any rule change); the 534-line size of
  `answer-evidence.ts` against the 300 limit and moving the detector to its own module are -006 (low). Noted: -006 also records that the F1-C5 pin test compares a path with its own hash, so the pin in F1-C5 is
  weaker than it reads; it stays filed.

## Out of scope
Rewording prompts only (`def9078d` already did that and was insufficient). Consent (D-210).

## Amendment log
- 2026-11-25 · routine · created. Maker reading [F1-a]->C1 (added the over-cap rule: hold, never truncate), [F1-b]->C2+C3 (tightened: detection method named with false-hold controls; held content must not reach history),
  [F1-c]->C5 (tightened: corpus pinned by path/hash, prose-only failing cases must be reconstructed or the unit stays open); added C4 (budget) and C6 (live retest = G03) · folds inbox "unit-level checks for wave 1" (D-227)
- 2026-11-25 · routine · F1B section added from the maker-derived inbox entry for unit f1-whole-turn-hydration (verdict `f1-waiver-condition`, ISS-F1WAIVERCONDITION-001/-002/-005). Dispositions: F1B-C1 amend (over-cap
  turn: the answer citing it is held, never judged on slices; closes a gap between C1 and C4); F1B-C2 accept (base commit named); F1B-C3 amend (compared with the recorded outcome per probe, reported for fast and deep,
  no extra LLM call); F1B-C4 amend (a `web_used` answer is checked on internal sources, never skipped; closes -005); F1B-C5 amend (ledger repro is prose: quote verbatim, pin file path and hash, count by id);
  F1B-I1 amend (read count unchanged, visibility test; tenancy class never capped); F1B-I2, I3, I4 accept; scope line of the file extended to the two files F1B touches; F1-C6 now waits for F1B too.
  Contradiction found: go-live G03 allowed a live retest to pass on "kept (or held)", which the 1024-byte-slice defect would satisfy by a false hold; G03 amended in `go-live-acceptance.md`. The verdict's
  HUMAN_GATE-REQUEST is answered by the contract (G03 cannot pass before F1B); whether to launch with row 3 open is the owner's schedule call, not a contract question.
