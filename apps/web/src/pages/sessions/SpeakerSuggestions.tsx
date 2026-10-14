import { useEffect, useState } from "react";
import { ApiError } from "../../api/client.js";
import { decideSpeakerSuggestion, listSpeakerSuggestions, type SpeakerSuggestion } from "../../api/speakerSuggestions.js";

type Row = SpeakerSuggestion & { decided?: "confirmed" | "rejected" };

// A suggestion is visibly NOT a final name: dashed amber frame, "Suggested:" prefix, an "unconfirmed" badge, and the evidence quote
// beside it. Only after a human confirms does the card read "Confirmed (human-confirmed)". Rendering is text-only (no innerHTML).
const SUGGESTED_STYLE = { border: "2px dashed var(--warn)", background: "var(--warn-bg)" } as const;
const CONFIRMED_STYLE = { border: "1px solid var(--good)", background: "var(--good-bg)" } as const;

/** Suggested speaker names for one session, with Confirm / Reject. Renders nothing when there are none or the endpoint is unavailable. */
export function SpeakerSuggestions({ apiKey, sessionId }: { apiKey: string | null; sessionId: string }): React.ReactElement | null {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows([]); setError(null);
    listSpeakerSuggestions(apiKey, sessionId)
      .then((list) => { if (!cancelled) setRows(list); })
      .catch(() => { /* optional panel: a missing or unavailable endpoint must not break the session page */ });
    return () => { cancelled = true; };
  }, [apiKey, sessionId]);

  async function decide(row: Row, action: "confirm" | "reject") {
    setBusy(row.id); setError(null);
    try {
      const state = await decideSpeakerSuggestion(apiKey, sessionId, row.id, action);
      setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, decided: state, status: state === "confirmed" ? "confirmed" : r.status, ...(state === "confirmed" ? { finalProvenance: "human-confirmed" as const } : {}) } : r)));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? "This suggestion was already decided." : "Could not save your decision. Try again.");
    } finally { setBusy(null); }
  }

  const shown = rows.filter((r) => r.decided !== "rejected");
  if (shown.length === 0 && !error) return null;
  return (
    <div className="card" data-testid="speaker-suggestions">
      <div className="section-title">Suggested speakers ({shown.filter((r) => r.status === "suggested").length})</div>
      {error && <p role="alert">{error}</p>}
      {shown.map((r) => r.status === "confirmed" ? (
        <div key={r.id} className="row-card" data-testid="speaker-confirmed" style={CONFIRMED_STYLE}>
          <div className="row-title">Confirmed: {r.suggestedName} <span className="badge badge-good">human-confirmed</span></div>
          <div className="row-meta">{r.speakerRef}</div>
        </div>
      ) : (
        <div key={r.id} className="row-card" data-testid="speaker-suggestion" style={SUGGESTED_STYLE}>
          <div className="row-title">Suggested: {r.suggestedName} <span className="badge badge-warn">unconfirmed</span></div>
          <div className="row-meta">for {r.speakerRef}</div>
          {r.quotes.map((q, i) => <blockquote key={i} className="row-meta">&ldquo;{q.quote}&rdquo; <small>({q.kind})</small></blockquote>)}
          <button disabled={busy === r.id} onClick={() => void decide(r, "confirm")}>Confirm</button>{" "}
          <button disabled={busy === r.id} onClick={() => void decide(r, "reject")}>Reject</button>
        </div>
      ))}
    </div>
  );
}
