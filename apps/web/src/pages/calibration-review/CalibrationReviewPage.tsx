import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { getCalibrationReview, submitCalibrationItem, exportCalibrationReview, type CalibrationReviewView } from "./client.js";
import { stageOfflineDraft, type OfflineJudgment } from "./offline-transfer.js";

export function CalibrationReviewPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  const epoch = useRef(0);
  const [view, setView] = useState<CalibrationReviewView | null>(null), [selected, setSelected] = useState(0);
  const [score, setScore] = useState(""), [rationale, setRationale] = useState(""), [affirm, setAffirm] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [staged, setStaged] = useState<OfflineJudgment[]>([]);
  const importEpoch = useRef(0);
  const item = view?.items[selected];
  async function reload(): Promise<void> {
    const generation = epoch.current;
    if (!apiKey) return;
    importEpoch.current++; setStaged([]); setBusy(true); setError(""); setNotice("");
    try { const value = await getCalibrationReview(apiKey); if (generation === epoch.current) setView(value); }
    catch (e) { if (generation === epoch.current) { setView(null); setError(e instanceof Error ? e.message : "Could not load reviews"); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  useEffect(() => {
    epoch.current++; importEpoch.current++; setStaged([]); setView(null); setSelected(0); setScore(""); setRationale(""); setAffirm(false); setError(""); setNotice("");
    void reload(); return () => { epoch.current++; };
  }, [apiKey, sessionVersion]);
  useEffect(() => {
    setScore(item?.humanReview.score == null ? "" : String(item.humanReview.score));
    setRationale(item?.humanReview.rationale ?? ""); setAffirm(false);
  }, [item?.id, item?.revision]);
  async function importDraft(file: File): Promise<void> {
    if (!view || busy) return;
    const generation = epoch.current, request = ++importEpoch.current, packet = view.packetSha256;
    setStaged([]); setAffirm(false); setError(""); setNotice("");
    try {
      if (file.size > 5_000_000) throw new Error("Offline draft exceeds the local import limit.");
      const judgments = await stageOfflineDraft(JSON.parse(await file.text()), view);
      if (generation !== epoch.current || request !== importEpoch.current) return;
      setStaged(judgments); setNotice(`${judgments.length} offline assertions staged for packet ${packet}. No judgment saved; review and confirm each item again.`);
    } catch (e) { if (generation === epoch.current && request === importEpoch.current) setError(e instanceof Error ? e.message : "Offline draft refused."); }
  }
  function useStaged(): void {
    const judgment = staged.find(candidate => candidate.id === item?.id && candidate.inputSha256 === item?.inputSha256);
    if (!judgment || busy) return;
    setScore(String(judgment.score)); setRationale(judgment.rationale); setAffirm(false);
    setNotice("Offline assertion copied into this form. Re-read the current inputs and confirm this individual judgment before saving.");
  }
  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!apiKey || !item || busy) return;
    const numeric = Number(score);
    if (!score.trim() || !Number.isFinite(numeric) || numeric < 0 || numeric > 1 || !rationale.trim() || !affirm) {
      setError("Enter a score from 0 to 1, a rationale, and your individual review confirmation."); return;
    }
    const generation = epoch.current; setBusy(true); setError(""); setNotice("");
    try {
      const value = await submitCalibrationItem(apiKey, item, numeric, rationale);
      if (generation === epoch.current) { setView(value); setNotice(`${item.id} saved with its audit receipt.`); setAffirm(false); }
    } catch (e) { if (generation === epoch.current) setError(`${e instanceof Error ? e.message : "Save failed"}. Your judgment has not been accepted. Reload to resolve conflicts or changed sources.`); }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  async function download(): Promise<void> {
    if (!apiKey || busy) return;
    const generation = epoch.current; setBusy(true); setError("");
    try {
      const result = await exportCalibrationReview(apiKey);
      if (generation !== epoch.current) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "calibration-reviewed-export.json"; anchor.click(); URL.revokeObjectURL(url);
      setNotice("Exported stored review assertions. Actual Umesh confirmation and live calibration still require independent verification.");
    } catch (e) { if (generation === epoch.current) setError(e instanceof Error ? e.message : "Export failed"); }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
    <h1>Evaluator calibration review</h1>
    <p>Review thirty query and summary pairs individually. No model score is preselected.</p>
    <p>Your API key identifies the tenant. The reviewer name Umesh is an assertion; genuine individual human judgments require independent confirmation.</p>
    <button type="button" disabled={busy || !apiKey} onClick={() => void reload()}>Reload stored reviews</button>
    {busy && <p role="status">Working…</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {view && <>
      <p>{view.approvedCount}/{view.total} individual review assertions stored; {view.total - view.approvedCount} pending. Human gold has not been independently verified.</p>
      <p>{view.packet.rubric}</p>
      <label htmlFor="calibration-offline-draft">Stage local offline draft</label>{" "}
      <input id="calibration-offline-draft" type="file" accept="application/json,.json" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void importDraft(file); }} />
      <p>Draft assertions stay in this page until you review and save each item. Offline identity, time and revisions do not become server audit.</p>
      <label htmlFor="calibration-item">Review item</label>{" "}
      <select id="calibration-item" disabled={busy} value={selected} onChange={e => { setSelected(Number(e.target.value)); setNotice(""); }}>
        {view.items.map((i, index) => <option key={i.id} value={index}>Batch {i.batch} · {i.id} · {i.revision > 0 ? "submitted" : "pending"}</option>)}
      </select>
      {item && <article>
        <h2>{item.id} — batch {item.batch}</h2><h3>Student query</h3><p>{item.query}</p>
        <h3>Session title</h3><p>{item.node.title}</p><h3>Judge-visible summary</h3><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.node.summary}</p>
        <p>Review-only node: {item.node.node_id}. These displayed inputs, rather than the full transcript, are scored by the production judge.</p>
        <form onSubmit={e => void save(e)}>
          {staged.some(candidate => candidate.id === item.id) && <button type="button" disabled={busy} onClick={useStaged}>Use this item's offline assertion</button>}
          <label htmlFor="calibration-score">Relevance score (0 to 1)</label><br />
          <input id="calibration-score" type="number" min="0" max="1" step="any" required disabled={busy} value={score} onChange={e => { setScore(e.target.value); setAffirm(false); }} /><br />
          <label htmlFor="calibration-rationale">Reason for this judgment</label><br />
          <textarea id="calibration-rationale" rows={5} maxLength={20000} required disabled={busy} value={rationale} onChange={e => { setRationale(e.target.value); setAffirm(false); }} style={{ width: "100%" }} /><br />
          <label><input type="checkbox" checked={affirm} disabled={busy} onChange={e => setAffirm(e.target.checked)} /> I am Umesh and personally reviewed this individual query, title and summary.</label><br />
          <button type="submit" disabled={busy || !affirm}>Save this individual judgment</button>
        </form>
        <p>Stored revision {item.revision}{item.humanReview.approvedAt ? ` · ${item.humanReview.approvedAt}` : " · pending"}</p>
        {item.audit.length > 0 && <details><summary>Review audit history</summary><ul>{item.audit.map(a => <li key={a.revision}>Revision {a.revision} · {a.at} · {a.identityBasis}</li>)}</ul></details>}
      </article>}
      <button type="button" disabled={busy || view.approvedCount !== 30} onClick={() => void download()}>Export all thirty stored judgments</button>
      <p>{view.remainingGate}</p>
    </>}
  </main>;
}
