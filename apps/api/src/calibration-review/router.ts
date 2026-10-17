import { Router, type Request } from "express";
import { requireScope } from "../auth.js";
import { hash } from "./seed.js";
import { CalibrationReviewError, type CalibrationReviewStore, type ReviewSubmission } from "./types.js";

export interface CalibrationReviewDeps { store: CalibrationReviewStore }
/** Must be mounted AFTER requireAuth; tenant and audit actor come only from verified request context. */
export function createCalibrationReviewRouter(deps?: CalibrationReviewDeps): Router {
  const router = Router();
  router.use("/calibration-review", requireScope("compete"));
  const execute = (work: (req: Request) => Promise<unknown>) => async (req: Request, res: import("express").Response): Promise<void> => {
    if (!deps) { res.status(503).json({ error: "calibration_review_unavailable" }); return; }
    try {
      if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
      const result = await work(req);
      if (result === null) { res.status(404).json({ error: "calibration_not_found" }); return; }
      res.set("Cache-Control", "no-store").json(result);
    } catch (error) {
      res.status(error instanceof CalibrationReviewError ? error.status : 503)
        .json({ error: error instanceof CalibrationReviewError ? error.code : "calibration_review_unavailable" });
    }
  };
  router.get("/calibration-review", execute(req => deps!.store.read(req.auth!.tenantId)));
  router.post("/calibration-review/items/:id", execute(req => deps!.store.approve(req.auth!.tenantId, String(req.params.id), req.body as ReviewSubmission,
    `api-key-sha256:${hash(req.header("authorization") ?? "")}`)));
  router.get("/calibration-review/export", execute(req => deps!.store.export(req.auth!.tenantId)));
  return router;
}
