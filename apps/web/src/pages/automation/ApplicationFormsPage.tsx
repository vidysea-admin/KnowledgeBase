import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { apiFetch } from "../../api/client.js";
interface Target { id: string; version: string; requiredFields: string[]; allowedFields: string[] }
interface Operation { id: string; version: number; targetId: string; status: string; incident: string | null; sideEffectUncertain: boolean; attempts: number; maxAttempts: number; hasReceipt: boolean }
interface Field { name: string; value: string; source: { documentId: string; page: number; start: number; end: number; revision: string } }
interface Review { id: string; version: number; payloadDigest: string; targetFingerprint: string; evidence: { name: string; source: Field["source"] }[] }
export function ApplicationFormsPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth(), generation = useRef(0);
  const boundSession = useRef({ apiKey, sessionVersion });
  const [targets, setTargets] = useState<Target[]>([]), [operations, setOperations] = useState<Operation[]>([]), [definitions, setDefinitions] = useState<{ targetId: string; version: number; enabled: boolean }[]>([]);
  const [selected, setSelected] = useState(""), [fields, setFields] = useState<Record<string, Field>>({}), [requestKey, setRequestKey] = useState(""), [receipts, setReceipts] = useState<Record<string, string>>({}), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const target = targets.find(t => t.id === selected), definition = definitions.find(d => d.targetId === selected);
  const refresh = async (g: number) => {
    const [registered, saved, state] = await Promise.all([apiFetch<{ targets: Target[] }>("/automation/forms/targets", apiKey), apiFetch<{ definitions: typeof definitions }>("/automation/forms/definitions", apiKey), apiFetch<{ operations: Operation[] }>("/automation/forms/operations", apiKey)]);
    if (g === generation.current) { setTargets(registered.targets); setDefinitions(saved.definitions); setOperations(state.operations); }
  };
  useEffect(() => {
    const g = ++generation.current; boundSession.current = { apiKey, sessionVersion }; setTargets([]); setDefinitions([]); setOperations([]); setFields({}); setRequestKey(""); setSelected(""); setReceipts({}); setReviews({}); setError(null); setBusy(false);
    if (apiKey) void refresh(g).catch(() => { if (g === generation.current) setError("Application operations unavailable or permission denied."); });
    return () => { generation.current++; };
  }, [apiKey, sessionVersion]);
  const action = async (path: string, method: "POST" | "PUT", body: unknown) => {
    const g = generation.current; setBusy(true); setError(null);
    try { await apiFetch(path, apiKey, { method, body }); if (g === generation.current) await refresh(g); }
    catch { if (g === generation.current) setError("Operation refused. Confirm the evidence, permission and current version, then refresh."); }
    finally { if (g === generation.current) setBusy(false); }
  };
  const field = (name: string): Field => fields[name] ?? { name, value: "", source: { documentId: "", page: 1, start: 0, end: 0, revision: "" } };
  const review = async (id: string) => { const g = generation.current; try { const data = await apiFetch<{ review: Review }>(`/automation/forms/operations/${id}/review`, apiKey); if (g === generation.current) setReviews(prev => ({ ...prev, [id]: data.review })); } catch { if (g === generation.current) setError("Evidence review unavailable or permission denied."); } };
  const update = (name: string, patch: Partial<Field>, source?: Partial<Field["source"]>) => setFields(prev => ({ ...prev, [name]: { ...field(name), ...patch, source: { ...field(name).source, ...source } } }));
  if (!apiKey || boundSession.current.apiKey !== apiKey || boundSession.current.sessionVersion !== sessionVersion) return <section><h1>Approved application routines</h1><p>{apiKey ? "Loading your application operations…" : "Sign in to manage application operations."}</p></section>;
  return <section>
    <h1>Approved application routines</h1>
    <p>Prepare evidence-backed fields, approve the exact request and run an administrator-configured application routine.</p>
    {error && <p role="alert">{error}</p>}
    {!targets.length && <p>No approved application target is configured. An administrator must configure and validate the destination before submission.</p>}
    <label>Application target<select value={selected} disabled={busy} onChange={e => { setSelected(e.target.value); setFields({}); }}><option value="">Choose a target</option>{targets.map(t => <option key={t.id} value={t.id}>{t.id} — {t.version}</option>)}</select></label>
    {target && <>
      <button disabled={!apiKey || busy} onClick={() => void action("/automation/forms/definitions", "PUT", { targetId: target.id, enabled: !definition?.enabled, maxAttempts: 3, timeoutMs: 5000, expectedVersion: definition?.version ?? 0 })}>{definition?.enabled ? "Disable target" : "Enable target"}</button>
      <form onSubmit={e => { e.preventDefault(); void action("/automation/forms/operations", "POST", { targetId: target.id, idempotencyKey: requestKey, fields: target.allowedFields.map(name => field(name)).filter(f => f.value.trim()) }); }}>
        <label>Unique request key<input required value={requestKey} maxLength={80} onChange={e => setRequestKey(e.target.value)} /></label>
        {target.allowedFields.map(name => <fieldset key={name}><legend>{name}{target.requiredFields.includes(name) ? " (required)" : ""}</legend>
          <label>Value<input value={field(name).value} maxLength={256} onChange={e => update(name, { value: e.target.value }, { end: field(name).source.start + e.target.value.length })} /></label>
          <label>Source document<input value={field(name).source.documentId} maxLength={2048} onChange={e => update(name, {}, { documentId: e.target.value })} /></label>
          <label>Page<input type="number" min={1} max={10000} value={field(name).source.page} onChange={e => update(name, {}, { page: Number(e.target.value) })} /></label>
          <label>Verified source revision<input value={field(name).source.revision} maxLength={64} onChange={e => update(name, {}, { revision: e.target.value })} /></label>
          <label>Evidence start offset<input type="number" min={0} value={field(name).source.start} onChange={e => update(name, {}, { start: Number(e.target.value), end: Number(e.target.value) + field(name).value.length })} /></label>
        </fieldset>)}
        <button disabled={!apiKey || busy || !definition?.enabled}>Save draft for approval</button>
      </form>
    </>}
    <button disabled={!apiKey || busy} onClick={() => void action("/automation/forms/monitor", "POST", {})}>Check stalled routines</button>
    <ul>{operations.map(op => <li key={op.id}><strong>{op.id}</strong> — {op.targetId}: {op.status}; attempt {op.attempts}/{op.maxAttempts}
      {op.incident && <p>Attention required: {op.incident}</p>}{op.sideEffectUncertain && <p>The destination outcome is uncertain. Do not submit a second request.</p>}
      {op.status === "draft" && <><button disabled={busy} onClick={() => void review(op.id)}>Review source evidence</button>{reviews[op.id] && <div><p>Request fingerprint: {reviews[op.id]!.payloadDigest}</p><ul>{reviews[op.id]!.evidence.map(e => <li key={e.name}>{e.name}: source {e.source.documentId}, page {e.source.page}, evidence {e.source.start}–{e.source.end}, revision {e.source.revision}</li>)}</ul></div>}<button disabled={busy || reviews[op.id]?.version !== op.version} onClick={() => void action(`/automation/forms/operations/${op.id}/approve`, "POST", { expectedVersion: op.version })}>Approve reviewed request</button></>}
      {op.status === "approved" && <button disabled={busy} onClick={() => void action(`/automation/forms/operations/${op.id}/execute`, "POST", { expectedVersion: op.version })}>Execute approved routine</button>}
      {op.status === "waiting-for-operator" && op.attempts < op.maxAttempts && <button disabled={busy} onClick={() => void action(`/automation/forms/operations/${op.id}/intervene`, "POST", { action: "retry", receiptId: null, expectedVersion: op.version })}>Request safe retry</button>}
      {op.sideEffectUncertain && ["waiting-for-operator", "failed"].includes(op.status) && <label>Destination receipt<input value={receipts[op.id] ?? ""} maxLength={80} onChange={e => setReceipts(prev => ({ ...prev, [op.id]: e.target.value }))} /><button disabled={busy || !receipts[op.id]} onClick={() => void action(`/automation/forms/operations/${op.id}/intervene`, "POST", { action: "reconcile", receiptId: receipts[op.id], expectedVersion: op.version })}>Verify destination receipt</button></label>}
      {!op.sideEffectUncertain && ["draft", "approved", "waiting-for-operator", "failed"].includes(op.status) && <button disabled={busy} onClick={() => void action(`/automation/forms/operations/${op.id}/intervene`, "POST", { action: "cancel", receiptId: null, expectedVersion: op.version })}>Cancel routine</button>}
    </li>)}</ul>
  </section>;
}
