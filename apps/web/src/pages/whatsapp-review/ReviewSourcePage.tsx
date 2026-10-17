import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { getReviewSource, type ReviewSource } from "./client.js";

export default function ReviewSourcePage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  const { id = "" } = useParams<{ id: string }>();
  return <ReviewSourceState key={`${sessionVersion}:${apiKey}:${id}`} apiKey={apiKey} id={id} />;
}
function ReviewSourceState({ apiKey, id }: { apiKey: string | null; id: string }): React.ReactElement {
  const [source, setSource] = useState<ReviewSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const location = useLocation();
  const request = useRef(0);
  useEffect(() => {
    const generation = ++request.current;
    setSource(null); setError(null); setLoading(true);
    getReviewSource(apiKey, id).then(result => { if (generation === request.current) setSource(result); }).catch((failure: unknown) => {
      if (generation !== request.current) return;
      setError(failure instanceof ApiError && (failure.status === 401 || failure.status === 403)
        ? "Your key cannot view WhatsApp review evidence. Sign in with WhatsApp access."
        : failure instanceof ApiError && failure.status === 409
          ? "Current source evidence could not be verified. Refresh the review queue before deciding."
          : failure instanceof ApiError && failure.status === 404
            ? "This candidate's review evidence is no longer available."
            : "Review evidence could not be loaded. Retry or refresh the review queue.");
    }).finally(() => { if (generation === request.current) setLoading(false); });
    return () => { request.current++; };
  }, [apiKey, id, refresh]);
  let target: string | null = null;
  try { if (location.hash.startsWith("#turn-")) target = decodeURIComponent(location.hash.slice(6)); } catch { /* invalid fragment has no target */ }
  useEffect(() => {
    if (source && target) document.getElementById(`turn-${encodeURIComponent(target)}`)?.scrollIntoView?.({ block: "center" });
  }, [source, target]);
  return <section aria-label="WhatsApp review source">
    <h1>Review source evidence</h1>
    <p>Evidence for this candidate. Review access does not publish the content.</p>
    <Link to="/whatsapp">Return to WhatsApp review</Link>{" "}
    <button type="button" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Reload source evidence</button>
    {loading && <p role="status">Loading source evidence…</p>}
    {error && <p role="alert">{error}</p>}
    {source && <>
      <h2>{source.kind} · {source.status}</h2>
      <p>{source.text}</p>
      {source.attachment && <p>File: {source.attachment.name}{source.attachment.mimeType && ` (${source.attachment.mimeType})`}</p>}
      {source.evidence.map((e, i) => <blockquote role="group" key={`${e.turnId}:${i}`} id={`turn-${encodeURIComponent(e.turnId)}`}
        className={target === e.turnId ? "card highlighted" : "card"} style={target === e.turnId ? { outline: "2px solid currentColor" } : undefined}
        aria-label={target === e.turnId ? "Selected source message" : "Source message"}>
        <p>{e.quote}</p><p>{e.speakerLabel || e.speakerRef} · <time dateTime={e.occurredAt}>{e.occurredAt}</time></p>
        <p>Message: {e.turnId}</p>
      </blockquote>)}
      {target && !source.evidence.some(e => e.turnId === target) && <p role="alert">The selected message is not evidence for this candidate.</p>}
    </>}
  </section>;
}
