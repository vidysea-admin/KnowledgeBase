# Manifest — f1-waiver-condition (plan unit F1, lane A)
**Contract:** qa/contracts/ask-condition-fidelity.md
**Criteria:** `F1-C1`, `F1-C2`, `F1-C3`, `F1-C4`, `F1-C5`, `F1-C6`, `F1-I1`, `F1-I2`
**Policy-Version:** proportional-verification/2026-11-22.19
**Tier:** M
**Status:** checked-PASS (qa/verdicts/f1-waiver-condition.md, cycle 0, 2026-11-25)
**Fix cycle:** 0
**Round:** 6 files, 8 criteria, est 75 min — two owned source files plus one owned API file, two new test files and one fixture; the corpus had to be located and reconstructed from two delivery logs first
**slow-plan:** the recorded corpus (14 probes plus 9 failing cases) had to be found and reconstructed from 600 KB of delivery logs before any test could be written; the build cannot be split without separating the detector from the corpus that proves it
**Executor:** claude-opus-subagent (plan section 8: root cause already failed once, D-218)
**Dual check:** no — no tenancy, auth, prod-write or student-data path changed; tenant scoping, source separation and the vectorless boundary are untouched (F1-I1)
**Base:** a9bbeb98 · code commits bfa59936 + 289a2420 (final code SHA 289a2420) · branch wave/f1-waiver-condition
**Issues addressed:** cycle-3 FAIL of qa/verdicts/kb-ask-web-grounding-repair.md (failing classes V-C1..V-C4, false hold V-C5) and the engineering review findings V-E1..V-E4

## What changed
- packages/ask/src/answer.ts — `answer()`: a drafted sentence over 800 chars that cites only admitted evidence now throws `AnswerHoldError` (held for review, one call spent) instead of a refusal that left no history row (V-E4). Added in place, at the end of the file: `TURN_EVIDENCE_LIMITS` (16 KiB per turn, 24 KiB total), `evidenceTurns()` (groups quotes by speaker turn and recovers the whole turn, proven by `turnTextSHA256`, from the hydrator's `liveTurns` or from quotes that cover the turn), `wholeTurnSources()` (one generation source per whole turn, same id and speaker/time identity), and `conditionHold()` (the deterministic detector).
- packages/ask/src/ask-v2.ts — `askFastV2`: generation reads whole turns (`wholeTurnSources`); citing a whole turn cites all of its hydrated quotes; after grounding, the gate holds the answer through the existing review path (`holdForReview`: verdict ambiguous + insufficient coverage, reason `held for review: <why>`, audit entry `ask.condition_held`) when a cited turn is not whole (excerpt or over cap) or `conditionHold` fires; an `AnswerHoldError` is held the same way with no web retry. `askV2` (deep): post-hoc `conditionHold` over the released sources; graph nodes unchanged. `observeHydration` records `SourceHydration.liveTurns` without changing the hydration.
- apps/api/src/answer-policy/answer-evidence.ts — release gate (defense in depth): `conditionReleaseHold()`; `answerEvidence()` adds `source.conditionHeld` to bindings only when a candidate Ask did not already hold drops a condition; the Mongo verifier refuses any binding carrying it; `whyUnverified()` explains it. Bindings without the marker are byte-identical to before.
- New fixture: apps/api/src/answer-policy/fast/condition-fidelity-corpus.json (recorded inputs and provenance). New tests: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts (12), packages/ask/src/condition-fidelity.test.ts (5).
- Not touched: apps/api/src/answer-policy/answer-workflow.ts, apps/api/src/search-store.ts, apps/api/src/ask/source-context.ts, packages/ask/src/ask-graph.ts.

## Contract import (coordinator-directed, not maker-authored)
Commit c1c8e810 checked out the contract from c32c8bbc unchanged, as the coordinator instructed ("commit that one file alone"). The maker did not edit it.

## Detection method (F1-C2): a deterministic rule, no model check
`conditionHold(answer, citedTurnTexts)` in packages/ask/src/answer.ts. It adds no provider call.
1. **Scope rule.** A cited-turn sentence is a condition when it has one of:
   - a restriction marker (only, unless, except, depends on, limited to, applies only to, ...) together with a scope word (school, college, program, transfer, first-year, international, athlete, recruited, citizen, resident, nationality, ...);
   - a named institution that scopes a rule: it opens the sentence, follows "only" or "from", or is the subject of a rule verb;
   - "from/for/at/in your/our/this school or program".

   The condition's unit includes an anaphoric neighbour sentence ("This applies only to ..."). An answer sentence is held when it shares at least 2 non-generic concepts with that unit and carries none of the condition's scope tokens. The concept classes are TEST, WAIVE, PROFICIENCY, ADMISSION, SCHOLARSHIP and SUBMIT. "applicant" and "require" are too generic to count.
2. **Asked-not-stated rule.** An answer sentence supported (2 or more shared concepts) only by a question in the cited turns is held.
3. **Evidence-unit rule (F1-C1).** In fast mode, an answer citing a turn that is not whole (an excerpt only, or over the cap) is held.

**False-hold controls (all released, asserted in tests):**
- Paraphrased condition: "For transfer applicants, UC does not review SAT or ACT scores for admission or scholarships." (V-C1 source).
- Paraphrased condition: "Only pupils from Maple School can apply without proof of English proficiency." (V-C4 source).
- Unconditional turn: the recorded `admissions` turn (adm→admissions, fast and deep).
- Unconditional turn: V-C5, the recorded fee paraphrase "Submitting TOEFL scores lowers the visa fee.", which was the false hold of cycle 3.
- Verbatim condition: the recorded SAT quote of the whole t042 turn.
- Passing mention of an institution ("I studied at Stanford University. ...").

## Caps (F1-C1)
`TURN_EVIDENCE_LIMITS = { turnBytes: 16384, totalBytes: 24576 }`.
- The caps apply at turn boundaries only. A turn over 16384 bytes, or one that would push the evidence past 24576 bytes, is never cut: it keeps its hydrated excerpts, is marked incomplete, and an answer citing it is held.
- 24 KiB of turn text plus strip overhead stays inside `SOURCE_LIMITS.jobBytes` (64 KiB).
- The citation's speaker, turnId, tStart and tEnd are unchanged. The tests assert the tuple `[t042, 2026-07-03-inside-the-uc-session-t042, Vaishnavi, 2124, 2297]`.

## Production impact (read before G03)
The production hydrator (apps/api/src/ask/source-context.ts) cuts 1024-byte slices and does not return `liveTurns`.
- A turn of 1024 bytes or less is hydrated whole and goes through the condition gate.
- A longer cited turn can only be proven whole if its quotes cover it. Otherwise fast Ask holds the answer for review rather than answer from a fragment. This fails closed.
- In the archive, 264 of 3427 turns (8%) are over 1024 bytes, and they carry 56% of the text bytes. Until CORE-REQUEST-1 lands, expect more review holds on long-turn answers.
- t042 itself is 1024+ bytes, so the live G03 retest would see a hold for the excerpt reason. It would not see a release.

## CORE-REQUEST lines
- CORE-REQUEST-1: apps/api/src/ask/source-context.ts. The hydrator should return `liveTurns: [{ sessionId, turnId, text }]`, the canonical text of each hydrated turn, which it already loads. `validateHydration` already recomputes proofs against it, and `askFastV2` then feeds whole turns and runs the condition gate in place of the excerpt hold. One field on the hydrator's return object.
- CORE-REQUEST-2: packages/ask/src/ask-graph.ts. The deep answer node should feed `wholeTurnSources(...)` to generation and catch `AnswerHoldError` like the fast path does. Deep now gets only the post-hoc gate over all released sources, which can over-hold. An over-long deep sentence still throws, as at base.
- CORE-REQUEST-3 (optional): apps/api/src/answer-policy/answer-workflow.ts could log the release-gate reason on the stored run. It is not needed for C3.

## Recorded corpus (F1-C5, D-015) — counts by id, on 289a2420
Inputs: apps/api/src/answer-policy/fast/condition-fidelity-corpus.json. The canonical JSON of the three case lists has sha256 `dff25270ef6d0eca90709c5fe55d7f16c4ce1774a6163cff9425b9ced8b5a67d`, pinned in the test.

**14 UC probes**
- Archive: data/toc-migrated/2026-07-03-inside-the-uc-session/turns.json (git blob 5812a10152d72272f6a855e53fffda9deac11fe0; working-copy sha256 15b8e978c194cf176843f37d47f615b41c20b34f3059482932fee8c69564bb1d), turn 2026-07-03-inside-the-uc-session-t042.
- Full-turn sha256 c8cc254ed168ca29fc8f4f7f4952bdd7a663a0c8966537aef7cb41e131335019. The recorded 1024-char excerpt has sha256 6b98821e69a0828cf40ef5ddf41b41a752ec00f6b517260cc5f72a1807f62164.
- Probe inputs and harness come from qa/.delivery/cb83c01058334c10d11177acc9b90af6d4a10005aba1d2484c96f1b80acd1c3b.log (sha256 equals its name, verified): constants at lines 1739-1754, harness at 1755-1795, the 14-replay loop at 1881-1885 and 2228-2232, and the "14/14" report at 2988.

**Cycle-3 verdict cases**
- Source: qa/verdicts/kb-ask-web-grounding-repair.md lines 75-80, which names both logs.
- V-C1..V-C3 and V-C5: inputs at cb83c010 lines 1795-1802, recorded results at 2013-2016.
- V-C4: lines 2723, 2838 and 2981.

**Engineering cases**
- Source: qa/.delivery/f7db56dfd2f94ac9ff5bd34e7a7cfaeca1b89df561976f4ec31a001edef2741b.log (sha256 equals its name, verified).
- Inputs at lines 2140-2150, results at 2159-2164, findings at 2302-2308.

**The two prose classes in the cycle-3 verdict, reconstructed**
- "Distinct source wording bypassed scope protection" = V-C3 + V-C4 + V-E1. Inputs recovered from cb83c010 lines 1801 and 2723/2838 and from f7db56df line 2147.
- "SAT sentence lost an adjacent eligibility restriction" = V-C1 + V-E2. Inputs recovered from cb83c010 lines 1795-1800 and f7db56df line 2148.
- Associated failing cases: V-C2/V-E3 (an unanswered question accepted) and V-E4 (over-budget quote thrown).
- Both classes were recovered, so no class is left open.

| Corpus | Base a9bbeb98 (red) | 289a2420 |
|---|---|---|
| UC probes as recorded (excerpt of t042) | 0/14 held (all allowed, answer public and in history) | **14/14** held, public answer and history empty, ≤2 calls, web 0 |
| UC probes with the whole t042 turn (liveTurns) | 0/14 | **14/14** held by the school scope; generation reads the whole turn |
| V-C1 transfer-only SAT | allowed (FAIL) | held "transfer" |
| V-C2 interrogative + program | allowed (FAIL) | held "program" |
| V-C3 Maple School omit | allowed (FAIL) | held "maple school" |
| V-C4 UC lets only Maple pupils | allowed (FAIL) | held "maple school" |
| V-C5 fee paraphrase (false-hold control) | allowed (PASS) | **allowed** (the cycle-3 false hold is gone) |
| Verdict cases total | 1/5 | **5/5** |
| V-E1 fee waiver became a test waiver | allowed (FAIL) | held "maple school" |
| V-E2 recruited athletes only | allowed (FAIL) | held "recruited athlete" |
| V-E3 asked, not stated | allowed (FAIL) | held "only asks this question" |
| V-E4 859-char quotation | threw source_context_unavailable, 0 history rows (FAIL) | held for review, history row present, 1 call |
| Engineering total | 0/4 | **4/4** |

**Named differences from recorded assertions**
- The recorded 14-probe loop also asserted `dropped === 1` and `judged == [verbatim]`. Those pinned def9078d's sentence-rewrite mechanism, which is not in base a9bbeb98. This unit holds the whole answer instead, so the waiver is absent from public output and history either way.
- The recorded "distinct keeper with recorded waiver" asserted `ids == ['admissions']` for the same reason. Here the answer is held for review (asserted) with both citations kept for the reviewer.
- Deep releases every retrieved source at base (the cited-only filter of F4 is fast-only), so the deep control asserts `[t042, admissions, uncited]`.
- **Open cases:** none.

## Pre-checks (final code SHA 289a2420; prefix every command with `TSX_DISABLE_CACHE=1`, run from the worktree root)
Pre-check[F1-C1]: 289a2420 node --import tsx --test --test-name-pattern='\[F1-C1\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts packages/ask/src/condition-fidelity.test.ts -> 6 passed, 0 failed
Pre-check[F1-C2]: 289a2420 node --import tsx --test --test-name-pattern='\[F1-C2\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts packages/ask/src/condition-fidelity.test.ts -> 8 passed, 0 failed
Pre-check[F1-C3]: 289a2420 node --import tsx --test --test-name-pattern='\[F1-C3\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts -> 6 passed, 0 failed
Pre-check[F1-C4]: 289a2420 node --import tsx --test --test-name-pattern='\[F1-C4\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts ; node --import tsx --test apps/api/src/answer-policy/fast/answer-fast.test.ts packages/ask/src/fast/ask-fast.test.ts -> 31 passed (2 + 29), 0 failed
Pre-check[F1-C5]: 289a2420 node --import tsx --test --test-name-pattern='\[F1-C5\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts -> 6 passed, 0 failed
Pre-check[F1-C6]: 289a2420 (precondition only) the F1-C1..C5 commands above -> green; the live UC retest itself is launch row G03 and was not run here (no live model call in this build)
Pre-check[F1-I1]: 289a2420 node --import tsx --test apps/api/src/answer-policy/answer-persistence.test.ts apps/api/src/answer-policy/answer-router.test.ts apps/api/src/answer-policy/answer-workflow.test.ts apps/api/src/answer-policy/fast/answer-fast.test.ts apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts apps/api/src/answer-policy/native-answer-evidence.test.ts apps/api/src/answer-policy/stale-citation-refusal.test.ts apps/api/src/ask/source-context.test.ts apps/api/src/ask/source-exclusion.test.ts apps/api/src/evaluation-flywheel/composition.test.ts apps/api/src/native-evidence/message-vertical.test.ts apps/api/src/native-evidence/vertical.test.ts apps/api/src/production.test.ts apps/api/src/routes/championship/championship-proof.test.ts apps/api/src/routes/compete/compete.test.ts packages/ask/src/answer-policy.test.ts packages/ask/src/answer.test.ts packages/ask/src/ask-graph.test.ts packages/ask/src/ask-v2.test.ts packages/ask/src/bounded-ask.test.ts packages/ask/src/bounded-evidence/native-bounded-context.test.ts packages/ask/src/bounded-evidence/vectorless-multisource-language.test.ts packages/ask/src/bounded-evidence/webinar-citation.test.ts packages/ask/src/condition-fidelity.test.ts packages/ask/src/fast/ask-fast.test.ts packages/ask/src/source-context.test.ts packages/ask/src/quote-proof-live.test.ts -> 325 passed, 0 failed, 1 skipped (answer-persistence live NASA test, gated on LKB_TEST_LIVE_NASA)
Pre-check[F1-I2]: 289a2420 node --import tsx --test --test-name-pattern='\[F1-I2\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts ; node --import tsx --test packages/ask/src/answer.test.ts apps/api/src/answer-policy/answer-workflow.test.ts -> 26 passed (1 + 25), 0 failed

## Tests (selection from the diff)
Tests[F1-C1]: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts packages/ask/src/condition-fidelity.test.ts — whole t042 reaches generation, intact (no sentence cut) and with identity unchanged; the over-cap turn is held and not truncated; evidenceTurns hash proofs and caps; wholeTurnSources identity
Tests[F1-C2]: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts packages/ask/src/condition-fidelity.test.ts — held classes V-C1..V-C4, V-E1..V-E3 and the 14 whole-turn probes; false-hold controls (paraphrase x2, unconditional turn x2, verbatim, passing mention); deep hold
Tests[F1-C3]: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts — `assertWithheld` checks the execute output, get() and history() JSON for every held draft, plus the stored review copy; release-gate verifier refusal and the whyUnverified reason
Tests[F1-C4]: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts apps/api/src/answer-policy/fast/answer-fast.test.ts packages/ask/src/fast/ask-fast.test.ts — ≤2 calls and web 0 on every corpus run (V-E4 makes 1 call); the two-call default path is unchanged; bindings and digests of unconditional answers are byte-identical to the pre-change shape
Tests[F1-C5]: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts — the recorded corpus verbatim, pinned by hash, with counts asserted (14, 14, 5, 4)
Tests[F1-C6]: none — the live retest is launch row G03 (go-live-acceptance.md) by contract; deterministic C1..C5 are green first
Tests[F1-I1]: apps/api/src/answer-policy/answer-workflow.test.ts apps/api/src/ask/source-context.test.ts apps/api/src/ask/source-exclusion.test.ts packages/ask/src/source-context.test.ts packages/ask/src/bounded-evidence/vectorless-multisource-language.test.ts packages/ask/src/ask-graph.test.ts — tenant scoping, source exclusion, the vectorless boundary and the graph baseline stay green with no edits to them
Tests[F1-I2]: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts packages/ask/src/answer.test.ts apps/api/src/answer-policy/answer-workflow.test.ts — answers that pass the gate keep their answer, sources and bindings; the answer key pin and the workflow shape are unchanged

## Red first (TDD), base a9bbeb98, out-of-worktree copy (git archive into the scratchpad, own @lkb junctions)
- The new test files at base fail to load (`2 failed`) because the helpers they import do not exist there.
- A per-case probe (the same check() harness with the new imports removed) gave: UC probes as recorded 0/14, UC probes on the whole turn 0/14, verdict cases 1/5 (only V-C5), engineering 0/4 (V-E4 threw `Ask could not validate a bounded source context: answer references unknown or duplicate evidence`).
- The same probe on a copy of 289a2420 gave 14/14, 14/14, 5/5, 4/4.

## Falsification (one per criterion; copy of 289a2420 outside the worktree)
Each mutation had a byte backup and a subshell trap on EXIT/INT/TERM, tests ran under `timeout 300`, and a HEAD-fidelity check followed (the LF-normalized `git hash-object` of each touched copy file equals `git rev-parse 289a2420:<file>`, OK for all three files after all five mutations).
- F1-C1: in `ask-v2.ts`, removed `s.boundedSources = wholeTurnSources(...)` -> 1 failed ("UC probes 14/14 with the whole t042 turn": generation got the excerpt) · restored, fidelity OK
- F1-C2: in `answer.ts`, changed the concept threshold `>= 2` to `>= 99` -> 7 failed (detector classes, verdict 5/5, engineering 4/4, whole-turn probes, deep, release gate) · restored, fidelity OK
- F1-C3: `holdForReview` keeps the result's verdict and coverage -> 7 failed (the held drafts reached public output and history) · restored, fidelity OK
- F1-C4: the `AnswerHoldError` branch returns false (the hold falls through to the web retry) -> 1 failed (V-E4: a web search and a second answer call, which threw) · restored, fidelity OK
- F1-C5: swapped one recorded claim for an author-chosen one in the fixture -> 2 failed (the corpus hash pin, and the 14/14 whole-turn count) · restored, fidelity OK
- F1-C6 is not falsified here; it is the live G03 row. F1-I1 and F1-I2 are guarded by the unchanged existing suites in Pre-check[F1-I1].

## Metrics
Metrics: affected tests t=46 s (27 files, 326 tests, 325 passed, 1 skipped) · typecheck packages/ask exit 0 and apps/api exit 0 (t=41 s, run in parallel) · new tests 17 · LLM calls added on the default path 0 · diff +731/-6 across 7 files (34 of them the imported contract)

## Notes
- The affected run of apps/api/src/evaluation-flywheel/composition.test.ts rewrites the tracked file qa/evidence/goal-t059-maker/rows.json (requestedAt and turnIds). This is an existing side effect of that test, not of this unit. The file was restored with `git checkout` after each run and is not in any commit.
- Nothing connected to lkb_prod. No .env file was read. No live model or web call was made (stubs only). No push and no deploy.
- Started PIDs: test and typecheck runs 35936, 36956, 37394, 37805, 37806, 38377, 40747, 41141, 41303, 42016, 42425-43495, 43764, 44229-44708, 44897, 45218, 45219, 46472-46759. All exited on their own; none were killed.
- The 57 junctions per scratch copy were removed by their log, link-only, and 0 reparse points remain.
- Consent is out of scope (D-210) and was not touched.
