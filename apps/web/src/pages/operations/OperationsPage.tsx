import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { WriteScope } from "../../auth/WriteScope.js";
import { ApiError } from "../../api/client.js";
import { listSessions } from "../../api/sessions.js";
import { loadActivityHealth } from "../activity-health/activityHealthClient.js";
import { activityHealthModel, type ActivitySnapshot } from "../activity-health/activityHealthModel.js";
import { loadNotifications, type NotificationsResponse } from "../notifications/notificationsClient.js";
import { explorerUrl, operationUrl, operationViews, readOperationSessions, readOperationView, sessionsForView, viewLabels, type OperationSession, type OperationView } from "./operationsModel.js";
import { loadSavedViews, persistSavedViews } from "./savedViews.js";
import { SourceHealthPanel } from "./SourceHealthPanel.js";
import { EvaluationFlywheelPanel } from "./EvaluationFlywheelPanel.js";
import { OperationsIntegrationsPanel } from "../operations-integrations/OperationsIntegrationsPanel.js";
type Panel<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ok"; data: T };
const loading = { state: "loading" } as const;
function describe(error: unknown, label: string): string {
  if (error instanceof ApiError && error.status === 403) return `${label} unavailable: this key does not have permission.`;
  if (error instanceof ApiError && error.status === 503) return `${label} unavailable: the service could not read this source.`;
  return `${label} unavailable: unable to read a valid response. Try refreshing.`;
}
function PanelBody<T>({ panel, children }: { panel: Panel<T>; children: (data: T) => ReactNode }) {
  return panel.state === "loading" ? <p role="status">Loading…</p> : panel.state === "error" ? <p role="alert">{panel.message}</p> : children(panel.data);
}
function OperationsSnapshot({ apiKey, view }: { apiKey: string; view: OperationView }) {
  const [sessions, setSessions] = useState<Panel<OperationSession[]>>(loading);
  const [activity, setActivity] = useState<Panel<ActivitySnapshot>>(loading);
  const [notifications, setNotifications] = useState<Panel<NotificationsResponse>>(loading);
  useEffect(() => {
    let cancelled = false;
    const load = <T,>(read: () => Promise<T>, set: (value: Panel<T>) => void, label: string) => {
      void read().then(data => { if (!cancelled) set({ state: "ok", data }); }, error => { if (!cancelled) set({ state: "error", message: describe(error, label) }); });
    };
    load(async () => readOperationSessions(await listSessions(apiKey)), setSessions, "Sessions");
    load(() => loadActivityHealth(apiKey, 50), setActivity, "Queue activity");
    load(() => loadNotifications(apiKey, 50), setNotifications, "Notifications");
    return () => { cancelled = true; };
  }, [apiKey]);
  return <>
    <SourceHealthPanel apiKey={apiKey} />
    <WriteScope>
      <OperationsIntegrationsPanel apiKey={apiKey} />
      <EvaluationFlywheelPanel apiKey={apiKey} />
    </WriteScope>
    <section className="card" aria-label="Session worklist"><h2>Session worklist</h2>
      <p>Ready means transcription and index are both done. Needs attention means a failed stage or an unknown status. Processing means a known stage is processing; pending work stays in All sessions.</p>
      <PanelBody panel={sessions}>{rows => {
        const shown = sessionsForView(rows, view), unknown = rows.filter(row => row.category === "unknown").length;
        return <><p role="status">{shown.length} shown of {rows.length} returned session rows; {unknown} with unknown status.</p>
          {rows.length === 0 ? <p>No sessions returned.</p> : shown.length === 0 ? <p>No returned sessions match this view.</p> : <ul aria-label="Session worklist rows">{shown.map(row => <li key={row.id}>
            <strong>{row.title || "Untitled session"}</strong><p>{row.date || "Date not recorded"} · {row.category}; transcription: {row.transcribe ?? "Not recorded"}; index: {row.index ?? "Not recorded"}.</p>
            <Link to={`/sessions/${encodeURIComponent(row.id)}`}>Inspect session</Link>{" · "}<Link to={explorerUrl(row.id)}>Explore knowledge</Link>{row.category !== "ready" && <> · <Link to="/activity-health">Track processing</Link></>}
          </li>)}</ul>}</>;
      }}</PanelBody><p className="row-meta">Source: GET /sessions. Returned rows are not a knowledge coverage score.</p>
    </section>
    <section className="card" aria-label="Queue activity"><h2>Queue activity</h2>
      <PanelBody panel={activity}>{data => { const model = activityHealthModel(data); return <>
        <p>{model.returned} returned queue jobs (limit {data.limit}), observed {data.observedAt}.</p>
        <p>{model.counts.pending} pending; {model.counts.processing} processing; {model.counts.done} done; {model.counts.failed} failed. {model.retryCount} observed automatic retries.</p>
        {data.jobs.length === 0 && <p>No jobs in the returned queue window.</p>}{data.truncated && <p>Older queue jobs are not included.</p>}
        {model.futureTimestampCount > 0 && <p role="alert">{model.futureTimestampCount} activity timestamps are ahead of the observation time.</p>}
        <p>Latest returned queue activity: {model.latestQueueActivityAt ?? "Not recorded"}. Queue activity does not establish index freshness.</p>
        <Link to="/activity-health">Inspect queue failures and retry attempts</Link>
      </>; }}</PanelBody><p className="row-meta">Source: GET /activity-health?limit=50, upload queue and failed file job queue records.</p>
    </section>
    <section className="card" aria-label="Recent notifications"><h2>Recent notifications</h2>
      <PanelBody panel={notifications}>{data => { const unavailable = Object.entries(data.sources).filter(([, value]) => value === "unavailable"); return <>
        {unavailable.map(([source]) => <p key={source} role="alert">{source} unavailable; failures from that source are absent.</p>)}
        <p>{data.notifications.length} returned failure notifications (limit {data.limit}).</p>
        {data.notifications.length === 0 ? <p>{unavailable.length ? "No failures in the sources that could be read." : "No failures in the returned recent window."}</p> : <ul>{data.notifications.map(item => <li key={item.id}><strong>{item.title}</strong><p>{item.source} · {item.occurredAt}{item.detail ? ` · ${item.detail}` : ""}</p></li>)}</ul>}
        {data.truncated && <p>Older failure notifications are not included.</p>}<Link to="/notifications">Open notification center</Link>
      </>; }}</PanelBody><p className="row-meta">Source: GET /notifications?limit=50. This window does not establish all-clear.</p>
    </section>
  </>;
}
export function OperationsPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  const [params, setParams] = useSearchParams();
  const { view, invalid } = readOperationView(params);
  const [generation, setGeneration] = useState(0);
  const [saved, setSaved] = useState(loadSavedViews);
  const updateSaved = (views: OperationView[]) => setSaved({ views, notice: persistSavedViews(views) });
  return <>
    <div className="page-header"><h1>Operations workspace</h1><p>Find sessions needing attention, follow their processing and explore their grounded knowledge.</p></div>
    <nav aria-label="Operations destinations"><Link to="/sessions">Sessions</Link> · <Link to="/explorer">Knowledge explorer</Link> · <Link to="/ops-health">Operations health</Link> · <Link to="/jobs">Provider jobs</Link> · <Link to="/gaps">Knowledge gaps</Link> · <Link to="/analytics">Analytics</Link> · <Link to="/status">System status</Link> · <Link to="/setup">Setup wizard</Link></nav>
    {!apiKey ? <p>Sign in with an API key to open the operations workspace.</p> : <>
      {invalid && <p role="alert">Invalid view link; showing All sessions. Choose a supported view.</p>}
      <label>Worklist view <select value={view} onChange={event => setParams({ view: event.target.value })}>{operationViews.map(code => <option key={code} value={code}>{viewLabels[code]}</option>)}</select></label>
      <button type="button" onClick={() => setGeneration(g => g + 1)}>Refresh workspace</button>
      <section className="card" aria-label="Saved views"><h2>Saved views</h2><p>Browser-local filter preferences only. Opening a saved view loads the current signed-in context. No scheduled digest is configured by these preferences.</p>
        <button type="button" disabled={saved.views.includes(view)} onClick={() => updateSaved([...saved.views, view])}>Save current view</button>
        {saved.notice && <p role="status">{saved.notice}</p>}{saved.views.length === 0 && <p>No saved view preferences.</p>}
        <ul>{saved.views.map(code => <li key={code}><Link to={operationUrl(code)} onClick={() => setGeneration(g => g + 1)}>Open {viewLabels[code]}</Link>{" "}<button type="button" aria-label={`Remove ${viewLabels[code]} saved view`} onClick={() => updateSaved(saved.views.filter(value => value !== code))}>Remove</button></li>)}</ul>
      </section>
      <OperationsSnapshot key={`${sessionVersion}:${apiKey}:${generation}:${view}`} apiKey={apiKey} view={view} />
    </>}
  </>;
}
