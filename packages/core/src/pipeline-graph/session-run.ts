/**
 * packages/core/src/pipeline-graph/session-run.ts — T-050 wiring slice. Drives ONE session through the pipeline graph:
 * submit -> claim -> runGraph, over an injected queue + run-state store (the caller picks real files or fakes). NOT exported from src/index.ts.
 * It only composes the already-checked runner (D-139 failed-run semantics included) and graph; it holds no policy.
 * A heartbeat decorator keeps the queue lease and the stage lease alive while a long handler (transcript, index) is awaiting,
 * because the graph itself is sequential and only touches the runner between handlers.
 */
import { WEBINAR_PIPELINE, type WorkflowDef } from "../domain/pipeline-workflow.js";
import type { JobQueue } from "../job-queue/queue-types.js";
import type { RunStateStore } from "../run-state-store/run-state-store.js";
import { createPipelineRunner } from "../pipeline-runner/pipeline-runner.js";
import type { PipelineRunner, RunnerError } from "../pipeline-runner/runner-types.js";
import type { GraphRun, NodeHandler } from "./graph-types.js";
import { buildGraph, runGraph } from "./pipeline-graph.js";
import type { SessionControl } from "./session-control.js";

export interface SessionRunInput {
  tenantId: string; runKey: string; sourceFingerprint: string;
  handlers: Record<string, NodeHandler>; queue: JobQueue; store: RunStateStore; now: () => number;
  def?: WorkflowDef; workerId?: string; skip?: string[]; mintAttemptId?: () => string;
  /** Heartbeat period while a handler runs; at most 1s, normally leaseMs / 3. 0 disables (tests). */
  heartbeatMs?: number;
  control?: SessionControl;
  signal?: AbortSignal;
}
export type SessionRunResult =
  | { ok: true; run: GraphRun; generation: number }
  | { ok: false; error: RunnerError };

const fail = (source: RunnerError["source"], code: string, message: string): { ok: false; error: RunnerError } => ({ ok: false, error: { source, code, message } });

/** Wrap a runner so the started attempt is heartbeated until it is settled (succeed / fail / skip). */
function withHeartbeat(inner: PipelineRunner, everyMs: number, abort: AbortController, check: () => void): { runner: PipelineRunner; stop(): void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const runner: PipelineRunner = {
    ...inner,
    submit: inner.submit.bind(inner), claim: inner.claim.bind(inner), heartbeat: inner.heartbeat.bind(inner),
    step(lease) {
      stop();
      const r = inner.step(lease);
      if (r.ok && r.value.kind === "started" && everyMs > 0) {
        const at = r.value.attempt;
        timer = setInterval(() => {
          try {
            check();
            const beat = inner.heartbeat(lease, at);
            if (!beat.ok) abort.abort("lease-lost");
          } catch { abort.abort("heartbeat-failed"); }
        }, everyMs);
        timer.unref?.();
      }
      return r;
    },
    succeed(lease, at, fp) { stop(); return inner.succeed(lease, at, fp); },
    fail(lease, at, code) { stop(); return inner.fail(lease, at, code); },
    skip(lease, stage) { stop(); return inner.skip(lease, stage); },
  };
  return { runner, stop };
}

export async function runSessionThroughGraph(i: SessionRunInput): Promise<SessionRunResult> {
  const def = i.def ?? WEBINAR_PIPELINE, worker = i.workerId ?? "graph-worker";
  if (Object.values(i.handlers).some(handler => typeof handler !== "function")) return fail("runner", "bad-graph", "handlers must be functions");
  const abort = new AbortController();
  const check = () => {
    if (i.signal?.aborted) abort.abort("cancelled");
    const status = i.control?.read(i.tenantId, i.runKey);
    if (status && !status.ok) abort.abort("control-unavailable");
    else if (status?.cancelled) abort.abort("cancelled");
  };
  const handlers = Object.fromEntries(Object.entries(i.handlers).map(([name, handler]) => [name, async (ctx: Parameters<NodeHandler>[0]) => {
    check();
    if (abort.signal.aborted) return { kind: "fail" as const, code: String(abort.signal.reason) };
    let result;
    try { result = await handler({ ...ctx, signal: abort.signal }); }
    catch (error) { if (!abort.signal.aborted) throw error; }
    check();
    return abort.signal.aborted ? { kind: "fail" as const, code: String(abort.signal.reason) } : result!;
  }]));
  const built = buildGraph(def, handlers, { skip: i.skip });
  if (!built.ok) return fail("runner", "bad-graph", built.error);
  const base = createPipelineRunner({ def, queue: i.queue, store: i.store, now: i.now, mintAttemptId: i.mintAttemptId });
  const heartbeat = withHeartbeat(base, i.heartbeatMs ?? Math.max(1, Math.min(1000, Math.floor(def.leaseMs / 3))), abort, check);
  const { runner } = heartbeat;
  const sub = runner.submit({ tenantId: i.tenantId, runKey: i.runKey, sourceFingerprint: i.sourceFingerprint });
  if (!sub.ok) return { ok: false, error: sub.error };
  // Terminal queue retention can forget an id while its acknowledged run-state still exists.
  // A newly enqueued changed input must never reuse that old checkpoint as successful progress.
  const submittedState = i.store.load(sub.value.runId);
  if (!submittedState.ok) return fail("store", submittedState.code, "Submitted checkpoint could not be read");
  if (!submittedState.state || submittedState.state.sourceFingerprint !== i.sourceFingerprint)
    return fail("runner", "source-fingerprint-mismatch", "Checkpoint does not belong to the submitted input");
  const claimed = runner.claim(worker, i.tenantId);
  if (!claimed.ok) return { ok: false, error: claimed.error };
  // The caller gives each session its own queue, so a claim for another run key can only be a leftover: refuse it rather than drive it with these handlers.
  if (claimed.value === null) return fail("runner", "nothing-to-claim", "the run is in flight elsewhere, finished, or its lease has not lapsed");
  if (claimed.value.lease.runKey !== i.runKey) return fail("runner", "foreign-run", "claimed a run key other than the one submitted");
  const externalAbort = () => abort.abort("cancelled");
  i.signal?.addEventListener("abort", externalAbort, { once: true });
  try {
    const run = await runGraph({ runner, graph: built.graph, lease: claimed.value.lease });
    return { ok: true, run, generation: claimed.value.lease.generation ?? 0 };
  } finally {
    heartbeat.stop();
    i.signal?.removeEventListener("abort", externalAbort);
  }
}
