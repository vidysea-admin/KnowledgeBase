import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { listSessions } from "../../api/sessions.js";
import type { SessionSummary } from "../../api/types.js";
import { createKnowledgeOutput, editKnowledgeOutput, exportKnowledgeOutput, getKnowledgeOutput, listKnowledgeOutputs, revalidateKnowledgeOutput,
  type KnowledgeOutputDraft, type OutputSummary } from "../../api/knowledge-outputs.js";

export function KnowledgeOutputsPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]), [outputs, setOutputs] = useState<OutputSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]), [kind, setKind] = useState<KnowledgeOutputDraft["kind"]>("faq");
  const [title, setTitle] = useState(""), [purpose, setPurpose] = useState(""), [policyId, setPolicyId] = useState("");
  const [draft, setDraft] = useState<KnowledgeOutputDraft | null>(null), [editTitle, setEditTitle] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({}), [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const stamp = ++generation.current;
    setSessions([]); setOutputs([]); setSelected([]); setDraft(null); setEdits({}); setEditing(false); setBusy(false); setError(null); setLoading(true);
    setTitle(""); setPurpose(""); setPolicyId(""); setEditTitle(""); setKind("faq");
    setLoadFailed(false);
    void Promise.all([listSessions(apiKey), listKnowledgeOutputs(apiKey)]).then(([sources, saved]) => {
      if (stamp !== generation.current) return;
      setSessions(sources.sessions); setOutputs(saved.outputs);
    }).catch((e: unknown) => { if (stamp === generation.current) { setLoadFailed(true); setError(e instanceof ApiError ? e.message : "Could not load knowledge outputs."); } })
      .finally(() => { if (stamp === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [apiKey, sessionVersion]);
  function show(next: KnowledgeOutputDraft): void {
    setDraft(next); setEditTitle(next.title); setEdits({}); setEditing(false);
    setOutputs((saved) => saved.map((output) => output.id === next._id
      ? { id: next._id, title: next.title, kind: next.kind, revision: next.revision, updatedAt: next.updatedAt }
      : output).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }
  async function action(fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true); setError(null);
    const stamp = generation.current;
    try { await fn(); }
    catch (e) { if (stamp === generation.current) setError(e instanceof ApiError ? `${e.message}${e.status === 409 ? " Reopen the draft or regenerate after reviewing changes." : ""}` : "Knowledge output operation failed."); }
    finally { if (stamp === generation.current) setBusy(false); }
  }
  async function create(): Promise<void> {
    const stamp = generation.current;
    const next = await createKnowledgeOutput(apiKey, { kind, title, purpose, sessionIds: selected, ...(policyId.trim() ? { policyId: policyId.trim() } : {}) });
    if (stamp !== generation.current) return;
    show(next);
    const saved = await listKnowledgeOutputs(apiKey); if (stamp === generation.current) setOutputs(saved.outputs);
  }
  async function open(id: string): Promise<void> {
    const stamp = generation.current, next = await getKnowledgeOutput(apiKey, id);
    if (stamp === generation.current) show(next);
  }
  async function save(): Promise<void> {
    if (!draft) return;
    const stamp = generation.current;
    const next = await editKnowledgeOutput(apiKey, draft._id, { revision: draft.revision, title: editTitle, edits: Object.entries(edits).map(([id, text]) => ({ id, text })) });
    if (stamp === generation.current) show(next);
  }
  async function validate(): Promise<void> {
    if (!draft) return;
    const stamp = generation.current, next = await revalidateKnowledgeOutput(apiKey, draft._id, draft.revision);
    if (stamp === generation.current) show(next);
  }
  async function download(): Promise<void> {
    if (!draft) return;
    const stamp = generation.current, result = await exportKnowledgeOutput(apiKey, draft._id, draft.revision);
    if (stamp !== generation.current) return;
    const url = URL.createObjectURL(new Blob([result.markdown], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.filename; anchor.click(); URL.revokeObjectURL(url);
  }
  const unvalidated = draft?.sections.some((s) => s.items.some((i) => i.validation !== "ai-supported"));
  const available = draft?.sections.some((s) => s.items.some((i) => i.validation === "ai-supported"));
  const partial = draft && (draft.sourceCoverage.status === "partial" || draft.sections.some((s) => !s.items.length || s.items.some((i) => i.validation !== "ai-supported")));
  return <>
    <div className="page-header"><h1>Knowledge outputs</h1><p>Create a cited FAQ, report or meeting brief from your knowledge. All generated content remains an AI draft for human review.</p></div>
    {error && <div role="alert" className="card error-note">{error}</div>}
    {loading && <p role="status">Loading sources and saved drafts…</p>}
    {!loading && <form className="card" onSubmit={(e) => { e.preventDefault(); void action(create); }}>
      <h2>Create a draft</h2><label htmlFor="output-kind">Output type</label>{" "}
      <select id="output-kind" value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as KnowledgeOutputDraft["kind"])}>
        <option value="faq">FAQ</option><option value="report">Report</option><option value="meeting-brief">Meeting preparation brief</option>
      </select>
      <p><label htmlFor="output-title">Title</label><input id="output-title" value={title} maxLength={180} required disabled={busy} onChange={(e) => setTitle(e.target.value)} /></p>
      <p><label htmlFor="output-purpose">Audience and purpose</label><textarea id="output-purpose" value={purpose} maxLength={2000} required disabled={busy} onChange={(e) => setPurpose(e.target.value)} style={{ width: "100%" }} /></p>
      <p><label htmlFor="output-policy">Policy ID (optional)</label><input id="output-policy" value={policyId} maxLength={120} disabled={busy} onChange={(e) => setPolicyId(e.target.value)} /> Use a policy whose question class matches {kind}. <Link to="/answer-policy">Manage policies</Link></p>
      <fieldset disabled={busy}><legend>Source sessions (choose up to 10)</legend>
        {sessions.map((s) => <label key={s._id} style={{ display: "block" }}><input type="checkbox" checked={selected.includes(s._id)} disabled={!selected.includes(s._id) && selected.length >= 10}
          onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, s._id] : ids.filter((id) => id !== s._id))} />{s.title}</label>)}
        {!sessions.length && <p>{loadFailed ? "Source sessions could not be loaded." : "No source sessions are available."}</p>}
      </fieldset>
      <button type="submit" disabled={busy || !selected.length || !title.trim() || !purpose.trim()}>{busy ? "Working…" : "Generate draft"}</button>
    </form>}
    <section className="card"><h2>Saved drafts</h2>{!outputs.length && <p>{loadFailed ? "Saved drafts could not be loaded." : "No saved drafts."}</p>}<ul>{outputs.map((o) => <li key={o.id}><button disabled={busy} onClick={() => { void action(() => open(o.id)); }}>{o.title}</button> · {o.kind} · revision {o.revision}</li>)}</ul></section>
    {draft && <section className="card"><h2>{draft.title}</h2><p role="status">AI draft · revision {draft.revision} · {!available ? "No supported content available; review the draft or change sources." : unvalidated ? "Grounding review required; export unavailable." : "Model grounding assessment completed; human review required."}</p>
      {partial && <p>Coverage is partial. Empty or withheld sections need review.</p>}
      {draft.sourceCoverage.withheldClaims > 0 && <p>{draft.sourceCoverage.withheldClaims} source claims were excluded because their evidence was not eligible for grounded output.</p>}
      <p>{draft.policy ? `Policy ${draft.policy.policyId}, version ${draft.policy.version}.` : "No matching policy. Uses a conservative internal-only default with required citations."}</p>
      <p>Generated using {draft.provider} / {draft.model}. Review source support before sharing.</p>
      {!editing && <button disabled={busy} onClick={() => setEditing(true)}>Edit draft</button>}
      {editing && <p><label htmlFor="edit-output-title">Draft title</label><input id="edit-output-title" value={editTitle} maxLength={180} disabled={busy} onChange={(e) => setEditTitle(e.target.value)} /></p>}
      {draft.sections.map((section) => <section key={section.key}><h3>{section.title}</h3>{section.missing && <p>{section.missing}</p>}
        {!section.items.length && <p>No supported material found.</p>}
        {section.items.map((item) => <article key={item.id}>
          {item.validation !== "ai-supported" ? <p>Item withheld — needs grounding review.</p> : <p style={{ whiteSpace: "pre-wrap" }}>{item.kind === "suggestion" ? "Suggestion: " : item.kind === "question" ? "Question: " : ""}{item.text}</p>}
          {editing && <><label htmlFor={`edit-${item.id}`}>Edit {item.id} (saved edits need revalidation)</label><textarea id={`edit-${item.id}`} value={edits[item.id] ?? item.text} maxLength={2000} disabled={busy}
            onChange={(e) => setEdits((old) => ({ ...old, [item.id]: e.target.value }))} style={{ width: "100%" }} />
            <button disabled={busy} onClick={() => setEdits((old) => ({ ...old, [item.id]: "" }))}>Remove {item.id}</button>{edits[item.id] === "" && <p>This item will be removed when saved.</p>}</>}
          <ul>{item.citationIds.map((id) => { const c = draft.citations.find((citation) => citation.id === id); return c ? <li key={id}>
            <Link to={`/sessions/${encodeURIComponent(c.sessionId)}#turn-${encodeURIComponent(c.turnId)}`}>{c.speakerLabel ?? c.speakerRef} · {c.occurredAt ?? `${c.start}–${c.end} ${c.unit}`}</Link><blockquote>{c.quote}</blockquote>
          </li> : <li key={id}>Citation unavailable.</li>; })}</ul>
        </article>)}</section>)}
      {editing && <><button disabled={busy || !editTitle.trim() || Object.values(edits).some((v) => v !== "" && !v.trim())} onClick={() => { void action(save); }}>Save changes</button>{" "}<button disabled={busy} onClick={() => { setEdits({}); setEditTitle(draft.title); setEditing(false); }}>Cancel editing</button>{" "}</>}
      <button disabled={busy || editing} onClick={() => { void action(validate); }}>Revalidate grounding</button>{" "}
      <button disabled={busy || editing || unvalidated || !available} onClick={() => { void action(download); }}>Download Markdown</button>
    </section>}
  </>;
}
