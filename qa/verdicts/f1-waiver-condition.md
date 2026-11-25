# Verdict — f1-waiver-condition (F1, ask-condition-fidelity)
Date: 2026-11-25 · Checker: Mode A, one coordinator, no sub-checkers (SERIAL: no spawn needed; one test process at a time, memory tight)
Cycle checked: 0 · Policy: proportional-verification/2026-11-22.19 (manifest pin) · Bound root: D:/KnowledgeBase/.worktrees/f1-waiver-condition
Head: 16e2b75a (code 289a2420) · Base: a9bbeb98 (= `git merge-base HEAD release/kb-golive`, verified)

## Check plan (step 0)
- Route: `tick.mjs --route a9bbeb98..HEAD --root <bound>` -> floor L (rule `contracts`), dual false. Manifest says M; checked at L. No security/auth/tenancy/prod-write trigger, single check.
- Contract blob: worktree `qa/contracts/ask-condition-fidelity.md` = 590329ae9e9e = `c32c8bbc:qa/contracts/ask-condition-fidelity.md` in the main repo (equal).
- Logic change in the Ask answer path: affected tests + falsification floor + diff scope (4c) + D-015 corpus count. No UI (Mode D n/a), no persona walk, no LLM-output rubric needed (deterministic fakes only), no live/provider call, no deployed address.
- Reads (cited): D:/KnowledgeBase/qa/verdicts/kb-ask-web-grounding-repair.md lines 60-81; qa/.delivery/cb83c010...log lines 1739-1830, 1878-1890, 2010-2018, 2720-2725, 2836-2840, 2978-2990 and f7db56df...log lines 2138-2166, 2300-2310 (both sha256 = file name, verified).

## Evidence
- Step 3, one process, the manifest's 27 files: 326 tests, 325 pass, 0 fail, 1 skip (live NASA test). Tagged tests ran: C1 6, C2 8, C3 6, C4 2 (+ answer-fast 2, ask-fast 29 in the same run), C5 6. Superset of every `Pre-check[...]` command. Log: scratchpad `i1-run.log`.
- 4c diff scope: +697/-6 over 6 non-qa files, all listed in "What changed". The 6 removed lines are in-place edits (imports, `askV2` return, `guarded` deps, `answerEvidence` map head); nothing deleted or renamed. `ask-graph.ts`, `answer-workflow.ts`, `search-store.ts`, `source-context.ts` untouched.
- Extra reference hits (.13-8 by hand, `git grep` of changed identifiers over test files): `ask-web-fallback.test.ts`, `grounded-postprocessing/visibility.test.ts` pass; `activity-health/router.test.ts` red = recorded baseline red (qa/checkpoints/baseline-reds.md line 11, no `.venv` python in worktree), unrelated. Other hits (`reader`, `session-*`, `packages/index`) are a different `answerEvidence` of the same name.
- D-015 corpus, counted by me against the recorded logs: every input in `condition-fidelity-corpus.json` equals the recorded text (7 claims x 2 questions = 14 probes, `adm`, `verbatimSat`, V-C1..V-C5 sources and drafts, V-E1..V-E4 incl. the 859-char recipe). The unit's corpus EXTENDS the recorded set only by the `live`/whole-turn variant of the same 14; it replaces none. Corpus hash pin `dff25270...` equals the manifest. Archive `turns.json` blob 5812a101 is the pinned one; t042 full sha c8cc254e, excerpt sha 6b98821e, Vaishnavi 2124-2297 re-computed by me.
  Counts on HEAD (assertions in the green run): UC probes as recorded 14/14 held; whole-turn 14/14 held; verdict cases V-C1..V-C4 held, V-C5 released = 5/5; engineering V-E1..V-E4 held = 4/4.
  Left out and named: the recorded loop's `dropped === 1` / `judged == [verbatim]` assertions (they pinned def9078d's sentence rewrite, absent at base), the old `ids == ['admissions']` keeper case (now held for review). Not named by the manifest: the engineering log's closing Fast/Deep divergence observation (log line 2309, probe `partial-deep` line 1834), an observation of the def9078d rewrite, not a verdict-named case; low, in EXPLANATION.
- Criteria: C1 met at the askFastV2/hydrator interface (whole turn reaches generation, hash-proven, caps at turn boundaries, citation tuple unchanged). C2 detector named (deterministic, no model call), controls present (paraphrase x2, unconditional x2, verbatim, passing mention). C3 `assertWithheld` checks execute output, reopen, history and stored review copy. C4 <=2 calls, web 0 on every corpus run; V-E4 one call; bindings byte-identical when no condition. C5 above. C6 precondition green; live half is G03. I1 and I2: the existing suites in the 27-file run are green with no edits to them.

## CAPABILITY-COVERAGE (falsification floor, 1 per criterion, throwaway copies row1..row5 under the scratchpad, own @lkb junctions, `timeout 300`, byte backup per mutation, HEAD-fidelity `git hash-object` after each)
| Row | File / single-hunk edit | Check (single node) | Green before | Red after, assertion that fired | Restored = intended blob |
|---|---|---|---|---|---|
| C1 | ask-v2.ts: delete `s.boundedSources = wholeTurnSources(...)` | UC probes 14/14 with the whole t042 turn | 1/1 | 0/1: `norm(stripsOf(r,"t042")) == norm(raw.text)` (generation got the 1024-char excerpt) | 5e0b1460 yes |
| C2 | answer.ts: `shared.length >= 2` -> `>= 99` | cycle-3 verdict cases V-C1..V-C4 | 1/1 | 0/1: `r.out.state == "review"` got `allowed` (waiver released) | d6a2eb40 yes |
| C3 | ask-v2.ts: `holdForReview` keeps result verdict/coverage | UC probes 14/14 as recorded | 1/1 | 0/1: `assertWithheld` `state == "review"` got `allowed` | 5e0b1460 yes |
| C4 | ask-v2.ts: `AnswerHoldError` branch `return true` -> `return false` | engineering-review cases (V-E4) | 1/1 | 0/1: web retry + second answer call, then BoundedAskError thrown (budget broken) | 5e0b1460 yes |
| C5 | builder cell: "swapped one recorded claim for an author-chosen one in the fixture" in `condition-fidelity-corpus.json` | | | NOT EXECUTED: an edit to a fixture file is not admissible (CONTRACT_MISMATCH on that cell, quoted verbatim). Checker substitute, own floor: answer.ts `asked >= 2 && stated < 2` -> `false && ...` | 1/1 | 0/1: V-E3 `state == "review"` got `allowed` (recorded case re-opens) | d6a2eb40 yes |
The builder's C5 pin (hash + count) has no product-side falsifier; I did not run it. The recorded-corpus regression itself is falsified by the substitute.

## Result
VERDICT: PASS
SCOREBOARD: 6/6 criteria met (C6 precondition half), 2/2 invariants hold
TIER: L (route floor, contract file in diff; no security/auth/tenancy/prod-write trigger in changed non-test files; single check)
FAILURES: none
CAPABILITY-COVERAGE: 4/5 rows reproduced as built; C5 cell inadmissible (fixture edit), replaced by checker's own product-file falsification, 5/5 criteria falsified
LIVE-BROWSER: not-applicable (no UI path changed)
ISSUES-WRITTEN: none
EXECUTOR: claude-opus-subagent (checker: claude-sonnet-subagent)
full-suite trigger: none (no security/auth/tenancy/prod write, no config/dependency/conftest change; behaviour-scoped set + collection at 6c).
EXPLANATION: Every criterion is evidenced by tests I ran and by recorded inputs I compared with the two delivery logs; the five falsifications went red at the assertion they are named for. Production caveat, which the manifest states and I confirmed in code (apps/api/src/ask/source-context.ts:198 `slices(turn.text)`, return at the end of `hydrate` has no `liveTurns`): the real hydrator cuts 1024-byte slices and supplies no live turn text, so for a cited turn over 1024 bytes generation still reads a slice and askFastV2 holds the answer for review (fail closed), and deep gets only the post-hoc gate; C1's whole-turn feed and release of long unconditional turns need CORE-REQUEST-1 (and CORE-REQUEST-2 for deep), outside this contract's scope. The detector is a lexicon rule (English scope words, 2-concept overlap), so recall beyond the recorded and control classes is not claimed. Notes only: manifest has no `## Test selection (haiku)` section or `Sibling:` lines (.13-7/.13-8 form), substance checked by hand with no uncovered hit.
HUMAN_GATE-REQUEST: land CORE-REQUEST-1 (hydrator returns `liveTurns`) before launch row G03, or accept that the live UC retest will show a review hold on t042 (2365 bytes), not a release.
Metrics: start=2026-11-25T13:24:00+05:30 end=2026-11-25T13:35:00+05:30 wall_min=11 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=660 mutants=0 defects_unit=0 defects_6c=0
