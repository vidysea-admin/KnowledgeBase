import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { listPolicies, listPolicyConflicts, loadPolicyYaml, policyHistory, retirePolicy, savePolicyYaml, simulateYamlPolicy, type SavedPolicy, type PolicyConflict } from "./client.js";
import { AnswerPolicySimulator } from "./AnswerPolicySimulator.js";
import { AnswerSources } from "./AnswerSources.js";

const starter = 'questionClass: "general"\nmode: "internal-only"\nstyle: "concise"\nonInsufficient: "review"\ncitations: "required"\nnote: "Initial policy"\n';
export function PolicyManager(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth(); const authOwner = JSON.stringify([apiKey, sessionVersion]);
  const [viewKey, setViewKey] = useState(authOwner);
  const [policies, setPolicies] = useState<SavedPolicy[]>([]), [conflicts, setConflicts] = useState<PolicyConflict[]>([]);
  const [history, setHistory] = useState<SavedPolicy[]>([]), [id, setId] = useState("general-policy"), [yaml, setYaml] = useState(starter);
  const [note, setNote] = useState(""), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState(""), [simulation, setSimulation] = useState<Awaited<ReturnType<typeof simulateYamlPolicy>> | null>(null);
  const generation = useRef(0);
  useEffect(() => { const token = ++generation.current; setViewKey(authOwner); setPolicies([]); setConflicts([]); setHistory([]); setError(null); setBusy(false); setYaml(starter); setId("general-policy"); setNote(""); setSimulation(null); setQuestion("");
    Promise.all([listPolicies(apiKey), listPolicyConflicts(apiKey)]).then(([p, c]) => { if (token === generation.current) { setPolicies(p.policies); setConflicts(c.conflicts); } })
      .catch((e: unknown) => { if (token === generation.current) setError(e instanceof ApiError ? e.message : "Policies unavailable."); });
    return () => { generation.current++; };
  }, [apiKey, authOwner]);
  async function action(work: () => Promise<void>): Promise<void> {
    if (busy) return; const token = ++generation.current; setBusy(true); setError(null);
    try { await work(); } catch (e) { if (token === generation.current) setError(e instanceof ApiError ? e.message : "Policy operation failed."); }
    finally { if (token === generation.current) setBusy(false); }
  }
  async function reload(token: number): Promise<void> {
    const [p, c, h] = await Promise.all([listPolicies(apiKey), listPolicyConflicts(apiKey), policyHistory(apiKey, id)]);
    if (token === generation.current) { setPolicies(p.policies); setConflicts(c.conflicts); setHistory(h.history); }
  }
  if (viewKey !== authOwner) return <div className="page-header"><h1>Answer policies</h1><p>Loading this sign-in session…</p></div>;
  return <><div className="page-header"><h1>Answer policies</h1><p>Save immutable policy revisions, inspect conflicts and apply a selected policy on <Link to="/ask">Ask</Link>. Citations are always required.</p></div>
    {error && <div className="card" role="alert">{error}</div>}
    <section className="card"><h2>Saved policies</h2>{!policies.length && <p>No saved policies.</p>}
      <ul>{policies.map((p) => <li key={p.policyId}>{p.policyId} v{p.version} · {p.questionClass} · {p.retired ? "retired" : "active"}
        <button disabled={busy} onClick={() => { void action(async () => { const token = generation.current; const [y, h] = await Promise.all([loadPolicyYaml(apiKey, p.policyId), policyHistory(apiKey, p.policyId)]); if (token === generation.current) { setId(p.policyId); setYaml(y.yaml); setHistory(h.history); setSimulation(null); } }); }}>Edit or inspect {p.policyId}</button>
      </li>)}</ul></section>
    <form className="card" onSubmit={(e) => { e.preventDefault(); void action(async () => { const token = generation.current; await savePolicyYaml(apiKey, id, yaml); await reload(token); }); }}>
      <h2>Policy YAML</h2><label htmlFor="saved-policy-id">Policy ID</label><input id="saved-policy-id" value={id} maxLength={64} disabled={busy} onChange={(e) => { setId(e.target.value); setHistory([]); setSimulation(null); }} />
      <p>Use flat scalar YAML with quoted strings. Editing a saved policy requires its expectedVersion. Changes take effect on selection; policy-change reviews are an audit queue.</p>
      <label htmlFor="saved-policy-yaml">YAML definition</label><textarea id="saved-policy-yaml" value={yaml} maxLength={8192} disabled={busy} rows={10} style={{ width: "100%" }} onChange={(e) => { setYaml(e.target.value); setSimulation(null); }} />
      <button disabled={busy || !id.trim() || !yaml.trim()}>Save policy revision</button>
    </form>
    <section className="card"><h2>Simulate this YAML draft</h2><label htmlFor="yaml-policy-question">Simulation question</label><input id="yaml-policy-question" maxLength={4000} value={question} disabled={busy} onChange={(e) => { setQuestion(e.target.value); setSimulation(null); }} />
      <button disabled={busy || !question.trim() || !id.trim() || !yaml.trim()} onClick={() => { void action(async () => { const token = generation.current; const reply = await simulateYamlPolicy(apiKey, id, yaml, question.trim()); if (token === generation.current) setSimulation(reply); }); }}>Simulate YAML draft</button>
      <p>Simulation is transient: it does not save or approve this candidate. Source mode and answer style govern this fresh bounded Ask run.</p>
      {simulation && <><p role="status">Draft decision: {simulation.simulation.decision} · {simulation.simulation.reason}</p><h3>Unapproved simulation candidate</h3><p>{simulation.result.answer}</p><AnswerSources answer={simulation.result} /></>}
    </section>
    <section className="card"><h2>History for {id}</h2>{!history.length && <p>No history loaded.</p>}
      <ol>{history.map((p) => <li key={p.version}>v{p.version} · {p.changedAt} · verified tenant actor {p.changedBy.actor}{p.changedBy.claimedBy && ` · unverified label ${p.changedBy.claimedBy}`} · {p.retired ? "retired" : `${p.mode}, ${p.style}, ${p.onInsufficient}`}<p>{p.note}</p></li>)}</ol>
      <label htmlFor="retire-policy-note">Retirement reason</label><input id="retire-policy-note" value={note} maxLength={500} disabled={busy} onChange={(e) => setNote(e.target.value)} />
      <button disabled={busy || !note.trim() || !history.length || history.at(-1)?.retired === true} onClick={() => { void action(async () => { const token = generation.current; const current = history.at(-1)!; await retirePolicy(apiKey, current, note); await reload(token); }); }}>Retire current revision</button>
    </section>
    <section className="card"><h2>Policy conflicts</h2><p>Conflicting policies require editing or retirement. Acknowledgement cannot authorize an answer.</p>
      {!conflicts.length && <p>No live policy conflicts.</p>}<ul>{conflicts.map((c) => <li key={c.key}>{c.severity}: {c.explanation}</li>)}</ul>
    </section>
    <section><h2>Transient simulation</h2><AnswerPolicySimulator /></section>
  </>;
}
