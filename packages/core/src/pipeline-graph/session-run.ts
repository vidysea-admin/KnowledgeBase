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

export interface SessionRunInput {
  tenantId: string; runKey: string; sourceFingerprint: string;
  handlers: Record<string, NodeHandler>; queue: JobQueue; store: RunStateStore; now: () => number;
  def?: WorkflowDef; workerId?: string; skip?: string[]; mintAttemptId?: () => string;
  /** Heartbeat period while a handler runs; default leaseMs / 3. 0 disables (tests). */
  heartbeatMs?: number;
}
export type SessionRunResult =
  | { ok: true; run: GraphRun; generation: number }
  | { ok: false; error: RunnerError };

const fail = (source: RunnerError["source"], code: string, message: string): { ok: false; error: RunnerError } => ({ ok: false, error: { source, code, message } });

/** Wrap a runner so the started attempt is heartbeated until it is settled (succeed / fail / skip). */
function withHeartbeat(inner: PipelineRunner, everyMs: number): PipelineRunner {
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  return {
    ...inner,
    submit: inner.submit.bind(inner), claim: inner.claim.bind(inner), heartbeat: inner.heartbeat.bind(inner),
    step(lease) {
      stop();
      const r = inner.step(lease);
      if (r.ok && r.value.kind === "started" && everyMs > 0) {
        const at = r.value.attempt;
        timer = setInterval(() => { try { inner.heartbeat(lease, at); } catch { /* the next runner call reports a lost lease */ } }, everyMs);
        timer.unref?.();
      }
      return r;
    },
    succeed(lease, at, fp) { stop(); return inner.succeed(lease, at, fp); },
    fail(lease, at, code) { stop(); return inner.fail(lease, at, code); },
    skip(lease, stage) { stop(); return inner.skip(lease, stage); },
  };
}

export async function runSessionThroughGraph(i: SessionRunInput): Promise<SessionRunResult> {
  const def = i.def ?? WEBINAR_PIPELINE, worker = i.workerId ?? "graph-worker";
  const built = buildGraph(def, i.handlers, { skip: i.skip });
  if (!built.ok) return fail("runner", "bad-graph", built.error);
  const base = createPipelineRunner({ def, queue: i.queue, store: i.store, now: i.now, mintAttemptId: i.mintAttemptId });
  const runner = withHeartbeat(base, i.heartbeatMs ?? Math.floor(def.leaseMs / 3));
  const sub = runner.submit({ tenantId: i.tenantId, runKey: i.runKey, sourceFingerprint: i.sourceFingerprint });
  if (!sub.ok) return { ok: false, error: sub.error };
  const claimed = runner.claim(worker, i.tenantId);
  if (!claimed.ok) return { ok: false, error: claimed.error };
  // The caller gives each session its own queue, so a claim for another run key can only be a leftover: refuse it rather than drive it with these handlers.
  if (claimed.value === null) return fail("runner", "nothing-to-claim", "the run is in flight elsewhere, finished, or its lease has not lapsed");
  if (claimed.value.lease.runKey !== i.runKey) return fail("runner", "foreign-run", "claimed a run key other than the one submitted");
  const run = await runGraph({ runner, graph: built.graph, lease: claimed.value.lease });
  return { ok: true, run, generation: claimed.value.lease.generation ?? 0 };
}
