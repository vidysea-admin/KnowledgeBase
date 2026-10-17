import { Router } from "express";
import { requireScope } from "../auth.js";
import { isDecisionIdentity } from "./provenance.js";
import type { SessionDecisionsDeps } from "./reader.js";

/** Mount after existing requireAuth; tenant always comes from the verified request actor. */
export function createSessionDecisionsRouter(deps: SessionDecisionsDeps): Router {
  const router = Router();
  router.get("/sessions/:id/decisions", requireScope("sessions"), async (req, res) => {
    const id = req.params.id;
    if (!isDecisionIdentity(id)) { res.status(400).json({ error: "invalid_session", message: "Invalid session identity" }); return; }
    try {
      const result = await deps.getSessionDecisions(req.auth!.tenantId, id);
      if (!result) { res.status(404).json({ error: "not_found", message: "Session not found" }); return; }
      res.json(result);
    } catch {
      res.status(503).json({ error: "decisions_unavailable", message: "Stored decisions are unavailable" });
    }
  });
  return router;
}
