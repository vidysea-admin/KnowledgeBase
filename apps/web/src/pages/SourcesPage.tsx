import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { listSources } from "../api/sources.js";
import { ApiError } from "../api/client.js";
import type { Source } from "../api/types.js";

export function SourcesPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [loaded, setLoaded] = useState<{ key: string | null; sources: Source[] | null; error: string | null }>({ key: apiKey, sources: null, error: null });
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [captureMode, setCaptureMode] = useState("");
  const sources = loaded.key === apiKey ? loaded.sources : null;
  const error = loaded.key === apiKey ? loaded.error : null;

  useEffect(() => {
    let cancelled = false;
    setLoaded({ key: apiKey, sources: null, error: null });
    listSources(apiKey)
      .then((data) => { if (!cancelled) setLoaded({ key: apiKey, sources: data.sources, error: null }); })
      .catch((err: unknown) => { if (!cancelled) setLoaded({ key: apiKey, sources: null, error: err instanceof ApiError ? err.message : "failed to load sources" }); });
    return () => { cancelled = true; };
  }, [apiKey]);

  const search = query.trim().toLowerCase();
  const visible = (sources ?? []).filter((source) =>
    (!kind || source.kind === kind) && (!captureMode || source.captureMode === captureMode) &&
    (!search || [source.kind, source.url, source.path].some((value) => value?.toLowerCase().includes(search))),
  ).sort((a, b) => {
    const aTime = Date.parse(a.createdAt), bTime = Date.parse(b.createdAt);
    const dateOrder = (Number.isFinite(bTime) ? bTime : -Infinity) - (Number.isFinite(aTime) ? aTime : -Infinity);
    return dateOrder || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0);
  });
  const kinds = [...new Set((sources ?? []).map((source) => source.kind))].sort();
  const captureModes = [...new Set((sources ?? []).map((source) => source.captureMode))].sort();

  return (
    <>
      <div className="page-header">
        <h1>Sources</h1>
        <p>Every raw source that has been ingested into the knowledge base.</p>
      </div>
      {error && <div className="card error-note">{error}</div>}
      {!error && sources === null && <div className="card empty-note">Loading&hellip;</div>}
      {sources && sources.length === 0 && <div className="card empty-note">No sources recorded for this tenant yet.</div>}
      {sources && sources.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "end" }}>
            <label style={{ display: "grid", gap: "0.3rem" }}>Search sources
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Location or kind" />
            </label>
            <label style={{ display: "grid", gap: "0.3rem" }}>Kind
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="">All kinds</option>
                {kinds.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: "0.3rem" }}>Capture mode
              <select value={captureMode} onChange={(event) => setCaptureMode(event.target.value)}>
                <option value="">All capture modes</option>
                {captureModes.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => { setQuery(""); setKind(""); setCaptureMode(""); }}>Clear filters</button>
          </div>
          <p role="status">Showing {visible.length} of {sources.length} sources &middot; Newest first</p>
          {visible.length === 0 && <div className="empty-note">No sources match these filters.</div>}
          {visible.map((s) => (
            <div key={s._id} className="row-card">
              <div className="row-title">{s.kind} &middot; {s.captureMode}</div>
              <div className="row-meta">{s.url ?? s.path ?? "(no location recorded)"} &middot; {s.createdAt}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
