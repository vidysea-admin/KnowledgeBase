/**
 * apps/api/src/routes/semantic-search.ts — T-008 slice. `GET /search/semantic?q=<query>&k=<n>`:
 * vector (unstructured) retrieval over `chunks`, one hit per session. Same auth scope as `/search`
 * ("search"); tenant comes only from the verified key. Mounted by server.ts ONLY when
 * `deps.semanticSearch` is supplied (flag LKB_SEMANTIC_SEARCH=1), so with the flag off the route
 * does not exist.
 */
import { Router, type Request, type Response } from "express";
import type { Sessions } from "@lkb/core";
import type { SourceSpan } from "@lkb/index";
import { requireScope } from "../auth.js";
import { SemanticIndexPendingError, type SemanticReadiness } from "./readiness.js";

export interface SemanticHit {
  chunkId: string;
  sessionId: string;
  score: number;
  session: Sessions | null;
  /**
   * T-008 chunk evidence for the hit's best chunk (additive; session-level fields above are
   * unchanged): the turns it spans, their time window, and a verbatim, provenance-checked quote.
   */
  turnIds?: string[];
  tStart?: number;
  tEnd?: number;
  sourceSpans?: SourceSpan[];
  rawTextSha256?: string;
  quote?: { turnId: string; charStart: number; charEnd: number; text: string;
    speakerRef?: string; speakerLabel?: string; occurredAt?: string; tStart?: number; tEnd?: number };
}

export interface SemanticSearchDeps {
  search(tenantId: string, query: string, k: number, mode?: "sessions" | "chunks"): Promise<SemanticHit[]>;
  readiness?(tenantId: string): Promise<SemanticReadiness>;
}

const DEFAULT_K = 10;
const MAX_K = 50;
const MAX_Q_CHARS = 512;

export function createSemanticSearchRouter(deps: SemanticSearchDeps): Router {
  const router = Router();
  router.get("/search/semantic/readiness", requireScope("search"), async (req: Request, res: Response) => {
    try {
      if (!deps.readiness) throw new Error("readiness unavailable");
      res.status(200).json(await deps.readiness(req.auth!.tenantId));
    } catch { res.status(503).json({ error: "unavailable", message: "semantic index readiness is unavailable" }); }
  });
  router.get("/search/semantic", requireScope("search"), async (req: Request, res: Response) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) {
      res.status(400).json({ error: "bad_request", message: "query parameter 'q' is required and must be non-empty" });
      return;
    }
    // ISS-T008SEARCH-001: bound the RAW q too (whitespace padding must not smuggle a huge string to the paid embedder).
    if (Array.from(q).length > MAX_Q_CHARS ||
        (req.query.mode !== undefined && req.query.mode !== "sessions" && req.query.mode !== "chunks")) {
      res.status(400).json({ error: "bad_request", message: "query or search mode is invalid" });
      return;
    }
    const mode = req.query.mode === "chunks" ? "chunks" : "sessions";
    const kParam = Number(req.query.k);
    const k = Number.isFinite(kParam) && kParam > 0 ? Math.min(Math.floor(kParam), MAX_K) : DEFAULT_K;
    try {
      const hits = mode === "chunks" ? await deps.search(req.auth!.tenantId, q, k, mode)
        : await deps.search(req.auth!.tenantId, q, k);
      res.status(200).json({ query: q, hits, ...(mode === "chunks" ? { mode } : {}) });
    } catch (error) {
      if (error instanceof SemanticIndexPendingError) {
        res.status(503).json({ error: "semantic_index_pending", message: "semantic passages need a source/model-compatible rebuild before search" });
        return;
      }
      res.status(503).json({ error: "unavailable", message: "semantic search is unavailable" });
    }
  });
  return router;
}
