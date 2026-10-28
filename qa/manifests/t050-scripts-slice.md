# t050-scripts-slice

**Handshake status:** checked-PASS
Fix cycle: 0
Lane: lane/w16-t050scripts (base a9fac545). Touches only scripts/webinar/graph/* (+ this manifest).
Contract: qa/contracts/goal-t050.md (scripts slice: criteria 3, 5, 6 at the script boundary). packages/core is another lane.

## State at base
stage-process.mjs (bounded child, classified retry codes), proof-marker.mjs (atomic identity-bound marker), completed-session.mjs + graph-finalize.mjs (acknowledged-completion repair) already existed and were covered by tests.

## Changes
- stage-process.mjs: a child reporting EBUSY/EIO/EMFILE/ENFILE only through stderr now classifies as `io-error` (retryable). Before, only the in-process error.code path did, so a file lock in a separate child became non-retryable `stage-failed` (ISS-W050-001 file-lock case). Diagnostic text still never escapes.
- stage-process.test.mjs: 3 classification rows plus a real-child test (stderr EBUSY -> `io-error`, no private marker leaked).
- graph-finalize.test.mjs: stale expectation fixed. The sequential finalize child now carries `--tenant fixture` (run-pipeline.mjs, base); the test expected the old args.

## Evidence
- Env: node 24.19.0 via codex runtime; lane junctions to main node_modules (root, packages/*, apps/*). Without the packages/core junction `@langchain/langgraph` is not found (environment gap, not a failure).
- Base run of graph-finalize.test.mjs: 3 pass / 2 fail (stale `--tenant` arg; "real graph" test failed once under load with reason service-stopped, passed alone and in every later run).
- After: `node --test --test-force-exit --import tsx scripts/webinar/graph/*.test.mjs`: tests 16, pass 16, fail 0, 15 of 15 runs (15-26 s each). stage-process + proof-marker + completed-session (8 tests): 15 of 15 runs pass (7-13 s each).
- Note: without `--test-force-exit` the graph-finalize.test.mjs process does not exit after the tests finish (an open handle from the run-pipeline import tree); it ran to the 300 s timeout. Not fixed here (run-pipeline.mjs is out of scope).
- ISS-W050-001 corpus: 1/1 reproduction refused. The wired transient 503 test (graph-retry.test.mjs) retries only the failed stage (media 1, transcript 2, screen 1, index 1); classification table 12/12; real-child stderr cases 429, EBUSY classified.
- ISS-W050-002 (packages/core/src/pipeline-graph/session-run.test.ts, mutation M4: `everyMs > 0` -> `false` at session-run.ts:42): still reproduces at base, test passes 6/6 with the heartbeat timer disabled. Left open: package belongs to the core lane. Mutation applied with per-mutation byte backup; restored, `git hash-object` equals HEAD blob 85dd8285.

## NOT done / needs other lanes
- ISS-W050-002 fix (core lane).
- run-pipeline.mjs / capture driver not touched; graph-finalize.test.mjs process-hang handle belongs there.
- No real provider/media long-stage evidence, no live DB.
