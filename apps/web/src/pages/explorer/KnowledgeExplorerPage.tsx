import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { listSessions } from "../../api/sessions.js";
import { loadGraph } from "../../api/graph.js";
import type { Graph, GraphNode, SessionSummary } from "../../api/types.js";
import { buildExplorer } from "./explorerModel.js";

const tabs = ["Overview", "Topics", "Speakers", "Orgs"] as const;
type Tab = typeof tabs[number];
type Model = ReturnType<typeof buildExplorer>;
const emptyGraph: Graph = { nodes: [], edges: [], stats: { sessionsTotal: 0, sessionsInGraph: 0, sessionsMissing: [], edgeSources: { treeIndex: 0, entityEdges: 0 } } };
function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "This API key needs sessions and graph permissions to view the knowledge explorer.";
  return "Unable to load the knowledge explorer. Try refreshing.";
}
function SessionLinks({ sessions, select }: { sessions: SessionSummary[]; select: (id: string) => void }) {
  return <ul>{sessions.map(session => <li key={session._id}><button type="button" onClick={() => select(session._id)}>{session.title || "Untitled session"}</button> <span className="row-meta">{session.date || "Date not recorded"}</span> <Link to={`/sessions/${encodeURIComponent(session._id)}`}>Open session</Link></li>)}</ul>;
}
function EntityLinks({ nodes, title, model }: { nodes: GraphNode[]; title: string; model: Model }) {
  return nodes.length ? <ul>{nodes.map(node => <li key={node.id}><Link to={`/brain?${new URLSearchParams({ node: node.id }).toString()}`}>{node.label || "Unnamed entity"}</Link>
    {model.selectedSession && <ul>{model.links.filter(edge => edge.source === node.id || edge.target === node.id).map((edge, index) => <li key={index}>{edge.type} · {edge.origin} · {edge.inferred ? "inferred relationship" : "stated relationship"}</li>)}</ul>}
  </li>)}</ul> : <p>No {title.toLowerCase()} are linked in the returned graph{model.selectedSession ? " for this session" : ""}.</p>;
}
export function KnowledgeExplorerPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [generation, setGeneration] = useState(0);
  const [tab, setTab] = useState<Tab>("Overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; generation: number; sessions: SessionSummary[]; graph: Graph; graphMissing: boolean; error: string | null } | null>(null);
  const current = loaded?.key === apiKey && loaded.generation === generation ? loaded : null;
  useEffect(() => {
    let cancelled = false;
    setLoaded(null); setTab("Overview"); setSelectedId(null);
    if (apiKey) Promise.all([listSessions(apiKey), loadGraph(apiKey).then(graph => ({ graph, missing: false })).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return { graph: emptyGraph, missing: true };
      throw error;
    })]).then(([response, result]) => {
      buildExplorer(response.sessions, result.graph);
      if (!cancelled) setLoaded({ key: apiKey, generation, sessions: response.sessions, graph: result.graph, graphMissing: result.missing, error: null });
    }).catch((error: unknown) => {
      if (!cancelled) setLoaded({ key: apiKey, generation, sessions: [], graph: emptyGraph, graphMissing: false, error: errorMessage(error) });
    });
    return () => { cancelled = true; };
  }, [apiKey, generation]);
  const model = current && !current.error ? buildExplorer(current.sessions, current.graph, selectedId) : null;
  return <>
    <div className="page-header"><h1>Knowledge explorer</h1><p>Browse sessions by their recorded year and month, and explore topics, speakers and organizations in the knowledge graph.</p></div>
    {!apiKey ? <div className="card empty-note">Sign in with an API key to view the knowledge explorer.</div> : <>
      <button type="button" disabled={!current} onClick={() => setGeneration(value => value + 1)}>Refresh</button>
      {!current && <p role="status">Loading the knowledge explorer…</p>}
      {current?.error && <p role="alert" className="card error-note">{current.error}</p>}
      {model && <>
        <label>Session scope <select value={selectedId ?? ""} onChange={event => setSelectedId(event.target.value || null)}><option value="">All returned sessions</option>{(current?.sessions ?? []).map(session => <option key={session._id} value={session._id}>{session.title || "Untitled session"}</option>)}</select></label>
        <p>{model.selectedSession ? `Entity tabs show graph relationships for: ${model.selectedSession.title}.` : "Entity tabs show the entire returned tenant graph."}</p>
        <div role="tablist" aria-label="Knowledge explorer views">{tabs.map(value => <button key={value} role="tab" id={`explorer-tab-${value}`} aria-selected={tab === value} aria-controls="explorer-panel" onClick={() => setTab(value)}>{value}</button>)}</div>
        <section className="card" role="tabpanel" id="explorer-panel" aria-labelledby={`explorer-tab-${tab}`}>
          {current?.graphMissing && <p>No knowledge graph has been indexed for this tenant yet. Recorded sessions remain available below.</p>}
          {tab === "Overview" && <>
            {model.selectedSession && <div><h2>{model.selectedSession.title || "Untitled session"}</h2>
              <p>Recorded date: {model.selectedSession.date || "Not recorded"}</p>
              <p>Transcription status: {typeof model.selectedSession.status?.transcribe === "string" ? model.selectedSession.status.transcribe : "Not recorded"}; index status: {typeof model.selectedSession.status?.index === "string" ? model.selectedSession.status.index : "Not recorded"}.</p>
              <Link to={`/sessions/${encodeURIComponent(model.selectedSession._id)}`}>Open selected session</Link>
            </div>}
            <p role="status">{model.sessionsCount} returned sessions; {model.topics.length} topics; {model.speakers.length} speakers; {model.orgs.length} organizations in the returned graph.</p>
            <p>Calendar groups use recorded session dates. Missing or invalid dates appear separately; graph entity counts do not measure transcript coverage.</p>
            {model.sessionsCount === 0 && <p>No sessions were returned for this tenant.</p>}
            {model.years.map(year => <details key={year.year}><summary>{year.year}</summary>{year.months.map(month => <details key={month.month}><summary>{year.year}-{month.month}</summary><SessionLinks sessions={month.sessions} select={setSelectedId} /></details>)}</details>)}
            {model.undated.length > 0 && <details><summary>Date unavailable ({model.undated.length})</summary><SessionLinks sessions={model.undated} select={setSelectedId} /></details>}
          </>}
          {tab === "Topics" && <EntityLinks nodes={model.topics} title="Topics" model={model} />}
          {tab === "Speakers" && <><p>Speakers listed here are person nodes in the returned graph; names and roles have not been inferred.</p><EntityLinks nodes={model.speakers} title="Speakers" model={model} /></>}
          {tab === "Orgs" && <EntityLinks nodes={model.orgs} title="Organizations" model={model} />}
        </section>
      </>}
    </>}
  </>;
}
