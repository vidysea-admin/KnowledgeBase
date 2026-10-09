/**
 * apps/api/src/routes/compete.ts — T-012 C3. `POST /compete/start` + `POST /compete/:id/score`,
 * added to the existing T-009 Express app (never a second server). `/compete/start` calls the
 * existing `askV2` composition the exact same way `routes/ask.ts` does (same `tree`/`askDeps`
 * shape, reused not duplicated) and writes one `eval_runs` row with `credibility: 'internal'`
 * (D-007 tier rule — this one-person manual form can never produce anything else).
 * `/compete/:id/score` fills in the counsellor's own answer + both scores on that same row.
 */
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { EvalRuns } from "@lkb/core";
import { askV2, BoundedAskError, type AskV2Deps } from "@lkb/ask";
import { requireScope } from "../auth.js";
import type { AskRouteDeps } from "./ask.js";

/** Injected dependency (C3) — production impl in `store.ts` wraps `@lkb/db`'s `eval-runs.ts`
 * accessor; tests use a fake, matching `TreeStore`/`ApiKeyStore`'s existing injection pattern. */
export interface EvalRunStore {
  create(tenantId: string, doc: Omit<EvalRuns, "tenantId">): Promise<void>;
  recordScore(
    tenantId: string,
    id: string,
    update: { counsellorAnswer: EvalRuns["counsellorAnswer"]; score: EvalRuns["score"] },
  ): Promise<boolean>;
}

export interface CompeteRouteDeps extends AskRouteDeps {
  evalRuns: EvalRunStore;
}

interface StartBody {
  question?: unknown;
  counsellor?: { name?: unknown; org?: unknown };
}

interface ScoreBody {
  counsellorAnswer?: { text?: unknown };
  score?: { ai?: unknown; counsellor?: unknown };
  notes?: unknown;
}

export function createCompeteRouter(deps: CompeteRouteDeps): Router {
  const router = Router();

  router.post("/compete/start", requireScope("compete"), async (req: Request, res: Response) => {
    const body = req.body as StartBody | undefined;
    const question = body?.question;
    const counsellorName = body?.counsellor?.name;
    if (
      !body ||
      typeof question !== "string" ||
      question.trim() === "" ||
      !body.counsellor ||
      typeof counsellorName !== "string" ||
      counsellorName.trim() === ""
    ) {
      res.status(400).json({
        error: "bad_request",
        message: "body must be { question: string, counsellor: { name: string, org?: string } }",
      });
      return;
    }
    const counsellorOrg = body.counsellor.org;

    const tenantId = req.auth!.tenantId;
    const tree = await deps.tree.load(tenantId);
    if (!tree) {
      res.status(404).json({ error: "not_found", message: "no tree index built for this tenant yet" });
      return;
    }

    let result: Awaited<ReturnType<typeof askV2>>;
    try {
      const requestDeps: Omit<AskV2Deps, "tenantId"> = deps.requestDepsFor ? await deps.requestDepsFor(tenantId) : deps.askDeps;
      if (deps.requestDepsFor && (!requestDeps ||
          [requestDeps.complete, requestDeps.scoreFn, requestDeps.treeSearchFn, requestDeps.write,
            requestDeps.sourceContext?.hydrate].some(value => typeof value !== "function") ||
          requestDeps.extraCandidateArmsFn !== undefined && typeof requestDeps.extraCandidateArmsFn !== "function")) {
        throw new BoundedAskError("request dependencies unavailable");
      }
      result = await askV2(question, tree, { ...requestDeps, tenantId });
    } catch (error) {
      if (deps.requestDepsFor || error instanceof BoundedAskError) {
        res.status(503).json({error: "source_context_unavailable", message: "Compete could not validate source evidence"});
        return;
      }
      throw error;
    }
    const evalRunId = randomUUID();
    const counsellor: EvalRuns["counsellor"] = { name: counsellorName };
    if (typeof counsellorOrg === "string" && counsellorOrg.trim() !== "") {
      counsellor.org = counsellorOrg;
    }
    // `scored` (which source nodes were judged relevant, and why) is what the /compete page
    // renders as "cited sources" -- real gap found live (2026-09-04) testing the actual UI: this
    // object used to drop it, so every real answer showed as uncited even when askV2 had scored
    // real candidates. `/ask`'s own response already includes it; this route stayed consistent
    // with that shape instead of re-deriving citations from `sources` alone.
    const aiAnswer = { text: result.answer, sources: result.sources, scored: result.scored, verdict: result.verdict };

    await deps.evalRuns.create(tenantId, {
      _id: evalRunId,
      question,
      counsellor,
      aiAnswer,
      credibility: "internal",
      createdAt: new Date().toISOString(),
    });

    res.status(200).json({ evalRunId, aiAnswer });
  });

  router.post("/compete/:id/score", requireScope("compete"), async (req: Request, res: Response) => {
    const body = req.body as ScoreBody | undefined;
    const counsellorAnswerText = body?.counsellorAnswer?.text;
    const aiScore = body?.score?.ai;
    const counsellorScore = body?.score?.counsellor;
    if (
      !body ||
      !body.counsellorAnswer ||
      typeof counsellorAnswerText !== "string" ||
      !body.score ||
      typeof aiScore !== "number" ||
      typeof counsellorScore !== "number"
    ) {
      res.status(400).json({
        error: "bad_request",
        message: "body must be { counsellorAnswer: { text: string }, score: { ai: number, counsellor: number }, notes? }",
      });
      return;
    }
    const notes = body.notes;

    const tenantId = req.auth!.tenantId;
    const id = req.params.id as string;
    const score: EvalRuns["score"] = { ai: aiScore, counsellor: counsellorScore };
    if (typeof notes === "string") score.notes = notes;

    const updated = await deps.evalRuns.recordScore(tenantId, id, {
      counsellorAnswer: { text: counsellorAnswerText },
      score,
    });
    if (!updated) {
      res.status(404).json({ error: "not_found", message: "no eval run with that id for this tenant" });
      return;
    }
    res.status(200).json({ ok: true });
  });

  return router;
}
