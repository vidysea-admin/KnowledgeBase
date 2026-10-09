import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { listJobs, type JobsReadResponse } from "../../api/jobs.js";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "This API key needs jobs permission to read provider audit records.";
  if (error instanceof ApiError && error.status === 401) return "Sign in with an API key to view provider audit records.";
  return "Unable to load provider audit records. Try refreshing.";
}

export function JobsPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string | null; generation: number; data: JobsReadResponse | null; error: string | null } | null>(null);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const current = loaded?.key === apiKey && loaded.generation === refresh ? loaded : null;

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setKind("");
    setStatus("");
    if (apiKey) listJobs(apiKey)
      .then((data) => { if (!cancelled) setLoaded({ key: apiKey, generation: refresh, data, error: null }); })
      .catch((error: unknown) => { if (!cancelled) setLoaded({ key: apiKey, generation: refresh, data: null, error: errorMessage(error) }); });
    return () => { cancelled = true; };
  }, [apiKey, refresh]);

  const data = current?.data;
  const visible = (data?.jobs ?? []).filter((job) => (!kind || job.kind === kind) && (!status || job.status === status));
  const kinds = [...new Set((data?.jobs ?? []).map((job) => job.kind))].sort();

  return (
    <>
      <div className="page-header">
        <h1>Provider jobs</h1>
        <p>Application provider-call audit records. Status describes a provider call; it does not establish end-to-end pipeline completion.</p>
      </div>
      {!apiKey ? <div className="card empty-note">Sign in with an API key to view provider audit records.</div> : <>
        <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={!current}>Refresh</button>
        {!current && <div className="card empty-note">Loading provider audit records&hellip;</div>}
        {current?.error && <div className="card error-note" role="alert">{current.error}</div>}
        {data && <div className="card">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <label>Kind <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="">All kinds</option>
              {kinds.map((value) => <option key={value} value={value}>{value}</option>)}
            </select></label>
            <label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {["pending", "processing", "done", "failed"].map((value) => <option key={value} value={value}>{value}</option>)}
            </select></label>
          </div>
          <p role="status">Showing {visible.length} of {data.jobs.length} returned provider audit records.</p>
          {data.truncated && <p className="empty-note">More records exist beyond this {data.limit}-record response. Filters apply only to returned records.</p>}
          {!data.truncated && <p className="row-meta">Filters apply to the returned records.</p>}
          {data.jobs.length === 0 && <p className="empty-note">No provider audit records were returned.</p>}
          {data.jobs.length > 0 && visible.length === 0 && <p className="empty-note">No returned records match these filters.</p>}
          {visible.map((job, index) => <div className="row-card" key={`${job._id}:${index}`}>
            <div className="row-title">{job.kind} &middot; {job.status}</div>
            <div className="row-meta">ID: {job._id} &middot; Created: {job.createdAt}</div>
            <div className="row-meta">Provider: {job.provider ?? "Not recorded"}{job.updatedAt ? ` · Updated: ${job.updatedAt}` : ""}</div>
          </div>)}
        </div>}
      </>}
    </>
  );
}
