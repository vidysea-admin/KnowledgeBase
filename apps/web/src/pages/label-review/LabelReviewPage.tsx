import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { acceptAiLabel, acceptHighConfidence, getLabelReview, overrideLabel, U22_LABELS, type Confidence, type Label, type LabelReviewView, type LabelRow, type LabelSet } from "./client.js";

export type Mode = "low-first" | "all" | "reviewed";
const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const SET_NAME: Record<LabelSet, string> = { t022: "T-022 judge item", u22: "U2.2 claim" };
const show = (label: Label | null): string => label === null ? "no AI label (models did not agree)" : typeof label === "number" ? label.toFixed(2) : label.replace("_", " ");
const message = (error: unknown): string => {
  const detail = error instanceof Error ? error.message : "label_review_unavailable";
  return /forbidden|unauthorized/.test(detail) ? "A trusted human reviewer with compete scope is required. " + detail
    : /conflict|sources_changed/.test(detail) ? "The item or its review changed. Reload before reviewing again. " + detail : detail;
};

/** Pure: the three views of the list. Low confidence first sorts low, medium, high and puts unreviewed ahead of reviewed within a band. */
export function arrange(items: LabelRow[], mode: Mode, set: LabelSet | "both"): LabelRow[] {
  const scoped = items.filter(i => set === "both" || i.set === set);
  if (mode === "all") return scoped;
  if (mode === "reviewed") return scoped.filter(i => i.revision > 0 && i.effective.reviewedBy !== null);
  return [...scoped].sort((a, b) => RANK[a.confidence] - RANK[b.confidence] || Number(a.effective.reviewedBy !== null) - Number(b.effective.reviewedBy !== null));
}

function RowCard({ row, busy, onAccept, onOverride }: { row: LabelRow; busy: boolean; onAccept: () => void; onOverride: (label: Label, note: string) => void }): React.ReactElement {
  const [value, setValue] = useState(""), [note, setNote] = useState("");
  const parsed: Label | null = row.set === "t022" ? (value.trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1 ? null : Number(value)) : (value === "" ? null : value as Label);
  const e = row.effective;
  return <li data-testid={`row-${row.id}`} style={{ border: "1px solid #ccc", borderRadius: 6, padding: 12, margin: "12px 0", listStyle: "none" }}>
    <p><strong>{SET_NAME[row.set]}</strong> · <span aria-label="confidence">{row.confidence} confidence</span></p>
    <h3 style={{ margin: "4px 0" }}>{row.set === "t022" ? "Question" : "Claim"}</h3><p style={{ overflowWrap: "anywhere" }}>{row.prompt}</p>
    <h4 style={{ margin: "4px 0" }}>{row.set === "t022" ? "Answer excerpt" : "Cited passage"}</h4><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row.passage}</pre>
    <p>AI {row.set === "t022" ? "score" : "label"}: <strong>{show(row.aiLabel)}</strong> (AI-consensus)</p>
    <p>Model agreement: {row.agreement}, {row.validVotes} valid vote{row.validVotes === 1 ? "" : "s"}{row.tally ? ` · ${Object.entries(row.tally).map(([k, n]) => `${k} x${n}`).join(", ")}` : ""}{row.flags.length > 0 ? ` · flags: ${row.flags.join(", ")}` : ""}</p>
    <details><summary>Per-model votes</summary><ul>{row.perModel.map(v => <li key={v.model}>{v.model}: {show(v.label)} · {v.rationale}</li>)}</ul></details>
    <p data-testid="source">{e.reviewedBy === null ? "Label source: ai-consensus · not reviewed (optional)" : `Label source: ${e.labelSource} · ${e.labelSource === "human" ? "human override" : "AI label accepted"} by ${e.reviewedBy}${e.note ? ` · ${e.note}` : ""}`}{e.reviewedBy !== null && e.labelSource === "human" ? ` · current label ${show(e.label)}` : ""}</p>
    <button type="button" disabled={busy || row.aiLabel === null} onClick={onAccept}>Accept AI</button>
    <fieldset style={{ marginTop: 8 }}><legend>Override</legend>
      {row.set === "t022"
        ? <><label htmlFor={`v-${row.id}`}>Score 0 to 1</label> <input id={`v-${row.id}`} type="number" min={0} max={1} step={0.05} value={value} disabled={busy} onChange={ev => setValue(ev.target.value)} /></>
        : <><label htmlFor={`v-${row.id}`}>Label</label> <select id={`v-${row.id}`} value={value} disabled={busy} onChange={ev => setValue(ev.target.value)}><option value="">Choose a label</option>{U22_LABELS.map(l => <option key={l} value={l}>{l.replace("_", " ")}</option>)}</select></>}
      {" "}<label htmlFor={`n-${row.id}`}>Note (optional)</label> <input id={`n-${row.id}`} value={note} maxLength={2000} disabled={busy} onChange={ev => setNote(ev.target.value)} />
      {" "}<button type="button" disabled={busy || parsed === null} onClick={() => { if (parsed !== null) { onOverride(parsed, note); setValue(""); setNote(""); } }}>Override</button>
    </fieldset>
  </li>;
}

export function LabelReviewPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  const epoch = useRef(0);
  const [view, setView] = useState<LabelReviewView | null>(null), [mode, setMode] = useState<Mode>("low-first"), [set, setSet] = useState<LabelSet | "both">("both");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function run(work: (key: string) => Promise<LabelReviewView & { acceptedCount?: number }>, done: (r: { acceptedCount?: number }) => string): Promise<void> {
    if (!apiKey) return;
    const generation = epoch.current; setBusy(true); setError(""); setNotice("");
    try { const result = await work(apiKey); if (generation === epoch.current) { setView(result); setNotice(done(result)); } }
    catch (e) { if (generation === epoch.current) setError(message(e)); }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  useEffect(() => {
    epoch.current++; setView(null); setError(""); setNotice("");
    if (apiKey) void run(getLabelReview, () => "");
    return () => { epoch.current++; };
  }, [apiKey, sessionVersion]);
  const rows = useMemo(() => view ? arrange(view.items, mode, set) : [], [view, mode, set]);
  const highOpen = view ? view.items.filter(i => i.confidence === "high" && i.aiLabel !== null && i.revision === 0 && (set === "both" || i.set === set)).length : 0;
  return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
    <h1>Label review</h1>
    <p>These are AI-consensus labels from several models, shown with how much the models agree. They are the working labels and nothing waits for a human. You may review any item: accepting keeps it an AI-consensus label, overriding records your label as a human label. Neither is human gold, and every metric built on them is reported as AI-consensus.</p>
    {busy && <p role="status">Working…</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {view && <>
      <p>{view.counts.reviewed}/{view.counts.total} reviewed ({view.counts.humanOverrides} human overrides) · confidence: {view.counts.byConfidence.high} high, {view.counts.byConfidence.medium} medium, {view.counts.byConfidence.low} low</p>
      <label htmlFor="label-mode">Show</label>{" "}
      <select id="label-mode" value={mode} onChange={e => setMode(e.target.value as Mode)}>
        <option value="low-first">Low confidence first</option><option value="all">All</option><option value="reviewed">Reviewed</option>
      </select>{" "}
      <label htmlFor="label-set">Set</label>{" "}
      <select id="label-set" value={set} onChange={e => setSet(e.target.value as LabelSet | "both")}>
        <option value="both">T-022 and U2.2</option><option value="t022">T-022 judge items</option><option value="u22">U2.2 claims</option>
      </select>{" "}
      <button type="button" disabled={busy || highOpen === 0} onClick={() => void run(key => acceptHighConfidence(key, set === "both" ? undefined : set), r => `Accepted ${r.acceptedCount ?? 0} high-confidence AI labels. They stay AI-consensus labels.`)}>Accept all high-confidence ({highOpen})</button>
      <ul style={{ padding: 0 }}>
        {rows.map(row => <RowCard key={row.id} row={row} busy={busy}
          onAccept={() => void run(key => acceptAiLabel(key, row), () => `${row.id}: AI label accepted (still AI-consensus).`)}
          onOverride={(label, note) => void run(key => overrideLabel(key, row, label, note), () => `${row.id}: human label recorded.`)} />)}
      </ul>
      {rows.length === 0 && <p>{mode === "reviewed" ? "Nothing has been reviewed yet. Review is optional." : "No items."}</p>}
    </>}
  </main>;
}
