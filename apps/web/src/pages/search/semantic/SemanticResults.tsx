import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/client.js";
import { searchSemantic, type SemanticResult } from "../../../api/search/semanticClient.js";

interface Props { apiKey: string | null; query: string }
type State = { status: "idle" | "loading" } | { status: "failed"; message: string } |
  { status: "ready"; hits: SemanticResult[] };

function message(error: unknown): string {
  if (error instanceof ApiError) {
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
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const valid = query.trim().length > 0 && Array.from(query.trim()).length <= 512;

  async function request(): Promise<void> {
    if (!apiKey || !valid || pending.current) return;
    pending.current = true;
    setState({ status: "loading" });
    try {
      const response = await searchSemantic(apiKey, query);
      if (active.current) setState({ status: "ready", hits: response.hits });
    } catch (error) {
      if (active.current) setState({ status: "failed", message: message(error) });
    } finally { pending.current = false; }
  }

  return <section className="card" aria-label="Semantic search">
    <h2>Semantic matches</h2>
    <p>Compare meaning-based session matches with lexical passages. This request uses an embedding provider and may incur charges.</p>
    <p>Matches identify sessions, not exact quotes. Retrieval scores are not answer confidence.</p>
    {!apiKey ? <p>Sign in to use semantic search.</p> : <>
      <button type="button" disabled={!valid || state.status === "loading"} onClick={() => { void request(); }}>Search semantic matches</button>
      {!valid && <p>Submit a query of up to 512 characters in Search first.</p>}
      {state.status === "loading" && <p role="status">Searching semantic matches…</p>}
      {state.status === "failed" && <p role="alert">{state.message}</p>}
      {state.status === "ready" && (state.hits.length === 0 ? <p>No semantic matches found.</p> :
        <ul aria-label="Semantic results">{state.hits.map(hit => <li key={hit.sessionId}>
          {hit.session ? <Link to={`/sessions/${encodeURIComponent(hit.sessionId)}`}>{hit.session.title || "Untitled session"}</Link> : <span>Session unavailable</span>}
          {hit.session && <span> — {hit.session.date}</span>}
          <p>Retrieval score: {hit.score.toFixed(3)} · Chunk: {hit.chunkId}</p>
        </li>)}</ul>)}
    </>}
  </section>;
}
