import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import type { GroundedContentView, GroundedEvidenceView } from "../sessions/grounded/client.js";
import { loadHighlights } from "./profileClient.js";
import { sessionHref } from "./profileModel.js";

function Refs({ refs }: { refs: GroundedEvidenceView[] }): React.ReactElement {
  if (!refs.length) return <p>No evidence attached.</p>;
  return <ul>{refs.map((r, i) => <li key={i}>{r.quote !== null && <blockquote style={{ margin: 0 }}>{r.quote}</blockquote>}
    {r.available ? <Link to={sessionHref(r.sessionId, r.turnId)}>{r.speaker ?? "Source"} · {r.tStart ?? "?"}s</Link> : <span>Source unavailable or quote could not be resolved</span>}</li>)}</ul>;
}
type S = { key: string; id: string; data?: GroundedContentView; error?: string };
/** Document highlights: the session's grounded notes and claims, each with its quote. Nothing is promoted. */
export function ProfileHighlights({ sessionId }: { sessionId: string }): React.ReactElement {
  const { apiKey } = useAuth();
  const [state, setState] = useState<S | null>(null);
  useEffect(() => {
    let cancelled = false; setState(null);
    if (apiKey) loadHighlights(apiKey, sessionId).then(data => {
      if (!cancelled) setState({ key: apiKey, id: sessionId, ...(data && data.sessionId === sessionId && Array.isArray(data.notes) && Array.isArray(data.claims) ? { data } : { error: "Highlights response does not match this session." }) });
    }).catch(() => { if (!cancelled) setState({ key: apiKey, id: sessionId, error: "Highlights are unavailable for this session." }); });
    return () => { cancelled = true; };
  }, [apiKey, sessionId]);
  const cur = state && state.key === apiKey && state.id === sessionId ? state : null;
  if (!cur) return <p role="status">Loading highlights…</p>;
  if (cur.error || !cur.data) return <p role="alert">{cur.error}</p>;
  const { notes, claims } = cur.data;
  if (!notes.length && !claims.length) return <p>No highlights were published for this session.</p>;
  return <div style={{ overflowWrap: "anywhere" }}>
    {notes.map(n => <article key={n.id} className="card"><h3>{n.kind}</h3><p>{n.text}</p><p>Unverified generated note</p><Refs refs={n.evidence} /></article>)}
    {claims.map(c => <article key={c._id} className="card"><h3>Claim · {c.status}</h3><p>{c.text}</p><Refs refs={c.evidence} /></article>)}
  </div>;
}
