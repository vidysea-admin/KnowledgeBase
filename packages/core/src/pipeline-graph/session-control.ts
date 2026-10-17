/** Durable, tenant-bound cancellation latch. The existing CAS store owns all file/lock policy. */
import { createHash } from "node:crypto";
import { initialState, type WorkflowDef } from "../domain/pipeline-workflow.js";
import { validateQueueId } from "../job-queue/queue-types.js";
import type { RunStateStore } from "../run-state-store/run-state-store.js";

export type ControlResult = { ok: true; cancelled: boolean } | { ok: false; code: string };
export interface SessionControl {
  read(tenantId: string, runKey: string): ControlResult;
  cancel(tenantId: string, runKey: string): ControlResult;
  /** Explicit operator resume: only clears the latch; runner resubmission still owns generations. */
  resume(tenantId: string, runKey: string): ControlResult;
}
const DEF: WorkflowDef = { leaseMs: 1, stages: [{ name: "control", deps: [], maxAttempts: 1, retryable: [] }] };
const identity = (tenant: string, run: string) => {
  if (validateQueueId(tenant, "tenant id") || validateQueueId(run, "run key")) return null;
  return `c-${createHash("sha256").update(`${tenant}\0${run}`).digest("hex").slice(0, 32)}`;
};

export function createSessionControl(store: RunStateStore): SessionControl {
  function read(tenant: string, run: string): ControlResult {
    const id = identity(tenant, run);
    if (!id) return { ok: false, code: "invalid-input" };
    const loaded = store.load(id);
    if (!loaded.ok) return { ok: false, code: loaded.code };
    if (!loaded.state) return { ok: true, cancelled: false };
    if (loaded.state.sourceFingerprint !== id || Object.keys(loaded.state.stages).join() !== "control")
      return { ok: false, code: "control-mismatch" };
    return { ok: true, cancelled: loaded.state.stages.control!.status === "failed" };
  }
  function update(tenant: string, run: string, cancel: boolean): ControlResult {
    const id = identity(tenant, run);
    if (!id) return { ok: false, code: "invalid-input" };
    for (let attempt = 0; attempt < 4; attempt++) {
      const checked = read(tenant, run);
      if (!checked.ok || checked.cancelled === cancel) return checked;
      const loaded = store.load(id);
      if (!loaded.ok) return { ok: false, code: loaded.code };
      // Recheck the precise CAS candidate, not an earlier independent read.
      if (loaded.state && (loaded.state.sourceFingerprint !== id || Object.keys(loaded.state.stages).join() !== "control"))
        return { ok: false, code: "control-mismatch" };
      const next = initialState(DEF, id);
      if (cancel) next.stages.control = { ...next.stages.control!, status: "failed", errorCode: "cancelled" };
      const saved = store.save(id, loaded.state, next);
      if (saved.ok) return { ok: true, cancelled: cancel };
      if (saved.code !== "conflict") return { ok: false, code: saved.code };
    }
    return { ok: false, code: "conflict" };
  }
  return { read, cancel: (t, r) => update(t, r, true), resume: (t, r) => update(t, r, false) };
}
