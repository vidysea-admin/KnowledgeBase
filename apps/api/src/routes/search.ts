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

export interface SearchDeps {
  search(tenantId: string, query: string, k: number): Promise<SearchHit[]>;
  searchNative?(tenantId: string, query: string, k: number): Promise<NativeSearchResult>;
}
/** Native identity only; no synthetic session/turn IDs, timestamps or unrechecked quote. */
export interface NativeSearchHit { nativeSourceLocator: NativeSourceLocator; score: number; title?: string }
export interface NativeSearchResult { hits: NativeSearchHit[]; truncated: boolean }

const DEFAULT_K = 10;
const MAX_K = 50;

export function createSearchRouter(deps: SearchDeps): Router {
  const router = Router();

  router.get("/search", requireScope("search"), async (req: Request, res: Response) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) {
      res.status(400).json({ error: "bad_request", message: "query parameter 'q' is required and must be non-empty" });
      return;
    }
    const kParam = Number(req.query.k);
    const k = Number.isFinite(kParam) && kParam > 0 ? Math.min(Math.floor(kParam), MAX_K) : DEFAULT_K;
    try {
      const [transcripts, native] = await Promise.all([
        deps.search(req.auth!.tenantId, q, k), deps.searchNative?.(req.auth!.tenantId, q, k),
      ]);
      const hits = native ? [...transcripts, ...native.hits].sort((a, b) => b.score - a.score).slice(0, k) : transcripts;
      res.status(200).json({ query: q, hits, ...(native ? { nativeTruncated: native.truncated } : {}) });
    } catch { res.status(503).json({ error: "search_unavailable" }); }
  });

  return router;
}
