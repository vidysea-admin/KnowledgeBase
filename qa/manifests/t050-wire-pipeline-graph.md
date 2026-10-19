# t050-wire-pipeline-graph

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (roadmap task T-050, wiring slice: runner adapter + graph -> real entry point). T-050 stays in_progress. Data-write class (drives the queue and run-state files): full ceremony.
Lane: lane/w050 (from 406d5ef4).

## Pre-checks
- D-139 (failed run = FAILED/dead job, resubmit = new generation) is carried by the existing runner; D-142 is the ask graph and is untouched. No D-119 hold on T-050.
- OWNER QUESTION (not decided here): TASKS.md T-050 / .goal/goal.json say "thin LangGraph 1.x workflow". No DECISIONS entry or qa/contract waives that for the PIPELINE graph; the checked slices (t050-pipeline-graph manifest) use a minimal typed executor, no LangGraph package. This wiring uses that executor. Swapping the executor later does not change the wiring seam (runSessionThroughGraph).

## Scope
- NEW `packages/core/src/pipeline-graph/session-run.ts` (+ test): submit -> claim -> runGraph over an injected queue/store, plus a heartbeat decorator (the graph is sequential, so a long transcript/index stage would otherwise let the leases lapse). Not exported from src/index.ts.
- NEW `scripts/webinar/graph/graph-finalize.mjs` (+ test): `graphEnabled(env)` (true only for LKB_PIPELINE_GRAPH === "1"), one idempotent handler per stage (capture: artifact present; media: `finalize` child without --transcribe/--index; transcript: transcribe-long-session.mjs; screen: process-video.mjs; index: sync-session.mjs + validateIndexProof + the same pipeline-state.json marker the sequential path writes), file queue + run-state under `data/webinar-release/pipeline-graph/<session>/`. Any stage failure = non-retryable code `stage-failed`.
- EDIT `scripts/webinar/run-pipeline.mjs` (+8 lines): in the recovery loop only, `if (graphEnabled(env))` runs the graph, then the existing `complete(id)` check and `finishOperation`; else the unchanged `execute(id, ['finalize', ...])`.

## Flag-off identity
Flag OFF (unset, "0", "true", "1 ", etc.): the else branch is the original statement verbatim. Test asserts the finalize child gets the exact original args, the graph runner is never called, and no pipeline-graph directory is created. Existing run-pipeline.test.mjs: 22/22 unchanged.

## Evidence (node v24 off-PATH)
- packages/core `session-run.test.ts`: 6/6; run 15 times: 15/15. Covers complete/done, D-139 dead job + new generation on resubmit, idempotent finished run, tenant isolation, bad graph refused before queueing, heartbeat while running and stopped after.
- `scripts/webinar/graph/graph-finalize.test.mjs`: 5/5; run 5 times: 5/5 (each run ~75 s of tsx start-up, so not 15). Real graph + real file queue/run-state in a temp dir with fake child/scripts: stage order, failure -> dead job, next tick -> new generation -> ready.
- `scripts/webinar/run-pipeline.test.mjs`: 22/22.
- packages/core full suite: 391 tests, 388 pass, 2 fail: both in file-job-queue.pid-reuse.test.ts (real foreign-pid timing probes), and they fail identically on the main tree untouched. Not from this lane.
- tsc --noEmit (packages/core): exit 0. `node scripts/lint-loc.mjs --all`: lint:structure OK, 10 stages, 0 failed.
- Mutations (10 applied, 8 killed, 2 equivalent): flag defaults on; always graph; completion check removed; stage failure swallowed; non-complete outcome ignored; claim wrong tenant; bad graph proceeds; heartbeat stop no-op: all killed. Survivors: succeed() not stopping the heartbeat, and step() not stopping the previous one (each is covered by the other stop path, equivalent). Harness untracked, deleted; blobs verified restored.
- Ledger reproductions: none (fixes no filed issue).

## T-050 acceptance, as far as the task text states it
Met in code: pipeline runs through a graph over a file job queue with checkpoint/resume (RunState) behind an off-by-default flag at the real entry point; failed runs are visible (D-139).
Still needs a live run: LKB_PIPELINE_GRAPH=1 against a real recorded session (real transcribe/process-video/sync-session children, MONGO_WORK_DB isolated); the heartbeat period against real long stages.
Not done: the live `record` path (capture stage) is still the sequential child; only post-capture recovery is graph-driven. No LangGraph library (owner question above). Failure codes are all `stage-failed` (no retry of transient provider errors yet; the stage retry lists need real error classes from the children). Queue/run state is per session directory, not a shared queue.
