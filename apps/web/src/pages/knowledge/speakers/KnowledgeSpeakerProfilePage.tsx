import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../../auth/AuthContext.js";
import { getCollectionMembers, type MemberChoice } from "../collectionsClient.js";
import { loadCitedSpeakerProfile, loadSpeakerKnowledge, type SpeakerKnowledgeResponse, type CitedSpeakerProfile, type SpeakerCitation } from "./speakerProfileClient.js";
import { apiFetch, ApiError } from "../../../api/client.js";
import { SpeakerRelationWorkbench, type SpeakerRelationAuthority } from "../speaker-relations/SpeakerRelationWorkbench.js";

const relationObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const relationId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(v);
const relationHash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
/** Validate the authenticated bootstrap; profile confidence/identity never substitutes for capability. */
function relationAuthority(value: unknown, personId: string): SpeakerRelationAuthority {
  if (!relationObject(value) || value.personId !== personId || !relationObject(value.capabilities) ||
    typeof value.capabilities.canPropose !== "boolean" || typeof value.capabilities.canReview !== "boolean" ||
    !["human", "automation"].includes(value.capabilities.reviewerKind as string) || !relationHash(value.sourceRevisionDigest) ||
    !Array.isArray(value.statements) || !value.statements.every(c => relationObject(c) && relationId(c.id) && typeof c.text === "string" &&
      Array.isArray(c.evidence) && c.evidence.length > 0 && c.evidence.every(e => relationObject(e) && relationId(e.sessionId) && relationId(e.turnId) && typeof e.quote === "string" && !!e.quote.trim() && e.quote.length <= 12000 && relationHash(e.transcriptHash))) ||
    new Set(value.statements.map(c => c.id)).size !== value.statements.length) throw new ApiError(503, "Invalid relationship source bootstrap.");
  return { personId, canPropose: value.capabilities.canPropose, canReview: value.capabilities.canReview,
    reviewerKind: value.capabilities.reviewerKind as "human" | "automation", sourceRevisionDigest: value.sourceRevisionDigest,
    claims: value.statements as NonNullable<SpeakerRelationAuthority["claims"]> };
}
function SpeakerRelationships({ apiKey, personId, authSession }: { apiKey: string; personId: string; authSession: number }): React.ReactElement {
  const [generation, refresh] = useState(0);
  const [source, setSource] = useState<{ generation: number; authority: SpeakerRelationAuthority } | null>(null);
  const [error, setError] = useState("");
  const current = source?.generation === generation ? source.authority : null;
  useEffect(() => {
    let cancelled = false; setSource(null); setError("");
    apiFetch<unknown>(`/speaker-relations/source?personId=${encodeURIComponent(personId)}`, apiKey)
      .then(value => { const authority = relationAuthority(value, personId); if (!cancelled) setSource({ generation, authority }); })
      .catch(e => { if (!cancelled) setError(e instanceof ApiError && e.status === 403 ? "Relationship actions unavailable: the server refused source access." : "Relationship actions unavailable: current source evidence or server capabilities could not be loaded."); });
    return () => { cancelled = true; };
  }, [apiKey, personId, authSession, generation]);
  return <section aria-label="Speaker relationship source">
    <button type="button" onClick={() => refresh(n => n + 1)}>Refresh relationship source</button>
    {!current && !error && <p role="status">Loading current relationship source…</p>}{error && <p role="alert">{error}</p>}
    <SpeakerRelationWorkbench apiKey={apiKey} personId={personId} authSession={authSession} authority={current} onChanged={() => refresh(n => n + 1)} />
  </section>;
}
function Evidence({ values }: { values: SpeakerCitation[] }): React.ReactElement {
  return <ul>{values.map((c, i) => <li key={i}><blockquote>{c.quote}</blockquote><Link to={`/sessions/${encodeURIComponent(c.sessionId)}#turn-${encodeURIComponent(c.turnId)}`}>{c.sessionTitle} · {c.tStart}s</Link></li>)}</ul>;
}

function SpeakerKnowledge({ apiKey, personId }: { apiKey: string; personId: string }): React.ReactElement {
  const [query, setQuery] = useState(""); const [request, setRequest] = useState<{ query: string } | null>(null);
  const [result, setResult] = useState<SpeakerKnowledgeResponse | null>(null); const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (request === null) return;
    let cancelled = false; setLoading(true); setResult(null); setError("");
    loadSpeakerKnowledge(apiKey, personId, request.query).then(value => { if (!cancelled) setResult(value); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Speaker knowledge unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiKey, personId, request]);
  return <section aria-label="Speaker knowledge"><h3>Explore speaker knowledge</h3>
    <p>Search this speaker’s source-backed statements and connected sessions/topics. Suggested identities do not establish speaker ownership.</p>
    <form onSubmit={e => { e.preventDefault(); setRequest({ query }); }}><label>Question or topic <input value={query} maxLength={2000} onChange={e => setQuery(e.target.value)} /></label> <button type="submit">Find source passages</button></form>
    {loading && <p role="status">Loading speaker knowledge…</p>}{error && <p role="alert">{error}</p>}
    {result && <><p>{result.knowledge.statements.length} source-backed statements · {result.knowledge.nodes.filter(n => n.kind === "session").length} sessions · {result.knowledge.nodes.filter(n => n.kind === "topic").length} topics</p>
      {result.knowledge.identityStatus === "unresolved" && <p>Identity unresolved; no trusted individual knowledge is available.</p>}
      {result.knowledge.ambiguity && <p>Same-name ambiguity remains; these sessions may involve different people.</p>}
      {!result.retrieval.passages.length && <p>No matching source passages.</p>}<Evidence values={result.retrieval.passages} />
      {result.retrieval.truncated && <p>Results are bounded; refine the topic for more specific passages.</p>}
      <p>Knowledge revision: <code>{result.knowledge.revision}</code></p>
    </>}
  </section>;
}
type Data = { key: string; authSession: number; id?: string; generation: number; speakers: MemberChoice[]; profile?: CitedSpeakerProfile; truncated: boolean; error?: string };
export function KnowledgeSpeakerProfilePage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth(); const { personId } = useParams(); const [generation, refresh] = useState(0); const [data, setData] = useState<Data | null>(null);
  const cur = data?.key === apiKey && data.authSession === sessionVersion && data.generation === generation && data.id === personId ? data : null;
  useEffect(() => {
    let cancelled = false; setData(null);
    if (apiKey) (async () => { const list = await getCollectionMembers(apiKey); const profile = personId ? await loadCitedSpeakerProfile(apiKey, personId) : undefined;
      if (!cancelled) setData({ key: apiKey, authSession: sessionVersion, id: personId, generation, speakers: list.members.filter(m => m.kind === "speaker"), truncated: list.truncated, ...(profile ? { profile } : {}) });
    })().catch(e => { if (!cancelled) setData({ key: apiKey, authSession: sessionVersion, id: personId, generation, speakers: [], truncated: false, error: e instanceof Error ? e.message : "Speaker profile unavailable." }); });
    return () => { cancelled = true; };
  }, [apiKey, sessionVersion, generation, personId]);
  const p = cur?.profile;
  return <div style={{ overflowWrap: "anywhere", maxWidth: "100%" }}><h1>Speaker profiles</h1><p>Recorded aliases and suggested names do not confirm identity. Profiles use accepted source evidence and exact speaker blocks.</p>
    {!apiKey ? <p>Sign in to view speakers.</p> : <><button type="button" onClick={() => refresh(n => n + 1)}>Refresh speakers</button>
      {!cur && <p role="status">Loading speakers…</p>}{cur?.error && <p role="alert">{cur.error}</p>}
      {cur && !cur.error && <><h2>Recorded speaker entries</h2>{cur.truncated && <p>Only bounded membership choices are shown.</p>}
        <ul>{cur.speakers.map(s => <li key={s.id}>{s.personId ? <Link to={`/knowledge/speakers/${encodeURIComponent(s.personId)}`}>{s.title}</Link> : <span>{s.title} · stable identity unavailable</span>}</li>)}</ul>
        {!cur.speakers.length && <p>No recorded speaker entries.</p>}
        {p && <article aria-label="Cited speaker profile"><h2>{p.identityStatus === "unresolved" ? "Unresolved speaker" : p.aliases.join(" / ") || p.personId}</h2>
          <p>Identity: {p.identityStatus}</p>{p.recordedConfidence !== null && <p>Recorded confidence: {p.recordedConfidence}</p>}
          <SpeakerKnowledge key={`${sessionVersion}:${apiKey}:${generation}:${personId}`} apiKey={apiKey} personId={p.personId} />
          <SpeakerRelationships key={JSON.stringify([sessionVersion, apiKey, generation, p.personId])} apiKey={apiKey} personId={p.personId} authSession={sessionVersion} />
          {p.recordedConfidence !== null && p.recordedConfidence < 1 && <p>This recorded confidence is below certainty; it does not confirm identity.</p>}
          {p.ambiguity && <p role="status">Same-name ambiguity across {p.ambiguity.sessionIds.length} sessions. This profile may combine people; do not treat it as a confirmed single identity.</p>}
          <h3>Identity evidence</h3>{!p.identityEvidence.length && <p>No accepted identity evidence.</p>}<Evidence values={p.identityEvidence} />
          <h3>Organizations and roles</h3>{!p.organizations.length && <p>Organization unavailable: accepted provenance missing.</p>}{!p.roles.length && <p>Role unavailable: accepted provenance missing.</p>}
          {[...p.organizations, ...p.roles].map((f, i) => <section key={i}><p>{f.value}</p><Evidence values={f.evidence} /></section>)}
          {p.unavailable.length > 0 && <p>Unavailable: {p.unavailable.join(", ")}</p>}
          <h3>Attributed blocks</h3>{!p.attribution.length && <p>No accepted speaker blocks.</p>}
          <ul>{p.attribution.map((a, i) => <li key={i}>{a.speakerRef} · turns {a.startTurnIndex}–{a.endTurnIndex} · <Link to={`/sessions/${encodeURIComponent(a.sessionId)}#turn-${encodeURIComponent(a.turnIds[0]!)}`}>Open exact block</Link></li>)}</ul>
          <h3>Verified attributed claims</h3>{!p.claims.length && <p>No verified claims attributed within accepted blocks.</p>}
          {p.claims.map(c => <section className="card" key={c.id}><p>{c.text}</p><p>Recorded claim status: verified</p><Evidence values={c.evidence} /></section>)}
          <h3>Topics and sessions</h3><ul>{p.topics.map(t => <li key={t.id}><Link to={`/knowledge/topics/${encodeURIComponent(t.id)}`}>{t.name}</Link></li>)}</ul><ul>{p.sessions.map(s => <li key={s.id}><Link to={`/sessions/${encodeURIComponent(s.id)}`}>{s.title}</Link> · {s.date}</li>)}</ul>
          <p>Withheld: {p.withheld.claims} claims, {p.withheld.identityEvidence} identity references, {p.withheld.blocks} blocks, {p.withheld.profileFields} profile fields.</p>
        </article>}
      </>}
    </>}
  </div>;
}
