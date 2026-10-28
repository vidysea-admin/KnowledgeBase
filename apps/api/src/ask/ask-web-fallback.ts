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
import { detectGeminiFreeTier } from "@lkb/ai";
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

// ---------------------------------------------------------------------------------------------
// gemini-web-fallback (D-202): Tavily is dropped from production wiring; the /ask web fallback is
// Gemini with Google Search grounding on the existing paid GEMINI_API_KEY. The dependency keeps its
// historical name `tavilySearchFn` (packages/ask is untouched). The Tavily function above is kept
// (existing tests exercise it) but production.ts no longer calls it.
// ---------------------------------------------------------------------------------------------

/** Default grounded-search model; override with LKB_WEB_GROUNDING_MODEL. */
export const WEB_GROUNDING_DEFAULT_MODEL = "gemini-2.5-flash";

/** Typed failure of the Gemini grounded-search call (HTTP error or transport failure). `ask-graph.ts`
 * catches any rejection from `tavilySearchFn` and degrades to internal-only. Never carries the API
 * key: `status` is 0 for a transport failure and the message is built from the status only. */
export class GeminiWebSearchError extends Error {
  constructor(public readonly status: number, detail: string) {
    super(`gemini web search failed (HTTP ${status})${detail ? `: ${detail}` : ""}`);
    this.name = "GeminiWebSearchError";
  }
}

interface GroundingChunk { web?: { uri?: string; title?: string } }
interface GroundingSupport { segment?: { text?: string }; groundingChunkIndices?: number[] }
interface GeminiGroundedResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: GroundingChunk[]; groundingSupports?: GroundingSupport[] };
  }[];
}

/** Maps Gemini `groundingMetadata` to `WebSource[]`. Each web chunk becomes one item whose `content`
 * is the text of the answer segments that cite it (evidence); a chunk no segment cites falls back to
 * the synthesized answer text. No chunks (or none with a uri) -> `[]`: never a fabricated source. */
export function mapGroundedResponse(body: GeminiGroundedResponse): WebSource[] {
  const cand = body.candidates?.[0];
  const meta = cand?.groundingMetadata;
  const chunks = meta?.groundingChunks ?? [];
  const answer = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  const supported = new Map<number, string[]>();
  for (const s of meta?.groundingSupports ?? []) {
    const text = s.segment?.text?.trim();
    if (!text) continue;
    for (const i of s.groundingChunkIndices ?? []) {
      const list = supported.get(i) ?? [];
      if (!list.includes(text)) list.push(text);
      supported.set(i, list);
    }
  }
  const out: WebSource[] = [];
  const seen = new Set<string>();
  chunks.forEach((c, i) => {
    const url = c.web?.uri;
    if (typeof url !== "string" || !url || seen.has(url)) return;
    seen.add(url);
    const content = supported.get(i)?.join(" ") || answer;
    out.push({ title: c.web?.title, url, content: content || undefined });
  });
  return out;
}

async function geminiGroundedSearch(apiKey: string, model: string, query: string): Promise<WebSource[]> {
  const redact = (s: string) => s.split(apiKey).join("[redacted]");
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      // Only the query text leaves the process: no tenant id, student id, session or filter data.
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: query }] }], tools: [{ google_search: {} }] }),
    });
  } catch (err) {
    throw new GeminiWebSearchError(0, redact(err instanceof Error ? err.message : String(err)).slice(0, 200));
  }
  if (!res.ok) {
    let parsed: unknown;
    try { parsed = await res.json(); } catch { parsed = undefined; }
    const freeTier = detectGeminiFreeTier(res.status, parsed);
    if (freeTier) throw freeTier;
    throw new GeminiWebSearchError(res.status, "");
  }
  return mapGroundedResponse((await res.json()) as GeminiGroundedResponse);
}

/** ALWAYS returns a real function (ISS-274 reachability): with GEMINI_API_KEY it runs a grounded
 * search; without one it rejects with `TavilyUnavailableError` and makes no network call, so ask
 * continues internal-only exactly as before. */
export function createGeminiWebSearchFn(): (query: string) => Promise<WebSource[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return async () => {
      throw new TavilyUnavailableError("GEMINI_API_KEY not configured");
    };
  }
  const model = process.env.LKB_WEB_GROUNDING_MODEL?.trim() || WEB_GROUNDING_DEFAULT_MODEL;
  return (query: string) => geminiGroundedSearch(apiKey, model, query);
}
