/**
 * packages/core/src/pipeline-graph/pipeline-graph.ts — T-050 slice 6. UNWIRED, plain TypeScript.
 * buildGraph validates handlers against the workflow definition (names, deps, optionality all come from the definition, so the
 * graph cannot drift from the planner). runGraph drives one claimed run: step -> handler -> succeed/fail/skip, until the planner
 * says complete / failed-terminal / waiting, or the runner refuses (stale lease, store/queue error).
 * Resume and idempotency are the planner's: a restarted run re-plans from persisted RunState, so done stages are not re-run.
 * Skip rule (ISS-T050GRAPH-001): mirrors packages/meeting-bot/src/capture/record-commands.ts:90,
 *   `if (rest.includes("--index") && !rest.includes("--process-video")) throw new Error("--index requires --process-video");`
 * i.e. a stage that still runs (index) may not depend on a skipped stage (screen). buildGraph refuses such a skip. A screen that FAILS
 * already blocks index (failed-terminal, record-finalize.ts:246-262), so only the skip-by-config case needed a guard.
 * Delivery is AT-LEAST-ONCE (ISS-T050GRAPH-002): a worker that crashes (or loses its lease) after a handler's side effect but before
 * succeed() is recorded leaves the node unrecorded; the next worker re-runs that node (cause lease-expired). So EVERY node handler
 * (capture, media, transcript, screen, index) must be idempotent: re-running with the same inputFingerprint must be safe and must
 * return the same outputFingerprint. A superseded lease mid-node leaves the side effect done but unrecorded.
 * Open owner question (not depended on): whether a terminally failed run should finish its queue job as done. The runner currently
 * completes the job; this module only reports the outcome and never touches the queue.
 */
import type { WorkflowDef } from "../domain/pipeline-workflow.js";
import type { PipelineGraphNode, GraphRun, NodeHandler, PipelineGraph, RunGraphInput } from "./graph-types.js";

export function buildGraph(def: WorkflowDef, handlers: Record<string, NodeHandler>, opts: { skip?: string[] } = {}): { ok: true; graph: PipelineGraph } | { ok: false; error: string } {
  const names = new Set(def.stages.map((s) => s.name));
  for (const k of Object.keys(handlers)) if (!names.has(k)) return { ok: false, error: `handler for unknown stage: ${k}` };
  const skip = new Set(opts.skip ?? []);
  for (const k of skip) { const d = def.stages.find((x) => x.name === k); if (!d || d.optional !== true) return { ok: false, error: `cannot skip a stage that is not optional: ${k}` }; }
  // Mirrors record-commands.ts:90 ("--index requires --process-video"): a skipped stage may not have a dependent that still runs.
  for (const d of def.stages) {
    if (skip.has(d.name)) continue;
    for (const dep of d.deps) if (skip.has(dep)) return { ok: false, error: `cannot skip stage ${dep}: stage ${d.name} requires it (record-commands.ts:90, --index requires --process-video)` };
  }
  const nodes: PipelineGraphNode[] = [];
  for (const s of def.stages) {
    const handler = Object.prototype.hasOwnProperty.call(handlers, s.name) ? handlers[s.name] : undefined;
    if (typeof handler !== "function") return { ok: false, error: `missing handler for stage: ${s.name}` };
    nodes.push({ name: s.name, deps: [...s.deps], optional: s.optional === true, skip: skip.has(s.name), handler });
  }
  return { ok: true, graph: { nodes } };
}

export async function runGraph(input: RunGraphInput): Promise<GraphRun> {
  const { runner, graph, lease } = input;
  const byName = new Map(graph.nodes.map((n) => [n.name, n]));
  const out: GraphRun = { outcome: "error", ran: [], skipped: [], warnings: [] };
  const cap = input.maxIterations ?? graph.nodes.length * 4 + 4;
  const note = (w?: string[]) => { if (w) out.warnings.push(...w); };
  for (let i = 0; i < cap; i++) {
    // Skip configured optional stages as soon as they are READY; "not ready / already settled" is invalid-transition and is not an error.
    for (const n of graph.nodes) {
      if (!n.skip) continue;
      const k = runner.skip(lease, n.name);
      if (k.ok) { out.skipped.push(n.name); note(k.warnings); } else if (k.error.code !== "invalid-transition") { out.error = k.error; return out; }
    }
    const st = runner.step(lease);
    if (!st.ok) { out.error = st.error; return out; }
    note(st.warnings);
    const s = st.value;
    if (s.kind === "complete") { out.outcome = "complete"; return out; }
    if (s.kind === "waiting") { out.outcome = "waiting"; return out; }
    if (s.kind === "failed-terminal") { out.outcome = "failed-terminal"; out.failedTerminal = { stage: s.stage, code: s.code, why: s.why }; return out; }
    const node = byName.get(s.attempt.stage);
    if (!node) { out.error = { source: "runner", code: "unknown-node", message: `planner started a stage the graph lacks: ${s.attempt.stage}` }; return out; }
    let res;
    try {
      res = await node.handler({ tenantId: lease.tenantId, runKey: lease.runKey, stage: node.name, inputFingerprint: s.inputFingerprint, attemptNumber: s.attemptNumber, cause: s.cause });
    } catch {
      res = { kind: "fail" as const, code: "node-threw" }; // a thrown handler is a failed attempt, never a crash of the executor; the message is not recorded
    }
    let w;
    if (res.kind === "ok" && typeof res.outputFingerprint === "string" && res.outputFingerprint !== "") { w = runner.succeed(lease, s.attempt, res.outputFingerprint); out.ran.push(node.name); }
    else if (res.kind === "fail" && typeof res.code === "string" && res.code !== "") { w = runner.fail(lease, s.attempt, res.code); out.ran.push(node.name); }
    else { w = runner.fail(lease, s.attempt, "bad-node-result"); out.ran.push(node.name); }
    if (!w.ok) { out.error = w.error; return out; }
    note(w.warnings);
  }
  out.error = { source: "runner", code: "iteration-cap", message: "graph did not settle within the iteration cap" };
  return out;
}
