/**
 * apps/api/src/routes/graph.ts — `GET /graph`: the real relationship data behind the "brain
 * view" (plan §8b phase 2). Same DI pattern as `brain.ts` — an injected `GraphReadDeps`, a real
 * Mongo-backed impl in `store.ts`.
 *
 * Scope disclosure, CORRECTED 2026-09-24 (U-BRAIN [C1]). This module used to assert that
 * `graph_edges`/`topics`/`speakers`/`orgs` "hold ZERO real rows and no pipeline writes them" and
 * that this route reads `tree_index` only. Both halves of that stopped being true the moment
 * `scripts/webinar/sync-session.mjs` shipped: `graph_edges` holds real rows for tenant `toc`
 * (`{from, to, type, weight, sessionRef, date, evidence[], confidence}` — the field is `type`,
 * NOT `kind`), and this route now reads them, unioned with `tree_index`, through
 * `@lkb/index`'s pure `buildKnowledgeGraph`.
 *
 * What is STILL not read, stated rather than implied: `speakers`/`orgs`/`topics` as standalone
 * collections (their content reaches the graph only as edge endpoints, labelled from the id or
 * from `sessions.title`), `decisions` (zero rows), and claim->topic edges (blocked on
 * `claims.topicRefs`, present on every real claim and always empty). Derived-vs-literal stays on
 * the wire per edge via `inferred` + `confidence`, never only in this comment.
 *
 * The 404 for a tenant with neither a tree index nor any edges is DELIBERATELY KEPT: it is one of
 * the four cross-tenant probes that prove tenancy is not widened (contract [I1]). The UI renders
 * it as an explanatory empty state ([C8]) rather than swallowing it.
 */
import { Router, type Request, type Response } from "express";
import type { KnowledgeGraph } from "@lkb/index";
import { requireScope } from "../auth.js";

export interface GraphReadDeps {
  loadGraph(tenantId: string): Promise<KnowledgeGraph | null>;
}

export function createGraphRouter(deps: GraphReadDeps): Router {
  const router = Router();

  router.get("/graph", requireScope("graph"), async (req: Request, res: Response) => {
    const graph = await deps.loadGraph(req.auth!.tenantId);
    if (!graph) {
      res.status(404).json({
        error: "not_found",
        message: "no knowledge graph for this tenant yet — no tree index has been built and no graph_edges rows exist",
      });
      return;
    }
    res.status(200).json(graph);
  });

  return router;
}
