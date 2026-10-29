import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { apiFetch } from "../../api/client.js";

interface Definition { id: string; enabled: boolean; version: number; maxAttempts: number; timeoutMs: number }
interface Run { id: string; version: number; status: string; attempts: number; maxAttempts: number; incident: string | null; outcome: { ready: boolean; missingDocuments: string[] } | null }
/** Actual form-completeness operations; external application submission remains a separate configured integration. */
export function AutomationPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  const [runs, setRuns] = useState<Run[]>([]), [definition, setDefinition] = useState<Definition | null>(null);
  const [reference, setReference] = useState(""), [key, setKey] = useState(""), [available, setAvailable] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const boundSession = useRef({ apiKey, sessionVersion });
  const refresh = async (expected: number) => {
    const [definitions, data] = await Promise.all([apiFetch<{ definitions: Definition[] }>("/automation/definitions", apiKey), apiFetch<{ runs: Run[] }>("/automation/runs", apiKey)]);
    if (expected === generation.current) { setDefinition(definitions.definitions[0] ?? null); setRuns(data.runs); }
  };
  useEffect(() => {
    const current = ++generation.current; boundSession.current = { apiKey, sessionVersion }; setRuns([]); setDefinition(null); setError(null); setBusy(false); setReference(""); setKey(""); setAvailable([]);
    if (apiKey) void refresh(current).catch(() => { if (current === generation.current) setError("Automation unavailable or permission denied."); });
    return () => { generation.current++; };
  }, [apiKey, sessionVersion]);
  const action = async (path: string, method: "POST" | "PUT", body: unknown) => {
    const current = generation.current; setBusy(true); setError(null);
    try { await apiFetch(path, apiKey, { method, body }); await refresh(current); }
    catch { if (current === generation.current) setError("Operation refused or unavailable. Refresh the current state before retrying."); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const toggleDocument = (name: string) => setAvailable(prev => prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name]);
  if (!apiKey || boundSession.current.apiKey !== apiKey || boundSession.current.sessionVersion !== sessionVersion) return <section><h1>Application automation</h1><p>{apiKey ? "Loading your automation…" : "Sign in to manage automation."}</p></section>;
  return <section>
    <h1>Application automation</h1>
    <p><Link to="/automation/forms">Application forms</Link></p>
    <p>Check application document readiness, monitor work and handle exceptions. This routine does not submit applications externally.</p>
    {!apiKey && <p>Sign in to manage your tenant's automation.</p>}
    {error && <p role="alert">{error}</p>}
    <button disabled={!apiKey || busy} onClick={() => void action("/automation/definitions/application-readiness", "PUT", { enabled: !definition?.enabled, maxAttempts: 3, timeoutMs: 5000, expectedVersion: definition?.version ?? 0 })}>{definition?.enabled ? "Disable readiness routine" : "Enable readiness routine"}</button>
    <form onSubmit={event => { event.preventDefault(); void action("/automation/runs", "POST", { kind: "application-readiness", idempotencyKey: key, input: { applicationRef: reference, requiredDocuments: ["identity", "statement", "transcript"], availableDocuments: available } }); }}>
      <label>Application reference (no personal data)<input required maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" value={reference} onChange={e => setReference(e.target.value)} /></label>
      <label>Unique request key<input required maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" value={key} onChange={e => setKey(e.target.value)} /></label>
      <fieldset><legend>Available documents</legend>{["identity", "statement", "transcript"].map(name => <label key={name}><input type="checkbox" checked={available.includes(name)} onChange={() => toggleDocument(name)} />{name}</label>)}</fieldset>
      <button disabled={!apiKey || busy || !definition?.enabled}>Queue readiness check</button>
    </form>
    <button disabled={!apiKey || busy} onClick={() => void action("/automation/monitor", "POST", {})}>Check stalled operations</button>
    <button disabled={!apiKey || busy} onClick={() => void refresh(generation.current).catch(() => setError("Automation unavailable."))}>Refresh status</button>
    <ul>{runs.map(run => <li key={run.id}>
      <strong>{run.id}</strong> — {run.status}, attempt {run.attempts}/{run.maxAttempts}
      {run.incident && <p>Operator attention: {run.incident}</p>}
      {run.outcome && <p>{run.outcome.ready ? "Documents ready" : `Missing: ${run.outcome.missingDocuments.join(", ")}`}</p>}
      {run.status === "queued" && <button disabled={busy} onClick={() => void action(`/automation/runs/${run.id}/execute`, "POST", { expectedVersion: run.version })}>Run check</button>}
      {run.status === "waiting-for-operator" && run.attempts < run.maxAttempts && <button disabled={busy} onClick={() => void action(`/automation/runs/${run.id}/intervene`, "POST", { action: "retry", expectedVersion: run.version })}>Retry</button>}
      {run.status === "waiting-for-operator" && run.incident === "reconciliation-required" && <button disabled={busy} onClick={() => void action(`/automation/runs/${run.id}/intervene`, "POST", { action: "reconcile", expectedVersion: run.version })}>Confirm reconciliation</button>}
      {["queued", "waiting-for-operator", "failed"].includes(run.status) && <button disabled={busy} onClick={() => void action(`/automation/runs/${run.id}/intervene`, "POST", { action: "cancel", expectedVersion: run.version })}>Cancel</button>}
    </li>)}</ul>
  </section>;
}
