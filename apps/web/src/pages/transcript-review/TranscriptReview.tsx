import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client.js";
import { getTranscriptReview, saveTranscriptReview, type TranscriptReviewSnapshot } from "../../api/transcriptReview.js";
import { ReviewHistory } from "./ReviewHistory.js";

/** Revision-bound transcript correction and explicit contiguous speaker mapping. */
export function TranscriptReview({ apiKey, sessionId, onCommitted }: {
  apiKey: string | null; sessionId: string; onCommitted?: () => void;
}): React.ReactElement {
  const [loaded, setLoaded] = useState<{ key: string | null; sessionId: string; value: TranscriptReviewSnapshot } | null>(null);
  const [drafts, setDrafts] = useState<Map<string, string>>(() => new Map());
  const [selected, setSelected] = useState("");
  const [start, setStart] = useState(0), [end, setEnd] = useState(0);
  const [speakerRef, setSpeakerRef] = useState(""), [speakerLabel, setSpeakerLabel] = useState("");
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<{ key: string | null; sessionId: string; text: string; error: boolean } | null>(null);
  const current = useRef({ key: apiKey, sessionId, generation: 0 });
  current.current.key = apiKey; current.current.sessionId = sessionId;
  const snapshot = loaded?.key === apiKey && loaded.sessionId === sessionId ? loaded.value : null;
  const notice = message?.key === apiKey && message.sessionId === sessionId ? message : null;
  function resetDrafts() { setDrafts(new Map()); setReason(""); setSpeakerRef(""); setSpeakerLabel(""); setStart(0); setEnd(0); setConflict(false); }
  async function load(reset = true, committedRevision?: string) {
    const identity = { key: apiKey, sessionId, generation: ++current.current.generation };
    const active = () => current.current.key === identity.key && current.current.sessionId === identity.sessionId && current.current.generation === identity.generation;
    setBusy(true); setLoaded(null);
    if (reset) { resetDrafts(); setMessage(null); }
    try {
      const value = await getTranscriptReview(apiKey, sessionId);
      if (!active()) return;
      if (committedRevision && value.revision !== committedRevision) throw new Error("Reload did not return the committed revision; reload again before editing.");
      setLoaded({ key: apiKey, sessionId, value }); setSelected(value.turns[0]?._id ?? "");
      return value;
    } catch (error) {
      if (active()) setMessage((previous) => ({ key: apiKey, sessionId,
        text: `${!reset && previous?.key === apiKey && previous.sessionId === sessionId ? `${previous.text} ` : ""}${error instanceof Error ? error.message : "Transcript review unavailable"}`, error: true }));
    } finally { if (active()) setBusy(false); }
  }
  useEffect(() => { void load(); return () => { current.current.generation++; }; }, [apiKey, sessionId]);
  const turn = snapshot?.turns.find((t) => t._id === selected);
  const corrections = snapshot?.turns.filter((t) => drafts.has(t._id) && drafts.get(t._id) !== t.text)
    .map((t) => ({ turnId: t._id, text: drafts.get(t._id)! })) ?? [];
  const mappingRequested = !!speakerRef || !!speakerLabel;
  const block = snapshot?.turns.slice(start, end + 1) ?? [];
  const validBlock = start <= end && block.length > 0 && block.length <= 100 && block.every((t) => t.speakerRef === block[0]!.speakerRef);
  const mappingValid = !mappingRequested || (validBlock && !!speakerRef.trim() && !!speakerLabel.trim() && speakerRef.length <= 400 && speakerLabel.length <= 400);
  const mappingChanged = mappingRequested && block.some((t) => t.speakerRef !== speakerRef || t.speakerLabel !== speakerLabel);
  const canSave = !!snapshot && !busy && !conflict && !!reason.trim() && reason.length <= 2000 && mappingValid &&
    corrections.length <= 100 && corrections.every((c) => !!c.text.trim() && c.text.length <= 20000) && (!!corrections.length || mappingChanged);
  async function save() {
    if (!snapshot || !canSave) return;
    const identity = { ...current.current };
    const active = () => current.current.key === identity.key && current.current.sessionId === identity.sessionId && current.current.generation === identity.generation;
    setBusy(true); setMessage(null);
    try {
      const result = await saveTranscriptReview(apiKey, sessionId, { expectedRevision: snapshot.revision, reason, corrections,
        ...(mappingRequested ? { mapping: { turnIds: block.map((t) => t._id), speakerRef, speakerLabel } } : {}) });
      if (!active()) return;
      resetDrafts();
      setMessage({ key: apiKey, sessionId, error: false, text: result.refresh === "complete" ? "Transcript saved. Knowledge refresh complete." :
        result.refresh === "failed" ? "Transcript saved. Knowledge refresh failed; existing answers may be stale." : "Transcript saved. Knowledge refresh pending; existing answers may be stale." });
      // Canonical reload is required: a commit receipt is not an authoritative transcript snapshot.
      try { onCommitted?.(); } catch { /* callback cannot turn a committed write into a retry */ }
      if (!active()) return;
      const reloading = load(false, result.revision);
      const reloadIdentity = { ...current.current };
      const canonical = await reloading;
      if (canonical && current.current.key === reloadIdentity.key && current.current.sessionId === reloadIdentity.sessionId && current.current.generation === reloadIdentity.generation) {
        setMessage({ key: apiKey, sessionId, error: false, text: canonical.refresh === "complete" ? "Transcript saved. Knowledge refresh complete." :
          canonical.refresh === "failed" ? "Transcript saved. Knowledge refresh failed; existing answers may be stale." : "Transcript saved. Knowledge refresh pending; existing answers may be stale." });
      }
    } catch (error) {
      if (!active()) return;
      setConflict(true);
      setMessage({ key: apiKey, sessionId, error: true, text: error instanceof ApiError && [409, 412, 428].includes(error.status) ?
        "Transcript changed. Your draft is retained. Reload before saving." : "Save could not be confirmed. Your draft is retained. Reload before saving again." });
    } finally { if (active()) setBusy(false); }
  }
  async function reloadAfterRefresh() {
    const pending = load(false);
    const identity = { ...current.current };
    const value = await pending;
    if (current.current.key !== identity.key || current.current.sessionId !== identity.sessionId || current.current.generation !== identity.generation) return;
    if (value) setMessage({ key: apiKey, sessionId, error: value.refresh === "failed", text: value.refresh === "complete" ? "Knowledge refresh complete." :
      value.refresh === "failed" ? "Knowledge refresh failed; existing answers may be stale." : "Knowledge refresh pending; existing answers may be stale." });
    try { onCommitted?.(); } catch { /* reload truth remains intact */ }
  }
  return <section className="card" aria-label="Transcript review">
    <h2>Transcript review</h2>
    {notice && <p role={notice.error ? "alert" : "status"}>{notice.text}</p>}
    <button onClick={() => void load()} disabled={busy && !!snapshot}>Reload transcript</button>
    {!snapshot ? <p>{busy ? "Loading transcript review…" : "Transcript review unavailable."}</p> : <>
      <p>Knowledge refresh: {snapshot.refresh}</p>
      {snapshot.refresh !== "complete" && <p role="note" aria-label="Knowledge freshness warning">
        Knowledge refresh {snapshot.refresh}; existing answers may be stale. {snapshot.refresh === "failed" ? "Retry knowledge refresh below." : "Refresh knowledge below to update dependent knowledge."}
      </p>}
      {!!snapshot.orphanedTurnIds?.length && <p role="alert">Source passages changed after review. {snapshot.orphanedTurnIds.length} reviewed passage(s) no longer exist: {snapshot.orphanedTurnIds.join(", ")}. Their audit remains available; restore stable source passage identifiers before refreshing knowledge.</p>}
      <ReviewHistory apiKey={apiKey} sessionId={sessionId} revision={snapshot.revision} refresh={snapshot.refresh} disabled={busy}
        onRefreshed={reloadAfterRefresh} />
      {snapshot.turns.length === 0 ? <p>No transcript turns to review.</p> : <>
        <label>Passage <select aria-label="Passage" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {snapshot.turns.map((t) => <option key={t._id} value={t._id}>{t.tStart}s · {t.speakerLabel ?? t.speakerRef} · {t._id}</option>)}
        </select></label>
        {turn && <><p>Current text: {turn.text}</p><label>Corrected text <textarea aria-label="Corrected text" maxLength={20000}
          value={drafts.get(turn._id) ?? turn.text} onChange={(e) => { const value = e.target.value; setDrafts((d) => new Map(d).set(turn._id, value)); }} /></label></>}
        <fieldset><legend>Map one speaker block</legend>
          <p>Only the selected consecutive passages change. Repeated labels elsewhere stay separate.</p>
          <label>Block start <select aria-label="Block start" value={start} onChange={(e) => setStart(Number(e.target.value))}>
            {snapshot.turns.map((t, i) => <option key={t._id} value={i}>{t.tStart}s · {t._id}</option>)}
          </select></label>
          <label>Block end <select aria-label="Block end" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
            {snapshot.turns.map((t, i) => <option key={t._id} value={i}>{t.tStart}s · {t._id}</option>)}
          </select></label>
          <label>Speaker reference <input aria-label="Speaker reference" maxLength={400} value={speakerRef} onChange={(e) => setSpeakerRef(e.target.value)} /></label>
          <label>Speaker name <input aria-label="Speaker name" maxLength={400} value={speakerLabel} onChange={(e) => setSpeakerLabel(e.target.value)} /></label>
          {mappingRequested && !mappingValid && <p role="alert">Choose up to 100 consecutive passages with the same current speaker label, and supply both speaker fields.</p>}
        </fieldset>
        <label>Review reason <textarea aria-label="Review reason" maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <p>{corrections.length} text correction(s){mappingRequested ? `; ${block.length} passage(s) selected for speaker mapping` : ""}.</p>
        <button onClick={() => void save()} disabled={!canSave}>Save reviewed changes</button>
      </>}
    </>}
  </section>;
}
