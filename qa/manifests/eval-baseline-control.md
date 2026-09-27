# Manifest — eval-baseline-control

**Contract:** none existing covers this directly (plan §10 U0.10 groundwork). Proposed criteria
below for the checker to adopt or amend as `qa/contracts/eval-baseline-control.md`.
**Goal task:** none (plan §10 U0.10 — the blocking Phase-0-finish item)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none directly — but this unit produces the EVIDENCE for a finding the
checker should judge and (if it agrees) file. See "The finding" below. The maker deliberately
did not file it itself: a maker filing its own finding about its own measurement is the
self-certification this pair exists to prevent.

## Why

Plan §10 U0.10 is the one Phase-0-finish item left, and the plan flags it as blocking in its own
words: *"do not skip to save a week — without it Phase 1 is unfalsifiable."* Its prescribed
remedy is "redo T-021/T-022 against a real LLM."

Reading the existing eval artifacts before building anything, that remedy looks insufficient —
not wrong, but aimed at the wrong half of the problem. `data/eval/recall-report.json` recorded:

```
recallAtK: 1.000, total: 46, hits: 46, misses: []
```

A perfect score with **zero misses**. Whatever else that number means, it means the metric has
no room left to move: any future retriever — including the real LLM U0.10 prescribes — can only
hold at 1.000 or drop. It can register a regression; it can never demonstrate an improvement.
That is precisely the unfalsifiability U0.10 exists to fix, and swapping the *measured* thing
does not fix a saturated *instrument*.

This unit does not attempt U0.10 itself. It builds the two controls that make U0.10's eventual
number readable at all, and measures what the current one actually says.

## Two corrections I made to my own reasoning while building this

Recording both, because the first version of this finding would have been wrong in the ledger.

1. **I initially read the golden set as a verbatim-copy tautology.** `scripts/gen-golden-set.mjs`'s
   own header says it builds questions from `session_page.keyInsights` as *"verbatim excerpts,
   not paraphrased or invented"*, and `heuristic-retriever.ts` scores keyword overlap against
   each session's `summary` — so I expected the question to be a literal substring of the text
   being searched. **It is not.** Checked directly:
   `page.summary.includes(page.keyInsights[0])` → `false`. `keyInsights` and `summary` are two
   different fields. The overlap is shared entity vocabulary, not literal copying. My first
   framing was wrong and I dropped it.
2. **I then implied the retriever was worthless. Also wrong.** The measured control says the
   opposite: the heuristic scores **1.000** against a question-blind control's **0.217** — a lift
   of **+0.783**. It beats chance decisively. The defect is in the instrument's *headroom*, not
   in the retriever's *quality*, and the manifest says so rather than claiming a scarier finding
   than the evidence supports.

## The finding (evidence below; the checker judges and files it, not me)

The recall@5 metric is **SATURATED**, not merely proxy-based. Measured, not asserted:

| | value |
|---|---|
| heuristic retriever | **1.000** (46/46, 0 misses) |
| question-blind control | **0.217** |
| chance floor (k=5 over 23 sessions) | **0.217** — control matches it exactly, as it must |
| lift over control | **+0.783** |
| verdict | **saturated** |

Two consequences worth a checker's judgment:
- The tracker's existing note that T-021 "was run against a heuristic proxy" is true but
  understates it. Even with a perfect real-LLM retriever, the ceiling is 1.000 — already reached.
  **U0.10 as written cannot produce a falsifiable number on this question set.**
- The golden set's provenance is a contributing cause: 46 questions are machine-generated
  `keyInsights` statements drawn from the same pipeline and the same document as the retrieval
  target, and they are declarative statements, not user-style questions (sampled: *"New Zealand:
  76% of 2025 visa applications approved, government target is 27,000 Indian students by 2030."*).
  A harder or independently-authored set is the actual prerequisite for U0.10 — and authoring one
  that is not derived from the same pipeline may be a HUMAN_GATE, which is worth settling before
  U0.10 is scheduled rather than discovering mid-unit.

## What changed

1. **`packages/index/src/eval/baseline.ts`** (new) — two standard, non-inventive sanity
   conditions any retrieval score is read against:
   - `createNullRetriever(sessionIds)` — a **question-blind** control: ignores the question
     entirely, returns the same deterministic first-k ids every call. Deterministic rather than
     random so the control is reproducible run to run.
   - `assessBaseline(measured, control, sessionCount)` → `{chanceFloor, liftOverControl,
     saturated, verdict, reason}`. `verdict` is `at-chance` | `saturated` | `informative`.
     **`at-chance` deliberately outranks `saturated`** — a retriever that fails to beat a blind
     control is the more fundamental failure, and reporting it as merely "saturated" would
     flatter it.
2. **`packages/index/src/eval/baseline.test.ts`** (new, 7 tests) — control blindness,
   determinism, `k` handling, the real chance floor, and one test per verdict branch including
   the at-chance-outranks-saturated precedence.
3. **`packages/index/src/index.ts`** — exports `createNullRetriever`, `assessBaseline`, and its
   two types.
4. **`scripts/eval-recall.mjs`** — now runs the control over the same golden set and the same
   candidate pool, prints `control` + `chance floor` + a `VERDICT:` line, and writes three new
   fields into the report: `control`, `assessment`, and `goldenSetProvenance` (which records, in
   the artifact itself, that the questions are derived `keyInsights` rather than independently
   authored — so the next person to read the number sees the caveat without having to re-derive
   it from a generator script's comment).
5. **`data/eval/recall-report.json`** — regenerated by a real run (below). `recallAtK` is
   unchanged at 1.000; what changed is that it is now accompanied by the control that makes it
   interpretable.

`packages/index/src/eval/recall.ts` is deliberately **untouched** — it is a working, PASSed path,
and the plan's own guidance is to add at the boundary rather than rewrite working paths.

## Evidence

Real run, `node scripts/eval-recall.mjs`:
```
recall@5 = 1.000 (46/46 hits)
control (question-blind) = 0.217 | chance floor = 0.217
VERDICT: SATURATED — 46/46 with zero misses — the metric is pinned at its ceiling, so it can
register a regression but can never demonstrate an improvement; a harder or
independently-authored question set is needed before this number can support a claim
```
The control landing exactly on the chance floor (0.217) is itself a check on the harness: 5 of 23
sessions blind = 10 of 46 questions = 0.2174. If the control had scored *above* the floor, the
control itself would be leaking question signal.

`pnpm -r typecheck` — exit 0, all workspace projects clean.
`pnpm --filter @lkb/index test` — 56/56 (49 pre-existing + 7 new).
`pnpm --filter @lkb/api test` — 89/89 (untouched by this unit; run as a regression check).
`pnpm lint:structure` — clean (237 files in budget, 259 modules / 774 dependencies cruised, 0
violations, tracker-audit gate G1 OK).
`node scripts/catalogue-score.mjs` — 24.6%/33.3% unchanged, correctly: this is eval
instrumentation, not one of plan §4c's 57 catalogue features.

**Mutation-tested with proof of application, twice — and the second mutation caught a real
defect in my own test, which is why it is reported here rather than quietly fixed:**

1. **Saturation detector**: forced `saturated = false`. Confirmed the file content changed, re-ran:
   **6/7 pass, exactly the "perfect score is reported SATURATED" test reddened.** Restored → 7/7.
2. **Control blindness**: made `createNullRetriever` peek at the question (ranking any session id
   named in the question higher). Re-ran: **6/7 pass — but the test literally named *"ignores the
   question entirely"* still PASSED.** Its two sample questions contained no session ids, so a
   question-aware control had nothing to react to: a blindness test run only on inputs the
   implementation could not respond to is not testing blindness at all. Strengthened the test to
   use questions that explicitly name `s9`/`s10`, re-ran the identical mutation: **5/7 pass, both
   the blindness test AND the chance-floor test now redden.** Restored → 7/7.

   This is the third time this session that a regression test re-derived its own check instead of
   genuinely exercising the property — the pattern already logged in `qa/feedback-inbox.md`
   (2026-09-08). It was caught only because mutation-with-proof-of-application is mandatory here;
   a green suite alone would have shipped a control whose defining property was untested.

## How to verify (checker)

1. Read `packages/index/src/eval/baseline.ts` — confirm the control is genuinely question-blind
   and deterministic, and that `at-chance` outranks `saturated` in the verdict precedence.
2. Run `node scripts/eval-recall.mjs` yourself — confirm the three numbers reproduce
   (1.000 / 0.217 / saturated) and that the control equals the chance floor exactly.
3. Run `pnpm --filter @lkb/index test` (56/56), `pnpm -r typecheck`, `pnpm lint:structure`.
4. Reproduce BOTH mutations: (a) force `saturated = false` → only the saturation test should
   redden; (b) make the null retriever question-aware → **both** the blindness and chance-floor
   tests should redden. Confirm via a backup `diff` that each mutation genuinely changed the file
   before trusting the red/green. Restore and confirm 7/7.
5. **Judge the finding above and decide whether to file it, at what severity, and against which
   feature.** Specifically judge the claim that plan §10 U0.10's prescribed remedy ("redo against
   a real LLM") cannot produce a falsifiable number on a set already pinned at 1.000, and whether
   authoring a non-derived question set is a HUMAN_GATE that should be settled before U0.10 is
   scheduled. Disagree if you think this is overstated — I have already had to walk back two
   stronger versions of it (see "Two corrections" above), so treat it skeptically.
   Note: a concurrent Mode B sweep was asked the same question independently and told to report
   whether it would file rather than filing, so you two do not double-file — coordinate via the
   ledger, and check `qa/QUEUE.md` / `qa/.last-sweep` for its view before filing.
6. Consider whether `qa/contracts/eval-baseline-control.md` is warranted (checker territory per
   ISS-006 — the maker deliberately did not draft one).

## Risk / rollback

Pure additive instrumentation plus one regenerated data artifact
(`data/eval/recall-report.json`). No production data touched, no network, no LLM spend, no live
Mongo. `recall.ts` and the golden set are unmodified — this unit only adds the controls that
make their output readable. Reversible by `git revert`.

**Status: checked-PASS** — PASS from `qa/verdicts/eval-baseline-control.md` (Cycle checked: 1, matching Fix cycle 1), committed `fcc2863`. Closed out on the 2026-09-08 reconcile tick.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
