import { Router } from "express";
import type { EvalRuns } from "@lkb/core";
import { requireScope } from "../../auth.js";
import { ChampionshipError, createChampionshipEvent, type ChampionshipEvent } from "../../championship/model.js";
import type { VerifyEvidence } from "../../answer-policy/answer-records.js";
import { answerEvidence } from "../../answer-policy/answer-evidence.js";
import { addChampionshipTrial, championshipReport, freezeChampionship } from "../../championship/runtime.js";

/** Production adapter must retain documents, tenant-scope every operation and implement atomic revision CAS. */
export interface ChampionshipStore {
  create(tenantId: string, event: ChampionshipEvent): Promise<void>;
  get(tenantId: string, id: string): Promise<ChampionshipEvent | null>;
  replace(tenantId: string, id: string, expectedRevision: number, event: ChampionshipEvent): Promise<boolean>;
  getEvalRun(tenantId: string, id: string): Promise<EvalRuns | null>;
  /** Tenant-scoped canonical-turn verifier (createMongoEvidenceVerifier). When absent, cited trials fail closed on read. */
  verifyEvidence?: VerifyEvidence;
}
const STALE_REASON = "Stored candidate, policy or source evidence changed, was withdrawn, or cannot be verified.";
/** Recompute stored quote proofs on read, as every other saved-answer path does; stale citations are stripped and flagged. */
async function reverifyTrials(store: ChampionshipStore, tenantId: string, event: ChampionshipEvent): Promise<ChampionshipEvent> {
  const trials = await Promise.all(event.trials.map(async trial => {
    const sources = (trial.aiAnswer as { sources?: { internal?: unknown; web?: unknown } } | undefined)?.sources;
    const cited = !!sources && [sources.internal, sources.web].some(v => Array.isArray(v) && v.length > 0);
    if (!cited) return trial;
    let ok = false;
    try { ok = !!store.verifyEvidence && await store.verifyEvidence(tenantId, answerEvidence(trial.aiAnswer as never)); } catch { ok = false; }
    if (ok) return trial;
    return { ...trial, state: "stale" as const, aiAnswer: { ...(trial.aiAnswer as object), sources: { internal: [], web: [] }, reason: STALE_REASON } as typeof trial.aiAnswer };
  }));
  return { ...event, trials };
}
export function createChampionshipRouter(store: ChampionshipStore, clock = () => new Date().toISOString()): Router {
  const router = Router();
  router.use("/championship", requireScope("compete"));
  router.post("/championship", async (req, res, next) => {
    try { const event = createChampionshipEvent(req.auth!.tenantId, req.body, clock());
      await store.create(req.auth!.tenantId, event); res.status(201).json(event);
    } catch (e) { if (e instanceof ChampionshipError) res.status(e.code === "storage_unavailable" ? 503 : 400).json({ error: e.code, message: e.message }); else next(e); }
  });
  router.get("/championship/:id", async (req, res, next) => {
    try { const event = await store.get(req.auth!.tenantId, String(req.params.id));
      if (!event || event.tenantId !== req.auth!.tenantId || event._id !== String(req.params.id)) { res.status(404).json({ error: "not_found" }); return; }
      const checked = await reverifyTrials(store, req.auth!.tenantId, event);
      res.json({ event: checked, report: championshipReport(checked) });
    } catch (e) { if (e instanceof ChampionshipError) res.status(409).json({ error: e.code, message: e.message }); else next(e); }
  });
  for (const action of ["freeze", "trials"] as const) router.post(`/championship/:id/${action}`, async (req, res, next) => {
    try {
      const tenantId = req.auth!.tenantId, id = String(req.params.id), body = req.body;
      if (!body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) { res.status(400).json({ error: "revision_required" }); return; }
      const event = await store.get(tenantId, id);
      if (!event || event.tenantId !== tenantId || event._id !== id) { res.status(404).json({ error: "not_found" }); return; }
      if (event.revision !== body.expectedRevision) { res.status(409).json({ error: "revision_conflict" }); return; }
      let updated: ChampionshipEvent;
      if (action === "freeze") updated = freezeChampionship(event, body.bankDigest, clock());
      else {
        if (typeof body.evalRunId !== "string" || !body.evalRunId.trim() || body.evalRunId.length > 100) { res.status(400).json({ error: "eval_run_required" }); return; }
        const run = await store.getEvalRun(tenantId, body.evalRunId);
        if (!run || run.tenantId !== tenantId || run._id !== body.evalRunId) { res.status(404).json({ error: "not_found" }); return; }
        updated = addChampionshipTrial(event, body.questionId, body.counsellorId, run, clock());
      }
      if (!await store.replace(tenantId, id, event.revision, updated)) { res.status(409).json({ error: "revision_conflict" }); return; }
      res.json({ event: updated, report: championshipReport(updated) });
    } catch (e) { if (e instanceof ChampionshipError) res.status(e.code === "storage_unavailable" ? 503 : 400).json({ error: e.code, message: e.message }); else next(e); }
  });
  return router;
}
