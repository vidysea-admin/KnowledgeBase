/**
 * T-057 System status / setup check. Counts come from the authenticated, tenant-scoped
 * `GET /system-status` (ISS-STATUSSCOPE-001); the public `/health` counts are never used or shown. Everything from the API is rendered as React text. There are no URLs in this payload,
 * so no href is built. Long collection names are truncated in CSS, never sliced.
 * States: no key (no request), loading, "counts unavailable" error (401 / 403 / 503 / other, with a manual Retry), empty (db
 * ok but no collections reported), loaded. A failed load is never shown as the empty state.
 */
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { getSystemStatus, type SystemStatus } from "./statusClient.js";

interface Loaded {
  key: string;
  generation: number;
  data: SystemStatus | null;
  error: { kind: "unauthorised" | "forbidden" | "unavailable" | "failed"; message: string } | null;
}

function toError(error: unknown): NonNullable<Loaded["error"]> {
  if (error instanceof ApiError && error.status === 401) return { kind: "unauthorised", message: "Your API key was not accepted. Sign in again to view system status. Counts unavailable." };
  if (error instanceof ApiError && error.status === 403) return { kind: "forbidden", message: "Counts unavailable: this API key is not permitted to read system status." };
  if (error instanceof ApiError && error.status === 503) return { kind: "unavailable", message: "Counts unavailable: the system status reader is not available right now." };
  return { kind: "failed", message: "Counts unavailable: unable to load system status. The service may be down or unreachable." };
}

const truncate: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" };

export function SystemStatusPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const current = loaded && loaded.key === apiKey && loaded.generation === generation ? loaded : null;

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    getSystemStatus(apiKey)
      .then((data) => { if (!cancelled) setLoaded({ key: apiKey, generation, data, error: null }); })
      .catch((error: unknown) => { if (!cancelled) setLoaded({ key: apiKey, generation, data: null, error: toError(error) }); });
    return () => { cancelled = true; };
  }, [apiKey, generation]);

  const data = current?.data ?? null;
  const total = data ? data.collections.reduce((sum, c) => sum + c.count, 0) : 0;
  const emptyNames = data ? data.collections.filter((c) => c.count === 0).map((c) => c.name) : [];

  return (
    <>
      <div className="page-header">
        <h1>System status</h1>
        <p>Setup check for your tenant. Counts are document totals for your own tenant only.</p>
      </div>
      {!apiKey && <div className="card empty-note">Sign in with an API key to view system status.</div>}
      {apiKey && !current && <div className="card empty-note" role="status">Loading system status&hellip;</div>}
      {current?.error && (
        <div className="card error-note" role="alert">
          <p>{current.error.message}</p>
          {current.error.kind !== "unauthorised" && (
            <button type="button" onClick={() => setGeneration((value) => value + 1)}>Retry</button>
          )}
        </div>
      )}
      {data && (
        <>
          <section className="card" aria-labelledby="status-checks">
            <h2 id="status-checks">Checks</h2>
            <ul>
              <li>Database: {data.db === "ok" ? "reachable" : "NOT reachable"}</li>
              <li>Watchers silent: unavailable (no tenant-scoped source)</li>
              <li>Watchers unreadable: unavailable (no tenant-scoped source)</li>
              <li>Collections with no documents: {emptyNames.length === 0 ? "none" : emptyNames.length}</li>
            </ul>
            <button type="button" onClick={() => setGeneration((value) => value + 1)}>Refresh</button>
          </section>
          <section className="card" aria-labelledby="status-collections">
            <h2 id="status-collections">Collections</h2>
            {data.collections.length === 0 ? (
              <p className="empty-note">The service reported no collections.</p>
            ) : (
              <table>
                <caption className="row-meta">{data.collections.length} collections, {total} documents in total</caption>
                <thead><tr><th scope="col">Collection</th><th scope="col">Documents</th></tr></thead>
                <tbody>
                  {data.collections.map((c) => (
                    <tr key={c.name}>
                      <th scope="row"><div style={{ ...truncate, maxWidth: "24rem" }}>{c.name}</div></th>
                      <td>{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}
