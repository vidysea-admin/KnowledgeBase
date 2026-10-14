# Verdict — iss-t050askgraph-001-002-golden-coverage-and-shared-nodes

**Cycle checked:** 0
**Commit under check:** ba04e343 (lane/askshared, from 14cf68d8)

## VERDICT: PASS

## EXPLANATION
1. Baseline provenance (independent): the lane's test scenarios were copied to a scratch file and re-run against MAIN's original askV2 (main ask-v2.ts, hash == HEAD blob, main untouched) in record mode. The output is byte-identical (cmp) to the lane's ask-graph.baseline.json, all 21 scenarios. The baseline was taken from the old code.
2. The frozen baseline covers only the 21 `S` scenarios. The refusal and error tests (3 bounded refusals, heuristic refusal, budget refusal, 2 wraps, legacy no-wrap, 4 per-node failures) are only self-comparisons after the refactor. I therefore traced every askV2 invocation in the whole lane test file (33 calls: result or error, every write, every complete kind) against main's original and the lane's. They are identical; the only diff is the wall-clock elapsedStartMs (1 vs 0). Branch coverage vs main's runAskV2: every branch has a scenario (extra arms, degraded, dropped, cap, hydrate degraded, scoreFn variants, heuristic, tavily ok/empty/throws, bounded empty early return, refine plain/bounded, both assertHealthy, wrap).
3. API: index.ts byte-unchanged. ask-v2.ts exports are the same (AuditEntry, AskV2Deps, AskV2Result, askV2); the dropped webDocText and collectNodesById were never exported. ask-graph is not in index.ts, and only ask-v2.ts and the tests reference it. The import is one-way for values (ask-graph imports only types from ask-v2). OWNER NOTE: "off by default" now means only "not exported"; the graph code IS the production /ask path via askV2, so D-142's "off by default" is true of the symbol but not of the code. D-142 should be reworded if it is meant as a behaviour flag.
4. The claimed-equivalent mutant is NOT equivalent. Dropping the first `assertHealthy` after evaluate fails a scenario I added: swallowed budget failure (as the evaluator's heuristic fallback does) + score below lower + no tavily. The original refuses with "budget exhausted"; the mutant returns the polite "No supported internal source..." success, because refine returns early and the sticky failure is never rethrown (it also lets tavily run). The checker's new test killed it. The existing suite does not pin it, so the manifest claim is wrong. Production behaviour is unchanged (HEAD refuses correctly); this is a coverage gap. The second assertHealthy (after answer) is equivalent: answer.ts has no catch.
5. My mutations (harness untracked in the worktree, timeout, per-mutation byte backup restored in a trap, hash == HEAD blob verified after each, harness deleted): M1 first assertHealthy dropped SURVIVED the lane suite (killed only by my new test); M2 second assertHealthy dropped survived (equivalent); killed: M3 goodDocNodes lower->upper, M5 bounded wrap removed, M6 verdict condition, M7 ask.score tenantId, M8 upper default, M9 askV2 wrapper change. M4 did not match the source text, so it was not run.
6. tsc clean (packages/ask, and apps/api via a temporary paths mapping to the lane's @lkb/ask, resolution confirmed, mapping deleted). packages/ask suite 122/122. apps/api ask tests 129/129 (fakes only).

PASS: behaviour is preserved against the original (provenance and traces verified); the open finding is a medium coverage gap, not security class.

ISSUES-WRITTEN: ISS-ASKSHARED-001 (medium, qa/issues.askshared.jsonl)
