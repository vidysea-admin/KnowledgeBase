/** Bounded graph routing over server-projected accepted, current source provenance.
 * This pure helper is not an authorization authority. The request composition must reload
 * visibility and effective content revisions; user IDs select evidence, never grant access.
 */
import type { TreeIndexNode } from "@lkb/core";

export interface GraphRoutingNode { kind: "speaker" | "topic" | "statement" | "session"; ref: string }
export interface GraphRoutingProof { sessionId: string; sourceId: string; revisionHash: string }
export interface CurrentGraphSource extends GraphRoutingProof { tenantId: string }
export interface AcceptedGraphEdge {
  id: string; tenantId: string; status: "accepted" | "suggested" | "revoked";
  from: GraphRoutingNode; to: GraphRoutingNode; provenance: readonly GraphRoutingProof[];
}
export interface GraphRetrievalSelection { speakerRefs?: readonly string[]; topicRefs?: readonly string[] }
export interface AuthorizedGraphExpansionInput {
  tenantId: string; selection: GraphRetrievalSelection; edges: readonly AcceptedGraphEdge[];
  visibleSources: readonly CurrentGraphSource[]; tree: TreeIndexNode;
}
export interface AuthorizedGraphExpansionResult {
  nodes: TreeIndexNode[]; degraded: string | null;
  stats: { examinedEdges: number; hops: number; selectedSessions: number; inputBytes: number };
}
export const GRAPH_ROUTING_LIMITS = Object.freeze({ selectionIds: 16, edges: 128, sources: 128,
  bytes: 32 * 1024, hops: 2, sessions: 6, treeNodes: 50_000, treeDepth: 32 });
const identity = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 512 && !/\s/u.test(s);
const sha = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
const key = (node: GraphRoutingNode) => JSON.stringify([node.kind, node.ref]);
const validNode = (node: GraphRoutingNode) => !!node && ["speaker", "topic", "statement", "session"].includes(node.kind) && identity(node.ref);

export function expandAuthorizedGraph(input: AuthorizedGraphExpansionInput): AuthorizedGraphExpansionResult {
  const stats = { examinedEdges: 0, hops: 0, selectedSessions: 0, inputBytes: 0 };
  const refuse = (reason: string): AuthorizedGraphExpansionResult => ({ nodes: [], degraded: `graph: ${reason}`, stats });
  if (!input || !identity(input.tenantId) || !input.selection || !Array.isArray(input.edges) || !Array.isArray(input.visibleSources)) return refuse("invalid projection");
  const speakerRefs = input.selection.speakerRefs ?? [], topicRefs = input.selection.topicRefs ?? [];
  if (!Array.isArray(speakerRefs) || !Array.isArray(topicRefs) || ![...speakerRefs, ...topicRefs].every(identity)) return refuse("invalid selection");
  if (!speakerRefs.length && !topicRefs.length) return { nodes: [], degraded: null, stats };
  if (speakerRefs.length + topicRefs.length > GRAPH_ROUTING_LIMITS.selectionIds || input.edges.length > GRAPH_ROUTING_LIMITS.edges
    || input.visibleSources.length > GRAPH_ROUTING_LIMITS.sources) return refuse("projection row limit");
  try { stats.inputBytes = Buffer.byteLength(JSON.stringify({ selection: input.selection, edges: input.edges, sources: input.visibleSources }), "utf8"); }
  catch { return refuse("invalid projection encoding"); }
  if (stats.inputBytes > GRAPH_ROUTING_LIMITS.bytes) return refuse("projection byte limit");
  const sources = new Map<string, CurrentGraphSource>();
  for (const source of input.visibleSources) {
    if (!source || source.tenantId !== input.tenantId || !identity(source.sessionId) || !identity(source.sourceId)
      || !sha(source.revisionHash) || sources.has(source.sessionId)) return refuse("invalid current source authority");
    sources.set(source.sessionId, source);
  }
  const bySession = new Map<string, TreeIndexNode>(), treeIds = new Set<string>();
  const stack: { node: TreeIndexNode; depth: number }[] = [{ node: input.tree, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (!node || !identity(node.node_id) || treeIds.has(node.node_id) || !Array.isArray(node.children)
      || depth > GRAPH_ROUTING_LIMITS.treeDepth || treeIds.size >= GRAPH_ROUTING_LIMITS.treeNodes) return refuse("invalid current tree");
    treeIds.add(node.node_id);
    const sessionId = node.evidence?.sessionRef;
    if (node.level === "session" && typeof sessionId === "string" && sources.has(sessionId)) {
      const marker = node.node_id.lastIndexOf("/session:");
      if (bySession.has(sessionId) || (marker >= 0 && node.node_id.slice(marker + 9) !== sessionId)) return refuse("ambiguous tree source");
      bySession.set(sessionId, node);
    }
    for (const child of node.children) stack.push({ node: child, depth: depth + 1 });
  }
  const edgeIds = new Set<string>(), accepted: AcceptedGraphEdge[] = [];
  let omitted = 0;
  for (const edge of input.edges) {
    stats.examinedEdges++;
    if (!edge || !identity(edge.id) || edgeIds.has(edge.id)) return refuse("invalid edge identity");
    edgeIds.add(edge.id);
    if (edge.tenantId !== input.tenantId || edge.status !== "accepted" || !validNode(edge.from) || !validNode(edge.to)
      || !Array.isArray(edge.provenance) || !edge.provenance.length || !edge.provenance.every((proof: GraphRoutingProof) => {
        const current = proof && sources.get(proof.sessionId);
        return current && current.sourceId === proof.sourceId && current.revisionHash === proof.revisionHash && bySession.has(proof.sessionId);
      })) { omitted++; continue; }
    // Explicit session endpoints must be among the edge's own current source proofs.
    if ([edge.from, edge.to].some((node) => node.kind === "session" && !edge.provenance.some((p: GraphRoutingProof) => p.sessionId === node.ref))) { omitted++; continue; }
    accepted.push(edge);
  }
  accepted.sort((a, b) => a.id.localeCompare(b.id));
  let frontier = new Set([...speakerRefs.map((ref) => key({ kind: "speaker", ref })), ...topicRefs.map((ref) => key({ kind: "topic", ref }))]);
  const visited = new Set(frontier), sessions = new Set<string>();
  for (let hop = 0; hop < GRAPH_ROUTING_LIMITS.hops && frontier.size; hop++) {
    const next = new Set<string>();
    for (const edge of accepted) {
      const from = key(edge.from), to = key(edge.to);
      if (!frontier.has(from) && !frontier.has(to)) continue;
      for (const proof of edge.provenance) sessions.add(proof.sessionId);
      for (const endpoint of [from, to]) if (!visited.has(endpoint)) { visited.add(endpoint); next.add(endpoint); }
    }
    stats.hops++;
    frontier = next;
  }
  const selected = [...sessions].sort();
  const truncated = selected.length > GRAPH_ROUTING_LIMITS.sessions;
  const nodes = selected.slice(0, GRAPH_ROUTING_LIMITS.sessions).map((session) => bySession.get(session)!);
  stats.selectedSessions = nodes.length;
  return { nodes, degraded: omitted || truncated ? `graph: ${omitted} noncurrent or unaccepted edge(s) omitted${truncated ? "; session limit" : ""}` : null, stats };
}
