/** Test helpers for the run-state store (not used by production code). */
import { initialState, type RunState, type WorkflowDef } from "../domain/pipeline-workflow.js";

export const RUN_STATE_TEST_DEF: WorkflowDef = {
  leaseMs: 1000,
  stages: [
    { name: "capture", deps: [], maxAttempts: 3, retryable: ["net"] },
    { name: "media", deps: ["capture"], maxAttempts: 3, retryable: ["net"] },
  ],
};

/** A valid RunState whose capture stage carries attempt/attemptId `n`, so different n give different revisions. */
export function runStateWithAttempt(n: number, status: "running" | "done" | "failed" = "running"): RunState {
  const s = initialState(RUN_STATE_TEST_DEF, "src-fp");
  s.stages.capture = {
    status, attempt: n, attemptId: `att-${n}`, errorCode: status === "failed" ? "net" : null,
    inputFingerprint: "source:src-fp", outputFingerprint: status === "done" ? `out-${n}` : null, heartbeatAt: status === "running" ? 10 : null,
  };
  return s;
}

/** Deterministic PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
