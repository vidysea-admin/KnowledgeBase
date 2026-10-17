import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import type { AskResponse } from "../../api/types.js";
import { AnswerSources } from "./AnswerSources.js";
import { directAnswer, answerReviews, askWithPolicy, resolveAnswerReview, resolveSourceConflict, sourceConflicts, type AnswerReview, type SourceConflict } from "./client.js";

export function AnswerReviewPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth(); const authOwner = JSON.stringify([apiKey, sessionVersion]);
  const [items, setItems] = useState<AnswerReview[]>([]), [conflicts, setConflicts] = useState<SourceConflict[]>([]);
  const [viewKey, setViewKey] = useState(authOwner);
  const [notes, setNotes] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  async function load(token: number): Promise<void> { const [r, c] = await Promise.all([answerReviews(apiKey), sourceConflicts(apiKey)]); if (token === generation.current) { setItems(r.items); setConflicts(c.conflicts); } }
  useEffect(() => { const token = ++generation.current; setViewKey(authOwner); setItems([]); setConflicts([]); setNotes({}); setBusy(false); setError(null); setNotice(null);
    load(token).catch((e: unknown) => { if (token === generation.current) setError(e instanceof ApiError ? e.message : "Review queue unavailable."); });
    return () => { generation.current++; };
  }, [apiKey, authOwner]);
  async function perform(work: (token: number) => Promise<void>): Promise<void> {
    if (busy) return; const token = ++generation.current; setBusy(true); setError(null); setNotice(null);
    try { await work(token); if (token === generation.current) await load(token); } catch (e) { if (token === generation.current) setError(e instanceof ApiError ? e.message : "Review failed."); }
    finally { if (token === generation.current) setBusy(false); }
  }
  if (viewKey !== authOwner) return <div className="page-header"><h1>Answer review</h1><p>Loading this sign-in session…</p></div>;
  return <><div className="page-header"><h1>Answer review and evidence conflicts</h1><p>Review the exact saved candidate and original citations. Each decision records the verified tenant actor, reason and immutable evidence revision.</p><Link to="/ask">Ask</Link></div>
    {error && <div className="card" role="alert">{error}</div>}{notice && <p role="status">{notice}</p>}
    <section><h2>Candidate answer queue</h2><p>Up to 100 records, with oldest pending reviews first, then recent decisions.</p>{!items.length && <p>No candidate answer reviews.</p>}
      {items.map((item) => <article className="card" key={item.id}><h3>{item.query}</h3><p>{item.state} · {item.reason} · {item.createdAt}</p>
        <p>{item.policy ? `${item.policy.policyId} v${item.policy.version}` : "Conservative default policy"}</p><p style={{ whiteSpace: "pre-wrap" }}>{item.candidate.answer}</p>
        <AnswerSources answer={item.candidate} />
        {item.review ? <p>{item.review.decision} by verified tenant actor {item.review.by.actor} at {item.review.at}: {item.review.note}</p>
          : <><label htmlFor={`answer-review-${item.id}`}>Review reason</label><input id={`answer-review-${item.id}`} maxLength={500} value={notes[item.id] ?? ""} disabled={busy} onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })} />
            {(["approved", "rejected"] as const).map((decision) => <button key={decision} disabled={busy || item.state !== "review" || !(notes[item.id] ?? "").trim()} onClick={() => { void perform(async () => { await resolveAnswerReview(apiKey, item, decision, notes[item.id]!); }); }}>{decision === "approved" ? "Approve exact candidate" : "Reject candidate"}</button>)}</>}
      </article>)}
    </section>
    <section><h2>Conflicting source evidence</h2><p>Preference is a reviewed decision, not proof that a source is true. Original citations are retained. Rebuild the answer to apply the resolution.</p>{!conflicts.length && <p>No reported evidence conflicts.</p>}
      {conflicts.map((conflict) => <article className="card" key={conflict.id}><h3>{conflict.explanation}</h3><p>{conflict.status}</p>
        <h4>{conflict.a.id}</h4><blockquote>{conflict.a.excerpt}</blockquote><h4>{conflict.b.id}</h4><blockquote>{conflict.b.excerpt}</blockquote>
        <AnswerSources answer={{ sources: {
          internal: [conflict.a, conflict.b].filter((s) => s.origin === "internal").map((s) => s.source as unknown as AskResponse["sources"]["internal"][number]),
          web: [conflict.a, conflict.b].filter((s) => s.origin === "web").map((s) => s.source),
        } }} />
        <Link to={`/ask?run=${encodeURIComponent(conflict.runId)}`}>Open original answer in history</Link>
        {conflict.resolution ? <><p>Preferred {conflict.resolution.keepSourceId} by {conflict.resolution.by.actor}: {conflict.resolution.note}</p>
          <button disabled={busy} onClick={() => { void perform(async (token) => {
            const original = await directAnswer(apiKey, conflict.runId);
            if (token !== generation.current) return;
            const reply = await askWithPolicy(apiKey, { query: original.query, questionClass: original.questionClass, evidenceMode: original.evidenceMode, filters: original.filters, resolutionId: conflict.id,
              ...(original.result.policy ? { policyId: original.result.policy.policyId, policyVersion: original.result.policy.version } : {}) });
            if (generation.current === token) setNotice(`New answer ${reply.runId} generated with the reviewed source preference; status ${reply.state}. Find it in Ask history.`);
          }); }}>Rebuild using source resolution</button>
        </> : <><label htmlFor={`source-conflict-${conflict.id}`}>Resolution reason</label><input id={`source-conflict-${conflict.id}`} maxLength={500} disabled={busy} value={notes[conflict.id] ?? ""} onChange={(e) => setNotes({ ...notes, [conflict.id]: e.target.value })} />
          {[conflict.a, conflict.b].map((source) => <button key={source.id} disabled={busy || !(notes[conflict.id] ?? "").trim()} onClick={() => { void perform(async () => { await resolveSourceConflict(apiKey, conflict, source.id, notes[conflict.id]!); }); }}>Prefer {source.id}</button>)}</>}
      </article>)}
    </section>
  </>;
}
