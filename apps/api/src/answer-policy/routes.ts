/** T-056 draft simulation: Ask runs unchanged; policy decisions are metadata, never publication. */
import { Router } from "express";
import { askV2, BoundedAskError } from "@lkb/ask";
import { createAnswerPolicyVersion, simulateAnswerPolicy } from "../../../../packages/ask/src/answer-policy.js";
import type { AskRouteDeps } from "../routes/ask/ask.js";
import { requireScope } from "../auth.js";
import { simulateYamlPolicy } from "./yaml-simulation.js";
import { answerWorkflowFailure } from "./answer-router.js";
import { AnswerWorkflowError, answerGraphSelection, parseAnswerInput } from "./answer-workflow.js";

export function createAnswerPolicyRouter(deps: AskRouteDeps): Router {
  const router = Router();
  router.post("/answer-policy/simulate-yaml", requireScope("ask"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try { res.json(await simulateYamlPolicy(req.auth!.tenantId, req.body, deps)); }
    catch (error) {
      if (error instanceof BoundedAskError) { res.status(503).json({ error: error.code, message: error.message }); return; }
      answerWorkflowFailure(res, error);
    }
  });
  router.post("/answer-policy/simulate", requireScope("ask"), async (req, res, next) => {
    const body = req.body as { query?: unknown; filters?: unknown; draft?: { policyId?: unknown; version?: unknown; mode?: unknown } } | undefined;
    const draft = body?.draft;
    if (!body || typeof body.query !== "string" || !body.query.trim() || body.query.length > 4000
      || !draft || typeof draft.policyId !== "string" || draft.policyId.length > 120
      || !Number.isSafeInteger(draft.version) || (draft.version as number) < 1
      || (draft.mode !== "internal-only" && draft.mode !== "internal-and-web")) {
      res.status(400).json({ error: "bad_request", message: "Provide a question and valid draft policy." }); return;
    }
    const tenantId = req.auth!.tenantId;
    let policy;
    try { policy = { ...createAnswerPolicyVersion(tenantId, draft.policyId, draft.mode), version: draft.version as number }; }
    catch { res.status(400).json({ error: "bad_request", message: "Invalid draft policy." }); return; }
    try {
      const input = parseAnswerInput({ query: body.query, filters: body.filters });
      const selection = answerGraphSelection(input.filters);
      if ((selection?.speakerRefs?.length || selection?.topicRefs?.length) && !deps.requestDepsFor)
        throw new BoundedAskError("selected graph authority unavailable");
      const tree = await deps.tree.load(tenantId);
      if (!tree) { res.status(404).json({ error: "not_found", message: "no tree index built for this tenant yet" }); return; }
      // Same tenant factory precedence as /ask; no client tenant, sources or answer is accepted.
      const result = await askV2(input.query, tree, {
        ...deps.askDeps, ...(deps.requestDepsFor ? deps.requestDepsFor(tenantId, selection) : {}), tenantId,
        ...(!deps.requestDepsFor && deps.extraCandidateArmsFor ? { extraCandidateArmsFn: deps.extraCandidateArmsFor(tenantId) } : {}),
      });
      const simulation = simulateAnswerPolicy(tenantId, policy, { tenantId, result });
      res.json({ draft: { policyId: policy.policyId, version: policy.version, mode: policy.mode }, simulation, result });
    } catch (error) {
      if (error instanceof BoundedAskError) { res.status(503).json({ error: error.code, message: error.message }); return; }
      if (error instanceof AnswerWorkflowError) { answerWorkflowFailure(res, error); return; }
      next(error);
    }
  });
  return router;
}
