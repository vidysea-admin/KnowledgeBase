/**
 * apps/web/src/pages/AskPage.tsx — U3.1. The UI for `POST /ask`, which has been live and
 * checker-PASSed since T-009 but had no way to reach it from the app. No backend work: this page
 * calls the existing route through the existing `apiFetch` wrapper and renders what it already
 * returns.
 *
 * Two things this page deliberately shows rather than hides, because they are the product's
 * actual claim (ARCHITECTURE section 1: "always citing sources separately"):
 *  - internal sources are listed SEPARATELY from web sources, never merged into one list;
 *  - the router's verdict / insufficient-coverage state is surfaced, so an answer the system
 *    itself judged weakly-covered does not read as a confident one.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ask } from "../api/ask.js";
import { ApiError } from "../api/client.js";
import type { AskResponse, AskInternalSource } from "../api/types.js";

/**
 * Web sources come from an external search provider and `WebSource` is an open index-signature
 * type (`packages/ask/src/router.ts`), so `url` is attacker-influenceable text, not a checked
 * URL. Only http(s) may become an `href` — a `javascript:` or `data:` URI in a citation would
 * otherwise execute on click. Anything else renders as inert text, never as a dead or unsafe link.
 */
function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
  } catch {
    return null; // not an absolute URL at all
  }
}

/** The tree stores a session id on each node's evidence; that is what makes a citation clickable. */
function sessionRefOf(source: AskInternalSource): string | null {
  const ref = source.evidence?.sessionRef;
  return typeof ref === "string" && ref !== "" ? ref : null;
}

export function AskPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "" || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    ask(apiKey, trimmed)
      .then((res) => setResult(res))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "failed to ask"))
      .finally(() => setLoading(false));
  }

  const internal = result?.sources.internal ?? [];
  const web = result?.sources.web ?? [];
  // ISS-274: the seam is now wired unconditionally (apps/api/src/production.ts), so
  // `web_used: false` no longer means "no fallback was configured" -- it can also mean "the
  // fallback was reached and honestly failed" (e.g. no TAVILY_API_KEY yet). ask-v2.ts logs that
  // case as an `ask.web_fallback_unavailable` audit entry; without checking for it here, this
  // page would keep telling the person "no web fallback is configured" even once one is wired,
  // which is the exact "far from the DOM" UI regression this unit was told to watch for.
  const webFallbackUnavailable = result?.auditLog.some((e) => e.step.startsWith("web_fallback_unavailable")) ?? false;

  return (
    <>
      <div className="page-header">
        <h1>Ask</h1>
        <p>
          Ask a question against the knowledge base. Answers are drawn from the indexed sessions
          first; the web is used only when internal coverage is insufficient, and the two are
          always cited separately.
        </p>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <label htmlFor="ask-query" className="section-title">Question</label>
        <input
          id="ask-query"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. what did speakers say about UK student visas?"
          style={{ width: "100%", padding: "0.6rem", marginTop: "0.4rem", font: "inherit" }}
        />
        <button type="submit" disabled={loading || query.trim() === ""} style={{ marginTop: "0.75rem" }}>
          {loading ? "Asking…" : "Ask"}
        </button>
      </form>

      {error && <div className="card error-note">{error}</div>}

      {result && (
        <>
          <div className="card">
            <div className="section-title">Answer</div>
            <p style={{ whiteSpace: "pre-wrap" }}>{result.answer}</p>
            {result.insufficient_coverage && (
              <div className="empty-note">
                The router judged internal coverage insufficient for this question
                {result.web_used
                  ? " and fell back to the web."
                  : webFallbackUnavailable
                    ? "; the web fallback was reached but is currently unavailable."
                    : "; no web fallback is configured."}
              </div>
            )}
            <div className="row-meta">
              verdict: {result.verdict}
              {result.reason ? ` — ${result.reason}` : ""}
            </div>
          </div>

          <div className="card">
            <div className="section-title">Internal sources ({internal.length})</div>
            {internal.length === 0 && <div className="empty-note">None.</div>}
            <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
              {internal.map((source) => {
                const ref = sessionRefOf(source);
                return (
                  <li key={source.node_id} style={{ marginBottom: "0.35rem" }}>
                    {ref ? (
                      <Link to={`/sessions/${encodeURIComponent(ref)}`}>{source.node_id}</Link>
                    ) : (
                      <span>{source.node_id}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="card">
            <div className="section-title">Web sources ({web.length})</div>
            {web.length === 0 && <div className="empty-note">None — answered from the knowledge base alone.</div>}
            <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
              {web.map((source, i) => {
                const url = safeHttpUrl(source.url);
                const rawTitle = typeof source.title === "string" ? source.title : null;
                const title = rawTitle ?? url ?? "(untitled)";
                return (
                  <li key={url ?? `web-${i}`} style={{ marginBottom: "0.35rem" }}>
                    {url ? <a href={url} target="_blank" rel="noreferrer">{title}</a> : <span>{title}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
