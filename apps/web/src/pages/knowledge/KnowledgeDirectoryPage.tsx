import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { listSessions } from "../../api/sessions.js";
import { listSources } from "../../api/sources.js";
import { loadGraph } from "../../api/graph.js";
import type { Graph, SessionSummary, Source } from "../../api/types.js";
import { buildKnowledgeDirectory } from "./knowledgeDirectoryModel.js";

const emptyGraph: Graph = { nodes: [], edges: [], stats: { sessionsTotal: 0, sessionsInGraph: 0, sessionsMissing: [], edgeSources: { treeIndex: 0, entityEdges: 0 } } };
const entityUrl = (id: string) => `/knowledge?${new URLSearchParams({ entity: id })}`;
const DISPLAY_LIMIT = 200;
type Loaded = { key: string; generation: number; sessions: SessionSummary[]; sources: Source[]; graph: Graph; graphMissing: boolean; error: string | null };
type View = "Entities" | "Collections" | "Resources";

export function KnowledgeDirectoryPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [params] = useSearchParams();
  const entityId = params.get("entity");
  const [view, setView] = useState<View>("Entities");
  const [filter, setFilter] = useState("");
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const current = loaded?.key === apiKey && loaded.generation === generation ? loaded : null;
  useEffect(() => {
    let cancelled = false;
    setLoaded(null); setView("Entities"); setFilter("");
    if (apiKey) Promise.all([listSessions(apiKey), listSources(apiKey), loadGraph(apiKey).then(graph => ({ graph, missing: false })).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return { graph: emptyGraph, missing: true };
      throw error;
    })]).then(([sessions, sources, result]) => {
      buildKnowledgeDirectory(sessions.sessions, sources.sources, result.graph);
      if (!cancelled) setLoaded({ key: apiKey, generation, sessions: sessions.sessions, sources: sources.sources, graph: result.graph, graphMissing: result.missing, error: null });
    }).catch((error: unknown) => {
      if (!cancelled) setLoaded({ key: apiKey, generation, sessions: [], sources: [], graph: emptyGraph, graphMissing: false,
        error: error instanceof ApiError && error.status === 403 ? "This API key needs sessions, sources and graph permissions to view the directory." : "Unable to load the knowledge directory. Try refreshing." });
    });
    return () => { cancelled = true; };
  }, [apiKey, generation]);
  const model = current && !current.error ? buildKnowledgeDirectory(current.sessions, current.sources, current.graph, entityId) : null;
  const entities = model?.entities.filter(node => node.label.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) ?? [];
  return <>
    <div className="page-header"><h1>Knowledge directory</h1><p>Explore recorded entities, their source references, session collections and available resources.</p></div>
    {!apiKey ? <p>Sign in with an API key to view the knowledge directory.</p> : <>
      <button type="button" disabled={!current} onClick={() => setGeneration(value => value + 1)}>Refresh</button>
      {!current && <p role="status">Loading the knowledge directory…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {model && <>
        <p>{model.sessionsCount} returned sessions; {model.entities.length} returned entities; {model.resources.length} returned sources. Counts describe returned records, not extraction quality or complete corpus coverage.</p>
        {current?.graphMissing ? <p>No graph has been indexed for this tenant. Sessions and resources remain available.</p> : <p>{model.missingGraphSessions} sessions reported missing from the graph; {model.stats.sessionsInGraph} of {model.stats.sessionsTotal} reported sessions are in the graph.</p>}
        <div role="tablist" aria-label="Knowledge directory views">{(["Entities", "Collections", "Resources"] as View[]).map(tab => <button key={tab} type="button" role="tab" id={`directory-${tab}`} aria-selected={view === tab} aria-controls="directory-panel" onClick={() => setView(tab)}>{tab}</button>)}</div>
        <section className="card" role="tabpanel" id="directory-panel" aria-labelledby={`directory-${view}`} style={{ overflowWrap: "anywhere" }}>
          {view === "Entities" && <>
            <p>Names and relationships come from the returned graph. Person nodes do not establish confirmed speaker identity; inferred relationships remain unverified.</p>
            <label>Find entity <input value={filter} onChange={event => setFilter(event.target.value)} /></label>
            <ul>{entities.slice(0, DISPLAY_LIMIT).map(node => <li key={node.id}><Link to={entityUrl(node.id)}>{node.label || "Unnamed entity"}</Link> · {node.kind}</li>)}</ul>
            {!entities.length && <p>No matching entities were returned.</p>}
            {entities.length > DISPLAY_LIMIT && <p>Showing the first {DISPLAY_LIMIT} of {entities.length} matching entities. Narrow the filter.</p>}
            {model.selectionMissing && <p role="status">The selected entity is unavailable in this returned graph.</p>}
            {model.selected && <article aria-label="Selected entity">
              <h2>{model.selected.label || "Unnamed entity"}</h2><p>{model.selected.kind} · sources: {model.selected.sources.join(", ") || "Not recorded"}</p>
              <Link to={`/brain?${new URLSearchParams({ node: model.selected.id })}`}>Open in graph</Link>
              {!model.relationships.length && <p>No relationships were returned for this entity.</p>}
              <ul>{model.relationships.slice(0, DISPLAY_LIMIT).map(({ edge, neighbour, evidence }, index) => <li key={index}>
                <p>{edge.type} · {neighbour ? <Link to={entityUrl(neighbour.id)}>{neighbour.label || "Unnamed entity"}</Link> : "Related entity unavailable"}</p>
                <p>{edge.inferred || (edge.confidence !== undefined && edge.confidence < 1) ? "Inferred relationship" : "Stated relationship"} · {edge.origin}{edge.confidence !== undefined && ` · confidence ${edge.confidence.toFixed(2)}`}</p>
                {!evidence.length && <p>No turn evidence was returned for this relationship.</p>}
                <ul>{evidence.slice(0, DISPLAY_LIMIT).map(({ item, href }, evidenceIndex) => <li key={evidenceIndex}>{href ? <Link to={href}>Source turn {item.turnId}</Link> : <span>Source turn {item.turnId}: evidence session unavailable</span>}</li>)}</ul>
                {evidence.length > DISPLAY_LIMIT && <p>Showing {DISPLAY_LIMIT} of {evidence.length} evidence references.</p>}
              </li>)}</ul>
              {model.relationships.length > DISPLAY_LIMIT && <p>Showing {DISPLAY_LIMIT} of {model.relationships.length} relationships.</p>}
              <p>Source links open the referenced transcript turn. The session page reports a reference that cannot be found.</p>
            </article>}
          </>}
          {view === "Collections" && <>
            <p>These collections group returned sessions by recorded month. They are derived views; saved, curated collections are not available yet.</p>
            {!model.collections.length && <p>No session collections were returned.</p>}
            {model.collections.map(group => <details key={group.label}><summary>{group.label} ({group.sessions.length})</summary><ul>{group.sessions.slice(0, DISPLAY_LIMIT).map(session => <li key={session._id}><Link to={`/sessions/${encodeURIComponent(session._id)}`}>{session.title || "Untitled session"}</Link></li>)}</ul>{group.sessions.length > DISPLAY_LIMIT && <p>Showing {DISPLAY_LIMIT} of {group.sessions.length} sessions in this collection.</p>}</details>)}
          </>}
          {view === "Resources" && <>
            <p>Resources list recorded source metadata. Local file paths are not exposed; resource records do not prove successful ingestion.</p>
            {!model.resources.length && <p>No resources were returned.</p>}
            <ul>{model.resources.slice(0, DISPLAY_LIMIT).map(resource => <li key={resource.id}><p>{resource.kind} · {resource.id}</p>{resource.href ? <a href={resource.href} target="_blank" rel="noopener noreferrer">Open source ({resource.host})</a> : <span>No public source link available</span>}<p>Recorded: {resource.createdAt || "Not recorded"}</p></li>)}</ul>
            {model.resources.length > DISPLAY_LIMIT && <p>Showing {DISPLAY_LIMIT} of {model.resources.length} resources.</p>}
          </>}
        </section>
      </>}
    </>}
  </>;
}
