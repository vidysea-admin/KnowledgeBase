import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { CLAIM_STATUS_VALUES, listClaims, type ClaimStatus, type ClaimsListPage } from "../../api/claims.js";

const PAGE_SIZE = 25;
function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "This API key needs citations permission to read claims.";
  if (error instanceof ApiError && error.status === 401) return "Sign in with an API key to view claims.";
  return "Unable to load claims. Try refreshing.";
}

/** Read-only claims list with source citations. No approve/edit/delete controls by design. */
export function ClaimsPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [status, setStatus] = useState<ClaimStatus | "">("");
  const [offset, setOffset] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string | null; status: string; offset: number; data: ClaimsListPage | null; error: string | null } | null>(null);
  const current = loaded?.key === apiKey && loaded.status === status && loaded.offset === offset ? loaded : null;

  useEffect(() => {
    let cancelled = false;
    if (apiKey) listClaims(apiKey, { ...(status ? { status } : {}), limit: PAGE_SIZE, offset })
      .then((data) => { if (!cancelled) setLoaded({ key: apiKey, status, offset, data, error: null }); })
      .catch((error: unknown) => { if (!cancelled) setLoaded({ key: apiKey, status, offset, data: null, error: errorMessage(error) }); });
    return () => { cancelled = true; };
  }, [apiKey, status, offset]);

  const data = current?.data;
  return (
    <>
      <div className="page-header">
        <h1>Claims</h1>
        <p>Claims extracted from sessions, each with the session and turn it cites. This page is read-only.</p>
      </div>
      {!apiKey ? <div className="card empty-note">Sign in with an API key to view claims.</div> : <>
        <label>Status <select value={status} onChange={(e) => { setStatus(e.target.value as ClaimStatus | ""); setOffset(0); }}>
          <option value="">All statuses</option>
          {CLAIM_STATUS_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select></label>
        {!current && <div className="card empty-note">Loading claims&hellip;</div>}
        {current?.error && <div className="card error-note" role="alert">{current.error}</div>}
        {data && <div className="card">
          <p role="status">Showing {data.claims.length === 0 ? 0 : data.offset + 1}&ndash;{data.offset + data.claims.length}{data.truncated ? " (more available)" : ""}</p>
          {data.claims.length === 0 && <p className="empty-note">{data.offset > 0 ? "No more claims." : "No claims found for this tenant."}</p>}
          {data.claims.map((c) => <div className="row-card" key={c._id}>
            <div className="row-title">{c.text}</div>
            <div className="row-meta">Status: {c.status}{c.confidence !== undefined ? ` · Confidence: ${c.confidence}` : ""}{c.topicRefs?.length ? ` · Topics: ${c.topicRefs.join(", ")}` : ""}</div>
            {c.evidence.map((e, i) => <div className="row-meta" key={`${e.sessionId}:${e.turnId}:${i}`}>
              Source: <Link to={`/sessions/${encodeURIComponent(e.sessionId)}`}>{e.sessionTitle ?? e.sessionId}</Link> &middot; turn {e.turnId}
            </div>)}
          </div>)}
          <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>Previous</button>{" "}
          <button type="button" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={!data.truncated}>Next</button>
        </div>}
      </>}
    </>
  );
}
