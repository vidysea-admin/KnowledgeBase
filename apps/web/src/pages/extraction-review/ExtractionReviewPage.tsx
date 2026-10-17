import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { exportExtractionReview, getExtractionReview, saveExtractionReview, type ExtractionReviewExport, type ExtractionReviewView } from "./client.js";

const message = (error: unknown): string => {
  const detail = error instanceof Error ? error.message : "extraction_review_unavailable";
  return /forbidden|unauthorized/.test(detail)
    ? "A trusted human reviewer with compete scope is required. " + detail
    : /conflict|sources_changed/.test(detail) ? "The source or review revision changed. Reload before reviewing again. " + detail : detail;
};

export function ExtractionReviewPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  const epoch = useRef(0);
  const [view, setView] = useState<ExtractionReviewView | null>(null), [selected, setSelected] = useState(0);
  const [choice, setChoice] = useState(""), [rationale, setRationale] = useState(""), [affirm, setAffirm] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [exported, setExported] = useState<ExtractionReviewExport | null>(null);
  const item = view?.items[selected];
  async function reload(): Promise<void> {
    if (!apiKey) return;
    const generation = epoch.current;
    setBusy(true); setError(""); setNotice(""); setExported(null); setChoice(""); setRationale(""); setAffirm(false);
    try { const result = await getExtractionReview(apiKey); if (generation === epoch.current) setView(result); }
    catch (e) { if (generation === epoch.current) { setView(null); setError(message(e)); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  useEffect(() => {
    epoch.current++; setView(null); setSelected(0); setChoice(""); setRationale(""); setAffirm(false); setExported(null); setError(""); setNotice("");
    void reload(); return () => { epoch.current++; };
  }, [apiKey, sessionVersion]);
  useEffect(() => { setChoice(""); setRationale(""); setAffirm(false); }, [view?.packetSha256, item?.id, item?.inputSha256, item?.revision]);
  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!apiKey || !item || busy) return;
    const label = choice === "" ? undefined : item.options[Number(choice)];
    if (!label || !affirm || !rationale.trim() || rationale.length > 20000) { setError("Choose one native label, give a reason and confirm this individual review."); return; }
    const generation = epoch.current; setBusy(true); setError(""); setNotice(""); setExported(null); setAffirm(false);
    try {
      const result = await saveExtractionReview(apiKey, item, label, rationale);
      if (generation === epoch.current) { setView(result); setNotice(`${item.id} stored with its authenticated audit.`); }
    } catch (e) { if (generation === epoch.current) setError(`${message(e)} Your judgment was not accepted.`); }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  async function download(): Promise<void> {
    if (!apiKey || !view || busy) return;
    const generation = epoch.current, packet = view.packetSha256;
    setBusy(true); setError(""); setNotice(""); setExported(null);
    try {
      const result = await exportExtractionReview(apiKey);
      if (generation !== epoch.current) return;
      if (result.packetSha256 !== packet || result.tenantId !== view.tenantId) throw new Error("extraction_review_sources_changed");
      setExported(result);
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `extraction-reviewed-${result.reviewedCount}-of-${result.total}.json`; link.click(); URL.revokeObjectURL(url);
      setNotice("Authenticated evaluator export downloaded. Partial coverage and unaccepted thresholds remain explicit.");
    } catch (e) { if (generation === epoch.current) setError(message(e)); }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
    <h1>Extraction gold review</h1>
    <p>A trusted human reviewer labels each displayed candidate against its source. Native evaluator choices start unset; no judgment or threshold is inferred.</p>
    <button type="button" disabled={busy || !apiKey} onClick={() => void reload()}>Reload extraction reviews</button>
    {busy && <p role="status">Working…</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {view && <>
      <p>{view.reviewedCount}/{view.total} item reviews stored. Human gold has not been independently verified; binding thresholds remain unaccepted.</p>
      <p>Current packet: {view.packetSha256}</p>
      <label htmlFor="extraction-item">Review item</label>{" "}
      <select id="extraction-item" value={selected} disabled={busy} onChange={e => { setSelected(Number(e.target.value)); setNotice(""); }}>
        {view.items.map((entry, index) => <option key={entry.id} value={index}>{entry.caseId} · {entry.id} · {entry.review ? "reviewed" : "pending"}</option>)}
      </select>
      {item && <article>
        <h2>{item.id}</h2><h3>Candidate</h3><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.context.candidate}</pre>
        <h3>Source</h3><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.context.source}</pre>
        <p>Input {item.inputSha256} · stored revision {item.revision} · evaluator field {item.labelField}</p>
        {item.review && <p>Stored label: {JSON.stringify(item.review.label)} · {item.review.rationale} · {item.review.actorId} · {item.review.at}</p>}
        <form onSubmit={event => void save(event)}>
          <label htmlFor="extraction-label">Native evaluator label</label>{" "}
          <select id="extraction-label" value={choice} disabled={busy} required onChange={e => { setChoice(e.target.value); setAffirm(false); }}>
            <option value="">Choose a label</option>{item.options.map((label, index) => <option key={index} value={index}>{JSON.stringify(label)}</option>)}
          </select><br />
          <label htmlFor="extraction-rationale">Reason for this judgment</label><br />
          <textarea id="extraction-rationale" value={rationale} rows={4} maxLength={20000} disabled={busy} required onChange={e => { setRationale(e.target.value); setAffirm(false); }} style={{ width: "100%" }} /><br />
          <label><input type="checkbox" checked={affirm} disabled={busy} onChange={e => setAffirm(e.target.checked)} /> I personally reviewed this individual candidate against the displayed source.</label><br />
          <button type="submit" disabled={busy || choice === "" || !affirm}>Save this individual label</button>
        </form>
        {item.audit.length > 0 && <details><summary>Authenticated review audit</summary><ul>{item.audit.map(a => <li key={a.revision}>Revision {a.revision} · {a.actorId} · {a.at} · {JSON.stringify(a.label)} · {a.rationale}</li>)}</ul></details>}
      </article>}
      <button type="button" disabled={busy} onClick={() => void download()}>Export reviewed coverage and evaluator measurements</button>
      {exported && <section aria-label="Evaluator export coverage"><h2>Export coverage</h2>
        <p>{exported.reviewedCount}/{exported.total} reviewed; {exported.total - exported.reviewedCount} pending. This export does not establish full gold or accepted thresholds.</p>
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(exported.measurement.summary, null, 2)}</pre><p>{exported.remainingGate}</p>
      </section>}
    </>}
  </main>;
}
