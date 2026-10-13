# Verdict - u010harness

**VERDICT:** FAIL
**Cycle checked:** 0
**Commit checked:** deb42089 (lane/u010harness)

## EXPLANATION

Passing: packages/ai suite 220/220; scripts/eval tests 11/11; tsc exit 0; lint-loc OK (10 stages). Ollama construction sites: production.ts:139,145 and eval-note-judge.mjs:50 pass no apiKey (adapter never reads env), so `speakers: [ollama]` cannot gain a key or leave OLLAMA_BASE_URL; only llm-eval.mjs:53 sets baseUrl+apiKey, on its own one-provider chain. Headers are byte-identical without a key (blank is trimmed). The key never reaches output: console prints counts only, fetch errors reach results only via stats.errors/reason and writeResults redacts the whole JSON; grep of committed results for Bearer/key patterns found nothing. Call cap is checked before the call and calls++ is synchronous, so no off-by-one or concurrency gap for calls. `--llm` without a cap or model is refused (exit 2). Without `--llm` both scripts are unchanged (gated; calibration `--llm` branch placed after the pairs build). Recall mode keeps computeRecallAtK, null control and assessBaseline and restates the control beside recall (eval-baseline-control C6 "A bare recall number with no control is not a reportable result"; I1); filterBias reported NOT MEASURED. heuristicFallbacks are counted per call, per pair and per question; callSummary exposes heuristicFallbacks.

Mutations (hash-verified applied and restored; HEAD blob == worktree for ollama.ts and llm-eval.mjs): header-always-on KILLED, cap `>=`->`>` KILLED, cap check removed (after-call) KILLED, redactor identity (key in output) KILLED, cost cap `>=`->`>` SURVIVED. 4/5 killed.

BLOCKING: the cost cap is inert. Both OllamaProvider (ollama.ts:93) and GeminiProvider (gemini.ts:85) return `costUsd: 0`, so `--llm --model m --max-cost-usd 5` is accepted as "a cap" and can never trip: an unbounded paid run, which defeats the D-164 spend guard and the "refuses to run without a cap" requirement in substance. Fix: reject cost-only caps (require --max-calls) or price from tokens; add a boundary test.

Notes (not blocking): the results JSON has no explicit top-level warning field when heuristicFallbacks > 0; the count is present at calls.heuristicFallbacks and per-pair/question but a reader must look. Add a `warning` string when > 0 as the brief expects. Untracked full-run result files (calibration-*-2026-10-13.json, non-smoke) appeared in the worktree during the check; not mine, not committed (30 pairs, 0 fallbacks, MAE 0.044 glm).

## ISSUES-WRITTEN: ISS-U010HARNESS-001 (high), ISS-U010HARNESS-002 (low)
