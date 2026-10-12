# Verdict — t050-ask-graph

**Cycle checked:** 0
**Commit under check:** c8f82553 (lane/t050askgraph, from bea0272a)

## VERDICT: PASS

## EXPLANATION
Re-ran with fakes only, no network.
- tsc --noEmit -p packages/ask/tsconfig.json: exit 0.
- ask-graph + ask-v2 + bounded-ask tests: 46/46. Full packages/ask suite (all src/*.test.ts and src/eval): 111/111.
- Diff vs main touches only ask-graph.ts, ask-graph.test.ts and the manifest. ask-v2.ts and index.ts are unchanged.
- Unexported and unreachable: a repo-wide grep finds `ask-graph`/`askGraphV2` only in the two new files. Not in index.ts and not imported by apps/api or any route. packages/ask has no `exports` map (main is ./src/index.ts), so a deep import is possible but nothing does it.
- Tenant scoping and errors match askV2:
  - Node bodies are verbatim copies, including the membership resolve (ISS-157/158) and the dropped-candidate audit.
  - Every write carries the request tenantId.
  - Node errors propagate unwrapped, and askGraphV2 repeats the BoundedAskError refusal write.
  - Golden tests compare error, writes and provider calls for each of the 4 nodes (legacy mode) and for 3 bounded refusals plus the heuristic-degraded one.

Golden equivalence is real. Each scenario runs askV2 and askGraphV2 on separate fresh fakes and compares result (deepEqual and JSON), writes and provider calls. Any change to askV2 in a covered branch fails the suite.

Covered: correct, ambiguous (plain refine + sync web), tavily ok/throws/absent, extra arm, degraded arm, ghost-tenant node, poisoned real-id node, threshold boundary, bounded correct, bounded ambiguous (boundedRefine), bounded early return, bounded poisoned arm, bounded refusals, per-node failure.

Uncovered branches (see ISS-T050ASKGRAPH-001):
- bounded + tavily with results
- candidates > SOURCE_LIMITS.candidates (slice and audit)
- scoreFnForComplete set
- hydrate().degraded
- legacy tavily returning []
- completionBudget assertHealthy refusal
- non-BoundedAskError wrapped in bounded mode

Checker mutations on ask-graph.ts (11, per-mutation byte backup restored in finally, hash equal to HEAD blob after each, harness deleted):
- Killed (8): skip tavily, threshold >= to >, verdict forced non-correct, empty internal citations, plain/bounded refine swapped, skip dropped-audit, skip score audit, skip heuristic refusal.
- Survived (3): web sources dropped from boundedSources, candidate slice removed, scoreFnForComplete ignored. All three sit in the uncovered branches above.

Drift risk: the body is duplicated (~150 lines). Divergence is caught only where a scenario exists. Rated medium (ISS-T050ASKGRAPH-002). The mitigations are that the module is off, unexported and unwired, so there is no user impact now. The fix is to close -001 and refactor askV2 onto the shared node functions before any switch-over.

PASS because the unit's stated scope (unexported, off, golden-equal on the covered branches) holds and nothing is wired. Per repo policy both findings are medium: ledger entries, not units, and not security class.

ISSUES-WRITTEN: ISS-T050ASKGRAPH-001, ISS-T050ASKGRAPH-002
