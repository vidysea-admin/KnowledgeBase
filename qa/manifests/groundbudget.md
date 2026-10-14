# Manifest â€” groundbudget

**Contract:** none specific; HIGH live defect (staging ingest of 2026-10-13-zoom-webinar-p2). Related: D-162 (T-040 grounded notes), ingest-indexing-pipeline contract (no clause on request budget, windowing or hierarchy; nothing forbids this fix).
**Date:** 2026-10-14
**Fix cycle:** 0
**Status:** ready-for-check

## Defect and real root cause
`sync-session.mjs <s> --index` degraded with "strict grounded summary incomplete: complete evidence context exceeds request budget" (0/48 chunks embedded). The hardcoded `16000` is in `runtimeComplete`, but the brief's premise (no windowing) is not accurate: `runtimeWindows` ALREADY splits evidence by turn/span into windows and produces grounded per-window extracts whose quotes must lie inside that window's spans (`runtimeEvidence(..., spans)`); there is no reduce step because the page is the union of cited items. The bug is that the window packer capped only the spans at 12000 chars while the request also carries the duplicated `inventory` (turnId/from/to/digest per span, ~35% overhead for many short spans) and the wrapper. A window of many short turns therefore produced a payload > 16000. Measured on the real p2 turns (read-only, main tree): window 1 = 24 spans, request 16077 chars (> 16000). Earlier sessions indexed because their windows held fewer/longer spans (inventory share smaller). A 60-90 min webinar is NOT guaranteed to fail on the budget as such; any window of short turns can.

## Fix (packages/index/src/pipeline/grounded.ts, grounded-summary.ts)
- `runtimeWindows` now packs so BOTH `JSON.stringify(spans) <= 0.75*budget` (=12000 by default, unchanged) AND the exact extract request (spans + inventory + wrapper) `<= budget`.
- Budget is configurable: `LKB_GROUNDED_REQUEST_BUDGET` (integer >= 4000, default 16000, junk throws). Judge (x4 = 64000) and reconcile (x2 = 32000) budgets and the judge context cap (x3 = 48000) scale from it; defaults byte-identical to the old constants.
- Strictness untouched: over-budget payloads still refuse; quotes must be inside the submitting window's spans; coverage/inventory acknowledgement unchanged. No hierarchical reduce was needed or added (so no contract question arises).

## Evidence
- New `packages/index/src/pipeline/grounded-budget.test.ts` (5 tests): `node --test --import tsx src/pipeline/grounded-budget.test.ts` => pass 5 / fail 0.
  - 400-turn synthetic session through strictWebinar: degraded null, 400 covered, 400 cited items each with a real turn id and quote present in that turn, every extract request <= 16000, judge <= 64000, > 5 windows.
  - 73 short turns shape: every window's real request <= 16000.
  - A claim citing a turn outside its window: degraded, reason "quote not bound to submitted source".
  - Short sessions (n = 1, 2, 5, 12, 18): windows deepEqual the previous 12000-only packing.
  - Env parsing: default 16000, 32000 honoured, "abc"/"100"/"-5"/"16000.5" throw, larger budget gives fewer windows.
- Real data, fake LLM (no network, no Mongo): `summarizeSession(p2 turns, fakeComplete, {strictWebinar:true})` => degraded null, covered 73/73, 12 calls, max extract request 15439 chars (was 16077 and degraded). A true Ollama/Gemini dry-run was not possible: `sync-session --dry-run` connects to nothing and never calls the LLM, so no LLM calls were made.
- packages/index full suite: tests 678 / pass 677 / fail 1 (the known config/ai-routing.yaml note-judge route test in judge.test.ts, unrelated, lane indextests). `tsc --noEmit -p packages/index/tsconfig.json`: exit 0, no errors. apps/api (`node --test --import tsx "src/**/*.test.ts"`): tests 874 / pass 873 / fail 1 — activity-health/router.test.ts 'actual producer -> Python first/reclaim/fences ...' (child process exit null vs 0; spawns the Python producer, the lane worktree has no .venv, environmental and in code this change does not touch).
- `node scripts/lint-loc.mjs --all`: dependencies stage OK, 0 failed.

## Left open
Live re-run of `sync-session p2 --index` on the main tree (needs Mongo writes and LLM calls) is for the operator/checker.
