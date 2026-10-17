import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import { loadFlywheel, openFlywheel, retestFlywheel, type FlywheelView, type RetestView } from "./evaluationFlywheelModel.js";

function failure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "This key does not have permission for this evaluation operation.";
    if (error.status === 404) return "No matching evaluation recovery record was found.";
    if (error.status === 503) return "Evaluation recovery is unavailable on this server. No progress is confirmed.";
    if (error.status === 409) return "The server refused this attempt because its saved state conflicts or another attempt is active. Inspect the saved progress before retrying.";
  }
  return "Unable to confirm this operation. Inspect saved progress before retrying; keep the same request ID if a response was lost.";
}

function RecoverySession({ apiKey }: { apiKey: string }) {
  const [originalId, setOriginalId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [requestId, setRequestId] = useState("");
  const [head, setHead] = useState<FlywheelView>();
  const [child, setChild] = useState<RetestView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => () => { generation.current += 1; }, []);

  const run = async (action: "inspect" | "open" | "retest") => {
    if (inFlight.current || !originalId.trim()) return;
    inFlight.current = true;
    const id = originalId.trim(), current = ++generation.current, selectedHead = head;
    setBusy(true); setError(""); setHead(undefined); setChild(undefined);
    try {
      if (action === "retest") {
        const result = await retestFlywheel(apiKey, id, sourceUrl, requestId);
        if (current !== generation.current) return;
        if (!selectedHead || result.gapId !== selectedHead.gapId || result.question !== selectedHead.question) {
          throw new Error("Mismatched retest evidence");
        }
        setChild(result);
        const snapshot = await loadFlywheel(apiKey, id);
        if (current === generation.current) setHead(snapshot);
      } else {
        const snapshot = await (action === "open" ? openFlywheel(apiKey, id) : loadFlywheel(apiKey, id));
        if (current === generation.current) setHead(snapshot);
      }
    } catch (caught) {
      if (current === generation.current) setError(failure(caught));
    } finally {
      if (current === generation.current) { inFlight.current = false; setBusy(false); }
    }
  };

  let validSource = false;
  try { const url = new URL(sourceUrl); validSource = ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch { /* No valid source entered. */ }
  const canRetest = !!head && validSource && /^[A-Za-z0-9_-]{1,80}$/.test(requestId);
  return <section className="card" aria-label="Evaluation recovery">
    <h2>Evaluation recovery</h2>
    <p>Inspect a saved evaluation loss, record its knowledge gap, then capture a source and retry the original question. Source receipt and a new answer do not establish improvement.</p>
    <label>Original evaluation ID<input value={originalId} disabled={busy} onChange={event => {
      generation.current += 1; setOriginalId(event.target.value); setHead(undefined); setChild(undefined); setError(""); setSourceUrl(""); setRequestId("");
    }} /></label>
    <div className="button-row">
      <button type="button" disabled={busy || !originalId.trim()} onClick={() => void run("inspect")}>Inspect saved progress</button>
      <button type="button" disabled={busy || !originalId.trim()} onClick={() => void run("open")}>Record loss gap</button>
    </div>
    <p>Recording a gap writes a recovery record. The server accepts only a saved, scored loss owned by this key's tenant.</p>
    {busy && <p role="status">Waiting for the server. Capture, indexing and answering may take time.</p>}
    {error && <p role="alert">{error}</p>}
    {head && <div aria-label="Saved evaluation recovery evidence">
      <h3>Saved progress</h3>
      <dl><dt>Original evaluation</dt><dd>{head.originalEvalRunId}</dd><dt>Gap</dt><dd>{head.gapId}</dd>
        <dt>Original question</dt><dd>{head.question}</dd><dt>Original scores</dt><dd>AI {head.originalScore.ai}; counsellor {head.originalScore.counsellor}</dd>
        <dt>Original credibility</dt><dd>{head.credibility}</dd><dt>Source gap status</dt><dd>{head.gapStatus}</dd>
        <dt>Recovery stage</dt><dd>{head.stage}</dd><dt>Saved revision</dt><dd>{head.revision}</dd>
        <dt>Captured session</dt><dd>{head.captureSessionId ? <Link to={`/explorer?session=${encodeURIComponent(head.captureSessionId)}&tab=Overview`}>{head.captureSessionId}</Link> : "Not recorded"}</dd>
        <dt>Child evaluation</dt><dd>{head.childEvalRunId ?? "Not recorded"}</dd>
      </dl>
      <p>Received means source content arrived. It does not mean indexing succeeded, the loss is resolved, or a reviewer approved the result.</p>
      {head.failure && <p>Last recorded failure: {head.failure.stage}; request {head.failure.requestId}; {head.failure.at}. Failure history can remain after a successful retry.</p>}
      {head.lock && <p>Saved attempt lease: {head.lock.requestId}, expires {head.lock.expiresAt}. Inspect progress before retrying; the server decides whether this lease is still active.</p>}
      <label>Provided source URL<input type="url" value={sourceUrl} disabled={busy} onChange={event => setSourceUrl(event.target.value)} /></label>
      <label>Recovery request ID<input value={requestId} disabled={busy} onChange={event => setRequestId(event.target.value)} /></label>
      <p>Use a permitted provided/public/notes source. This action captures content, indexes its session and requests an answer. Use 1–80 letters, digits, hyphens or underscores for the request ID; reuse it after a lost response. An accepted source cannot be rebound to another URL.</p>
      <button type="button" disabled={busy || !canRetest} onClick={() => void run("retest")}>Capture source and retest</button>
    </div>}
    {child && <div aria-label="Retest evidence"><h3>Retest answer — needs review</h3>
      <p>Child evaluation: {child.childEvalRunId}. Original evaluation: {child.originalEvalRunId}. Gap: {child.gapId}. Request: {child.requestId}.</p>
      <p>Question: {child.question}</p><p>{child.answer}</p>
      <h4>Returned source evidence</h4><pre>{JSON.stringify(child.sources, null, 2)}</pre>
      <p>{child.score ? `Recorded internal scores: AI ${child.score.ai}; counsellor ${child.score.counsellor}. These scores do not establish calibrated approval.` : "Unscored internal answer. No improvement judgment is recorded here."}</p>
    </div>}
    <p className="row-meta">Human reference judgments, live calibration, complete indexed-session/cited-answer proof and an independent before/after review remain required. This panel supplies no review or approval authority.</p>
  </section>;
}

export function EvaluationFlywheelPanel({ apiKey }: { apiKey: string }) {
  return <RecoverySession key={apiKey} apiKey={apiKey} />;
}
