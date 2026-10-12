/**
 * packages/core/src/pipeline-runner/runner-types.ts — T-050 slice 5 (runner adapter). UNWIRED, plain TypeScript: no graph library.
 * The interface a LangGraph node (later slice) calls. A graph node stays wiring only: every decision lives in the planner
 * (domain/pipeline-workflow.ts), the queue (job-queue/) and the run-state store (run-state-store/).
 */
export interface RunnerError { source: "runner" | "queue" | "store" | "workflow"; code: string; message: string }
export type RunnerResult<T> = { ok: true; value: T } | { ok: false; error: RunnerError };

/** What a worker holds after `claim`. It is a handle, not an authority: every call re-derives the job and run ids from tenantId + runKey and is fenced by the queue lease. */
export interface RunnerLease { tenantId: string; runKey: string; workerId: string; attempt: number }
/** One started stage attempt; `attemptId` is minted fresh per attempt (run-state contract criterion 3, ABA). */
export interface StageAttempt { stage: string; attemptId: string }

export interface SubmitInput { tenantId: string; runKey: string; sourceFingerprint: string; maxAttempts?: number }
export interface Submitted { runId: string; queue: "enqueued" | "exists"; state: "created" | "exists" }
export interface ClaimedRun { lease: RunnerLease; runId: string }

export type Step =
  | { kind: "started"; attempt: StageAttempt; inputFingerprint: string; attemptNumber: number; cause: string }
  | { kind: "waiting"; reason: string }
  | { kind: "complete" }
  | { kind: "failed-terminal"; stage: string; code: string; why: string };

export interface PipelineRunner {
  /** Idempotent: enqueue the job and create the initial RunState. Ids are derived from tenantId + runKey (a one-way hash), so tenants never share a run or a job. */
  submit(input: SubmitInput): RunnerResult<Submitted>;
  /** Claim the oldest job of THIS tenant (the queue claim is always tenant-restricted). null = nothing to do. */
  claim(workerId: string, tenantId: string): RunnerResult<ClaimedRun | null>;
  /** Plan the run and start the first ready stage, or report waiting / complete / failed-terminal (the last two finish the queue job). */
  step(lease: RunnerLease): RunnerResult<Step>;
  heartbeat(lease: RunnerLease, at: StageAttempt): RunnerResult<null>;
  succeed(lease: RunnerLease, at: StageAttempt, outputFingerprint: string): RunnerResult<null>;
  fail(lease: RunnerLease, at: StageAttempt, errorCode: string): RunnerResult<null>;
  /** Cleanly skip an OPTIONAL stage that is ready. */
  skip(lease: RunnerLease, stage: string): RunnerResult<null>;
}
