import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getGroundedContent, type GroundedContentView, type GroundedEvidenceView } from "./client.js";

function Evidence({ refs }: { refs: GroundedEvidenceView[] }): React.ReactElement {
  return <ul>{refs.map((ref, index) => <li key={`${ref.turnId}-${index}`}>
    {ref.quote !== null && <blockquote>{ref.quote}</blockquote>}
    {ref.available ? <Link to={`/sessions/${encodeURIComponent(ref.sessionId)}#turn-${encodeURIComponent(ref.turnId)}`}>
      {ref.speaker ?? "Source"} · {ref.tStart}s–{ref.tEnd}s
    </Link> : <span>Source unavailable or quote could not be resolved</span>}
  </li>)}</ul>;
}

const ORIGINS = { "speaker-statement": "Speaker statement", "screen-ocr": "Screen text", "visual-observation": "Visual observation" };

export function GroundedContentPanel({ apiKey, sessionId }: { apiKey: string | null; sessionId: string }): React.ReactElement {
  const [loaded, setLoaded] = useState<{ key: string | null; id: string; data?: GroundedContentView; error?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    getGroundedContent(apiKey, sessionId).then((data) => {
      if (!cancelled) setLoaded({ key: apiKey, id: sessionId, ...(data.sessionId === sessionId ? { data } : { error: "Session response does not match this page" }) });
    }).catch((error: unknown) => {
      if (!cancelled) setLoaded({ key: apiKey, id: sessionId, error: error instanceof Error ? error.message : "Grounded content unavailable" });
    });
    return () => { cancelled = true; };
  }, [apiKey, sessionId]);
  const current = loaded?.key === apiKey && loaded.id === sessionId ? loaded : null;
  if (!current) return <section className="card"><h2>Grounded notes and Q&A</h2><p>Loading grounded content…</p></section>;
  if (current.error || !current.data) return <section className="card"><h2>Grounded notes and Q&A</h2><p role="alert">{current.error ?? "Grounded content unavailable"}</p></section>;
  const { notes, qa, claims } = current.data;
  return <section className="card">
    <h2>Grounded notes and Q&A</h2>
    <p>Quotes link to transcript evidence. Generated notes and Q&A await human review.</p>
    {!notes.length && !qa.length && <p>No grounded notes or Q&A published for this session.</p>}
    {notes.map((note) => <article key={note.id}><h3>{note.kind} · {ORIGINS[note.origin]}</h3>
      <p>{note.text}</p><p>Unverified</p><Evidence refs={note.evidence} /></article>)}
    {qa.map((item) => <article key={item.id}><h3>{item.question}</h3><p>Question evidence</p><Evidence refs={item.questionEvidence} />
      {item.status === "unanswered" ? <p>Unanswered in the source</p> : <><p>{item.answer ?? "Answer unavailable"}</p><p>Answer evidence · Unverified</p><Evidence refs={item.answerEvidence} /></>}
    </article>)}
    {!!claims.length && <h3>Claims</h3>}
    {claims.map((claim) => <article key={claim._id}><p>{claim.text}</p><p>{claim.status}</p><Evidence refs={claim.evidence} /></article>)}
  </section>;
}
