import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSessionDecisions, type SessionDecisionsView } from "./client.js";

export interface SessionDecisionsPanelProps {
  apiKey: string | null; sessionId: string; sessionVersion: number; revision: number;
}
const STATUS = { proposed: "Proposed · awaiting review", "needs-review": "Needs review", verified: "Stored review status: verified" };

export function SessionDecisionsPanel({ apiKey, sessionId, sessionVersion, revision }: SessionDecisionsPanelProps): React.ReactElement {
  const [loaded, setLoaded] = useState<(SessionDecisionsPanelProps & { data?: SessionDecisionsView; error?: string }) | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    getSessionDecisions(apiKey, sessionId).then((data) => {
      if (!cancelled) setLoaded({ apiKey, sessionId, sessionVersion, revision,
        ...(data.sessionId === sessionId ? { data } : { error: "Stored decisions do not match this session" }) });
    }).catch((error: unknown) => {
      if (!cancelled) setLoaded({ apiKey, sessionId, sessionVersion, revision,
        error: error instanceof Error ? error.message : "Stored decisions are unavailable" });
    });
    return () => { cancelled = true; };
  }, [apiKey, sessionId, sessionVersion, revision]);
  // Synchronous identity check hides old private state before the effect cleanup runs, including
  // same-key re-login and transcript-review revision changes.
  const current = loaded?.apiKey === apiKey && loaded.sessionId === sessionId
    && loaded.sessionVersion === sessionVersion && loaded.revision === revision ? loaded : null;
  return <section className="card">
    <h2>Stored decision candidates</h2>
    <p>These records have source references. Their stored review status does not certify extraction quality or semantic support.</p>
    {!current ? <p role="status">Loading stored decision candidates…</p> : current.error || !current.data
      ? <p role="alert">{current.error ?? "Stored decisions are unavailable"}</p>
      : <>
        {!current.data.decisions.length && <p>No stored decision candidates with current visible evidence are available. This does not establish that no decisions were made.</p>}
        {current.data.decisions.map((d) => <article key={d._id} data-decision-id={d._id}>
          <h3>{d.text}</h3><p>{STATUS[d.status]}</p>
          <p>{d.owner ? `Recorded owner: ${d.owner}` : "Owner not recorded"}</p>
          <ul>{d.evidence.map((e) => <li key={e.turnId}>
            <blockquote>{e.text}</blockquote>
            <Link to={`/sessions/${encodeURIComponent(e.sessionId)}#turn-${encodeURIComponent(e.turnId)}`}>
              {e.speaker} · {e.tStart}–{e.tEnd} {e.unit}
            </Link>
          </li>)}</ul>
        </article>)}
      </>}
  </section>;
}
