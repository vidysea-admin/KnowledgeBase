/**
 * packages/core/src/pipeline-runner/pipeline-runner.ts — T-050 slice 5. UNWIRED runner adapter over the file job queue and the run-state store.
 * Node-only (it sits beside those two): NOT exported from src/index.ts (run-state contract criterion 6).
 * Rules it carries from the BEFORE-WIRING lists:
 *  - tenantId on every claim and every LeaseRef (queue B3); job and run ids are a hash of tenantId + runKey, so an id is neither guessable nor shared (queue B4).
 *  - a fresh attemptId per attempt, from an injected minter (default crypto.randomUUID) (store B3 / ABA).
 *  - every state change is load -> pure event -> CAS save; `conflict` is retried a few times with a reload, anything else (incl. `locked`) is returned for the caller to retry (store B8).
 *  - D-139: a run that ends failed-terminal finishes its queue job as FAILED ("dead", via fail with terminal:true), never done. A resubmit of the same runKey after that starts a NEW
 *    attempt = a new GENERATION (a new job id and run id; generation 0 keeps the original ids). In-flight and succeeded runs stay idempotent.
 *  - every operation first heartbeats the queue lease, which fences a stale worker before any state is touched.
 */
import { createHash, randomUUID } from "node:crypto";
import { initialState, planNext, type RunState, type WorkflowDef } from "../domain/pipeline-workflow.js";
import { applyEvent, type WorkflowEvent } from "../domain/pipeline-workflow-reduce.js";
import { validateQueueId, type JobQueue, type LeaseRef } from "../job-queue/queue-types.js";
import type { RunStateStore } from "../run-state-store/run-state-store.js";
import type { ClaimedRun, PipelineRunner, RunnerError, RunnerLease, RunnerResult, StageAttempt, Step, SubmitInput, Submitted } from "./runner-types.js";

export interface PipelineRunnerOptions { def: WorkflowDef; queue: JobQueue; store: RunStateStore; now: () => number; mintAttemptId?: () => string; maxConflictRetries?: number }
const ok = <T>(value: T, warning?: string): RunnerResult<T> => (warning ? { ok: true, value, warnings: [warning] } : { ok: true, value });
const bad = (source: RunnerError["source"], code: string, message: string): { ok: false; error: RunnerError } => ({ ok: false, error: { source, code, message } });
const qerr = (e: { code: string; message: string }) => bad("queue", e.code, e.message);
const idOf = (tenantId: string, runKey: string, generation = 0) => `r-${createHash("sha256").update(generation === 0 ? `${tenantId}\0${runKey}` : `${tenantId}\0${runKey}\0${generation}`).digest("hex").slice(0, 32)}`;
const MAX_GENERATIONS = 10_000;
const validGeneration = (g: unknown): g is number => Number.isSafeInteger(g) && (g as number) >= 0 && (g as number) <= MAX_GENERATIONS;
/** A queue-safe error code for the failed job: the stage's own code when it is a valid queue id, else a fixed one. */
const failCode = (code: string) => (validateQueueId(code, "error code") === null ? code : "run-failed");
const checkIds = (tenantId: unknown, runKey: unknown) => validateQueueId(tenantId, "tenant id") ?? validateQueueId(runKey, "run key");
const checkLease = (l: RunnerLease) => checkIds(l?.tenantId, l?.runKey) ?? validateQueueId(l?.workerId, "worker id")
  ?? (Number.isSafeInteger(l?.attempt) ? null : { code: "invalid-input", message: "lease attempt must be an integer" })
  ?? (l?.generation === undefined || validGeneration(l.generation) ? null : { code: "invalid-input", message: "lease generation must be a small non-negative integer" });

type Built<T> = { event: WorkflowEvent; value: T } | { done: RunnerResult<T> };

export function createPipelineRunner(o: PipelineRunnerOptions): PipelineRunner {
  const mint = o.mintAttemptId ?? randomUUID, retries = o.maxConflictRetries ?? 3;
  const lid = (l: RunnerLease) => idOf(l.tenantId, l.runKey, l.generation ?? 0);
  const refOf = (l: RunnerLease): LeaseRef => ({ id: lid(l), workerId: l.workerId, attempt: l.attempt, tenantId: l.tenantId });

  /** Fence + load + `build` + CAS save, reloading on `conflict`. `build` returns an event, or a result to hand back without saving. */
  function mutate<T>(l: RunnerLease, build: (s: RunState, now: number) => Built<T>): RunnerResult<T> {
    const badLease = checkLease(l); if (badLease) return qerr(badLease);
    const hb = o.queue.heartbeat(refOf(l)); if (!hb.ok) return qerr(hb.error);
    const runId = lid(l);
    for (let i = 0; i <= retries; i++) {
      const ld = o.store.load(runId); if (!ld.ok) return bad("store", ld.code, ld.message);
      if (ld.state === null) { o.queue.fail(refOf(l), "run-missing"); return bad("runner", "run-missing", "no run state exists for this job"); }
      const b = build(ld.state, o.now());
      if ("done" in b) return b.done;
      const next = applyEvent(o.def, ld.state, b.event); if (!next.ok) return bad("workflow", next.error.code, next.error.message);
      const sv = o.store.save(runId, ld.state, next.state);
      if (sv.ok) return ok(b.value, sv.warning);
      if (sv.code !== "conflict") return bad("store", sv.code, sv.message);
    }
    return bad("store", "conflict", "state kept changing; reload and retry");
  }
  const stageEvent = (type: "heartbeat" | "stage-succeeded" | "stage-failed", at: StageAttempt, now: number, extra: object) =>
    ({ type, stage: at.stage, attemptId: at.attemptId, at: now, ...extra }) as WorkflowEvent;

  return {
    submit(i: SubmitInput): RunnerResult<Submitted> {
      const b = checkIds(i?.tenantId, i?.runKey); if (b) return qerr(b);
      if (typeof i.sourceFingerprint !== "string" || i.sourceFingerprint.length === 0) return bad("runner", "invalid-input", "sourceFingerprint must be a non-empty string");
      // D-139: find the current generation. A generation whose run ended failed-terminal is dead (its job is FAILED): the resubmit is the next generation.
      let generation = 0;
      for (;; generation++) {
        if (generation > MAX_GENERATIONS) return bad("runner", "too-many-attempts", "too many failed attempts for this run key");
        const cur = o.store.load(idOf(i.tenantId, i.runKey, generation)); if (!cur.ok) return bad("store", cur.code, cur.message);
        if (cur.state === null || planNext(o.def, cur.state, o.now()).outcome !== "failed-terminal") break;
      }
      const runId = idOf(i.tenantId, i.runKey, generation);
      const payload = generation === 0 ? { runKey: i.runKey, sourceFingerprint: i.sourceFingerprint } : { runKey: i.runKey, sourceFingerprint: i.sourceFingerprint, generation };
      const q = o.queue.enqueue({ id: runId, tenantId: i.tenantId, payload, maxAttempts: i.maxAttempts });
      if (!q.ok) return qerr(q.error);
      const ld = o.store.load(runId); if (!ld.ok) return bad("store", ld.code, ld.message);
      if (ld.state !== null) return ok({ runId, queue: q.value, state: "exists", generation });
      const sv = o.store.save(runId, null, initialState(o.def, i.sourceFingerprint));
      if (sv.ok) return ok({ runId, queue: q.value, state: "created", generation }, sv.warning);
      if (sv.code === "conflict") return ok({ runId, queue: q.value, state: "exists", generation }); // another submit won the race
      return bad("store", sv.code, sv.message);
    },
    claim(workerId: string, tenantId: string): RunnerResult<ClaimedRun | null> {
      const b = validateQueueId(tenantId, "tenant id"); if (b) return qerr(b);
      const c = o.queue.claim(workerId, { tenantId }); if (!c.ok) return qerr(c.error);
      const j = c.value; if (j === null) return ok(null);
      const p = j.payload as { runKey?: unknown; generation?: unknown } | null;
      const runKey = p !== null && typeof p === "object" ? p.runKey : undefined;
      const gen = p !== null && typeof p === "object" && p.generation !== undefined ? p.generation : 0;
      const lease: RunnerLease | null = typeof runKey === "string" && !checkIds(tenantId, runKey) && validGeneration(gen) && idOf(tenantId, runKey, gen) === j.id
        ? { tenantId, runKey, workerId, attempt: j.attempt, ...(gen === 0 ? {} : { generation: gen }) } : null;
      if (lease === null) { o.queue.fail({ id: j.id, workerId, attempt: j.attempt, tenantId }, "bad-payload"); return bad("runner", "bad-payload", "job payload does not match its id"); }
      return ok({ lease, runId: j.id });
    },
    step(l: RunnerLease): RunnerResult<Step> {
      return mutate<Step>(l, (s, now): Built<Step> => {
        const plan = planNext(o.def, s, now);
        if (plan.outcome === "invalid") { o.queue.fail(refOf(l), "plan-invalid"); return { done: bad("workflow", plan.errors[0]?.code ?? "invalid", plan.reason) }; }
        const finish = (v: Step): Built<Step> => { const c = o.queue.complete(refOf(l)); return { done: c.ok ? ok(v) : qerr(c.error) }; };
        const finishFailed = (v: Step & { kind: "failed-terminal" }): Built<Step> => { const c = o.queue.fail(refOf(l), failCode(v.code), { terminal: true }); return { done: c.ok ? ok(v) : qerr(c.error) }; };
        if (plan.outcome === "complete") return finish({ kind: "complete" });
        if (plan.outcome === "failed-terminal") { const t = plan.terminal!; return finishFailed({ kind: "failed-terminal", stage: t.stage, code: t.code, why: t.why }); }
        const r = plan.ready[0];
        if (!r) return { done: ok({ kind: "waiting", reason: plan.reason }) };
        const attemptId = mint();
        return { event: { type: "stage-started", stage: r.stage, attemptId, at: now, inputFingerprint: r.inputFingerprint },
          value: { kind: "started", attempt: { stage: r.stage, attemptId }, inputFingerprint: r.inputFingerprint, attemptNumber: r.attempt, cause: r.cause } };
      });
    },
    heartbeat: (l, at) => mutate<null>(l, (_s, now) => ({ event: stageEvent("heartbeat", at, now, {}), value: null })),
    succeed: (l, at, outputFingerprint) => mutate<null>(l, (_s, now) => ({ event: stageEvent("stage-succeeded", at, now, { outputFingerprint }), value: null })),
    fail: (l, at, errorCode) => mutate<null>(l, (_s, now) => ({ event: stageEvent("stage-failed", at, now, { errorCode }), value: null })),
    skip: (l, stage) => mutate<null>(l, (s, now): Built<null> => {
      const r = planNext(o.def, s, now).ready.find((x) => x.stage === stage);
      return r ? { event: { type: "stage-skipped", stage, at: now, inputFingerprint: r.inputFingerprint }, value: null }
        : { done: bad("workflow", "invalid-transition", "stage is not ready to skip") };
    }),
  };
}
