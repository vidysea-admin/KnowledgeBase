/**
 * T-057 D2 Operations health: failures, errors and retries across the upload queue (GET /activity-health),
 * provider audit jobs (GET /jobs) and watcher runs (GET /watch-runs). Each panel loads and fails
 * independently (401 is handled by the shared apiFetch/AuthContext; 403 and 503 get their own honest
 * "unavailable" text, never an empty or healthy-looking panel). Windows are the newest 50 rows, stated on
 * the page; nothing here is a lifetime total. Everything from the API renders as React text.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { listJobs } from "../../api/jobs.js";
import { loadActivityHealth } from "../activity-health/activityHealthClient.js";
import { loadWatchRuns, providerJobsHealth, queueHealth, type WatchRunsResponse } from "./opsHealthModel.js";

type Panel<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ok"; data: T };
const loading = { state: "loading" } as const;

function describe(error: unknown, what: string): string {
  if (error instanceof ApiError && error.status === 401) return `${what} unavailable: your API key was not accepted.`;
  if (error instanceof ApiError && error.status === 403) return `${what} unavailable: this API key is not permitted to read it.`;
  if (error instanceof ApiError && error.status === 503) return `${what} unavailable: the service could not read it right now.`;
  return `${what} unavailable: unable to load it.`;
}
const when = (v: string | null) => v ?? "none in this window";
const num = (v: number | null) => v === null ? "not recorded" : String(v);

function body<T>(p: Panel<T>, render: (d: T) => React.ReactNode): React.ReactNode {
  if (p.state === "loading") return <p role="status" className="empty-note">Loading&hellip;</p>;
  if (p.state === "error") return <p role="alert" className="error-note">{p.message}</p>;
  return render(p.data);
}

export function OpsHealthPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [queue, setQueue] = useState<Panel<ReturnType<typeof queueHealth>>>(loading);
  const [provider, setProvider] = useState<Panel<ReturnType<typeof providerJobsHealth>>>(loading);
  const [watch, setWatch] = useState<Panel<WatchRunsResponse>>(loading);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    setQueue(loading); setProvider(loading); setWatch(loading);
    const run = <T, R>(load: () => Promise<T>, map: (v: T) => R, set: (p: Panel<R>) => void, what: string) =>
      load().then((v) => { if (!cancelled) set({ state: "ok", data: map(v) }); }, (e: unknown) => { if (!cancelled) set({ state: "error", message: describe(e, what) }); });
    void run(() => loadActivityHealth(apiKey, 50), queueHealth, setQueue, "Upload queue health");
    void run(() => listJobs(apiKey, 50), providerJobsHealth, setProvider, "Provider job health");
    void run(() => loadWatchRuns(apiKey, 50), (v) => v, setWatch, "Watcher run history");
    return () => { cancelled = true; };
  }, [apiKey, generation]);
  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  return (
    <>
      <div className="page-header">
        <h1>Operations health</h1>
        <p>Failures, errors and retries for your own tenant. Each figure covers the newest 50 rows of its source, not a lifetime total.</p>
      </div>
      {!apiKey && <div className="card empty-note">Sign in with an API key to view operations health.</div>}
      {apiKey && (<>
        <section className="card" aria-labelledby="ops-queue">
          <h2 id="ops-queue">Upload queue</h2>
          {body(queue, (q) => q.total === 0 ? <p className="empty-note">No upload jobs recorded yet.</p> : (
            <ul>
              <li>{q.total} jobs: {q.by.pending} pending; {q.by.processing} processing; {q.by.done} done; {q.by.failed} failed</li>
              <li>Automatic retries: {q.retries} across {q.retried} jobs</li>
              <li>Failure classes: {Object.keys(q.errors).length === 0 ? "none" : Object.entries(q.errors).map(([k, n]) => `${k} ${n}`).join("; ")}</li>
              <li>Last failure: {when(q.lastFailureAt)}</li>
              {q.truncated && <li>Older jobs are not included.</li>}
            </ul>))}
          <p className="row-meta">Source: GET /activity-health</p>
        </section>
        <section className="card" aria-labelledby="ops-provider">
          <h2 id="ops-provider">Provider jobs</h2>
          {body(provider, (p) => p.total === 0 ? <p className="empty-note">No provider jobs recorded yet.</p> : (
            <ul>
              <li>{p.total} jobs: {p.by.pending} pending; {p.by.processing} processing; {p.by.done} done; {p.by.failed} failed</li>
              <li>Retries: not recorded for provider jobs</li>
              <li>Last failure: {when(p.lastFailureAt)}</li>
              {p.truncated && <li>Older jobs are not included.</li>}
            </ul>))}
          <p className="row-meta">Source: GET /jobs</p>
        </section>
        <section className="card" aria-labelledby="ops-watch">
          <h2 id="ops-watch">Watcher runs</h2>
          {body(watch, (w) => w.runs.length === 0 ? <p className="empty-note">No watcher runs recorded yet.</p> : (<>
            <ul>
              <li>{w.summary.runs} runs, {w.summary.runsWithFailures} with failures or errors</li>
              <li>Drive recordings failed: {w.summary.totalDriveFailed}; errors recorded: {w.summary.totalErrors}</li>
              <li>Last failure: {when(w.summary.lastFailureAt)}</li>
              {w.truncated && <li>Older runs are not included.</li>}
            </ul>
            <table>
              <caption className="row-meta">Newest first</caption>
              <thead><tr><th scope="col">Run at</th><th scope="col">Mode</th><th scope="col">New</th><th scope="col">Ingested</th><th scope="col">Failed</th><th scope="col">Errors</th></tr></thead>
              <tbody>{w.runs.map((r) => (
                <tr key={r.id}><th scope="row">{r.runAt}</th><td>{r.mode}</td><td>{num(r.driveNewFound)}</td><td>{num(r.driveIngested)}</td><td>{num(r.driveFailed)}</td><td>{r.errorCount}</td></tr>
              ))}</tbody>
            </table></>))}
          <p className="row-meta">Source: GET /watch-runs. Retries are not recorded per watcher run.</p>
        </section>
        <button type="button" onClick={refresh}>Refresh</button>
      </>)}
    </>
  );
}
