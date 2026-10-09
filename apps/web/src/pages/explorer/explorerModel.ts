import type { Graph, GraphNode, SessionSummary } from "../../api/types.js";

export interface ExplorerMonth { month: string; sessions: SessionSummary[] }
export interface ExplorerYear { year: string; months: ExplorerMonth[] }

function calendarMonth(date: string): { year: string; month: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[Tt])/.exec(date);
  if (!match) return null;
  if (date.length > 10 && (!/^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/.test(date) || !Number.isFinite(Date.parse(date)))) return null;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null;
  return { year: year!, month: month! };
}

/** Session dates determine the calendar view; graph membership never excludes a session. */
export function buildExplorer(sessions: SessionSummary[], graph: Graph, selectedSessionId: string | null = null) {
  if (!Array.isArray(sessions) || !sessions.every(session => session && typeof session._id === "string" && session._id.length > 0 && typeof session.title === "string" && typeof session.date === "string") ||
      new Set(sessions.map(session => session._id)).size !== sessions.length || !Array.isArray(graph?.nodes) ||
      !graph.nodes.every(node => node && typeof node.id === "string" && node.id.length > 0 && typeof node.label === "string" && typeof node.kind === "string") ||
      new Set(graph.nodes.map(node => node.id)).size !== graph.nodes.length || !Array.isArray(graph.edges) ||
      !graph.edges.every(edge => edge && typeof edge.source === "string" && typeof edge.target === "string" && typeof edge.type === "string" &&
        typeof edge.inferred === "boolean" && ["tree_index", "graph_edges"].includes(edge.origin) &&
        (edge.sessionRef === undefined || typeof edge.sessionRef === "string") &&
        (edge.evidence === undefined || Array.isArray(edge.evidence) && edge.evidence.every(item => item && typeof item.turnId === "string" && (item.sessionId === undefined || typeof item.sessionId === "string"))))) throw new Error("Invalid explorer response");
  const calendar = new Map<string, Map<string, SessionSummary[]>>();
  const undated: SessionSummary[] = [];
  for (const session of sessions) {
    const date = calendarMonth(session.date);
    if (!date) { undated.push(session); continue; }
    if (!calendar.has(date.year)) calendar.set(date.year, new Map());
    const months = calendar.get(date.year)!;
    if (!months.has(date.month)) months.set(date.month, []);
    months.get(date.month)!.push(session);
  }
  const compare = (a: SessionSummary, b: SessionSummary) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title) || a._id.localeCompare(b._id);
  const years: ExplorerYear[] = [...calendar].sort(([a], [b]) => b.localeCompare(a)).map(([year, months]) => ({
    year, months: [...months].sort(([a], [b]) => b.localeCompare(a)).map(([month, rows]) => ({ month, sessions: [...rows].sort(compare) })),
  }));
  const selectedSession = selectedSessionId ? sessions.find(session => session._id === selectedSessionId) ?? null : null;
  if (selectedSessionId && !selectedSession) throw new Error("Unknown selected session");
  const sessionNodes = new Set(graph.nodes.filter(node => node.kind === "session" && node.ref === selectedSessionId).map(node => node.id));
  const links = graph.edges.filter(edge => selectedSessionId === null ||
    edge.sessionRef === selectedSessionId || edge.evidence?.some(item => item.sessionId === selectedSessionId) ||
    edge.sessionRef === undefined && !edge.evidence?.some(item => item.sessionId !== undefined) &&
    (sessionNodes.has(edge.source) || sessionNodes.has(edge.target)));
  const linkedIds = new Set(links.flatMap(edge => [edge.source, edge.target]));
  const entities = (kind: GraphNode["kind"]) => graph.nodes.filter(node => node.kind === kind && (selectedSessionId === null || linkedIds.has(node.id)))
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  return { years, undated: [...undated].sort(compare), sessionsCount: sessions.length, selectedSession, links,
    topics: entities("topic"), speakers: entities("person"), orgs: entities("org") };
}
