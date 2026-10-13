# Manifest - u010harness

**Contract:** none new. Built against `qa/contracts/evaluator-calibration.md`, `qa/contracts/eval-baseline-control.md`, `qa/gates/golden-set-redesign.md`, D-156, D-164.
**Goal task:** U0.10 (code only; the paid baseline is NOT run in this unit).
**Date:** 2026-10-13
**Fix cycle:** 0
**Dual check:** no
**Status:** ready-for-check
**Lane:** lane/u010harness

## What was built

1. `packages/ai/src/providers/ollama.ts`: optional `OllamaConfig.apiKey`. Headers gain `authorization: Bearer <key>` only when a non-blank key is configured, for `complete` and `embed`. Unset/blank: headers are the original `{ "content-type": "application/json" }` object. The key is NEVER read from the environment inside the adapter, so the `speakers: [ollama]` route cannot pick it up or move to the cloud. Localhost default unchanged.
2. `scripts/eval/llm-eval.mjs` (new): `--llm` plumbing. ScoreFn = apps/api `createLlmScorer` (the existing production evaluator prompt) routed with jobKind `evaluator` through `@lkb/ai complete` with an explicit one-provider chain. Provider instance gets `baseUrl` (default `https://ollama.com`) and `OLLAMA_API_KEY` as config; `OLLAMA_BASE_URL` is never read or written. Router `write` is a no-op: no Mongo, no job rows. Call cap / cost cap checked BEFORE each call; `--llm` without `--model` or without a cap is refused (exit 2).
3. `scripts/eval/eval-calibration.mjs`: `--llm --model <id> --max-calls|--max-cost-usd <n> [--provider ollama|gemini] [--limit-questions N] [--out f]`. Never overwrites `calibration-report.json`.
4. `scripts/eval-recall.mjs`: same flags; ranks all sessions per question with the LLM, then the UNCHANGED `computeRecallAtK`, null control and `assessBaseline`. Only whole questions are scored; the rest are reported as not-scored. filterBias is reported NOT MEASURED in `--llm` mode.
5. Results: `data/eval/results/<kind>-<provider>-<model>-<date>[-smoke].json` with model id, date, call counts (made/ok/failed/heuristicFallbacks), cost, tokens, latency (mean/p50/p95/max), summary. Secrets are redacted before writing.
Without `--llm` both scripts behave as before (the new code is gated on the flag; dotenv for the calibration script is imported only under `--llm`).

## Constraints quoted (no scoring policy invented)

- evaluator-calibration.md: "This is explicitly NOT the plan's final calibration - a real human-scored set + the real LLM judge ... is the required follow-up". Reference scores are DERIVED (own session 1.0 / other session 0.0); `scoreFn` is the real evaluator seam type (`ScoreFn`). The results JSON restates this under `referenceSet`.
- eval-baseline-control.md C6: "A bare recall number with no control is not a reportable result under this contract." The recall results carry control, chance floor and verdict beside recall@5.
- golden-set-redesign.md condition 1-2: cite the control (0.217) beside every score; "Pass = a recall@5 strictly between 0.217 and 1.000, with a non-zero miss count. 1.000 is a FAILURE of this remedy".
- D-156: U1.4/U1.5 baselines re-point to the redesigned golden set (semantic leg recall@5 0.935). D-164: Ollama Cloud models first (glm-5.3-flash, deepseek-v4.1-flash), Gemini last, existing .env keys.
- Known limitation, for the checker: `createLlmScorer` silently falls back to the heuristic on a failed/unparseable reply. The harness detects that ("fell back") and reports `heuristicFallbacks`; a run with fallbacks > 0 must not be cited as a pure LLM number.

## Evidence

- `node --test --import tsx src/providers/ollama-auth.test.ts` (packages/ai): pass 3 / fail 0 (no key -> original headers exactly; key -> Bearer; env var not read implicitly).
- Full packages/ai suite (`src/*.test.ts src/**/*.test.ts`): pass 220 / fail 0. `node --test scripts/eval/*.test.mjs`: pass 11 / fail 0 (7 new in `llm-eval.test.mjs`, fake transport / fake LLM only). packages/ai `tsc --noEmit`: exit 0. `node scripts/lint-loc.mjs --all`: OK (10 stages, 0 failed).
- SMOKE (3 golden questions = 6 calibration pairs, cap 10 calls, real Ollama Cloud, no Mongo):
  - glm-5.3-flash: calls 6 (ok 6, failed 0, fallbacks 0), MAE 0.133, p50 1904 ms, p95 3258 ms.
  - deepseek-v4.1-flash: calls 6 (ok 6, failed 0, fallbacks 0), MAE 0.122, p50 1864 ms, p95 3226 ms.
  - Results: `data/eval/results/calibration-ollama-*-2026-10-13-smoke.json`; key value grep: 0 occurrences.
- Recall mode is covered by fake-LLM tests only; it was NOT smoke-run live (one question costs 23 calls, over the 10-call cap).

## Full run (NOT executed here)

Per model, with `$env:DOTENV_CONFIG_PATH` pointing at the .env if the worktree has none:
`node scripts/eval/eval-calibration.mjs --llm --model <id> --max-calls 40` (30 pairs) then
`node scripts/eval-recall.mjs --llm --model <id> --max-calls 2200` (92 questions x 23 sessions = 2116 calls, ~67 min serial at the smoke p50 of ~1.9 s/call). Ids: glm-5.3-flash, deepseek-v4.1-flash; Gemini last with `--provider gemini --model <id> --max-cost-usd <n>`.
