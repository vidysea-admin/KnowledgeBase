import type { Graph, GraphEdge, GraphEvidence, SessionSummary, Source } from "../../api/types.js";
import { safePublicResourceUrl } from "../../safe-url.js";

const kinds = ["session", "topic", "org", "person", "country", "date", "month", "user", "other"];
const origins = ["tree_index", "graph_edges"];
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const optionalText = (value: unknown) => value === undefined || text(value);

/** Derived read views only: no promotion, identity confirmation or curated collection writes. */
export function buildKnowledgeDirectory(sessions: SessionSummary[], sources: Source[], graph: Graph, entityId: string | null = null) {
  if (!Array.isArray(sessions) || sessions.length > 10000 || !sessions.every(row => row && text(row._id) && typeof row.title === "string" && typeof row.date === "string") ||
    new Set(sessions.map(row => row._id)).size !== sessions.length ||
    !Array.isArray(sources) || sources.length > 10000 || !sources.every(row => row && text(row._id) && text(row.kind) && typeof row.createdAt === "string" && optionalText(row.url)) ||
    new Set(sources.map(row => row._id)).size !== sources.length ||
    !Array.isArray(graph?.nodes) || graph.nodes.length > 10000 || !graph.nodes.every(row => row && text(row.id) && typeof row.label === "string" && kinds.includes(row.kind) && optionalText(row.ref) && Array.isArray(row.sources) && row.sources.every(source => origins.includes(source))) ||
    new Set(graph.nodes.map(row => row.id)).size !== graph.nodes.length ||
    !Array.isArray(graph.edges) || graph.edges.length > 20000 || !graph.edges.every(row => row && text(row.source) && text(row.target) && text(row.type) && typeof row.inferred === "boolean" && origins.includes(row.origin) && optionalText(row.sessionRef) &&
      (row.confidence === undefined || number(row.confidence) && row.confidence <= 1) &&
      (row.evidence === undefined || Array.isArray(row.evidence) && row.evidence.every(item => item && text(item.turnId) && optionalText(item.sessionId) && (item.tStart === undefined || number(item.tStart))))) ||
    !graph.stats || !Number.isInteger(graph.stats.sessionsTotal) || !number(graph.stats.sessionsTotal) || !Number.isInteger(graph.stats.sessionsInGraph) || !number(graph.stats.sessionsInGraph) ||
    !Array.isArray(graph.stats.sessionsMissing) || !graph.stats.sessionsMissing.every(row => row && text(row.id) && typeof row.title === "string")) throw new Error("Invalid knowledge directory response");
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const sessionIds = new Set(sessions.map(session => session._id));
  const selected = entityId ? nodes.get(entityId) ?? null : null;
  const selectedEdges = selected ? graph.edges.filter(edge => edge.source === selected.id || edge.target === selected.id) : [];
  function evidenceLink(edge: GraphEdge, evidence: GraphEvidence) {
    const endpointSessions = [nodes.get(edge.source), nodes.get(edge.target)].filter(node => node?.kind === "session" && node.ref).map(node => node!.ref!);
    const explicit = [edge.sessionRef, evidence.sessionId].filter(text);
    const candidates = new Set(explicit.length ? explicit : endpointSessions);
    const sessionId = candidates.size === 1 ? [...candidates][0]! : null;
    if (!sessionId || !sessionIds.has(sessionId) || endpointSessions.some(id => id !== sessionId)) return null;
    return `/sessions/${encodeURIComponent(sessionId)}#turn-${encodeURIComponent(evidence.turnId)}`;
  }
  const relationships = selectedEdges.map(edge => ({ edge, neighbour: nodes.get(edge.source === selected!.id ? edge.target : edge.source) ?? null,
    evidence: (edge.evidence ?? []).map(item => ({ item, href: evidenceLink(edge, item) })) }));
  const collections = new Map<string, SessionSummary[]>();
  for (const session of sessions) {
    const day = session.date.slice(0, 10);
    const date = /^\d{4}-\d{2}-\d{2}(?:$|[Tt])/.test(session.date) ? new Date(`${day}T00:00:00Z`) : null;
    const valid = date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day &&
      (session.date.length === 10 || /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/.test(session.date) && Number.isFinite(Date.parse(session.date)));
    const group = valid ? session.date.slice(0, 7) : "Date unavailable";
    if (!collections.has(group)) collections.set(group, []);
    collections.get(group)!.push(session);
  }
  const resources = [...sources].sort((a, b) => a.kind.localeCompare(b.kind) || a._id.localeCompare(b._id)).map(source => {
    const link = safePublicResourceUrl(source.url);
    return { id: source._id, kind: source.kind, createdAt: source.createdAt, href: link?.href ?? null, host: link?.host ?? null };
  });
  return { selected, selectionMissing: Boolean(entityId && !selected), relationships, resources,
    entities: graph.nodes.filter(node => ["topic", "person", "org"].includes(node.kind)).sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id)),
    collections: [...collections].sort(([a], [b]) => b.localeCompare(a)).map(([label, rows]) => ({ label, sessions: rows.sort((a, b) => a.title.localeCompare(b.title) || a._id.localeCompare(b._id)) })),
    sessionsCount: sessions.length, missingGraphSessions: graph.stats.sessionsMissing.length, stats: graph.stats };
}
