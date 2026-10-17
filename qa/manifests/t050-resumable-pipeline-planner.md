# t050-resumable-pipeline-planner

Status: checked-PASS (Checked: qa/verdicts/t050-resumable-pipeline-planner.md, cycle 0, 43db8de; pure planner, provisional stage list, unwired)
Fix cycle: 0
Tier: 3 (roadmap task T-050, FIRST SLICE ONLY). T-050 stays open.
Lane: lane/t050flow (from 5f8eb75). Touches no auth, tenancy or data write: pure functions, no I/O.

## What T-050 approved (read exactly)
TASKS.md / goal.json: "Pipeline as a thin LangGraph 1.x workflow (capture -> transcribe -> extract -> index) with checkpoint/resume + a job queue; /ask router as a graph. Standard: graph = wiring only, logic stays in functions/skills; multi-agent (Deep Agents) only for the counsellor (T-013); approved by Umesh 2026-09-24."
So the approved technology is LangGraph 1.x (graph is wiring only) plus a job queue. NOTHING of it is installed or integrated here. This slice is the "logic stays in functions" part: a pure planner a graph node or queue worker can call.

## Scope
- `packages/core/src/domain/pipeline-workflow.ts`: types, definition/state validation, `planNext`, `initialState`, `WEBINAR_PIPELINE`.
- `packages/core/src/domain/pipeline-workflow-reduce.ts`: `applyEvent` reducer. Takes the definition as first argument (`applyEvent(def, state, event)`): needed for dependency and retry rules.
- Tests: `pipeline-workflow.test.ts` (scenarios), `pipeline-workflow.property.test.ts` (seeded random DAGs).
- Not exported from `packages/core/src/index.ts`: no existing consumer's types change. Import by path.
- D-119 reserved files untouched. run-pipeline.mjs, contracts/, qa/contracts, TASKS.md, goal.json, enforcement paths untouched.

## Stage list and provenance
`capture -> media -> transcript -> screen (optional) -> index`, linear chain, definition format supports any DAG (deps must name earlier stages).
- capture: TASKS.md T-050 wording and the runner's recording phase (`run-pipeline.mjs` statuses recording/processing; `record` child).
- media, transcript: `validation.json` stages `"media"` and `"transcript"` in `packages/meeting-bot/src/capture/record-finalize.ts`.
- screen, index: `processRecordingArtifacts` in the same file (`let stage = "screen"`, then `stage = "index"`, written to `pipeline-state.json`; `--process-video` is optional, so `screen` is `optional`).
- "extract" in the TASKS wording has no separate stage today: claims/summary/chunks/tree are keys inside the index proof (`validateIndexProof`), so they are part of `index`. Not invented as a stage.
- Retry numbers (maxAttempts, retryable codes, 120 s lease) are PLACEHOLDERS, not read from the runner (the runner has its own retry logic, unmodified). Slice 2 must reconcile them.

## State model
Per stage: `status` (pending/running/done/failed/skipped), `attempt`, `attemptId`, `errorCode`, `inputFingerprint`, `outputFingerprint`, `heartbeatAt`. Run: `sourceFingerprint`. Expected input of a stage = `source:<fp>` for roots, else `dep:outputFp` pairs of its deps. Valid = done/cleanly skipped + recorded input equals expected + all deps valid.

## Guarantees ("resumable")
1. Same inputs give the same plan (deterministic; `now` injected, no clock reads, no I/O imports).
2. Never plans a stage whose dependency is not valid-done.
3. Never re-runs a done stage whose input fingerprint is unchanged.
4. Changed upstream output (or source) invalidates exactly the downstream closure; nothing upstream. A re-run that reproduces the same output fingerprint leaves downstream valid.
5. Failed stage: exactly that stage is ready again if the code is retryable and attempts remain; else run is failed-terminal with `{stage, code, why}`.
6. Dead worker: `running` with `now - heartbeatAt >= leaseMs` is stale: ready again (consumes an attempt; lease-expired is always retryable) or terminal when exhausted. Live lease: outcome `waiting`.
7. Bounded: a run terminates within sum(maxAttempts) attempt starts under any single-worker event order (property-tested).
8. Reducer: rejects succeeded/failed/heartbeat without a started attempt (`invalid-transition`); events from a superseded attempt id (`stale-attempt`, state unchanged); start on a live lease (`already-running`, so never two running attempts of one stage); start on a done stage (`already-done`); wrong input fingerprint (`input-mismatch`); start after terminal failure (`run-terminal`).
9. Duplicate delivery decision: a typed rejection `duplicate-event`, never a second change. Input state is never mutated (works on frozen state).
10. Hostile definition/state/event/now (wrong types, unknown stage, negative or NaN attempt, NaN time, throwing proxies) yields `outcome: "invalid"` or `{ok:false,error}`; never throws.
11. A stage "skipped" with an error code is never "complete": failed-terminal (`skipped-with-error`). Clean skip of an optional stage satisfies dependents.
Attempt budget resets when the stage's input changes.

## NOT done
No queue, no worker, no LangGraph (approved, not installed), no wiring into run-pipeline.mjs, no persistence, no stored schema or operations row change, no /ask graph, no heartbeat emitter. T-050 stays open.

## Proposed next slices (in order)
1. Reconcile definition with the runner: map operations.json statuses and `pipeline-state.json` onto RunState, read-only adapter plus tests (needs the runner owner; U4.1/T-051/T-052 HOLD, D-119 reserved files).
2. Persistence adapter: atomic read/write of RunState per session (file first), compare-and-swap on attemptId.
3. Single-process worker loop driving `planNext`/`applyEvent` with real heartbeats, behind a flag; killed-mid-run resume test.
4. Job queue seam (interface + file-backed impl), then the approved LangGraph 1.x wrapper (needs dependency approval at install time).
5. /ask router as a graph.

## Evidence
Commands from `packages/core` with node v24.19.0 (off-PATH location per toolchain memory).
- `node --test --import tsx src/domain/pipeline-workflow.test.ts src/domain/pipeline-workflow.property.test.ts` -> `tests 30, pass 30, fail 0` (27 scenario tests incl. per-stage resume-after-failure and dead-worker for all 5 stages; 3 property tests, 300 seeded random DAGs each: termination within sum(maxAttempts), invalidation closure equals computed descendants and re-run set equals it exactly once, hostile mutation never throws).
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0, no output.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (115 dir(s) within budget)`.
- Non-blank lines: pipeline-workflow.ts 165, -reduce.ts 86, test 263, property test 130.

## Mutations (12; each run killed by a test; harness in-lane, byte backup per mutation, restore in finally, 120 s kill)
| Mutation | Result | Killing tests (first) |
|---|---|---|
| dependency check dropped | KILLED (12) | property: random DAGs ... terminate |
| fingerprint comparison dropped | KILLED (4) | upstream output change invalidates exactly the downstream closure |
| stale-lease check inverted | KILLED (7) | resume after dead worker (each stage); property livelock guard |
| attempt cap off by one | KILLED (3) | retry budget is bounded: attempt cap is exactly maxAttempts |
| late-event guard removed | KILLED (1) | late event from a superseded attempt is rejected and changes nothing |
| downstream invalidation one level deep | KILLED (3) | upstream output change invalidates exactly the downstream closure |
| retryable set ignored | KILLED (2) | non-retryable error code is terminal even with attempts left |
| complete reported when skipped-with-error | KILLED (1) | a skipped stage carrying an error is never reported complete |
| live lease can be superseded | KILLED (3) | a live lease cannot be superseded |
| duplicate start-attempt guard removed | KILLED (1) | duplicate delivery is a typed rejection |
| start input-fingerprint check removed | KILLED (1) | impossible transitions ... input-mismatch |
| lease expiry does not consume budget | KILLED (5) | dead workers burn the attempt budget / property |
Fidelity: after the run `git hash-object` of both source files equals the staged blob that is committed unchanged (the files were not in HEAD when the harness ran).

Process notes (honest): (a) the first mutation run used a generic `mut.mjs` in the shared scratchpad that another agent had overwritten; it ran another lane's mutation list from my cwd. It found no matching files, wrote nothing, my worktree stayed clean (hashes verified). (b) The first stale-lease mutant livelocked the property driver; I killed the node process and restored the file from the staged blob; a livelock guard was added to the driver and the mutation re-run is killed cleanly. Harness is now lane-named, absolute-path, deleted before commit.
