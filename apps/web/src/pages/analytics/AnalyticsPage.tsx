import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { DETAIL_SAMPLE, loadAnalytics, type AnalyticsData, type Part } from "./analyticsClient.js";
import {
  claimsPerSession, formatPercent, gapCounts, gapStatusList, graphEvidence, jobCounts, jobStatusList, sessionsOverTime, speakerResolution,
} from "./analyticsModel.js";

function Source({ children }: { children: string }) { return <p className="row-meta">Source: {children}</p>; }
function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return <li style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
    <span style={{ minWidth: "5rem" }}>{label}</span>
    <span aria-hidden="true" style={{ display: "inline-block", height: "0.7rem", borderRadius: 3, background: "var(--accent)", width: `${max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0}%`, maxWidth: "60%" }} />
    <span>{value}</span>
  </li>;
}
/** Renders the part's error, or the figure built from its value. */
function Panel<T>({ title, part, children }: { title: string; part: Part<T>; children: (value: T) => React.ReactNode }) {
  return <section className="card" aria-label={title}>
    <h2 className="section-title">{title}</h2>
    {part.ok ? children(part.value) : <p role="alert" className="error-note">{part.message}</p>}
  </section>;
}
function Counts({ figure, order }: { figure: ReturnType<typeof gapCounts>; order: readonly string[] }) {
  return <>
    <p>{figure.total} returned: {order.map(k => `${figure.counts[k]} ${k}`).join("; ")}{figure.other > 0 ? `; ${figure.other} with another status` : ""}.</p>
    {figure.malformed > 0 && <p className="row-meta">{figure.malformed} malformed rows were ignored.</p>}
  </>;
}
export function AnalyticsPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; generation: number; data: AnalyticsData } | null>(null);
  const current = loaded?.key === apiKey && loaded.generation === generation ? loaded : null;
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    if (apiKey) void loadAnalytics(apiKey).then(data => { if (!cancelled) setLoaded({ key: apiKey, generation, data }); });
    return () => { cancelled = true; };
  }, [apiKey, generation]);
  const data = current?.data;
  return <>
    <div className="page-header"><h1>Analytics</h1><p>Read-only figures computed from this tenant’s sessions, claims, graph, gaps and provider jobs.</p></div>
    {!apiKey ? <p className="card empty-note">Sign in with an API key to view analytics.</p> : <>
      <button type="button" disabled={!current} onClick={() => setGeneration(value => value + 1)}>Refresh</button>
      {!data && <p role="status">Loading analytics…</p>}
      {data && <>
        <Panel title="Sessions ingested over time" part={data.sessions}>{value => {
          const f = sessionsOverTime(value);
          if (f.total === 0) return <p className="empty-note">No sessions were returned for this tenant.</p>;
          const max = Math.max(...f.months.map(m => m.count));
          return <>
            <p>{f.total} sessions; {f.indexed} with index status done.{f.undated > 0 ? ` ${f.undated} have no valid date and are not placed on the timeline.` : ""}</p>
            <ul aria-label="Sessions per month" style={{ listStyle: "none", padding: 0 }}>{f.months.map(m => <Bar key={m.month} label={m.month} value={m.count} max={max} />)}</ul>
            <Source>GET /sessions, field date (month of the session date, not of upload) and status.index.</Source>
          </>;
        }}</Panel>
        <Panel title="Claims and speakers" part={data.details}>{value => {
          const claims = claimsPerSession(value.rows), speakers = speakerResolution(value.rows);
          if (value.rows.length === 0) return <p className="empty-note">No session details were available to analyse.</p>;
          const max = Math.max(...claims.perSession.map(s => s.claims));
          return <>
            <p>Sample: the {value.rows.length} most recent sessions (up to {DETAIL_SAMPLE}), not all sessions.{value.failed > 0 ? ` ${value.failed} detail requests failed.` : ""}</p>
            <p>{claims.totalClaims} claims in {claims.sessionsWithClaims} of {claims.sessionsSampled} sampled sessions; verified claims: {formatPercent(claims.verified)}.</p>
            <ul aria-label="Claims per session" style={{ listStyle: "none", padding: 0 }}>{claims.perSession.map(s => <Bar key={s.sessionId} label={s.sessionId.slice(0, 24)} value={s.claims} max={max} />)}</ul>
            <p>Turns with a resolved speaker name: {formatPercent(speakers.resolved)}.</p>
            {(claims.malformed > 0 || speakers.malformed > 0) && <p className="row-meta">{claims.malformed + speakers.malformed} malformed rows were ignored.</p>}
            <Source>GET /sessions/:id, fields claims[].status and turns[].speakerLabel. Claims carry no speaker, so speaker resolution is measured on turns.</Source>
          </>;
        }}</Panel>
        <Panel title="Citation coverage" part={data.graph}>{value => {
          const f = graphEvidence(value);
          return <>
            <p>Graph edges with evidence: {formatPercent(f.withEvidence)}.</p>
            {f.sessionsTotal !== null && f.sessionsInGraph !== null && <p>{f.sessionsInGraph} of {f.sessionsTotal} sessions appear in the graph.</p>}
            {f.edges === 0 && <p className="empty-note">The graph returned no edges.</p>}
            {f.malformed > 0 && <p className="row-meta">{f.malformed} malformed edges were ignored.</p>}
            <Source>GET /graph, fields edges[].evidence[].turnId and stats. This measures graph edges, not individual claims.</Source>
          </>;
        }}</Panel>
        <Panel title="Knowledge gaps" part={data.gaps}>{value => {
          const f = gapCounts(value);
          return <>{f.total === 0 ? <p className="empty-note">No gaps were returned for this tenant.</p> : <Counts figure={f} order={gapStatusList} />}<Source>GET /gaps, field status.</Source></>;
        }}</Panel>
        <Panel title="Recent provider jobs" part={data.jobs}>{value => {
          const f = jobCounts(value.jobs);
          return <>
            {f.total === 0 ? <p className="empty-note">No provider jobs were returned.</p> : <Counts figure={f} order={jobStatusList} />}
            {value.truncated && <p className="row-meta">Capped at the {value.limit} newest jobs; older jobs are not counted.</p>}
            <Source>GET /jobs?limit=50, field status. A sample of recent jobs, not a lifetime total.</Source>
          </>;
        }}</Panel>
      </>}
    </>}
  </>;
}
