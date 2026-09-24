/**
 * apps/web/src/pages/brain/graph-model.ts — pure, DOM-free helpers behind /brain: filtering
 * ([C5]), neighbour grouping for the drill-down panel ([C3]), and evidence deep links ([C3]).
 * Kept out of the component so each rule is unit-testable without rendering a graph.
 */
import type { Graph, GraphEdge, GraphEvidence, GraphNode, GraphNodeKind } from "../../api/types.js";

export interface GraphFilters {
  /** Empty set = no kind filter (show all). */
  kinds: ReadonlySet<GraphNodeKind>;
  /** Canonical node id of a session (`session:<id>`), or null. */
  sessionId: string | null;
  /** Free-text label search; empty = no search. */
  query: string;
}

export const EMPTY_FILTERS: GraphFilters = { kinds: new Set(), sessionId: null, query: "" };

export interface Neighbour {
  edge: GraphEdge;
  node: GraphNode;
  /** `out` = the selected node is the edge `source`. Direction is kept because `person spoke_in
   * session` and `session covers country` read backwards if it is dropped. */
  direction: "out" | "in";
}

export function nodeIndex(graph: Graph | null): Map<string, GraphNode> {
  const map = new Map<string, GraphNode>();
  for (const n of graph?.nodes ?? []) map.set(n.id, n);
  return map;
}

/** All edges touching `id`, resolved to the node on the other end and grouped by edge `type`.
 * Insertion order of the groups follows first appearance, so the densest relationship a node has
 * is not buried under an alphabetical accident. */
export function neighboursByType(graph: Graph, id: string): Map<string, Neighbour[]> {
  const index = nodeIndex(graph);
  const groups = new Map<string, Neighbour[]>();
  for (const edge of graph.edges) {
    if (edge.source !== id && edge.target !== id) continue;
    const otherId = edge.source === id ? edge.target : edge.source;
    const node = index.get(otherId);
    if (!node) continue; // an edge to a node that is not in the payload is skipped, never faked
    const list = groups.get(edge.type) ?? [];
    list.push({ edge, node, direction: edge.source === id ? "out" : "in" });
    groups.set(edge.type, list);
  }
  return groups;
}

/** `/sessions/<sessionId>#turn-<turnId>` — the [C3] path from an edge to the exact turn that
 * supports it. Null when the evidence row has no session to resolve against, rather than a link
 * that goes nowhere. */
export function evidenceHref(edge: GraphEdge, evidence: GraphEvidence): string | null {
  const sessionId = evidence.sessionId ?? edge.sessionRef;
  if (!sessionId) return null;
  return `/sessions/${encodeURIComponent(sessionId)}#turn-${encodeURIComponent(evidence.turnId)}`;
}

/** Every evidence row across a node's edges, de-duplicated by turn. */
export function evidenceFor(neighbours: readonly Neighbour[]): { edge: GraphEdge; evidence: GraphEvidence }[] {
  const seen = new Set<string>();
  const out: { edge: GraphEdge; evidence: GraphEvidence }[] = [];
  for (const n of neighbours) {
    for (const ev of n.edge.evidence ?? []) {
      if (seen.has(ev.turnId)) continue;
      seen.add(ev.turnId);
      out.push({ edge: n.edge, evidence: ev });
    }
  }
  return out;
}

function matches(node: GraphNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.length === 0 || node.label.toLowerCase().includes(q) || node.id.toLowerCase().includes(q);
}

function keepEdges(edges: readonly GraphEdge[], keep: ReadonlySet<string>): GraphEdge[] {
  return edges.filter((e) => keep.has(e.source) && keep.has(e.target));
}

/**
 * Apply the filters in a fixed order: session subgraph -> label search -> node kind.
 *
 * The search step keeps matched nodes AND their direct neighbours on purpose: a matched node
 * shown alone has no edges and reads as a broken graph, which is the failure mode this whole
 * unit is fixing. The UI says so in words next to the search box — it is not a silent widening.
 * The kind filter is applied LAST and is strict, so "show me only people" means exactly that.
 */
export function filterGraph(graph: Graph, filters: GraphFilters): { nodes: GraphNode[]; edges: GraphEdge[] } {
  let nodes = graph.nodes;
  let edges = graph.edges;

  if (filters.sessionId) {
    const keep = new Set<string>([filters.sessionId]);
    for (const e of edges) {
      if (e.source === filters.sessionId) keep.add(e.target);
      if (e.target === filters.sessionId) keep.add(e.source);
    }
    nodes = nodes.filter((n) => keep.has(n.id));
    edges = keepEdges(edges, keep);
  }

  if (filters.query.trim().length > 0) {
    const matched = new Set(nodes.filter((n) => matches(n, filters.query)).map((n) => n.id));
    const keep = new Set(matched);
    for (const e of edges) {
      if (matched.has(e.source)) keep.add(e.target);
      if (matched.has(e.target)) keep.add(e.source);
    }
    nodes = nodes.filter((n) => keep.has(n.id));
    edges = keepEdges(edges, keep);
  }

  if (filters.kinds.size > 0) {
    const keep = new Set(nodes.filter((n) => filters.kinds.has(n.kind)).map((n) => n.id));
    nodes = nodes.filter((n) => keep.has(n.id));
    edges = keepEdges(edges, keep);
  }

  return { nodes, edges };
}

export function activeFilterCount(filters: GraphFilters): number {
  return (filters.kinds.size > 0 ? 1 : 0) + (filters.sessionId ? 1 : 0) + (filters.query.trim() ? 1 : 0);
}

/** [I4] — when the graph is past the layout ceiling, keep the highest-degree nodes rather than an
 * arbitrary prefix, and let the caller say out loud that it degraded. */
export function highestDegreeSubgraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  limit: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (nodes.length <= limit) return { nodes: [...nodes], edges: [...edges] };
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const kept = [...nodes]
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id))
    .slice(0, limit);
  const keep = new Set(kept.map((n) => n.id));
  return { nodes: kept, edges: keepEdges(edges, keep) };
}
