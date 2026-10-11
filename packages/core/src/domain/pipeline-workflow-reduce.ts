/**
 * packages/core/src/domain/pipeline-workflow-reduce.ts — T-050 slice 1. Pure reducer for the
 * run state defined in pipeline-workflow.ts. Never throws and never mutates its input: every
 * illegal transition returns `{ ok: false, error }` with the input state untouched.
 *
 * Duplicate delivery decision: replaying an event that already took effect (same attemptId and
 * the state already reflects it) is a TYPED REJECTION `duplicate-event`, never a second change.
 * A finish/heartbeat carrying an attemptId other than the stage's current one is `stale-attempt`
 * (a dead or superseded worker): it changes nothing.
 */
import {
  SKIPPED_OUTPUT, planNext, validateDefinition, validateState,
  type RunState, type StageState, type WorkflowDef, type WorkflowError,
} from "./pipeline-workflow.js";

export type WorkflowEvent =
  | { type: "stage-started"; stage: string; attemptId: string; at: number; inputFingerprint: string }
  | { type: "stage-succeeded"; stage: string; attemptId: string; at: number; outputFingerprint: string }
  | { type: "stage-failed"; stage: string; attemptId: string; at: number; errorCode: string }
  | { type: "heartbeat"; stage: string; attemptId: string; at: number }
  | { type: "stage-skipped"; stage: string; at: number; inputFingerprint: string };
export type ApplyResult = { ok: true; state: RunState } | { ok: false; error: WorkflowError };

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const reject = (code: string, message: string, stage?: string): ApplyResult => ({ ok: false, error: stage ? { code, stage, message } : { code, message } });

export function applyEvent(def: WorkflowDef, state: RunState, event: WorkflowEvent): ApplyResult {
  try {
    const defErrors = validateDefinition(def);
    if (defErrors.length > 0) return { ok: false, error: defErrors[0]! };
    const stateErrors = validateState(def, state);
    if (stateErrors.length > 0) return { ok: false, error: stateErrors[0]! };
    return reduce(def, state, event);
  } catch (e) {
    return reject("malformed", `unreadable input: ${String(e)}`);
  }
}

function reduce(def: WorkflowDef, state: RunState, event: WorkflowEvent): ApplyResult {
  const e = event as unknown as Record<string, unknown>;
  if (typeof e !== "object" || e === null) return reject("bad-event", "event must be an object");
  if (typeof e.at !== "number" || !Number.isFinite(e.at)) return reject("bad-event", "event.at must be a finite number");
  if (typeof e.stage !== "string" || !def.stages.some((s) => s.name === e.stage)) return reject("unknown-stage", "event names a stage the definition lacks");
  const stage = e.stage, at = e.at, cur = state.stages[stage]!;
  const put = (next: StageState): ApplyResult => ({ ok: true, state: { ...state, stages: { ...state.stages, [stage]: next } } });
  switch (e.type) {
    case "stage-started": {
      if (!nonEmpty(e.attemptId)) return reject("bad-event", "attemptId must be a non-empty string", stage);
      if (e.attemptId === cur.attemptId) return reject("duplicate-event", "this attempt id was already used", stage);
      const plan = planNext(def, state, at);
      if (plan.outcome === "failed-terminal") return reject("run-terminal", plan.reason, stage);
      const ready = plan.ready.find((r) => r.stage === stage);
      if (!ready) {
        const blk = plan.blocked.find((b) => b.stage === stage);
        if (blk?.reason === "running") return reject("already-running", "a live attempt holds the lease", stage);
        if (blk) return reject("dependency-not-done", blk.reason, stage);
        return reject("already-done", "stage is done with unchanged input", stage);
      }
      if (e.inputFingerprint !== ready.inputFingerprint) return reject("input-mismatch", "inputFingerprint differs from the one derived from upstream outputs", stage);
      return put({ status: "running", attempt: ready.attempt, attemptId: e.attemptId, errorCode: null, inputFingerprint: ready.inputFingerprint, outputFingerprint: null, heartbeatAt: at });
    }
    case "stage-skipped": {
      const d = def.stages.find((x) => x.name === stage)!;
      if (!d.optional) return reject("invalid-transition", "stage is not optional", stage);
      const ready = planNext(def, state, at).ready.find((r) => r.stage === stage);
      if (!ready) return reject("invalid-transition", "stage is not ready to skip", stage);
      if (e.inputFingerprint !== ready.inputFingerprint) return reject("input-mismatch", "inputFingerprint differs from the derived one", stage);
      return put({ status: "skipped", attempt: cur.attempt, attemptId: null, errorCode: null, inputFingerprint: ready.inputFingerprint, outputFingerprint: SKIPPED_OUTPUT, heartbeatAt: null });
    }
    case "stage-succeeded": case "stage-failed": case "heartbeat": {
      if (!nonEmpty(e.attemptId)) return reject("bad-event", "attemptId must be a non-empty string", stage);
      if (cur.status === "pending" || cur.status === "skipped") return reject("invalid-transition", `${e.type} without a started attempt`, stage);
      if (e.attemptId !== cur.attemptId) return reject("stale-attempt", "event is from a superseded attempt", stage);
      const wants = e.type === "stage-succeeded" ? "done" : "failed";
      if (cur.status !== "running") return reject(cur.status === wants && e.type !== "heartbeat" ? "duplicate-event" : "invalid-transition", `stage is ${cur.status}`, stage);
      if (e.type === "heartbeat") {
        if (cur.heartbeatAt !== null && at < cur.heartbeatAt) return reject("invalid-transition", "heartbeat older than the last one", stage);
        return put({ ...cur, heartbeatAt: at });
      }
      if (e.type === "stage-succeeded") {
        if (!nonEmpty(e.outputFingerprint)) return reject("bad-event", "outputFingerprint must be a non-empty string", stage);
        return put({ ...cur, status: "done", errorCode: null, outputFingerprint: e.outputFingerprint, heartbeatAt: at });
      }
      if (!nonEmpty(e.errorCode)) return reject("bad-event", "errorCode must be a non-empty string", stage);
      return put({ ...cur, status: "failed", errorCode: e.errorCode, outputFingerprint: null, heartbeatAt: at });
    }
    default:
      return reject("bad-event", "unknown event type", stage);
  }
}
