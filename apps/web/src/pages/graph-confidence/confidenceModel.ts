import type { Graph, GraphEdge, GraphNodeKind } from "../../api/types.js";
import { highestDegreeSubgraph } from "../brain/graph-model.js";

const kinds: GraphNodeKind[] = ["session", "topic", "org", "person", "country", "date", "month", "user", "other"];

export function parseMinimumConfidence(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(raw)) throw new Error("Invalid confidence threshold");
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid confidence threshold");
  return value;
}

export function confidenceKind(edge: GraphEdge): "recorded" | "missing" | "invalid" {
  if (edge.confidence === undefined) return "missing";
  return typeof edge.confidence === "number" && Number.isFinite(edge.confidence) && edge.confidence >= 0 && edge.confidence <= 1 ? "recorded" : "invalid";
}

/** Validate the fields this consumer renders; confidence absence/invalidity remains visible data. */
export function assertConfidenceGraph(graph: Graph): void {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error("Invalid graph shape");
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== "string" || !node.id || ids.has(node.id) || typeof node.label !== "string" || !kinds.includes(node.kind)
      || !Array.isArray(node.sources) || node.sources.some(value => value !== "tree_index" && value !== "graph_edges")
      || (node.ref !== undefined && typeof node.ref !== "string")) throw new Error("Invalid graph node");
    ids.add(node.id);
  }
  for (const edge of graph.edges) {
    if (!edge || typeof edge.source !== "string" || typeof edge.target !== "string" || !ids.has(edge.source) || !ids.has(edge.target)
      || typeof edge.type !== "string" || !edge.type || typeof edge.inferred !== "boolean" || !["tree_index", "graph_edges"].includes(edge.origin)
      || (edge.sessionRef !== undefined && typeof edge.sessionRef !== "string")) throw new Error("Invalid graph relationship");
    if (edge.evidence !== undefined && (!Array.isArray(edge.evidence) || edge.evidence.some(value => !value || typeof value.turnId !== "string"
      || (value.sessionId !== undefined && typeof value.sessionId !== "string") || (value.tStart !== undefined && (typeof value.tStart !== "number" || !Number.isFinite(value.tStart)))))) throw new Error("Invalid graph evidence");
  }
}

export function filterConfidenceGraph(graph: Graph, minimum: number | null): {
  nodes: Graph["nodes"]; edges: Graph["edges"]; recorded: number; missing: number; invalid: number; disconnected: number;
} {
  assertConfidenceGraph(graph);
  if (minimum !== null && (typeof minimum !== "number" || !Number.isFinite(minimum) || minimum < 0 || minimum > 1)) throw new Error("Invalid confidence threshold");
  let recorded = 0, missing = 0, invalid = 0;
  for (const edge of graph.edges) {
    const kind = confidenceKind(edge);
    if (kind === "recorded") recorded++;
    else if (kind === "missing") missing++;
    else invalid++;
  }
  const edges = graph.edges.filter(edge => minimum === null || (confidenceKind(edge) === "recorded" && edge.confidence! >= minimum));
  const endpoints = new Set(edges.flatMap(edge => [edge.source, edge.target]));
  const allEndpoints = new Set(graph.edges.flatMap(edge => [edge.source, edge.target]));
  return { nodes: graph.nodes.filter(node => endpoints.has(node.id)), edges, recorded, missing, invalid, disconnected: graph.nodes.length - allEndpoints.size };
}

/** The inspector and renderer both consume this exact capped edge/endpoints subset. */
export function displayConfidenceGraph(model: Pick<Graph, "nodes" | "edges">, limit: number): Pick<Graph, "nodes" | "edges"> {
  const capped = highestDegreeSubgraph(model.nodes, model.edges, limit);
  const endpoints = new Set(capped.edges.flatMap(edge => [edge.source, edge.target]));
  return { nodes: capped.nodes.filter(node => endpoints.has(node.id)), edges: capped.edges };
}
