import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import { listSources } from "../../api/sources.js";
import { getWatchState } from "../../api/watch-state.js";
import { sourceRegistryCounts, sourceWatcherHealth } from "./sourceHealthModel.js";
type Part<T> = { data: T; error: null } | { data: null; error: string };
function describe(error: unknown, name: string): string {
  if (error instanceof ApiError && error.status === 403) return `${name} unavailable: this key does not have permission.`;
  if (error instanceof ApiError && error.status === 501) return `${name} unavailable: this deployment has not configured the reader.`;
  return `${name} unavailable: unable to read valid data.`;
}
export function SourceHealthPanel({ apiKey }: { apiKey: string }): React.ReactElement {
  const [registry, setRegistry] = useState<Part<ReturnType<typeof sourceRegistryCounts>> | null>(null);
  const [watcher, setWatcher] = useState<Part<ReturnType<typeof sourceWatcherHealth>> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void listSources(apiKey).then(sourceRegistryCounts).then(data => { if (!cancelled) setRegistry({ data, error: null }); }, error => { if (!cancelled) setRegistry({ data: null, error: describe(error, "Source registry") }); });
    void getWatchState(apiKey).then(sourceWatcherHealth).then(data => { if (!cancelled) setWatcher({ data, error: null }); }, error => { if (!cancelled) setWatcher({ data: null, error: describe(error, "Source watcher health") }); });
    return () => { cancelled = true; };
  }, [apiKey]);
  return <>
    <section className="card" aria-label="Registered source counts"><h2>Registered source counts</h2>
      {!registry ? <p role="status">Loading source registry…</p> : registry.error ? <p role="alert">{registry.error}</p> : registry.data && <>
        <p>{registry.data.returned} returned registered source rows.</p><ul>{Object.entries(registry.data.counts).map(([kind, count]) => <li key={kind}>{kind}: {count}</li>)}</ul>
        {registry.data.unknown > 0 && <p>{registry.data.unknown} rows have unrecognized source kinds.</p>}{registry.data.returned === 0 && <p>No registered sources returned.</p>}
      </>}<p className="row-meta">Source: GET /sources. Registry counts do not prove ingestion, indexing or content coverage.</p><Link to="/sources">Inspect registered sources</Link>
    </section>
    <section className="card" aria-label="Source watcher health"><h2>Source watcher health</h2>
      {!watcher ? <p role="status">Loading source watcher health…</p> : watcher.error ? <p role="alert">{watcher.error}</p> : watcher.data && <>
        <p>{watcher.data.returned} returned current source states: {watcher.data.counts.seen} seen; {watcher.data.counts.ingested} ingested; {watcher.data.counts.failed} failed.</p>
        {watcher.data.returned === 0 && <p>No source watcher states returned; ingestion health is unknown.</p>}
        {watcher.data.heartbeats.length === 0 ? <p>No watcher heartbeats returned; watcher liveness is unknown.</p> : <ul>{watcher.data.heartbeats.map(heartbeat => <li key={heartbeat.sourceType}>{heartbeat.sourceType}: {heartbeat.lastHeartbeatAt === null ? "Never observed" : heartbeat.stale ? "Stale" : "Within server heartbeat interval"}; last heartbeat: {heartbeat.lastHeartbeatAt ?? "Not recorded"}.</li>)}</ul>}
      </>}<p className="row-meta">Source: GET /watch-state. Staleness uses the server's own heartbeat predicate; these are current returned states, not lifetime event totals.</p><Link to="/watch">Inspect source watcher and run a poll</Link>
    </section>
  </>;
}
