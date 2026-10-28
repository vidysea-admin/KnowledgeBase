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
import { Link } from "react-router-dom";
import { useAskHandoff } from "./search/AskHandoff.js";
import { safeHttpUrl } from "../safe-url.js";
import type { AskInternalSource } from "../api/types.js";
import { AiUsageSummary } from "../components/AiUsageSummary.js";
import { NativeEvidence } from "../components/NativeEvidence.js";
import { parseNativeSourceLocator, type NativeSourceLocator } from "../api/nativeEvidence.js";

// Web-source `url` comes from an external search provider (open index-signature `WebSource`), so
// it is attacker-influenceable text: only http(s) may become an `href` (see ../safe-url.ts).

/** The tree stores a session id on each node's evidence; that is what makes a citation clickable. */
function sessionRefOf(source: AskInternalSource): string | null {
  const ref = source.evidence?.sessionRef;
  return typeof ref === "string" && ref !== "" ? ref : null;
}

function nativeLocators(source: AskInternalSource): NativeSourceLocator[] {
  const raw = source.evidence?.sourceQuotes;
  const candidates = [source.evidence?.sourceLocator, ...(Array.isArray(raw) ? raw.map(q =>
    q && typeof q === "object" ? (q as Record<string, unknown>).sourceLocator : null) : [])];
  const unique = new Map<string, NativeSourceLocator>();
  for (const candidate of candidates) {
    const parsed = parseNativeSourceLocator(candidate);
    if (parsed) unique.set(JSON.stringify(parsed), parsed);
  }
  return [...unique.values()];
}
function hasNativeCitation(source: AskInternalSource): boolean {
  const evidence = source.evidence, quotes = evidence?.sourceQuotes;
  const native = (value: unknown) => value !== undefined && !(value && typeof value === "object" && (value as Record<string, unknown>).kind === "transcript");
  return native(evidence?.sourceLocator) || Array.isArray(quotes) && quotes.some(q => q && typeof q === "object"
    && (native((q as Record<string, unknown>).sourceLocator) || ["document-page", "message"].includes(String((q as Record<string, unknown>).origin))));
}

interface QuoteCitation { id: string; turnId: string; speakerRef: string; tStart: number; tEnd: number; quote: string; origin: string }
function quoteCitations(source: AskInternalSource): QuoteCitation[] {
  const quotes = source.evidence?.sourceQuotes;
  if (!Array.isArray(quotes)) return [];
  return quotes.filter((q): q is QuoteCitation => q !== null && typeof q === "object"
    && typeof q.id === "string" && typeof q.turnId === "string" && q.turnId.length > 0
    && typeof q.speakerRef === "string" && typeof q.quote === "string"
    && typeof q.origin === "string" && Number.isFinite(q.tStart) && Number.isFinite(q.tEnd));
}

export function AskPage(): React.ReactElement {
  const { query, setQuery, result, error, loading, handleSubmit } = useAskHandoff();

  const internal = result?.sources.internal ?? [];
  const excluded = typeof result?.excludedSessions === "number" && result.excludedSessions > 0 ? result.excludedSessions : 0;
  const removed = typeof result?.removedSentences === "number" && result.removedSentences > 0 ? result.removedSentences : 0;
  const web = result?.sources.web ?? [];
  // ISS-274: the seam is now wired unconditionally (apps/api/src/production.ts), so
  // `web_used: false` no longer means "no fallback was configured" -- it can also mean "the
  // fallback was reached and honestly failed" (e.g. no GEMINI_API_KEY yet). ask-v2.ts logs that
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
            {removed > 0 && (
              <div className="empty-note" data-testid="ask-removed-note">
                {removed} unsupported {removed === 1 ? "sentence was" : "sentences were"} removed from this answer.
              </div>
            )}
            <AiUsageSummary entries={result.auditLog} />
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
            {excluded > 0 && (
              <div className="empty-note" data-testid="ask-excluded-note">
                {excluded} {excluded === 1 ? "session" : "sessions"} not yet indexed and excluded from answers
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
                if (hasNativeCitation(source)) {
                  const locators = nativeLocators(source);
                  return <li key={source.node_id}><span>{source.node_id}</span>
                    {locators.map(locator => <NativeEvidence key={JSON.stringify(locator)} sourceLocator={locator} />)}
                    {!locators.length && <p>This source passage is unavailable.</p>}
                  </li>;
                }
                const ref = sessionRefOf(source);
                return (
                  <li key={source.node_id} style={{ marginBottom: "0.35rem" }}>
                    {ref ? (
                      <Link to={`/sessions/${encodeURIComponent(ref)}`}>{source.node_id}</Link>
                    ) : (
                      <span>{source.node_id}</span>
                    )}
                    {ref && quoteCitations(source).map((q) => <div key={q.id}>
                      <Link to={`/sessions/${encodeURIComponent(ref)}#turn-${encodeURIComponent(q.turnId)}`}>
                        {q.speakerRef} · {q.tStart}–{q.tEnd}s
                      </Link>
                      <blockquote>{q.quote}</blockquote>
                      <small>{q.origin === "speech" ? "Source statement; speaker label preserved" : q.origin}</small>
                    </div>)}
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
