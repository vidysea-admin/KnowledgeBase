/**
 * apps/api/src/routes/ask.ts — T-009 C3. `POST /ask`, the one real endpoint. Wires `@lkb/ask`'s
 * `askV2` with a REAL `treeSearchFn` (from `@lkb/index`) and a REAL LLM `complete` (T-019's
 * provider router) — this file IS the composition root T-005b's `treeSearchFn` seam and the
 * `apps/api` production entrypoint deferred to (see `production.ts`). Tests inject fakes for
 * `tree`/`complete`/`scoreFn` through the same `AskRouteDeps` shape used here — no second,
 * injection-only stub wiring exists alongside this real one.
 */
import { Router, type Request, type Response } from "express";
import type { TreeIndexNode } from "@lkb/core";
import { askV2, BoundedAskError, type AskV2Deps } from "@lkb/ask";
import { requireScope } from "../auth.js";

/** Injected dependency (C3) — production impl in `store.ts` is Mongo-backed; tests use a fake. */
export interface TreeStore {
  load(tenantId: string): Promise<TreeIndexNode | null>;
}

export interface AskRouteDeps {
  tree: TreeStore;
  requestDepsFor?: (tenantId: string) => Omit<AskV2Deps, "tenantId">;
  /** Everything `askV2` needs except `tenantId`, which comes from the verified key per request. */
  askDeps: Omit<AskV2Deps, "tenantId" | "extraCandidateArmsFn">;
  /**
   * U1.5 C6. A FACTORY, not a bound function — the retrieval arms query this tenant's vectors, so
   * binding them once at boot would query one tenant's corpus for every tenant's questions. That
   * is ISS-078's shape aimed at the corpus instead of the API. `buildProductionDeps()` has no
   * tenant (its router-level id is the literal "system"), so the only correct binding point is
   * here, from the verified key.
   */
  extraCandidateArmsFor?: (tenantId: string) => AskV2Deps["extraCandidateArmsFn"];
}

export function createAskRouter(deps: AskRouteDeps): Router {
  const router = Router();

  router.post("/ask", requireScope("ask"), async (req: Request, res: Response) => {
    const body = req.body as { query?: unknown } | undefined;
    if (!body || typeof body.query !== "string" || body.query.trim() === "") {
      res.status(400).json({ error: "bad_request", message: "body must be { query: string }" });
      return;
    }

    const tenantId = req.auth!.tenantId;
    const tree = await deps.tree.load(tenantId);
    if (!tree) {
      res.status(404).json({ error: "not_found", message: "no tree index built for this tenant yet" });
      return;
    }

    try {
    const result = await askV2(body.query, tree, {
      ...deps.askDeps,
      ...(deps.requestDepsFor ? deps.requestDepsFor(tenantId) : {}),
      tenantId,
      ...(!deps.requestDepsFor && deps.extraCandidateArmsFor ? { extraCandidateArmsFn: deps.extraCandidateArmsFor(tenantId) } : {}),
    });
    res.status(200).json(result);
    } catch (error) {
      if (error instanceof BoundedAskError) {
        res.status(503).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  return router;
}
