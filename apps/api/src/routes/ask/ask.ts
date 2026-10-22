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
import { requireScope } from "../../auth.js";
import { AnswerWorkflowError, answerGraphSelection, parseAnswerInput, type AnswerWorkflow } from '../../answer-policy/answer-workflow.js';
import { answerWorkflowFailure } from '../../answer-policy/answer-router.js';
import type { TreeExclusions } from '../../indexing/eligible-tree.js';

/** Injected dependency (C3) — production impl in `store.ts` is Mongo-backed; tests use a fake. */
export interface TreeStore {
  load(tenantId: string): Promise<TreeIndexNode | null>;
  /** Same tree plus how many of the tenant's sessions were left out as ineligible (D-190). Counts only. */
  loadWithExclusions?(tenantId: string): Promise<{ tree: TreeIndexNode | null; excluded: TreeExclusions }>;
}

export interface AskRouteDeps {
  answerWorkflow?: AnswerWorkflow;
  tree: TreeStore;
  requestDepsFor?: (tenantId: string, selection?: { speakerRefs?: string[]; topicRefs?: string[] }) => Omit<AskV2Deps, "tenantId">;
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
    const body = req.body as { query?: unknown; filters?: unknown } | undefined;
    if (!body || typeof body.query !== "string" || body.query.trim() === "") {
      res.status(400).json({ error: "bad_request", message: "body must be { query: string }" });
      return;
    }

    const tenantId = req.auth!.tenantId;
    try {
    // Keep the legacy request's ignored top-level fields inert. Durable policy Ask
    // retains its existing strict full-input parser; both paths validate filters.
    const input = parseAnswerInput(deps.answerWorkflow ? req.body : { query: body.query, filters: body.filters });
    const selection = answerGraphSelection(input.filters);
    if ((selection?.speakerRefs?.length || selection?.topicRefs?.length) && !deps.requestDepsFor)
      throw new BoundedAskError("selected graph authority unavailable");
    const loaded = deps.tree.loadWithExclusions
      ? await deps.tree.loadWithExclusions(tenantId)
      : { tree: await deps.tree.load(tenantId), excluded: { total: 0, reasons: {} } as TreeExclusions };
    const { tree, excluded } = loaded;
    if (!tree) {
      res.status(404).json({ error: "not_found", message: "no tree index built for this tenant yet" });
      return;
    }

    const requestDeps = {
      ...deps.askDeps,
      ...(deps.requestDepsFor ? deps.requestDepsFor(tenantId, selection) : {}),
      tenantId,
    };
    const result = deps.answerWorkflow
      ? await deps.answerWorkflow.execute(tenantId, req.body, { actor: `api-key:${req.auth!.keyId ?? tenantId}` }, tree, requestDeps)
      : await askV2(input.query, tree, requestDeps);
    res.status(200).json(result && typeof result === "object" && !Array.isArray(result)
      ? { ...result, excludedSessions: excluded.total, exclusionReasons: excluded.reasons } : result);
    } catch (error) {
      if (error instanceof BoundedAskError) {
        res.status(503).json({ error: error.code, message: error.message });
        return;
      }
      if (deps.answerWorkflow || error instanceof AnswerWorkflowError) { answerWorkflowFailure(res, error); return; }
      throw error;
    }
  });

  return router;
}
