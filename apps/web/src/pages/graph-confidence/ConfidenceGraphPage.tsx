import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { loadGraph } from "../../api/graph.js";
import type { Graph } from "../../api/types.js";
import { GraphSvg } from "../brain/GraphSvg.js";
import { layoutGraph, MAX_LAID_OUT_NODES } from "../brain/force-layout.js";
import { evidenceHref, neighboursByType, type Neighbour } from "../brain/graph-model.js";
import { assertConfidenceGraph, confidenceKind, displayConfidenceGraph, filterConfidenceGraph, parseMinimumConfidence } from "./confidenceModel.js";

const canvas = { width: 1100, height: 650 };
function loadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "This API key needs graph permission to view relationships.";
  return "Unable to load relationships. Try refreshing.";
}

export function ConfidenceGraphPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [generation, setGeneration] = useState(0);
  const [params, setParams] = useSearchParams();
  const [loaded, setLoaded] = useState<{ key: string; generation: number; graph: Graph | null; missing: boolean; error: string | null } | null>(null);
  const selectionKey = useRef(apiKey);
  const current = loaded?.key === apiKey && loaded.generation === generation ? loaded : null;
  const rawMinimum = params.get("minConfidence");
  const selectedId = params.get("node");
  let minimum: number | null = null, invalidMinimum = false;
  try { minimum = parseMinimumConfidence(rawMinimum); } catch { invalidMinimum = true; }

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    if (selectionKey.current !== apiKey) setParams(previous => { const next = new URLSearchParams(previous); next.delete("node"); return next; }, { replace: true });
    selectionKey.current = apiKey;
    if (apiKey) loadGraph(apiKey).then(graph => {
      assertConfidenceGraph(graph);
      if (!cancelled) setLoaded({ key: apiKey, generation, graph, missing: false, error: null });
    }).catch((error: unknown) => {
      if (!cancelled) setLoaded({ key: apiKey, generation, graph: null, missing: error instanceof ApiError && error.status === 404, error: error instanceof ApiError && error.status === 404 ? null : loadError(error) });
    });
    return () => { cancelled = true; };
  }, [apiKey, generation]);

  const model = useMemo(() => current?.graph && !invalidMinimum ? filterConfidenceGraph(current.graph, minimum) : null, [current, invalidMinimum, minimum]);
  const shown = useMemo(() => model ? displayConfidenceGraph(model, MAX_LAID_OUT_NODES) : { nodes: [], edges: [] }, [model]);
  const positions = useMemo(() => layoutGraph(shown.nodes, shown.edges, { ...canvas, iterations: 60, seed: 20261009 }), [shown]);
  const selected = shown.nodes.find(node => node.id === selectedId);
  const neighbours = current?.graph && selected ? neighboursByType({ ...current.graph, nodes: shown.nodes, edges: shown.edges }, selected.id) : new Map<string, Neighbour[]>();
  function updateParam(key: string, value: string | null) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value === null || value === "") next.delete(key); else next.set(key, value);
      return next;
    }, { replace: true });
  }

  return <>
    <div className="page-header"><h1>Confidence graph</h1><p>Explore recorded relationships and the evidence behind them. Minimum confidence uses each relationship’s recorded score, from 0 to 1.</p></div>
    {!apiKey ? <p className="card empty-note">Sign in with an API key to view relationships.</p> : <>
      <button type="button" disabled={!current} onClick={() => { updateParam("node", null); setGeneration(value => value + 1); }}>Refresh</button>
      {!current && <p role="status">Loading relationships…</p>}
      {current?.error && <p role="alert" className="card error-note">{current.error}</p>}
      {current?.missing && <p className="card empty-note">No knowledge graph has been indexed for this tenant yet.</p>}
      {current?.graph && <>
        <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <label>Minimum confidence <input type="number" min="0" max="1" step="0.01" value={invalidMinimum ? "" : rawMinimum ?? ""} placeholder="All values" onChange={event => updateParam("minConfidence", event.target.value)} /></label>
          <button type="button" onClick={() => updateParam("minConfidence", null)}>All confidence values</button>
          <Link to="/brain">Open Brain</Link>
        </div>
        {invalidMinimum && <p role="alert">Use a minimum confidence between 0 and 1, or reset to all values.</p>}
        {model && <>
          <p data-testid="confidence-counts">Showing {shown.edges.length} of {model.edges.length} matching relationships ({current.graph.edges.length} returned); {shown.nodes.length} of {model.nodes.length} matching endpoint nodes ({current.graph.nodes.length} returned). {minimum === null ? "All confidence values." : `Recorded confidence ≥ ${minimum}.`}</p>
          <p data-testid="confidence-quality">{model.recorded} relationships have usable recorded confidence; {model.missing} have no recorded confidence; {model.invalid} have invalid confidence. {minimum === null ? "Relationships without usable scores are included and labelled in inspection." : "Relationships without usable scores are excluded by this threshold."}</p>
          <p className="row-meta">{current.graph.edges.filter(edge => edge.origin === "graph_edges").length} returned relationships come from graph_edges; {current.graph.edges.filter(edge => edge.origin === "tree_index").length} from tree_index. A confidence filter does not measure transcript coverage or guarantee truth.</p>
          {model.disconnected > 0 && <p>{model.disconnected} returned nodes have no recorded relationships; open Brain to browse them.</p>}
          {model.nodes.length > MAX_LAID_OUT_NODES && <p role="status">Layout limit: at most {MAX_LAID_OUT_NODES} matching nodes. Some matching relationships are outside the displayed graph; inspection includes only displayed relationships. Increase minimum confidence to narrow the graph.</p>}
          {shown.edges.length === 0 ? <p className="card empty-note">{current.graph.edges.length ? "No relationships match this confidence threshold." : "No relationships were returned for this tenant."}</p> : <>
            <GraphSvg nodes={shown.nodes} edges={shown.edges} positions={positions} width={canvas.width} height={480} viewBox={{ x: 0, y: 0, w: canvas.width, h: canvas.height }} selectedId={selected?.id ?? null} onSelect={id => updateParam("node", id)} />
            <section className="card" aria-label="Relationship inspection">
              {!selected ? <p>{selectedId ? "The selected node is outside the displayed graph. Select a displayed node to inspect its relationships." : "Select a node to inspect its displayed relationships and evidence."}</p> : <>
                <h2>{selected.label}</h2><p>{selected.kind} · {selected.sources.join(" + ")}</p>
                {selected.kind === "session" && selected.ref && <Link to={`/sessions/${encodeURIComponent(selected.ref)}`}>Open session</Link>}
                {[...neighbours.entries()].map(([type, list]) => <div key={type}><h3>{type.replace(/[-_]/g, " ")} ({list.length})</h3>
                  <ul>{list.map(({ node, edge, direction }) => <li key={`${edge.source}|${edge.target}|${edge.type}`}>
                    <button type="button" onClick={() => updateParam("node", node.id)}>{direction === "in" ? "← " : "→ "}{node.label}</button>
                    <span> · {edge.origin} · {edge.inferred ? "inferred" : "stated"} · {confidenceKind(edge) === "recorded" ? `confidence ${edge.confidence}` : confidenceKind(edge) === "missing" ? "confidence not recorded" : "invalid confidence"}</span>
                    {edge.evidence?.length ? <ul>{edge.evidence.map((evidence, index) => {
                      const href = evidenceHref(edge, evidence);
                      return <li key={index}>{href ? <Link to={href}>Evidence: {evidence.turnId}</Link> : <span>Evidence: {evidence.turnId} (session not recorded)</span>}{evidence.tStart !== undefined ? ` · ${evidence.tStart}s` : ""}</li>;
                    })}</ul> : <p className="row-meta">No turn evidence was recorded for this relationship.</p>}
                  </li>)}</ul>
                </div>)}
              </>}
            </section>
          </>}
        </>}
      </>}
    </>}
  </>;
}
