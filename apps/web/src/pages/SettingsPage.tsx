import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { listKeys, createKey, revokeKey, type ApiKeySummary } from "../api/keys.js";
import { ApiError } from "../api/client.js";

const AVAILABLE_SCOPES = ["ask", "compete", "sessions", "sources", "gaps", "graph", "search", "citations", "webhooks", "keys", "jobs"];

export function SettingsPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["ask"]);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  function load() {
    listKeys(apiKey)
      .then((data) => setKeys(data.keys))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "failed to load keys"));
  }

  useEffect(load, [apiKey]);

  function toggleScope(scope: string) {
    setSelectedScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim() || selectedScopes.length === 0) {
      setError("a label and at least one scope are required");
      return;
    }
    try {
      const { key } = await createKey(apiKey, label.trim(), selectedScopes);
      setJustCreated(key);
      setLabel("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to create key");
    }
  }

  async function handleRevoke(id: string) {
    setError(null);
    try {
      await revokeKey(apiKey, id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to revoke key");
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage real API keys for this tenant. A raw key is only ever shown once, right after you create it.</p>
      </div>

      {justCreated && (
        <div className="card" style={{ borderColor: "var(--good)" }}>
          <div className="section-title">New key created &mdash; copy it now, it will not be shown again</div>
          <code className="inline" style={{ display: "block", padding: "0.6rem", wordBreak: "break-all" }}>{justCreated}</code>
          <button className="secondary" style={{ marginTop: "0.75rem" }} onClick={() => setJustCreated(null)}>I've copied it</button>
        </div>
      )}

      <div className="card">
        <div className="section-title">Create a new key</div>
        <form onSubmit={handleCreate}>
          <label htmlFor="key-label">Label</label>
          <input id="key-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My integration" />
          <div className="section-title">Scopes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {AVAILABLE_SCOPES.map((scope) => (
              <label key={scope} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontWeight: 400 }}>
                <input type="checkbox" checked={selectedScopes.includes(scope)} onChange={() => toggleScope(scope)} style={{ width: "auto", margin: 0 }} />
                {scope}
              </label>
            ))}
          </div>
          <button type="submit" style={{ marginTop: "1rem" }}>Create key</button>
        </form>
        {error && <div className="error-note" style={{ marginTop: "0.5rem" }}>{error}</div>}
      </div>

      <div className="section-title">Existing keys</div>
      {keys === null && <div className="card empty-note">Loading&hellip;</div>}
      {keys && keys.length === 0 && <div className="card empty-note">No keys yet.</div>}
      {keys && keys.length > 0 && (
        <div className="card">
          {keys.map((k) => (
            <div key={k._id} className="row-card">
              <div className="row-title">
                {k.label}{" "}
                <span className={k.revokedAt ? "badge badge-bad" : "badge badge-good"}>{k.revokedAt ? "revoked" : "active"}</span>
              </div>
              <div className="row-meta">scopes: {k.scopes.join(", ")} &middot; created {k.createdAt}</div>
              {!k.revokedAt && (
                <button className="secondary" style={{ marginTop: "0.5rem" }} onClick={() => handleRevoke(k._id)}>Revoke</button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
