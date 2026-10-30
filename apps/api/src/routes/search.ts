/**
 * apps/api/src/routes/search.ts — plan §10 U0.7 (second half). `GET /search?q=<query>&k=<n>`:
 * real lexical retrieval over `turns` (`@lkb/index`'s `lexicalSearchTurns`), each hit enriched
 * with the real turn text and session, same "citation shape" `routes/citations.ts` already
 * established — a search result should be resolvable back to the actual transcript the same way
 * a claim's evidence is. Un-stubs `/search` from `stubs.ts`, injected-deps pattern matching
 * `routes/brain.ts`/`routes/citations.ts` — tests never touch Mongo.
 */
import { Router, type Request, type Response } from "express";
import type { NativeSourceLocator, Sessions, Turns } from "@lkb/core";
import { requireScope } from "../auth.js";

export interface SearchHit {
  turnId: string;
  sessionId: string;
  score: number;
  turn: Turns | null;
  session: Sessions | null;
}

/** Per-call limits the route hands the store (D-206 K5). */
export interface SearchCallOptions {
  /** Absolute epoch-ms deadline; the store stops work (visibility step included) past it. */
  deadlineAt?: number;
}
export interface SearchDeps {
  search(tenantId: string, query: string, k: number, options?: SearchCallOptions): Promise<SearchHit[]>;
  searchNative?(tenantId: string, query: string, k: number): Promise<NativeSearchResult>;
}
/** Native identity only; no synthetic session/turn IDs, timestamps or unrechecked quote. */
export interface NativeSearchHit { nativeSourceLocator: NativeSourceLocator; score: number; title?: string }
export interface NativeSearchResult { hits: NativeSearchHit[]; truncated: boolean }

class SearchDeadlineError extends Error { constructor() { super("search deadline exceeded"); this.name = "SearchDeadlineError"; } }

const DEFAULT_K = 10;
const MAX_K = 50;

/** Hard server-side ceiling for one /search request (D-206 K5). Over it the answer is a 503 `search_timeout`, never a hang. */
export const DEFAULT_SEARCH_DEADLINE_MS = 5000;
export interface SearchRouterOptions { deadlineMs?: number }
const MIN_DEADLINE_MS = 50, MAX_DEADLINE_MS = 60_000;
/** `KB_SEARCH_DEADLINE_MS` overrides the default; garbage falls back to the default rather than disabling the bound. */
export function resolveSearchDeadlineMs(requested?: number, env: string | undefined = process.env.KB_SEARCH_DEADLINE_MS): number {
  const raw = requested ?? (env === undefined || env.trim() === "" ? NaN : Number(env));
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.max(Math.floor(raw), MIN_DEADLINE_MS), MAX_DEADLINE_MS) : DEFAULT_SEARCH_DEADLINE_MS;
}

export function createSearchRouter(deps: SearchDeps, options: SearchRouterOptions = {}): Router {
  const router = Router();
  const deadlineMs = resolveSearchDeadlineMs(options.deadlineMs);

  router.get("/search", requireScope("search"), async (req: Request, res: Response) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) {
      res.status(400).json({ error: "bad_request", message: "query parameter 'q' is required and must be non-empty" });
      return;
    }
    const kParam = Number(req.query.k);
    const k = Number.isFinite(kParam) && kParam > 0 ? Math.min(Math.floor(kParam), MAX_K) : DEFAULT_K;
    // Timeout is a 503, not an empty 200: an empty result is indistinguishable from "the KB knows nothing", and a caller
    // that treats it as an answer would silently drop real knowledge. 503 + a distinct code lets it retry or fall back.
    const deadlineAt = Date.now() + deadlineMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SearchDeadlineError()), deadlineMs); });
    expired.catch(() => undefined); // the race below owns the rejection; this only prevents an unhandled-rejection if it loses
    try {
      const [transcripts, native] = await Promise.race([
        Promise.all([deps.search(req.auth!.tenantId, q, k, { deadlineAt }), deps.searchNative?.(req.auth!.tenantId, q, k)]),
        expired,
      ]);
      const hits = native ? [...transcripts, ...native.hits].sort((a, b) => b.score - a.score).slice(0, k) : transcripts;
      res.status(200).json({ query: q, hits, ...(native ? { nativeTruncated: native.truncated } : {}) });
    } catch (error) {
      if (res.headersSent) return;
      res.status(503).json({ error: error instanceof SearchDeadlineError || (error instanceof Error && error.name === "VisibilityDeadlineError") ? "search_timeout" : "search_unavailable" });
    } finally { if (timer) clearTimeout(timer); }
  });

  return router;
}
