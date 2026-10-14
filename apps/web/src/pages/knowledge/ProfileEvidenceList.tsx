import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { loadQuotes, QUOTE_SESSION_LIMIT, type Quote } from "./profileClient.js";
import { sessionHref, type EvidenceRef } from "./profileModel.js";

const LIMIT = 50;
type State = { key: string | null; sig: string; quotes: Map<string, Quote>; failed: Set<string>; skipped: number; skippedIds: Set<string> };
/** Every claim row: session, timestamp, quote (from the session turns) and a link to the source turn. */
export function ProfileEvidenceList({ refs, titles }: { refs: EvidenceRef[]; titles: Map<string, string> }): React.ReactElement {
  const { apiKey } = useAuth();
  const shown = refs.slice(0, LIMIT);
  const sig = shown.map(r => r.key).join("|");
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    let cancelled = false; setState(null);
    if (apiKey && shown.length) void loadQuotes(apiKey, shown).then(r => { if (!cancelled) setState({ key: apiKey, sig, quotes: r.quotes, failed: r.failed, skipped: r.skippedSessions, skippedIds: r.skippedIds }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, sig]);
  const cur = state && state.key === apiKey && state.sig === sig ? state : null;
  if (!shown.length) return <p>No resolvable turn evidence was returned.</p>;
  return <>
    {!cur && <p role="status">Loading quotes…</p>}
    {cur && cur.skipped > 0 && <p>Quotes were loaded for the first {QUOTE_SESSION_LIMIT} sessions only; {cur.skipped} more sessions are not loaded (limit {QUOTE_SESSION_LIMIT} sessions).</p>}
    <ul style={{ padding: 0, listStyle: "none" }}>{shown.map(ref => {
      const q = cur?.quotes.get(`${ref.sessionId}\u0000${ref.turnId}`);
      const t = q?.tStart ?? ref.tStart;
      return <li key={ref.key} className="card" style={{ overflowWrap: "anywhere", margin: "0.5rem 0" }}>
        {q ? <blockquote style={{ margin: 0 }}>{q.text}{q.clipped && " …"}</blockquote> : cur ? <p>{cur.skippedIds.has(ref.sessionId) ? `Quote not loaded (limit ${QUOTE_SESSION_LIMIT} sessions).` : cur.failed.has(ref.sessionId) ? "Quote unavailable: session could not be loaded." : "Quote unavailable: turn not found in session."}</p> : null}
        {ref.label ? <p>{ref.label}</p> : <p>{ref.inferred ? "Inferred" : "Stated"} {ref.edgeType} · {ref.origin}{ref.confidence !== undefined && ` · confidence ${ref.confidence.toFixed(2)}`}</p>}
        <p>{titles.get(ref.sessionId) ?? ref.sessionId}{q?.speaker && ` · ${q.speaker}`}{t !== undefined && ` · ${t}s`} · <Link to={sessionHref(ref.sessionId, ref.turnId)}>Open source turn</Link></p>
      </li>;
    })}</ul>
    {refs.length > LIMIT && <p>Showing {LIMIT} of {refs.length} evidence references.</p>}
  </>;
}
