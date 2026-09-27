# Manifest — T-005-ask-router
**Contract:** qa/contracts/ask-router.md
**Goal task:** T-005
**Date:** 2026-09-03
**Fix cycle:** 2 of max 3
**Issues addressed:** ISS-001, ISS-002, ISS-003

## Fix cycle 2 — responses to verdict (qa/verdicts/T-005-ask-router.md, Cycle checked: 1)
- **[C2] ISS-001 "thresholds hardcoded, not tunable via parameters"** → `evaluate(query, candidates,
  score_fn, upper=0.7, lower=0.3)` and `ask(..., upper=0.7, lower=0.3)` pass-through; C1's positional
  signature unchanged; `ValueError` if `lower > upper` or out of [0,1].
- **[C6] ISS-002 "no reason returned on any call"** → every `scored[]` entry is `{node, score, reason}`;
  `score_fn` may return a bare float (reason `""`) or `(score, reason)`; top-level `reason` string on
  every result (correct included), citing the thresholds used.
- **ISS-003 (low) bare `from evaluator import …`** → `try: from .evaluator … except ImportError: from
  evaluator …` so both `import ask_router.router` (project root) and `python ask_router/test_router.py`
  work.

## What changed
- `ask_router/evaluator.py` — `upper`/`lower` kwargs + validation; `_normalize()` accepts float or
  `(score, reason)`; per-candidate `reason`; top-level verdict `reason`
- `ask_router/router.py` — threshold pass-through; `reason` surfaced; `_result()` helper removes the
  three duplicated dict literals; dual-mode import
- `ask_router/test_router.py` — +2 tests: `test_reason_returned_on_every_call_including_correct`,
  `test_thresholds_are_tunable_parameters` (default / stricter / looser / via `ask()` / invalid order)

## How to verify (commands + expected)
- `cd D:\KnowledgeBase && python ask_router/test_router.py` → expected: exit 0, "PASS: 6/6 test(s) passed."
- `cd D:\KnowledgeBase && python -c "import ask_router.router"` → expected: exit 0, no ModuleNotFoundError (ISS-003)
- `cd D:\KnowledgeBase && python -c "import inspect, ask_router.evaluator as e; print(inspect.signature(e.evaluate))"`
  → expected: `(query: str, candidates: list[dict], score_fn: ..., upper: float = 0.7, lower: float = 0.3) -> dict`

## Actual outputs (from maker's own run)
```
$ python ask_router/test_router.py
PASS: test_correct_verdict_never_calls_web_even_if_supplied
PASS: test_incorrect_verdict_uses_web_fallback_sources_kept_separate
PASS: test_ambiguous_verdict_merges_good_docs_and_web_but_keeps_them_separate
PASS: test_no_web_fallback_provided_sets_insufficient_coverage
PASS: test_reason_returned_on_every_call_including_correct
PASS: test_thresholds_are_tunable_parameters

PASS: 6/6 test(s) passed.
exit: 0

$ python -c "import ask_router.router as r; print('import ask_router.router OK ->', r.ask.__name__)"
import ask_router.router OK -> ask
exit: 0
```

## Status: checked-PASS
Verdict: qa/verdicts/T-005-ask-router.md (Cycle checked: 2, commit 129f8f1) — 7/7 criteria met; ISS-001..003 verified.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
