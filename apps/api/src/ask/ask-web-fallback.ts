/**
 * apps/api/src/ask-web-fallback.ts — ISS-010 / ISS-274: the real `tavilySearchFn` (packages/ask's
 * `AskV2Deps.tavilySearchFn`) for `POST /ask`'s web-supplement path. Same composition-root
 * pattern as `ingest-store.ts`'s `jinaReaderFetch` — a plain `fetch` call, no vendor SDK, no
 * abstraction the rest of the codebase doesn't already use for a single external HTTP call.
 *
 * Tavily's Search API: `POST https://api.tavily.com/search`, `{ api_key, query, max_results }`
 * body, `{ results: [{ title, url, content }, ...] }` response. Each result is passed straight
 * through as a `WebSource` — its `content` key already matches what `ask-v2.ts`'s `webDocText()`
 * looks for, so no field-mapping layer is needed.
 *
 * D-041 ruling 2 (Approver, docs/DECISIONS.md): "WEB FALLBACK: build it, do not amend the north
 * star... off-corpus questions must reach a web search path." ISS-274's finding was that the
 * ISS-010 version of this file made the seam UNREACHABLE (not merely unsuccessful) whenever
 * `TAVILY_API_KEY` was unset, by returning `undefined` and letting `production.ts` omit
 * `tavilySearchFn` from `askDeps` entirely — an off-corpus question in that state never even
 * attempted a web call. `createTavilySearchFn()` now ALWAYS returns a real function: with a key,
 * it calls Tavily for real; without one, it throws `TavilyUnavailableError` instead of silently
 * succeeding or being absent — `ask-v2.ts` catches that and logs an honest, observable
 * `ask.web_fallback_unavailable` audit entry, so the path is reached and the degradation is
 * testable, never invisible.
 */
import type { WebSource } from "@lkb/ask";

interface TavilyResponse {
  results?: { title?: string; url?: string; content?: string }[];
}

/** Thrown by the function `createTavilySearchFn()` returns when no `TAVILY_API_KEY` is
 * configured. Distinguishes "the seam was reached but the provider isn't configured" from a real
 * HTTP/network failure, though `ask-v2.ts` treats both the same way (caught, logged, degrade
 * honestly) — see its `tavilySearchFn` call site. */
export class TavilyUnavailableError extends Error {
  constructor(reason: string) {
    super(`web fallback unavailable: ${reason}`);
    this.name = "TavilyUnavailableError";
  }
}

async function tavilySearch(apiKey: string, query: string): Promise<WebSource[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
  });
  if (!res.ok) throw new Error(`Tavily search failed (HTTP ${res.status})`);
  const body = (await res.json()) as TavilyResponse;
  return (body.results ?? []).map((r) => ({ title: r.title, url: r.url, content: r.content }));
}

/** ISS-274: ALWAYS returns a real function so the web-fallback path is reachable on every
 * off-corpus question, regardless of whether a `TAVILY_API_KEY` is configured. When no key is
 * set, the returned function throws `TavilyUnavailableError` on every call rather than performing
 * a network call or pretending to succeed — the honest-degradation path required by D-041 ruling
 * 2, made observable via `ask-v2.ts`'s catch + audit log rather than by never being called. */
export function createTavilySearchFn(): (query: string) => Promise<WebSource[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return async () => {
      throw new TavilyUnavailableError("TAVILY_API_KEY not configured");
    };
  }
  return (query: string) => tavilySearch(apiKey, query);
}
