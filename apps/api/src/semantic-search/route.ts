/**
 * apps/api/src/routes/semantic-search.ts — T-008 slice. `GET /search/semantic?q=<query>&k=<n>`:
 * vector (unstructured) retrieval over `chunks`, one hit per session. Same auth scope as `/search`
 * ("search"); tenant comes only from the verified key. Mounted by server.ts ONLY when
 * `deps.semanticSearch` is supplied (flag LKB_SEMANTIC_SEARCH=1), so with the flag off the route
 * does not exist.
 */
import { Router, type Request, type Response } from "express";
import type { Sessions } from "@lkb/core";
import { requireScope } from "../auth.js";

export interface SemanticHit {
  chunkId: string;
  sessionId: string;
  score: number;
  session: Sessions | null;
}

export interface SemanticSearchDeps {
  search(tenantId: string, query: string, k: number): Promise<SemanticHit[]>;
}

const DEFAULT_K = 10;
const MAX_K = 50;

export function createSemanticSearchRouter(deps: SemanticSearchDeps): Router {
  const router = Router();
  router.get("/search/semantic", requireScope("search"), async (req: Request, res: Response) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) {
      res.status(400).json({ error: "bad_request", message: "query parameter 'q' is required and must be non-empty" });
      return;
    }
    const kParam = Number(req.query.k);
    const k = Number.isFinite(kParam) && kParam > 0 ? Math.min(Math.floor(kParam), MAX_K) : DEFAULT_K;
    try {
      const hits = await deps.search(req.auth!.tenantId, q, k);
      res.status(200).json({ query: q, hits });
    } catch {
      res.status(503).json({ error: "unavailable", message: "semantic search is unavailable" });
    }
  });
  return router;
}
