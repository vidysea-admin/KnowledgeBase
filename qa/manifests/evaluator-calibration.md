# Manifest — evaluator-calibration (T-022)

Status: checked-PASS
Cycle checked: 1
Verdict: `qa/verdicts/evaluator-calibration.md`
Contract: `qa/contracts/evaluator-calibration.md`

## Disclosed scope-down (read this first, same posture as T-021)
No human scorer is available in this autonomous session, and the real LLM judge is blocked on
ISS-015 (invalid `GEMINI_API_KEY`). This unit calibrates against a **derived** reference set
(own-session pairs = 1.0 "clearly relevant", a deliberately different session = 0.0 "clearly
irrelevant" — a mechanical proxy, not human judgment) and a local heuristic scorer built for this
harness. **`mae = 0.170` is NOT a calibration of the real LLM judge** — it's evidence the harness
computes correctly end-to-end and that the heuristic scorer's predictions are directionally
correct (every "relevant" pair scores meaningfully higher than its paired "irrelevant" one — see
the per-pair detail in the manifest's verify output below), which is a real, non-trivial result
(unlike T-021's expected 1.000, this MAE could have come out badly and would have been reported
as such).

## What changed

1. **`packages/ask/src/eval/heuristic-scorer.ts`** (new) — `heuristicScorer: ScoreFn`, a local
   keyword-overlap scorer built specifically for this harness (packages/ask cannot depend on
   `apps/api` or `packages/index` per `.dependency-cruiser.cjs` — this is NOT an illegal
   cross-package import of either package's existing heuristic, it's a new small file).
2. **`packages/ask/src/eval/calibration.ts`** (new) — `computeMAE(pairs, scoreFn):
   Promise<CalibrationResult>`, always awaits the scorer (works with sync OR async `ScoreFn`
   unmodified — proven by a dedicated test using an actually-async fake).
3. **`scripts/gen-calibration-set.mjs`** (new) — derives 30 pairs from T-021's real
   `data/eval/golden-set.json` (15 questions × own-session + deliberately-different-session).
4. **`scripts/eval-calibration.mjs`** (new) — same `tsx/esm/api` pattern as
   `scripts/eval-recall.mjs`; resolves each pair's `sessionId` to its real tree node, runs
   `computeMAE`, writes `data/eval/calibration-report.json`.
5. **`packages/ask/src/index.ts`** — exports the new `eval/` module.
6. **`docs/SNAPSHOT.md`** — regenerated for the new files.

## How to verify (all commands run, real output below)

```
$ node scripts/gen-calibration-set.mjs
wrote 30 calibration pairs -> D:\KnowledgeBase\data\eval\evaluator-calibration-set.json

$ node scripts/eval-calibration.mjs
mae = 0.170 over 30 pairs
  [...gq01-relevant] predicted=0.706 reference=1 absError=0.294
  [...gq01-irrelevant] predicted=0.176 reference=0 absError=0.176
  ... (30 lines total, every "relevant" predicted score higher than its paired "irrelevant" one)
wrote D:\KnowledgeBase\data\eval\calibration-report.json

$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm --filter @lkb/ask test
tests 30 / pass 30 / fail 0   (21 pre-existing + 9 new: 6 calibration.test.ts + 3 heuristic-scorer.test.ts)

$ pnpm -r test
core 7 / index 19 / ai 23 / ingest 26 / ask 30 / meeting-bot 20 / apps/api 18 — all green

$ pnpm gen:types --check
OK: 21 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 21 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (130 file(s) within budget)
lint-dirsize: OK (59 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (184 unique export(s), 21 unique schema $id(s))
lint-migrations: OK (694 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (110 lines, budget 200)
✔ no dependency violations found (139 modules, 390 dependencies cruised)
```

## Files touched
- `packages/ask/src/eval/heuristic-scorer.ts` (new)
- `packages/ask/src/eval/heuristic-scorer.test.ts` (new)
- `packages/ask/src/eval/calibration.ts` (new)
- `packages/ask/src/eval/calibration.test.ts` (new)
- `packages/ask/src/index.ts` (eval/ exports)
- `scripts/gen-calibration-set.mjs` (new)
- `scripts/eval-calibration.mjs` (new)
- `data/eval/evaluator-calibration-set.json` (generated)
- `data/eval/calibration-report.json` (generated)
- `docs/SNAPSHOT.md` (regenerated)
- `qa/contracts/evaluator-calibration.md` (new contract, maker-drafted)

## Follow-up (not this unit, disclosed in contract Non-goals)
Once ISS-015 clears and a real human-scored set exists, re-run this exact harness (`computeMAE`
already accepts any `ScoreFn`, including `apps/api/src/score.ts`'s `createLlmScorer`) for the
plan's actual calibration target.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
