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

---

# Cycle 1

**VERDICT:** PASS
**Cycle checked:** 1
**Commit checked:** 9183ee95 (lane/u010harness)

## EXPLANATION

1. ISS-U010HARNESS-001 reproduction (`--llm --model m --max-cost-usd 5`): refused for both `--provider ollama` and `--provider gemini` with the message naming `--max-calls`; 2/2 refused. Variants also refused: `--max-calls 0`, `--max-calls abc`, bare `--max-calls`, no cap (10/10 refused across both providers). Real scripts `eval-recall.mjs` and `eval/eval-calibration.mjs` exit code 2 on the repro.
2. No live path without an effective cap: parseLlmArgs is the single gate (both scripts return exit 2 on `.error`), and the only accepted shapes carry a finite positive `maxCalls`, which is the binding cap (calls++ is synchronous, checked before each call). Gemini goes through the same gate and the same capHit. Cost cap is now only an additional stop alongside maxCalls.
3. Boundary tests: capHit at costUsd === maxCostUsd true, 0.4999 false; calls === maxCalls true, one below false; no caps false.
4. Warning: `fallbackWarning` spread top-level in both recall and calibration results; absent when fallbacks = 0, present with "NOT a pure LLM number" when > 0 (unit-tested).
5. scripts/eval tests 14/14 (3 runs, 0 fail); packages/ai 220/220; tsc exit 0; lint-loc OK (10 stages).
6. Mutations on llm-eval.mjs (hash-verified applied, restored, HEAD blob 204d5fed == worktree): cost `>=`->`>` KILLED (cycle-0 survivor now dead), cost-only refusal disabled KILLED, warning threshold `>0`->`>1` KILLED. 3/3 killed.

No real API calls made; untracked data/eval/results files untouched.

## ISSUES-WRITTEN: none (ISS-U010HARNESS-001 closed; ISS-U010HARNESS-002 low warning-field note also addressed by this cycle)
