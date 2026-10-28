import { Router } from "express";
import { requireScope } from "../auth.js";
import type { GroundedContentDeps } from "./reader.js";

/** Mount after requireAuth. Reuses the session-read scope; accepts no tenant from clients. */
export function createGroundedContentRouter(deps: GroundedContentDeps): Router {
  const router = Router();
  router.get("/sessions/:id/grounded-content", requireScope("sessions"), async (req, res) => {
    const content = await deps.getGroundedContent(req.auth!.tenantId, req.params.id as string);
    if (!content) { res.status(404).json({ error: "not_found", message: "session not found" }); return; }
    res.json(content);
  });
  return router;
}
