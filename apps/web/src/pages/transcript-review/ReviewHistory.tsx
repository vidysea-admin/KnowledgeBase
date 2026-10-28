import { useEffect, useRef, useState } from "react";
import { getTranscriptReviewHistory, refreshTranscriptReview, type TranscriptRefresh, type TranscriptReviewRevision } from "../../api/review/transcriptReview.js";

export function ReviewHistory({ apiKey, sessionId, revision, refresh, disabled, onRefreshed }: {
  apiKey: string | null; sessionId: string; revision: string; refresh: TranscriptRefresh; disabled: boolean; onRefreshed: () => void | Promise<void>;
}): React.ReactElement {
  const identity = `${sessionId}\u0000${revision}`;
  const current = useRef({ apiKey, identity, generation: 0 });
  current.current.apiKey = apiKey; current.current.identity = identity;
  const [state, setState] = useState<{ apiKey: string | null; identity: string; rows?: TranscriptReviewRevision[]; notice?: string; error?: string; busy?: boolean } | null>(null);
  const visible = state?.apiKey === apiKey && state.identity === identity ? state : null;
  useEffect(() => () => { current.current.generation++; }, [apiKey, identity]);
  async function perform(action: "history" | "refresh") {
    const sent = { ...current.current, generation: ++current.current.generation };
    const active = () => current.current.apiKey === sent.apiKey && current.current.identity === sent.identity && current.current.generation === sent.generation;
    setState({ apiKey, identity, busy: true });
    try {
      if (action === "history") {
        const rows = await getTranscriptReviewHistory(apiKey, sessionId);
        if (active()) setState({ apiKey, identity, rows });
      } else {
        const status = await refreshTranscriptReview(apiKey, sessionId, revision);
        if (!active()) return;
        setState({ apiKey, identity, notice: status === "complete" ? "Knowledge refresh complete." :
          status === "failed" ? "Knowledge refresh failed. Retry when the service is available." : "Knowledge refresh remains pending." });
        try { await onRefreshed(); } catch { /* a consumer exception cannot change a confirmed refresh receipt */ }
      }
    } catch (error) {
      if (active()) setState({ apiKey, identity, error: error instanceof Error ? error.message : "Review operation unavailable" });
    }
  }
  return <section aria-label="Review history and knowledge refresh">
    <button disabled={disabled || visible?.busy} onClick={() => void perform("history")}>Show review history</button>
    {refresh !== "complete" && <button disabled={disabled || visible?.busy} onClick={() => void perform("refresh")}>{refresh === "failed" ? "Retry knowledge refresh" : "Refresh knowledge"}</button>}
    {visible?.busy && <p role="status">Loading review operation…</p>}
    {visible?.notice && <p role="status">{visible.notice}</p>}
    {visible?.error && <p role="alert">{visible.error}</p>}
    {visible?.rows && (visible.rows.length ? <ol>{visible.rows.map((r) => <li key={r.revision}>
      <p>{r.reviewedAt} · {r.actorRef}</p><p>Reason: {r.reason}</p>
      <ul>{r.changes.map((c) => <li key={c.turnId}><p>Passage {c.turnId}</p><p>Before: {c.before.text} · {c.before.speakerLabel ?? c.before.speakerRef}</p><p>After: {c.after.text} · {c.after.speakerLabel ?? c.after.speakerRef}</p></li>)}</ul>
    </li>)}</ol> : <p>No reviews yet.</p>)}
  </section>;
}
