# t050-pipeline-graph

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap task T-050, slice 6: graph executor, step 2 of runner adapter -> graph -> /ask graph). T-050 stays in_progress.
Lane: lane/t050graph (from e3fda503). Data-write class (it drives the queue and run-state through the runner): full ceremony.

## Pre-checks
- No LangGraph dependency needed or added (no package.json change); the graph is a minimal typed executor.
- Stage list and order are decided in code: `WEBINAR_PIPELINE` (capture, media, transcript, optional screen, index), taken from the definition, not re-declared. TASKS.md's prose "capture -> transcribe -> extract -> index" is looser; the graph follows the code definition.
- No job-queue, packages/db or apps/api file touched. tenantId is always explicit (the lease carries it into every handler context).

## Scope
New `packages/core/src/pipeline-graph/`: `graph-types.ts`, `pipeline-graph.ts` (`buildGraph(def, handlers, {skip})`, `runGraph({runner, graph, lease})`), `pipeline-graph.test.ts`. NOT exported from `src/index.ts`; not wired to any entry point. Handlers are fakes in tests only.
- buildGraph: names/deps/optionality come from the definition; missing, unknown, inherited handlers and skipping a non-optional stage are refused.
- runGraph: loop step -> handler -> succeed/fail; optional stages configured `skip` are skipped as soon as READY (runner.skip needs a ready stage, so a skip cannot be returned by a started node). A thrown handler = failed attempt `node-threw` (non-retryable, message not recorded). Runner errors (stale lease etc.) stop the loop before any handler runs. Outcomes: complete / failed-terminal / waiting / error.
- Resume and idempotency are the planner's: a new worker re-plans from persisted RunState; done stages are not re-run.

## Open owner question (not depended on)
Whether a terminally failed run should finish its queue job as `done`. The runner adapter currently completes the job; the graph only reports `failed-terminal` and never touches the queue, so either answer needs no graph change.

## Evidence (packages/core, node v24 off-PATH)
- `node --test --import tsx src/pipeline-graph/pipeline-graph.test.ts`: tests 13, pass 13, fail 0; run 15 times: 15/15 green (single process, fakes: MemQueueFs + FakeRunStateFs).
- Covered: graph order (skip and full), resume after crash (after node ran before recorded; after stage start), idempotent rerun, failure stops downstream (non-retryable, retry-exhausted, transient recovery, thrown handler), tenant isolation (two tenants same run key, forged lease), stale lease, waiting, build validation, iteration cap.
- `tsc --noEmit -p tsconfig.json`: exit 0. pipeline-runner tests still 22/22.
- Mutations on pipeline-graph.ts: 10 applied, 10 killed (fail->succeed, skip loop off, throw code retryable, tenant hardcoded, waiting no return, cap ignores input, inherited handlers, step error swallowed, skip non-optional allowed, wrong input fingerprint). Harness untracked, deleted before commit; file blob adfdd15b after.
- Ledger reproductions: none (fixes no filed issue).

## NOT done
No LangGraph library, no /ask graph, no wiring (run-pipeline.mjs, API), no real LLM/STT/MongoDB/network, no multi-process test, no CLI flag (module is unexported instead).
