# iss-t050askgraph-001-002-golden-coverage-and-shared-nodes

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: roadmap-adjacent (T-050 ask graph; medium issues ISS-T050ASKGRAPH-001 and -002). Touches the PRODUCTION /ask path (askV2): full ceremony. Verdict by the checker only.
Lane: lane/askshared (from lane/t050askgraph 14cf68d8). Ledger rows ISS-T050ASKGRAPH-001/-002 status NOT changed here. Only packages/ask touched (+ this manifest).

## ISS-T050ASKGRAPH-001: golden scenarios (commit a897e03e, test + baseline only, before the refactor)
New scenarios in `ask-graph.test.ts`, each run on askV2 AND askGraphV2 on fresh fakes, with explicit per-scenario assertions: bounded + tavily with web results (web cited), candidate cap (8 -> 6, audit text, hydrate sees 6) and exactly-at-cap (6, no audit), scoreFnForComplete set (one logged ask.score, no per-node entries) and absent (2 entries), hydrate degraded (failed write + audit), legacy tavily [] (web_used true, no web_fallback_empty), completion-budget refusal (swallowed over-budget call then assertHealthy; JSON refusal write, job_byte_limit), non-BoundedAskError wrapped in bounded mode (2 sources: answer, select_nodes; raw message not leaked), non-Bounded error NOT wrapped in legacy mode. elapsedStartMs (wall clock) is masked in the rig, after a flaky 4/15 failure was traced to it.

## ISS-T050ASKGRAPH-002: one implementation
`ask-v2.ts`: the ~190-line `runAskV2` body, `webDocText`, `collectNodesById` removed; `askV2` is now a thin function delegating to `askGraphV2` (retrieve -> evaluate -> refine -> answer node functions in ask-graph.ts; the refusal wrapper exists once). Public API (`askV2`, `AskV2Deps`, `AskV2Result`, `AuditEntry`) unchanged; ask-graph.ts still not exported from index.ts, off by default. Because the two-way comparison is now self-comparison, a frozen baseline `ask-graph.baseline.json` (result, writes, provider calls per scenario, recorded from the ORIGINAL duplicated askV2 before the refactor) is asserted in every golden scenario. No existing test expectation changed.

## Evidence (fakes only; no network/browser/Mongo)
```
packages/ask: all src/*.test.ts + src/eval/*.test.ts  ℹ tests 122 ℹ pass 122 ℹ fail 0   (was 111 + 11 new)
ask-graph.test.ts x15 runs: 15/15 pass (32 tests each)
apps/api (temp tsconfig paths @lkb/ask -> worktree, deleted): ask-tenant-hostile, ask-tenant-isolation, source-context, ask-arms, ask-web-fallback, routes/ask/ask.test  ℹ tests 129 ℹ pass 129 ℹ fail 0
tsc --noEmit: packages/ask clean; apps/api (with the paths mapping) clean
```
Mutations on ask-graph.ts (harness untracked, per-mutation byte backup in finally, hash == HEAD blob after): 8/9 killed: web dropped from boundedSources, candidate slice removed, scoreFnForComplete ignored (the checker's 3 survivors), candidates_bounded audit dropped, degraded write dropped, legacy tavily [] treated as empty, non-Bounded wrap removed, per-node ask.score audit dropped. Survivor: removing the first `budget.assertHealthy()` after evaluate is behaviourally equivalent (the budget failure is sticky and the next complete call in answer rethrows it; same writes, same calls).

## Reproductions
- ISS-T050ASKGRAPH-001: the three recorded survivors (a) web sources dropped, (b) candidate slice removed, (c) scoreFnForComplete ignored: 3/3 killed; plus the four named uncovered branches (hydrate degraded, legacy tavily [], budget refusal, non-Bounded wrap): 4/4 now pinned and killed by mutants.
- ISS-T050ASKGRAPH-002: duplicated body removed (askV2 and graph run the same nodes); drift in any branch now fails either the node's scenario or the frozen baseline. The fix_direction's "source-text drift test" is moot (no second copy).
