import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import { decideWhatsAppCandidate, listWhatsAppCandidates, type WhatsAppCandidate } from "../../api/whatsapp.js";

function reviewError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Review request could not be confirmed. Refresh to verify its state before retrying.";
  if (error.status === 401 || error.status === 403) return "Your key cannot review WhatsApp knowledge. Sign in with a key that has WhatsApp access.";
  if (error.status === 409) return error.code === "excluded"
    ? "Personal or excluded material cannot be approved. It can still be rejected."
    : "This candidate changed or was already decided. Refresh the queue before another action.";
  if (error.status === 503) return "Publication is unavailable. Approval was not confirmed; refresh to verify and retry when publication recovers.";
  if (error.status === 404) return "The review queue or candidate is unavailable. Refresh to verify its state.";
  return `Review request failed: ${error.message}. Refresh to verify its state before retrying.`;
}

/** Remount private state on credential change, including pending loads and decisions. */
export function ReviewQueue({ apiKey, revision }: { apiKey: string | null; revision: number }): React.ReactElement {
  return <ReviewQueueState key={apiKey} apiKey={apiKey} revision={revision} />;
}

function ReviewQueueState({ apiKey, revision }: { apiKey: string | null; revision: number }): React.ReactElement {
  const [rows, setRows] = useState<WhatsAppCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const live = useRef(true);
  const generation = useRef(0);
  const decisionLocked = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; generation.current++; }; }, []);
  useEffect(() => {
    const version = ++generation.current;
    setLoading(true); setError(null);
    listWhatsAppCandidates(apiKey).then(({ candidates }) => {
      if (!live.current || version !== generation.current) return;
      // Refresh is authoritative: do not retain locally confirmed text after source edits/deletions.
      setRows(candidates);
    }).catch((failure: unknown) => {
      if (live.current && version === generation.current) { setError(reviewError(failure)); setRows(null); }
    }).finally(() => { if (live.current && version === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [apiKey, revision, refresh]);

  async function decide(candidate: WhatsAppCandidate, action: "approve" | "reject"): Promise<void> {
    if (decisionLocked.current) return;
    decisionLocked.current = true;
    // Any load started before this decision cannot overwrite its confirmed response.
    generation.current++;
    setBusy(candidate._id); setError(null); setConfirmed(null);
    try {
      const response = await decideWhatsAppCandidate(apiKey, candidate._id, action);
      if (!live.current) return;
      setRows((previous) => (previous ?? []).map((row) => row._id === response.candidate._id ? response.candidate : row));
      setConfirmed(`${response.candidate.kind} ${response.candidate.status}. ${response.changed ? "Decision recorded." : "Previously recorded decision confirmed."}`);
    } catch (failure: unknown) {
      if (live.current) setError(reviewError(failure));
    } finally {
      decisionLocked.current = false;
      if (live.current) { setBusy(null); setLoading(false); }
    }
  }

  return <section aria-label="WhatsApp knowledge review">
    <h2>Knowledge review</h2>
    <p>Review each candidate independently. Sensitive and duplicate flags need your judgment; personal or excluded material cannot be approved.</p>
    <button type="button" disabled={loading || busy !== null} onClick={() => setRefresh((value) => value + 1)}>Refresh review queue</button>
    {loading && <p role="status">Loading review candidates…</p>}
    {error && <p role="alert">{error}</p>}
    {confirmed && <p role="status">{confirmed}</p>}
    {rows !== null && <p>{rows.filter((row) => row.status === "needs-review").length} pending review</p>}
    {rows?.length === 0 && <p>No candidates awaiting review.</p>}
    {rows?.map((candidate) => <article key={candidate._id} className="card" aria-label={`${candidate.kind} candidate`}>
      <h3>{candidate.kind} · {candidate.status}</h3>
      <p>{candidate.text}</p>
      {candidate.attachment && <p>File: {candidate.attachment.name}{candidate.attachment.mimeType && ` (${candidate.attachment.mimeType})`}</p>}
      {candidate.flags.length ? <ul>{candidate.flags.map((flag, index) => <li key={`${flag.kind}:${index}`}>
        <strong>{flag.kind}</strong>: {flag.reason}{flag.duplicateOf && ` · Matches ${flag.duplicateOf}`}
      </li>)}</ul> : <p>No detected flags. Inspect the evidence before deciding.</p>}
      {!candidate.evidence.length && <p role="alert">Source evidence is unavailable; this candidate cannot be decided here.</p>}
      {candidate.evidence.map((evidence, index) => <blockquote key={`${evidence.turnId}:${index}`}>
        <p>{evidence.quote}</p>
        <p>{evidence.speakerLabel || evidence.speakerRef} · <time dateTime={evidence.occurredAt}>{evidence.occurredAt}</time> · {evidence.sessionId === candidate.sessionId
          ? <Link to={`/whatsapp/review/${encodeURIComponent(candidate._id)}/source#turn-${encodeURIComponent(evidence.turnId)}`}>Open exact source message</Link>
          : <span role="alert">Source evidence session does not match this candidate.</span>}</p>
      </blockquote>)}
      {candidate.decision && <p>Decision: {candidate.decision.action} · {candidate.decision.at}</p>}
      {candidate.status === "needs-review" && <div>
        <button type="button" disabled={loading || busy !== null || !candidate.evidence.length || candidate.evidence.some((e) => e.sessionId !== candidate.sessionId) || candidate.flags.some((flag) => flag.kind === "personal-excluded")}
          onClick={() => void decide(candidate, "approve")}>{busy === candidate._id ? "Recording decision…" : "Approve"}</button>{" "}
        <button type="button" disabled={loading || busy !== null || !candidate.evidence.length || candidate.evidence.some((e) => e.sessionId !== candidate.sessionId)}
          onClick={() => void decide(candidate, "reject")}>Reject</button>
      </div>}
    </article>)}
  </section>;
}
