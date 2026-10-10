import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { loadActivityHealth } from "./activityHealthClient.js";
import { activityHealthModel, activityStatuses, type ActivitySnapshot } from "./activityHealthModel.js";

function failure(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "This API key needs jobs permission to view activity.";
  if (error instanceof ApiError && error.status === 503) return "The upload queue is unavailable or is not configured for this tenant.";
  return "Unable to load activity. Try refreshing.";
}
export function ActivityHealthPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState("all");
  const [loaded, setLoaded] = useState<{ key: string; generation: number; snapshot: ActivitySnapshot | null; error: string | null } | null>(null);
  const current = loaded?.key === apiKey && loaded.generation === generation ? loaded : null;
  useEffect(() => {
    let cancelled = false;
    setLoaded(null); setStatus("all");
    if (apiKey) loadActivityHealth(apiKey).then(snapshot => {
      if (!cancelled) setLoaded({ key: apiKey, generation, snapshot, error: null });
    }).catch((error: unknown) => {
      if (!cancelled) setLoaded({ key: apiKey, generation, snapshot: null, error: failure(error) });
    });
    return () => { cancelled = true; };
  }, [apiKey, generation]);
  const snapshot = current?.snapshot;
  const model = snapshot ? activityHealthModel(snapshot) : null;
  const visible = snapshot?.jobs.filter(job => status === "all" || job.status === status) ?? [];
  return <>
    <div className="page-header"><h1>Activity &amp; Knowledge Health</h1><p>Inspect this tenant’s durable upload operations, queue activity, errors and automatic retries.</p></div>
    {!apiKey ? <p className="card empty-note">Sign in with an API key to view activity.</p> : <>
      <button type="button" disabled={!current} onClick={() => setGeneration(value => value + 1)}>Refresh</button>
      {!current && <p role="status">Loading activity…</p>}
      {current?.error && <p role="alert" className="card error-note">{current.error}</p>}
      {snapshot && model && <>
        <section className="card" aria-label="Queue health summary">
          <p>{model.returned} returned upload operations{model.total === null ? `; capped at ${snapshot.limit}; total unknown` : "; all matching operations returned"}.</p>
          <p>{model.counts.pending} pending; {model.counts.processing} processing; {model.counts.done} done; {model.counts.failed} failed in this returned sample.</p>
          <p>{model.retryCount} automatic retries observed in this returned sample.</p>
          <p>Latest returned queue activity: {model.latestQueueActivityAt ?? "Not recorded"}.</p>
          <p>Snapshot checked at {model.observedAt}. Refresh to update it.</p>
          {model.futureTimestampCount > 0 && <p>{model.futureTimestampCount} recorded creation or update timestamps are after this snapshot; their age is unknown.</p>}
          <p className="row-meta">Queue activity measures operation creation or worker updates. It does not establish transcript, index or all-knowledge freshness. A done operation is not proof that downstream indexing completed.</p>
          <p className="row-meta">The worker may reclaim an expired processing lease below the operation’s attempt limit, while its deadline and cancellation checks permit it. Recorded attempts above one show an automatic retry. Failed operations are terminal.</p>
        </section>
        <label>Status <select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{activityStatuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <p role="status">Showing {visible.length} of {model.returned} returned upload operations.</p>
        {model.returned === 0 ? <p className="card empty-note">No upload operations were returned. This does not establish complete knowledge.</p> : visible.length === 0 ? <p className="card empty-note">No returned operations match this status.</p> : <ul className="card" aria-label="Upload operations">{visible.map(job => <li key={job.id}>
          <p>Operation {job.id}</p><p>Status: {job.status}; attempts: {job.attempts}/{job.maxAttempts}; observed automatic retries: {job.automaticRetryCount}.</p>
          <p>Created: {job.createdAt}; worker update: {job.updatedAt ?? "Not recorded"}; deadline: {job.deadlineAt}.</p>
          <p>Queue creation age at snapshot: {Date.parse(job.createdAt) > Date.parse(snapshot.observedAt) ? "Unknown (future recorded timestamp)" : `${Math.floor((Date.parse(snapshot.observedAt) - Date.parse(job.createdAt)) / 1000)} seconds`}; deadline at snapshot: {Date.parse(job.deadlineAt) <= Date.parse(snapshot.observedAt) ? "elapsed" : "upcoming"}.</p>
          {job.errorClass && <p>Error class: {job.errorClass}.</p>}
        </li>)}</ul>}
      </>}
    </>}
  </>;
}
