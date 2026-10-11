import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { normalizeQuery } from "./query.js";
import { searchTranscripts, type TranscriptSearchHit } from "../../api/search/client.js";

type SearchState = { key: string; query: string } & (
  { status: "loading" } | { status: "failed"; message: string } | { status: "ready"; hits: TranscriptSearchHit[] }
);
function message(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "This API key needs search access.";
  if (error instanceof ApiError && error.status === 401) return "Sign in to search transcripts.";
  if (error instanceof ApiError && error.status === 400) return "Enter a search query.";
  return "Search is unavailable. Try again.";
}

const inflight: { current: { id: string; promise: ReturnType<typeof searchTranscripts> } | null } = { current: null };

export function SearchPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [params, setParams] = useSearchParams();
  // The URL is the single source of truth for the executed query; the box is only a draft of it.
  const urlQuery = normalizeQuery(params.get("q"));
  const [query, setQuery] = useState(urlQuery);
  const [state, setState] = useState<SearchState | null>(null);
  const generation = useRef(0);
  const key = useRef(apiKey);
  const previousKey = useRef(apiKey);
  key.current = apiKey;
  const current = state?.key === apiKey ? state : null;
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (previousKey.current === apiKey) return;
    previousKey.current = apiKey;
    generation.current++;
    setState(null);
    setQuery("");
    setParams({}, { replace: true });
  }, [apiKey, setParams]);
  useEffect(() => {
    setQuery(urlQuery);
    if (!urlQuery || !apiKey) { generation.current++; setState(null); return; }
    void run(urlQuery);
    return () => { generation.current++; };
    // Runs per distinct URL query only; a key change clears the URL query above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  async function run(submitted: string) {
    if (!apiKey) return;
    const request = ++generation.current, requestKey = apiKey, id = JSON.stringify([requestKey, submitted]);
    setState({ key: requestKey, query: submitted, status: "loading" });
    // Reuse a still-pending identical request (React StrictMode re-runs mount effects in dev).
    const pending = inflight.current?.id === id ? inflight.current.promise : searchTranscripts(requestKey, submitted);
    inflight.current = { id, promise: pending };
    const settle = () => { if (inflight.current?.promise === pending) inflight.current = null; };
    try {
      const response = await pending;
      settle();
      if (generation.current === request && key.current === requestKey)
        setState({ key: requestKey, query: submitted, status: "ready", hits: response.hits });
    } catch (error) {
      settle();
      if (generation.current === request && key.current === requestKey)
        setState({ key: requestKey, query: submitted, status: "failed", message: message(error) });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKey) return;
    const submitted = normalizeQuery(query);
    if (!submitted) { generation.current++; setState({ key: apiKey, query: "", status: "failed", message: "Enter a search query." }); return; }
    // Same query as the URL: re-run in place (retry); otherwise push so Back returns to the earlier query.
    if (submitted === urlQuery) void run(submitted); else setParams({ q: submitted });
  }

  return <>
    <div className="page-header"><h1>Search</h1><p>Find passages in your transcripts and open their source.</p></div>
    {!apiKey ? <div className="card empty-note">Sign in to search transcripts.</div> : <>
      <form onSubmit={(event) => { void submit(event); }} className="card" aria-label="Search transcripts">
        <label htmlFor="transcript-search-query">Search transcripts</label>
        <input id="transcript-search-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="submit">Search</button>
      </form>
      {!current && <p className="empty-note">Enter a query to search your transcripts.</p>}
      {current?.status === "loading" && <p role="status">Searching transcripts…</p>}
      {current?.status === "failed" && <div className="card error-note" role="alert">{current.message}</div>}
      {current?.status === "ready" && <section aria-label="Search results">
        <p role="status">{current.hits.length ? `Results for “${current.query}”` : `No passages found for “${current.query}”.`}</p>
        {current.hits.map((hit) => <article className="row-card" key={hit.turnId}>
          <h2 className="row-title">{hit.session?.title || "Session unavailable"}</h2>
          {hit.session && <p className="row-meta">{hit.session.date}</p>}
          {hit.turn ? <>
            <p className="row-meta">Speaker: {hit.turn.speakerLabel?.trim() || hit.turn.speakerRef}</p>
            <p className="row-meta">{hit.turn.speakerRef === "url" || hit.turn.speakerRef === "document"
              ? `Characters ${hit.turn.tStart}–${hit.turn.tEnd}` : `${hit.turn.tStart}–${hit.turn.tEnd} s`}</p>
            <blockquote style={{ whiteSpace: "pre-wrap" }}>{hit.turn.text}</blockquote>
          </> : <p>Passage unavailable.</p>}
          {hit.session && hit.turn ? <Link to={`/sessions/${encodeURIComponent(hit.sessionId)}#turn-${encodeURIComponent(hit.turnId)}`}>Open transcript</Link>
            : <p>The source passage could not be resolved.</p>}
        </article>)}
      </section>}
    </>}
  </>;
}
