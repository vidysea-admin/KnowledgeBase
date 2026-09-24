/**
 * apps/web/src/pages/BrainPage.tsx — /brain, rebuilt as a readable, drill-down, self-refreshing
 * knowledge graph (U-BRAIN, qa/contracts/brain-knowledge-graph.md).
 *
 * What changed and why, in one place:
 * - [C1] the payload is now the UNION of `tree_index` and the 94 real `graph_edges` rows (people,
 *   orgs, countries, dates), which no route used to read.
 * - [C2] the renderer is SVG (`brain/GraphSvg.tsx`), not canvas, so every node carries a real
 *   `<text>` label. The measured before-state was 13 shapes / 0 labels.
 * - [C3] the panel is `brain/NodePanel.tsx`: neighbours grouped by edge type, each clickable and
 *   re-centring the graph, plus a link to the exact turn that evidences a relationship.
 * - [C5] filters (kind, session, label search) live in the URL, so a view is shareable.
 * - [C7] sessions that exist but are not in the graph are COUNTED on screen, never hidden.
 * - [C8] the API's 404 becomes an explanatory empty state instead of a bare error line.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { loadGraph } from "../api/graph.js";
import { getSession } from "../api/sessions.js";
import { ApiError } from "../api/client.js";
import type { Graph, GraphNodeKind, SessionDetail } from "../api/types.js";
import { GraphSvg, NODE_COLOR } from "./brain/GraphSvg.js";
import { NodePanel } from "./brain/NodePanel.js";
import { layoutGraph, MAX_LAID_OUT_NODES, type Point } from "./brain/force-layout.js";
import { activeFilterCount, filterGraph, highestDegreeSubgraph, neighboursByType, nodeIndex } from "./brain/graph-model.js";

const CANVAS = { width: 1100, height: 700 };
const KIND_ORDER: GraphNodeKind[] = ["session", "topic", "org", "person", "country", "date", "month", "user", "other"];

export function BrainPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailState, setDetailState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: CANVAS.width, h: CANVAS.height });
  const reloadRef = useRef(0);

  const selectedId = params.get("node");
  const query = params.get("q") ?? "";
  const sessionFilter = params.get("session");
  const kindParam = params.get("kinds") ?? "";
  const kinds = useMemo(
    () => new Set(kindParam.split(",").filter(Boolean) as GraphNodeKind[]),
    [kindParam],
  );

  const refresh = useCallback(() => {
    reloadRef.current += 1;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("r", String(reloadRef.current));
      return next;
    }, { replace: true });
  }, [setParams]);

  const reloadToken = params.get("r") ?? "0";
  useEffect(() => {
    let cancelled = false;
    loadGraph(apiKey)
      .then((data) => {
        if (cancelled) return;
        setGraph(data);
        setError(null);
        setLoadedAt(new Date().toLocaleTimeString());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const notFound = err instanceof ApiError && err.status === 404;
        setError({ message: err instanceof ApiError ? err.message : "failed to load graph", notFound });
      });
    return () => { cancelled = true; };
  }, [apiKey, reloadToken]);

  // [C6] "isko update bhi krte rhna hai" — a tab left open picks up newly ingested sessions when
  // it is focused again, instead of showing a graph that silently aged out.
  useEffect(() => {
    const onFocus = (): void => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const index = useMemo(() => nodeIndex(graph), [graph]);
  const selectedNode = selectedId ? index.get(selectedId) ?? null : null;

  useEffect(() => {
    if (!selectedNode || selectedNode.kind !== "session" || !selectedNode.ref) {
      setDetail(null);
      setDetailState({ loading: false, error: null });
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailState({ loading: true, error: null });
    getSession(apiKey, selectedNode.ref)
      .then((d) => { if (!cancelled) { setDetail(d); setDetailState({ loading: false, error: null }); } })
      .catch((err: unknown) => {
        if (!cancelled) setDetailState({ loading: false, error: err instanceof ApiError ? err.message : "failed to load session" });
      });
    return () => { cancelled = true; };
  }, [apiKey, selectedNode]);

  const filtered = useMemo(
    () => (graph ? filterGraph(graph, { kinds, sessionId: sessionFilter, query }) : { nodes: [], edges: [] }),
    [graph, kinds, sessionFilter, query],
  );
  const shown = useMemo(
    () => highestDegreeSubgraph(filtered.nodes, filtered.edges, MAX_LAID_OUT_NODES),
    [filtered],
  );
  const positions = useMemo<Map<string, Point>>(
    () => layoutGraph(shown.nodes, shown.edges, { ...CANVAS, seed: 20260924 }),
    [shown],
  );

  const setParam = useCallback((key: string, value: string | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setParams]);

  const select = useCallback((id: string) => {
    setParam("node", id);
    const p = positions.get(id);
    if (p) setViewBox((v) => ({ ...v, x: p.x - v.w / 2, y: p.y - v.h / 2 }));
  }, [positions, setParam]);

  /** ONE `setParams` call, not three. Three sequential `setParam(…, null)` calls all read the
   * same render's `prev` under React batching, so the last one re-adds the keys the first two
   * deleted — caught by the "clearing filters restores the whole graph" test. */
  const clearFilters = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of ["kinds", "session", "q"]) next.delete(key);
      return next;
    }, { replace: true });
  }, [setParams]);

  function toggleKind(kind: GraphNodeKind): void {
    const next = new Set(kinds);
    if (next.has(kind)) next.delete(kind); else next.add(kind);
    setParam("kinds", [...next].join(","));
  }

  function zoom(factor: number): void {
    setViewBox((v) => {
      const w = Math.min(CANVAS.width * 2, Math.max(150, v.w * factor));
      const h = Math.min(CANVAS.height * 2, Math.max(95, v.h * factor));
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    });
  }

  const missing = graph?.stats.sessionsMissing ?? [];
  const filters = { kinds, sessionId: sessionFilter, query };
  const sessionNodes = useMemo(
    () => (graph?.nodes ?? []).filter((n) => n.kind === "session").sort((a, b) => a.label.localeCompare(b.label)),
    [graph],
  );

  return (
    <>
      <div className="page-header">
        <h1>Brain</h1>
        <p>
          Every session, topic, org, person, country and date the knowledge base actually holds, and
          how they connect. Solid lines are stated relationships; dashed lines are derived
          (co-occurrence, or a keyword match below full confidence). Click any node to drill in —
          every neighbour is itself clickable, and evidence links open the exact turn.
        </p>
      </div>

      {error && error.notFound && (
        <div className="card empty-note" data-testid="graph-empty-state">
          No knowledge graph for this tenant yet — nothing has been indexed into `tree_index` and no
          `graph_edges` rows exist. Ingest a session (or run the webinar sync) and this page fills
          itself; it will not need a manual re-index.
        </div>
      )}
      {error && !error.notFound && <div className="card error-note">{error.message}</div>}
      {!error && graph === null && <div className="card empty-note">Loading&hellip;</div>}

      {graph && (
        <>
          {missing.length > 0 && (
            <div className="card" data-testid="staleness-note" style={{ borderLeft: "3px solid var(--warn)" }}>
              <div className="row-title">{missing.length} session(s) exist but are not in this graph</div>
              <div className="row-meta">
                {missing.slice(0, 5).map((m) => m.title).join(" · ")}
                {missing.length > 5 ? ` · +${missing.length - 5} more` : ""}
                {" — "}they have neither a tree-index entry nor any graph edges yet.
              </div>
            </div>
          )}

          <div className="card" data-testid="graph-filters" style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "center" }}>
            <label style={{ fontSize: "0.8rem" }}>
              Search&nbsp;
              <input
                type="search"
                aria-label="Search node labels"
                value={query}
                onChange={(e) => setParam("q", e.target.value)}
                placeholder="label…"
                style={{ padding: "0.25rem 0.4rem", border: "1px solid var(--line)", borderRadius: 6 }}
              />
            </label>
            <label style={{ fontSize: "0.8rem" }}>
              Session&nbsp;
              <select aria-label="Filter by session" value={sessionFilter ?? ""} onChange={(e) => setParam("session", e.target.value || null)} style={{ padding: "0.25rem", border: "1px solid var(--line)", borderRadius: 6 }}>
                <option value="">all sessions</option>
                {sessionNodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </label>
            {KIND_ORDER.filter((k) => graph.nodes.some((n) => n.kind === k)).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kinds.has(k)}
                onClick={() => toggleKind(k)}
                className="badge"
                style={{
                  cursor: "pointer", border: `1px solid ${NODE_COLOR[k]}`,
                  background: kinds.has(k) ? NODE_COLOR[k] : "transparent",
                  color: kinds.has(k) ? "#fff" : NODE_COLOR[k],
                }}
              >
                {k}
              </button>
            ))}
            <span className="row-meta" data-testid="filter-count">{activeFilterCount(filters)} filter(s) active</span>
            {activeFilterCount(filters) > 0 && (
              <button type="button" onClick={clearFilters} style={{ fontSize: "0.75rem", cursor: "pointer", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", padding: "0.2rem 0.5rem" }}>
                Clear filters
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => zoom(0.75)} aria-label="Zoom in" style={{ cursor: "pointer" }}>+</button>
            <button type="button" onClick={() => zoom(1.35)} aria-label="Zoom out" style={{ cursor: "pointer" }}>&minus;</button>
            <button type="button" onClick={() => setViewBox({ x: 0, y: 0, w: CANVAS.width, h: CANVAS.height })} style={{ cursor: "pointer", fontSize: "0.75rem" }}>Fit</button>
            <button type="button" onClick={refresh} style={{ cursor: "pointer", fontSize: "0.75rem" }}>Refresh</button>
          </div>

          <div className="card" style={{ display: "flex", gap: "1rem", padding: 0, overflow: "hidden" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row-meta" style={{ padding: "0.5rem 0.75rem 0" }} data-testid="graph-counts">
                showing {shown.nodes.length} of {graph.nodes.length} node(s) · {shown.edges.length} of {graph.edges.length} relationship(s)
                {graph.stats.edgeSources.entityEdges > 0 ? ` · ${graph.stats.edgeSources.entityEdges} from graph_edges, ${graph.stats.edgeSources.treeIndex} from tree_index` : ""}
                {loadedAt ? ` · loaded ${loadedAt}` : ""}
              </div>
              {filtered.nodes.length > MAX_LAID_OUT_NODES && (
                <div className="row-meta" style={{ padding: "0 0.75rem", color: "var(--warn)" }} data-testid="degraded-note">
                  Past the {MAX_LAID_OUT_NODES}-node layout ceiling — showing the {MAX_LAID_OUT_NODES} most connected nodes. Filter to see the rest.
                </div>
              )}
              {shown.nodes.length === 0 ? (
                <div className="empty-note" style={{ padding: "1rem" }} data-testid="no-match-note">
                  No nodes match these filters.
                </div>
              ) : (
                <GraphSvg
                  nodes={shown.nodes}
                  edges={shown.edges}
                  positions={positions}
                  width={CANVAS.width}
                  height={520}
                  viewBox={viewBox}
                  selectedId={selectedId}
                  onSelect={select}
                />
              )}
            </div>
            <div style={{ width: 340, flexShrink: 0, borderLeft: "1px solid var(--line)", padding: "1rem", overflowY: "auto", maxHeight: 560 }}>
              {!selectedNode && (
                <div className="empty-note">
                  Click any node — or tab to one and press Enter — to see what it connects to and the
                  turns that prove it.
                </div>
              )}
              {selectedNode && graph && (
                <NodePanel
                  node={selectedNode}
                  neighbours={neighboursByType(graph, selectedNode.id)}
                  detail={detail}
                  detailLoading={detailState.loading}
                  detailError={detailState.error}
                  onSelect={select}
                />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
