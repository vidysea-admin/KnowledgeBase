/** Authenticated history/feedback and distinct candidate/evidence review endpoints. Mount after auth+JSON+limits. */
import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
import { AnswerWorkflowError, type AnswerWorkflow } from "./answer-workflow.js";
import { PolicyServiceError } from "./service.js";
import { PolicyInputError } from "./rules.js";
import type { Actor } from "./types.js";

export type HumanReviewAction = "answer-review" | "source-preference" | "usefulness";
/** Server-owned identity verification, never a request's claimed actor or API-key scope. */
export interface TrustedHumanReviewer { kind: "human"; tenantId: string; subject: string }
export interface AnswerReviewAuthority {
  verifyHuman(req: Request, action: HumanReviewAction): Promise<TrustedHumanReviewer | null>;
}

export function answerWorkflowFailure(res: Response, error: unknown): void {
  if (error instanceof AnswerWorkflowError) {
    const status = { bad_request: 400, not_found: 404, stale_answer: 409, invalid_state: 409, evidence_unavailable: 503, policy_conflict: 409 }[error.code];
    res.status(status).json({ error: error.code, message: error.message }); return;
  }
  if (error instanceof PolicyInputError) { res.status(400).json({ error: error.code, message: error.message }); return; }
  if (error instanceof PolicyServiceError) {
    res.status(error.code === "not_found" ? 404 : error.code === "invalid_policy" ? 400 : 409).json({ error: error.code, message: error.message }); return;
  }
  res.status(503).json({ error: "answer_history_unavailable", message: "Answer history or review is unavailable." });
}

export function createAnswerHistoryRouter(workflow: AnswerWorkflow, authority?: AnswerReviewAuthority): Router {
  const router = Router();
  const actor = (req: Request) => ({ actor: `api-key:${req.auth!.tenantId}` });
  const handle = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    try { res.json(await fn(req)); } catch (error) { answerWorkflowFailure(res, error); }
  };
  const human = (action: HumanReviewAction, fn: (req: Request, by: Actor) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!authority) { res.status(503).json({ error: "human_review_unavailable", message: "Verified human review is not configured." }); return; }
    let reviewer: TrustedHumanReviewer | null;
    try { reviewer = await authority.verifyHuman(req, action); }
    catch { res.status(503).json({ error: "human_review_unavailable", message: "Verified human review is unavailable." }); return; }
    if (!reviewer || reviewer.kind !== "human" || reviewer.tenantId !== req.auth!.tenantId
      || typeof reviewer.subject !== "string" || !reviewer.subject.trim() || reviewer.subject !== reviewer.subject.trim()
      || reviewer.subject.length > 200 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(reviewer.subject)) {
      res.status(403).json({ error: "human_review_required", message: "This action requires an authorized human reviewer in this tenant." }); return;
    }
    try { res.json(await fn(req, { actor: `human:${reviewer.subject}` })); } catch (error) { answerWorkflowFailure(res, error); }
  };
  router.get("/answer-history", requireScope("ask"), handle(async (req) => ({ history: await workflow.history(req.auth!.tenantId) })));
  router.get("/answer-history/suggestions", requireScope("ask"), handle(async (req) => ({ questions: await workflow.suggestions(req.auth!.tenantId) })));
  router.get("/answer-history/:runId", requireScope("ask"), handle(async (req) => workflow.get(req.auth!.tenantId, String(req.params.runId))));
  router.post("/answer-history/:runId/feedback", requireScope("ask"), human("usefulness", async (req, by) => workflow.feedback(req.auth!.tenantId, String(req.params.runId), req.body, by)));
  router.post("/answer-history/:runId/conflicts", requireScope("ask"), handle(async (req) => workflow.reportConflict(req.auth!.tenantId, String(req.params.runId), req.body, actor(req))));
  router.get("/answer-reviews", requireScope("answer-policy:read"), handle(async (req) => ({ items: await workflow.queue(req.auth!.tenantId) })));
  router.post("/answer-reviews/:runId/resolve", requireScope("answer-policy:write"), human("answer-review", async (req, by) => workflow.review(req.auth!.tenantId, String(req.params.runId), req.body, by)));
  router.get("/answer-evidence-conflicts", requireScope("answer-policy:read"), handle(async (req) => ({ conflicts: await workflow.conflicts(req.auth!.tenantId) })));
  router.post("/answer-evidence-conflicts/:conflictId/resolve", requireScope("answer-policy:write"), human("source-preference", async (req, by) => workflow.resolveConflict(req.auth!.tenantId, String(req.params.conflictId), req.body, by)));
  return router;
}
