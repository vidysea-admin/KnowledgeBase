import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/client.js";
import { searchSemantic, inspectSemanticIndex, type SemanticResult, type SemanticIndexReadiness } from "../../../api/search/semanticClient.js";

interface Props { apiKey: string | null; query: string }
type State = { status: "idle" | "loading" } | { status: "failed"; message: string } |
  { status: "ready"; hits: SemanticResult[] };

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503 && error.code === "semantic_index_pending")
      return "These passages need to be reindexed before semantic search. Ask the knowledge-base owner to rebuild the index, then retry.";
    if (error.status === 404) return "Semantic search is not enabled on this server.";
    if (error.status === 401) return "Sign in to use semantic search.";
    if (error.status === 403) return "This API key needs search access.";
    if (error.status === 400) return "Use a query of up to 512 characters.";
  }
  return "Semantic search is unavailable. Try again.";
}

/** Keyed child resets immediately on key/query changes; no automatic embedding requests. */
export function SemanticResults({ apiKey, query }: Props): React.ReactElement {
  return <SemanticRequest key={JSON.stringify([apiKey, query])} apiKey={apiKey} query={query} />;
}

function SemanticRequest({ apiKey, query }: Props): React.ReactElement {
  const [state, setState] = useState<State>({ status: "idle" });
  const active = useRef(true);
  const pending = useRef(false);
  const readinessPending = useRef(false);
  const [readiness, setReadiness] = useState<SemanticIndexReadiness | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const valid = query.trim().length > 0 && Array.from(query.trim()).length <= 512;

  async function request(): Promise<void> {
    if (!apiKey || !valid || pending.current) return;
    pending.current = true;
    setState({ status: "loading" });
    try {
      const response = await searchSemantic(apiKey, query, 20, "chunks");
      if (active.current) setState({ status: "ready", hits: response.hits });
    } catch (error) {
      if (active.current) setState({ status: "failed", message: message(error) });
    } finally { pending.current = false; }
  }

  async function checkReadiness(): Promise<void> {
    if (!apiKey || readinessPending.current) return;
    readinessPending.current = true; setChecking(true); setReadiness(null); setReadinessError(null);
    try {
      const result = await inspectSemanticIndex(apiKey);
      if (active.current) setReadiness(result);
    } catch (error) { if (active.current) setReadinessError(message(error)); }
    finally { readinessPending.current = false; if (active.current) setChecking(false); }
  }

  return <section className="card" aria-label="Semantic search">
    <h2>Semantic matches</h2>
    <p>Compare meaning-based passages with lexical results. This request uses an embedding provider and may incur charges.</p>
    <p>Quotes come from the cited source turns. Retrieval scores are not answer confidence.</p>
    {!apiKey ? <p>Sign in to use semantic search.</p> : <>
      <button type="button" disabled={checking} onClick={() => { void checkReadiness(); }}>Check index readiness</button>
      {checking && <p role="status">Checking index readiness…</p>}
      {readinessError && <p role="alert">{readinessError}</p>}
      {readiness && <p role="status">{readiness.status === "empty" ? "No passages have been indexed yet." :
        readiness.status === "ready" ? `Source index ready: ${readiness.bound} passages. Search also checks compatibility with the active model.` :
          `Index requires rebuilding: ${readiness.legacy} legacy passages, ${readiness.stale} changed or unresolved passages, ${readiness.invalidVectors + readiness.invalidModels} invalid embeddings, ${readiness.uncoveredTurns} uncovered source turns, ${readiness.pendingGaps} pending indexing gaps.${readiness.modelCount > 1 || readiness.dimensionCount > 1 ? " The index also mixes embedding settings." : ""} Ask the knowledge-base owner to rebuild it, then check again.`}</p>}
      <button type="button" disabled={!valid || state.status === "loading"} onClick={() => { void request(); }}>Search semantic matches</button>
      {!valid && <p>Submit a query of up to 512 characters in Search first.</p>}
      {state.status === "loading" && <p role="status">Searching semantic matches…</p>}
      {state.status === "failed" && <p role="alert">{state.message}</p>}
      {state.status === "ready" && (state.hits.length === 0 ? <p>No semantic matches found.</p> :
        <ul aria-label="Semantic results">{state.hits.map(hit => <li key={hit.chunkId}>
          {hit.session ? <Link to={`/sessions/${encodeURIComponent(hit.sessionId)}`}>{hit.session.title || "Untitled session"}</Link> : <span>Session unavailable</span>}
          {hit.session && <span> — {hit.session.date}</span>}
          <p>Retrieval score: {hit.score.toFixed(3)} · Chunk: {hit.chunkId}</p>
          {hit.quote && <>
            <p>Speaker: {hit.quote.speakerLabel?.trim() || hit.quote.speakerRef}</p>
            {hit.quote.occurredAt && <p>Occurred: {hit.quote.occurredAt}</p>}
            <p>{hit.quote.speakerRef === "url" || hit.quote.speakerRef === "document" ? "Characters" : "Time"}: {hit.quote.tStart}–{hit.quote.tEnd}{hit.quote.speakerRef === "url" || hit.quote.speakerRef === "document" ? "" : " s"}</p>
            <blockquote style={{ whiteSpace: "pre-wrap" }}>{hit.quote.text}</blockquote>
            {hit.session ? <Link to={`/sessions/${encodeURIComponent(hit.sessionId)}#turn-${encodeURIComponent(hit.quote.turnId)}`}>Open cited passage</Link>
              : <p>The source session could not be resolved.</p>}
          </>}
        </li>)}</ul>)}
    </>}
  </section>;
}
