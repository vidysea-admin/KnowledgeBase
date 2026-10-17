import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { safeHttpUrl } from "../../safe-url.js";
import { simulateDraftPolicy, type DraftPolicyMode, type PolicySimulationResponse } from "./client.js";

export function AnswerPolicySimulator(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth(); const authOwner = JSON.stringify([apiKey, sessionVersion]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<DraftPolicyMode>("internal-only");
  const [version, setVersion] = useState(1);
  const [result, setResult] = useState<PolicySimulationResponse | null>(null);
  const [viewKey, setViewKey] = useState(authOwner);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    generation.current++;
    setViewKey(authOwner); setResult(null); setError(null); setBusy(false); setQuery("");
    return () => { generation.current++; };
  }, [apiKey, authOwner]);

  function changeMode(next: DraftPolicyMode): void {
    if (next === mode) return;
    generation.current++;
    setMode(next); setVersion((v) => v + 1); setResult(null); setError(null);
  }
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!query.trim() || busy) return;
    const request = ++generation.current;
    setBusy(true); setResult(null); setError(null);
    try {
      const reply = await simulateDraftPolicy(apiKey, query.trim(), { policyId: "browser-draft", version, mode });
      if (request === generation.current) setResult(reply);
    } catch (err) {
      if (request === generation.current) setError(err instanceof ApiError ? err.message : "Policy simulation failed.");
    } finally { if (request === generation.current) setBusy(false); }
  }

  if (viewKey !== authOwner) return <p>Loading this sign-in session…</p>;
  return <>
    <div className="page-header"><h1>Answer policy simulator</h1>
      <p>Test a draft policy against a fresh knowledge-base answer. This runs the existing Ask workflow.</p></div>
    <form className="card" onSubmit={(event) => { void submit(event); }}>
      <label htmlFor="policy-mode">Allowed sources</label>{" "}
      <select id="policy-mode" value={mode} disabled={busy} onChange={(e) => changeMode(e.target.value as DraftPolicyMode)}>
        <option value="internal-only">Internal knowledge only</option>
        <option value="internal-and-web">Internal knowledge and web</option>
      </select>
      <p>Draft version {version}. Drafts last for this page session; they are not saved or applied to Ask.</p>
      <label htmlFor="policy-query">Question</label>
      <input id="policy-query" value={query} disabled={busy} onChange={(e) => setQuery(e.target.value)} style={{ width: "100%" }} />
      <button disabled={busy || !query.trim()} type="submit">{busy ? "Simulating…" : "Simulate policy"}</button>
    </form>
    {error && <div role="alert" className="card error-note">{error}</div>}
    {result && <>
      <div className="card" role="status"><h2>Policy decision: {result.simulation.decision}</h2>
        <p>{result.simulation.reason.replaceAll("-", " ")}</p>
        <p>Simulated draft version {result.draft.version}. Internal sources: {result.simulation.internalSources}; web sources: {result.simulation.webSources}.</p>
        <p>This decision checks source availability and coverage, not the truth of every claim.</p>
      </div>
      <div className="card"><h2>Candidate answer</h2><p style={{ whiteSpace: "pre-wrap" }}>{result.result.answer}</p>
        {result.result.insufficient_coverage && <p className="empty-note">Coverage is insufficient; this answer needs review.</p>}
        <p>Retrieval verdict: {result.result.verdict}</p>
        <p>{result.result.web_used ? "Ask used web sources." : "Ask did not use web sources."}</p>
      </div>
      <div className="card"><h2>Internal sources</h2><ul>{result.result.sources.internal.map((source) => {
        const session = source.evidence?.sessionRef;
        return <li key={source.node_id}>{typeof session === "string" && session.trim()
          ? <Link to={`/sessions/${encodeURIComponent(session)}`}>{source.node_id}</Link> : source.node_id}</li>;
      })}</ul>{!result.result.sources.internal.length && <p>None.</p>}</div>
      <div className="card"><h2>Web sources</h2><ul>{result.result.sources.web.map((source, index) => {
        const url = safeHttpUrl(source.url), title = typeof source.title === "string" ? source.title : "Web source";
        return <li key={index}>{url ? <a href={url} target="_blank" rel="noreferrer">{title}</a> : <span>{title}</span>}</li>;
      })}</ul>{!result.result.sources.web.length && <p>None.</p>}</div>
    </>}
  </>;
}
