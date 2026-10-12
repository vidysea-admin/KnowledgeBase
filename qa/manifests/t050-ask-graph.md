# t050-ask-graph

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (roadmap task T-050, slice 7: /ask graph, after runner adapter and pipeline graph). T-050 stays in_progress.
Lane: lane/t050askgraph (from bea0272a). Touches the /ask path (tenant scoping, citations): full ceremony.

## Pre-checks
- No contract specifies the /ask graph nodes. Node list decided by Umesh: 4 coarse nodes, recorded as D-142 (pending append): retrieve (selectNodes, extra arms, rrfMerge, tree-membership resolve, sourceContext hydrate/bound), evaluate (ask() evaluation, tavily fallback, score audit), refine (bounded or plain), answer. Nodes may be split later.
- Switch-over policy: none. Module is unexported (not in index.ts), nothing calls it. askV2 is byte-unchanged.
- Did not reuse the pipeline-graph executor (it is bound to RunState/queue leases); a 10-line sequential executor is used instead.

## Scope
New in packages/ask/src only: `ask-graph.ts` (ASK_GRAPH, initAskGraphState, runAskGraphNodes, askGraphV2), `ask-graph.test.ts`. No other file touched (no core, job-queue, apps/api).
- Node bodies copy askV2's statements verbatim and call the same functions (selectNodes, ask, refine, boundedRefine, answer). A node error propagates unwrapped; askGraphV2 repeats askV2's BoundedAskError refusal handling.
- The bounded "no supported source" early return is a node setting `result`, which ends the run before the answer node.
- Duplication of the askV2 body is deliberate (keeps the production path untouched); the golden tests are the guard against drift.

## Evidence (packages/ask, node v24 off-PATH)
- `node --test --import tsx src/ask-graph.test.ts`: tests 21, pass 21, fail 0. With ask-v2.test.ts and bounded-ask.test.ts: tests 45 pass 45 (before the 21st test was added).
- Golden: 14 scenarios + 3 bounded refusals + heuristic-degraded refusal; each runs askV2 and askGraphV2 on separate fresh fakes and compares result (deepEqual and JSON string), every recordJob write (minus createdAt), and every provider call. Includes correct, ambiguous, sync web, tavily ok/throws/absent, extra arm, degraded arm, ghost tenant node, poisoned real-id node, score exactly at lower threshold, bounded correct/ambiguous/empty-web/poisoned arm.
- Node failure per node (retrieve, evaluate, refine, answer): same unwrapped error and same writes as askV2.
- Tenant: all writes carry the request tenantId; a t9 ghost node from an arm is dropped and audited.
- `tsc --noEmit -p tsconfig.json`: exit 0.
- Mutations on ask-graph.ts: 10 applied, 9 killed. Survivor 1 (threshold `>=` to `>`) was found by the first 9, test added, then killed. Survivor 2 (removing `return;` after the bounded early result) is an equivalent mutant: the executor stops on `result` regardless. Others killed: verdict inverted, membership resolve dropped, web_used false, boundedSources dropped, tavily-error audit removed, refusal write kind changed, score audit skipped. Harness untracked, deleted before commit; file blob 6f5d4ec2 after (verified equal to the intended blob).
- Ledger reproductions: none (fixes no filed issue).

## NOT done
No wiring, no switch, no export, no real LLM/embeddings/DB/network. Not LangGraph. Tests are single-process, deterministic.
