import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { listSessions } from "../../api/sessions.js";
import { loadGraph } from "../../api/graph.js";
import type { ClaimListRow } from "../../api/claims.js";
import type { Graph, SessionSummary } from "../../api/types.js";
import { listCuratedCollections, loadAllClaims } from "./profileClient.js";
import { buildProfile, sessionHref, themeCollections } from "./profileModel.js";
import { ProfileDetail, ProfileList } from "./ProfileViews.js";
import { ProfileHighlights } from "./ProfileHighlights.js";

/** Mount (integrator): <Route path="/knowledge/profiles" element={<KnowledgeProfilesPage />} /> inside the protected layout. */
const TABS = ["topics", "speakers", "highlights", "collections"] as const;
type Tab = (typeof TABS)[number];
const emptyGraph: Graph = { nodes: [], edges: [], stats: { sessionsTotal: 0, sessionsInGraph: 0, sessionsMissing: [], edgeSources: { treeIndex: 0, entityEdges: 0 } } };
type Loaded = { key: string; generation: number; sessions: SessionSummary[]; graph: Graph; graphMissing: boolean; claims: ClaimListRow[]; claimsNote: string | null; error: string | null };
const valid = (s: unknown, g: Graph) => Array.isArray(s) && s.every((r: SessionSummary) => r && typeof r._id === "string" && typeof r.title === "string" && typeof r.date === "string") &&
  Array.isArray(g?.nodes) && g.nodes.every(n => n && typeof n.id === "string" && typeof n.label === "string") && Array.isArray(g.edges) && g.edges.every(e => e && typeof e.source === "string" && typeof e.target === "string");

export function KnowledgeProfilesPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "topics";
  const id = params.get("id");
  const [filter, setFilter] = useState("");
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const cur = loaded?.key === apiKey && loaded.generation === generation ? loaded : null;
  useEffect(() => {
    let cancelled = false; setLoaded(null); setFilter("");
    if (apiKey) {
      const base = { key: apiKey, generation, sessions: [] as SessionSummary[], graph: emptyGraph, graphMissing: false, claims: [] as ClaimListRow[], claimsNote: null as string | null };
      Promise.all([listSessions(apiKey), loadGraph(apiKey).then(graph => ({ graph, missing: false })).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return { graph: emptyGraph, missing: true }; throw e; }),
      loadAllClaims(apiKey).then(r => ({ ...r, note: r.truncated ? "Only the first claims were loaded; some tagged claims may be missing." : null }), () => ({ claims: [] as ClaimListRow[], note: "Claims could not be loaded; claim lists are unavailable." }))])
        .then(([s, g, c]) => {
          if (cancelled) return;
          if (!valid(s?.sessions, g.graph)) throw new ApiError(503, "Invalid response");
          setLoaded({ ...base, sessions: s.sessions, graph: g.graph, graphMissing: g.missing, claims: c.claims, claimsNote: c.note, error: null });
        }).catch((e: unknown) => { if (!cancelled) setLoaded({ ...base, error: e instanceof ApiError && e.status === 403 ? "This API key needs sessions, graph and claims permissions to view profiles." : "Unable to load profiles. Try refreshing." }); });
    }
    return () => { cancelled = true; };
  }, [apiKey, generation]);
  const go = (next: Tab, nextId?: string) => { setFilter(""); setParams(nextId ? { tab: next, id: nextId } : { tab: next }); };
  const ok = cur && !cur.error ? cur : null;
  const kinds = tab === "topics" ? ["topic"] : ["person"];
  const needle = filter.toLocaleLowerCase();
  const nodes = ok ? ok.graph.nodes.filter(n => kinds.includes(n.kind) && n.label.toLocaleLowerCase().includes(needle)).sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)) : [];
  const profile = ok && (tab === "topics" || tab === "speakers") && id ? buildProfile(ok.sessions, ok.graph, ok.claims, id, kinds) : null;
  const themes = ok && tab === "collections" ? themeCollections(ok.sessions, ok.graph) : [];
  const highlightSession = ok && tab === "highlights" && id && ok.sessions.some(s => s._id === id) ? id : null;
  return <>
    <div className="page-header"><h1>Topic and speaker profiles</h1><p>Evidence-first profiles for counselling topics (admissions, study abroad, courses) and the people who discuss them.</p></div>
    {!apiKey ? <p>Sign in with an API key to view profiles.</p> : <>
      <button type="button" disabled={!cur} onClick={() => setGeneration(g => g + 1)}>Refresh</button>
      {!cur && <p role="status">Loading profiles…</p>}
      {cur?.error && <p role="alert">{cur.error}</p>}
      {ok && <>
        <p>{ok.sessions.length} returned sessions; {ok.graph.nodes.length} returned graph nodes. Counts describe returned records, not corpus coverage or extraction quality.</p>
        {ok.graphMissing && <p>No graph has been indexed for this tenant. Sessions remain available.</p>}
        <div role="tablist" aria-label="Profile views" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>{TABS.map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => go(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}</div>
        <section className="card" role="tabpanel" style={{ overflowWrap: "anywhere", maxWidth: "100%" }}>
          {(tab === "topics" || tab === "speakers") && <>
            <label>Find {tab === "topics" ? "topic" : "speaker"} <input value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: "100%" }} /></label>
            <ProfileList tab={tab} nodes={nodes} />
            {id && !profile && <p role="status">The selected profile is unavailable in this returned graph.</p>}
            {profile && <ProfileDetail key={`${apiKey}:${profile.node.id}`} profile={profile} tab={tab} sessions={ok.sessions} claimsNote={ok.claimsNote} />}
          </>}
          {tab === "highlights" && <>
            {!ok.sessions.length && <p>No sessions were returned.</p>}
            <ul>{ok.sessions.slice(0, 100).map(s => <li key={s._id}><Link to={`/knowledge/profiles?${new URLSearchParams({ tab: "highlights", id: s._id })}`}>{s.title || "Untitled session"}</Link></li>)}</ul>
            {ok.sessions.length > 100 && <p>Showing 100 of {ok.sessions.length} sessions.</p>}
            {id && !highlightSession && <p role="status">The selected session was not returned.</p>}
            {highlightSession && <ProfileHighlights key={`${apiKey}:${highlightSession}`} sessionId={highlightSession} />}
          </>}
          {tab === "collections" && <>
            <CuratedNotice />
            <p>Career-theme views below are derived: topics whose label contains a theme keyword, and the sessions their graph edges reference. They are a convenience filter, not a verified classification.</p>
            {themes.map(t => <details key={t.label}><summary>{t.label} ({t.sessions.length} sessions, {t.topics.length} topics)</summary>
              {!t.sessions.length && <p>No sessions matched.</p>}
              <ul>{t.topics.slice(0, 50).map(n => <li key={n.id}><Link to={`/knowledge/profiles?${new URLSearchParams({ tab: "topics", id: n.id })}`}>{n.label}</Link></li>)}</ul>
              <ul>{t.sessions.slice(0, 100).map(s => <li key={s._id}><Link to={sessionHref(s._id)}>{s.title || "Untitled session"}</Link></li>)}</ul></details>)}
          </>}
        </section>
      </>}
    </>}
  </>;
}

function CuratedNotice(): React.ReactElement {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => { let c = false; void listCuratedCollections().then(r => { if (!c) setAvailable(r.available); }); return () => { c = true; }; }, []);
  return <p role="status">{available === null ? "Checking saved collections…" : "Saved, curated collections are not available yet: the API has no collections endpoint."}</p>;
}
