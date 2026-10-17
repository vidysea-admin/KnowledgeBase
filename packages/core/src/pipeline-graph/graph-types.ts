/**
 * T-050 / D-161 graph executor seam. NOT exported from src/index.ts.
 * Official LangGraph runs the wiring: each node names a stage of the
 * workflow definition and holds a handler; every ordering/retry/resume decision stays in the planner via the runner adapter.
 */
import type { WorkflowDef } from "../domain/pipeline-workflow.js";
import type { PipelineRunner, RunnerError, RunnerLease } from "../pipeline-runner/runner-types.js";

/** AT-LEAST-ONCE: a handler may be re-run after a crash or lost lease (side effect done, succeed() not recorded). Every handler must be idempotent. See pipeline-graph.ts header. */
/** What a handler is given. Everything is derived by the runner; a handler never sees another tenant's data. */
export interface NodeContext { tenantId: string; runKey: string; stage: string; inputFingerprint: string; attemptNumber: number; cause: string; generation?: number; /** Cooperative stop signal; handlers must finish owned cleanup before returning. */ signal?: AbortSignal }
/** ok -> output fingerprint (a deterministic digest of the node's output, so a re-run is idempotent); fail -> an error code the stage's retry list may name. An optional stage is skipped by configuration (PipelineGraphNode.skip), because the runner can only skip a stage that is READY, not one already started. */
export type NodeResult = { kind: "ok"; outputFingerprint: string } | { kind: "fail"; code: string };
export type NodeHandler = (ctx: NodeContext) => NodeResult | Promise<NodeResult>;

export interface PipelineGraphNode { name: string; deps: string[]; optional: boolean; /** Optional stages only: skip this stage cleanly instead of running it. */ skip: boolean; handler: NodeHandler }
export interface PipelineGraph { nodes: PipelineGraphNode[] }

export type GraphOutcome = "complete" | "failed-terminal" | "waiting" | "error";
export interface GraphRun {
  outcome: GraphOutcome;
  /** Stages whose handler ran in THIS call, in order (a skipped stage is listed once, as skipped). */
  ran: string[];
  skipped: string[];
  failedTerminal?: { stage: string; code: string; why: string };
  error?: RunnerError;
  warnings: string[];
}
export interface RunGraphInput { runner: PipelineRunner; graph: PipelineGraph; lease: RunnerLease; /** Safety cap on loop iterations (default 4 x nodes + 4). */ maxIterations?: number }
export type { WorkflowDef };
