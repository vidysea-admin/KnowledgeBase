/** Standalone authenticated review routes. Integration must enforce quarantine before mounting. */
import { Router, type Request, type Response } from "express";
import { requireScope, isValidTenantId } from "../../auth.js";
import { sha256Hex } from "../../hash.js";
import { isWhatsAppReviewId, type WhatsAppReviewAction, type WhatsAppReviewRepository } from "./store.js";

function actor(req: Request): string {
  // This header has already been verified by the application auth middleware; persist only its fingerprint.
  const match = /^Bearer\s+(.+)$/iu.exec(req.header("authorization") ?? "");
  if (!match) throw new Error("Verified key actor unavailable");
  return `api-key-sha256:${sha256Hex(match[1]!)}`;
}

export function createWhatsAppReviewRouter(repository: WhatsAppReviewRepository): Router {
  const router = Router();
  router.use("/whatsapp/review", requireScope("whatsapp"), (req, res, next) => {
    if (!isValidTenantId(req.auth?.tenantId)) { res.status(401).json({ error: "unauthorized" }); return; }
    next();
  });
  router.get("/whatsapp/review", async (req: Request, res: Response) => {
    try { res.status(200).json({ candidates: await repository.list(req.auth!.tenantId) }); }
    catch { res.status(502).json({ error: "review_evidence_unavailable" }); }
  });
  router.get("/whatsapp/review/:id", async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!isWhatsAppReviewId(id)) { res.status(404).json({ error: "not_found" }); return; }
    try {
      const candidate = await repository.get(req.auth!.tenantId, id);
      if (!candidate) { res.status(404).json({ error: "not_found" }); return; }
      res.status(200).json({ candidate });
    } catch { res.status(502).json({ error: "review_evidence_unavailable" }); }
  });
  for (const [verb, action] of [["approve", "approved"], ["reject", "rejected"]] as const) {
    router.post(`/whatsapp/review/:id/${verb}`, async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!isWhatsAppReviewId(id)) { res.status(404).json({ error: "not_found" }); return; }
      if (req.body !== undefined && (req.body === null || typeof req.body !== "object"
          || Array.isArray(req.body) || Object.keys(req.body).length !== 0)) {
        res.status(400).json({ error: "bad_request", message: "Review decisions accept only an empty body" }); return;
      }
      try {
        const result = await repository.decide(req.auth!.tenantId, id, action as WhatsAppReviewAction, actor(req));
        if (result.result === "not_found") { res.status(404).json({ error: "not_found" }); return; }
        if (result.result === "publish_unavailable") { res.status(503).json({ error: "publish_unavailable" }); return; }
        if (result.result !== "ok") { res.status(409).json({ error: result.result }); return; }
        res.status(200).json({ candidate: result.candidate, changed: result.changed });
      } catch {
        res.status(502).json({ error: "review_failed", message: "Review decision was not confirmed; retry to verify its state" });
      }
    });
  }
  return router;
}
