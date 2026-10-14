import type { Graph, GraphEdge, GraphEvidence, GraphNode, SessionSummary } from "../../api/types.js";
import type { ClaimListRow } from "../../api/claims.js";

/** Pure profile projection over already-returned graph/session/claim data. No identity promotion. */
export interface EvidenceRef { key: string; sessionId: string; turnId: string; tStart?: number; edgeType: string; inferred: boolean; confidence?: number; origin: string }
export interface Profile {
  node: GraphNode; relationships: { edge: GraphEdge; neighbour: GraphNode | null }[];
  evidence: EvidenceRef[]; unresolvedEvidence: number; sessions: SessionSummary[]; claims: ClaimListRow[];
}
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Same ownership rule as the directory: exactly one known session or the link is refused. */
export function owningSession(graph: Graph, known: Set<string>, edge: GraphEdge, ev?: GraphEvidence): string | null {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const ends = [byId.get(edge.source), byId.get(edge.target)].filter(n => n?.kind === "session" && n.ref).map(n => n!.ref!);
  const explicit = [edge.sessionRef, ev?.sessionId].filter(text);
  const candidates = new Set(explicit.length ? explicit : ends);
  const id = candidates.size === 1 ? [...candidates][0]! : null;
  return id && known.has(id) && ends.every(e => e === id) ? id : null;
}

export function buildProfile(sessions: SessionSummary[], graph: Graph, claims: ClaimListRow[], nodeId: string | null, kinds: string[]): Profile | null {
  const node = nodeId ? graph.nodes.find(n => n.id === nodeId && kinds.includes(n.kind)) : undefined;
  if (!node) return null;
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const known = new Set(sessions.map(s => s._id));
  const owned = new Set<string>(); const evidence: EvidenceRef[] = []; let unresolved = 0;
  const relationships = graph.edges.filter(e => e.source === node.id || e.target === node.id).map(edge => {
    const own = owningSession(graph, known, edge); if (own) owned.add(own);
    for (const ev of edge.evidence ?? []) {
      const sessionId = owningSession(graph, known, edge, ev);
      if (!sessionId) { unresolved++; continue; }
      owned.add(sessionId);
      evidence.push({ key: `${sessionId}\u0000${ev.turnId}\u0000${evidence.length}`, sessionId, turnId: ev.turnId, ...(ev.tStart !== undefined && { tStart: ev.tStart }),
        edgeType: edge.type, inferred: edge.inferred || (edge.confidence !== undefined && edge.confidence < 1), ...(edge.confidence !== undefined && { confidence: edge.confidence }), origin: edge.origin });
    }
    return { edge, neighbour: byId.get(edge.source === node.id ? edge.target : edge.source) ?? null };
  });
  // Exact id match only: claims.topicRefs are tenant-namespaced (see API gap G1); labels/slugs are never matched.
  const matched = node.kind === "topic" ? claims.filter(c => c.topicRefs?.includes(node.id)) : [];
  for (const c of matched) for (const e of c.evidence) if (known.has(e.sessionId)) owned.add(e.sessionId);
  return { node, relationships, evidence, unresolvedEvidence: unresolved, claims: matched,
    sessions: sessions.filter(s => owned.has(s._id)).sort((a, b) => b.date.localeCompare(a.date) || a._id.localeCompare(b._id)) };
}

export const THEMES = [
  { label: "Admissions", terms: ["admission", "application", "intake"] },
  { label: "Study abroad", terms: ["abroad", "overseas", "visa", "scholarship"] },
  { label: "Courses and programs", terms: ["course", "program", "degree", "stream"] },
  { label: "Careers", terms: ["career", "job", "counsel"] },
];
/** Label-match lens only: a convenience filter over topic labels, never a verified classification. */
export function themeCollections(sessions: SessionSummary[], graph: Graph) {
  const known = new Set(sessions.map(s => s._id));
  return THEMES.map(theme => {
    const topics = graph.nodes.filter(n => n.kind === "topic" && theme.terms.some(t => n.label.toLocaleLowerCase().includes(t))).sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    const ids = new Set<string>();
    for (const t of topics) for (const e of graph.edges) if (e.source === t.id || e.target === t.id) { const s = owningSession(graph, known, e); if (s) ids.add(s); }
    return { ...theme, topics, sessions: sessions.filter(s => ids.has(s._id)).sort((a, b) => a.title.localeCompare(b.title) || a._id.localeCompare(b._id)) };
  });
}
export const sessionHref = (sessionId: string, turnId?: string) => `/sessions/${encodeURIComponent(sessionId)}${turnId ? `#turn-${encodeURIComponent(turnId)}` : ""}`;
