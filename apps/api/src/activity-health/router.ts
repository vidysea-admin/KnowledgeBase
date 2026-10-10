import { Router } from "express";
import { requireScope } from "../auth.js";
import { projectActivitySnapshot, type ActivityHealthDeps } from "./types.js";

export const unavailableActivityHealthDeps: ActivityHealthDeps = { async readActivityHealth() { throw new Error("Upload queue unavailable"); } };
export function createActivityHealthRouter(deps: ActivityHealthDeps): Router {
  const router = Router();
  router.get("/activity-health", requireScope("jobs"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const params = new URL(req.originalUrl, "http://localhost").searchParams, raw = params.get("limit");
    const body: unknown = req.body;
    if ([...params.keys()].some(key => key !== "limit") || params.getAll("limit").length > 1 ||
        Object.keys(req.query).some(key => key !== "limit") || req.query.limit !== undefined && typeof req.query.limit !== "string" ||
        raw !== null && (!/^[1-9][0-9]{0,2}$/.test(raw) || Number(raw) > 100) ||
        body !== undefined && (body === null || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0)) {
      res.status(400).json({ error: "invalid_activity_query", message: "Invalid activity query" }); return;
    }
    const limit = raw === null ? 50 : Number(raw);
    try {
      if (typeof req.auth?.tenantId !== "string" || !req.auth.tenantId.trim()) throw new Error("Missing verified tenant");
      res.status(200).json(projectActivitySnapshot(await deps.readActivityHealth(req.auth.tenantId, limit), limit));
    } catch { res.status(503).json({ error: "activity_unavailable", message: "Upload queue activity is unavailable for this tenant" }); }
  });
  return router;
}
