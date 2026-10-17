import { Router } from "express";
import { isValidTenantId, requireScope } from "../auth.js";
import type { RetentionStatus } from "./store.js";
import { projectSummary } from "./summary.js";
export interface RetentionStatusDeps { readRetentionStatus?(tenant: string): RetentionStatus | Promise<RetentionStatus> }
export function createRetentionStatusRouter(deps: RetentionStatusDeps): Router {
  const router = Router();
  router.get("/retention/status", requireScope("sessions"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const unavailable = () => res.status(503).json({ error: "retention_unavailable", message: "Retention status is unavailable." });
    if (!isValidTenantId(req.auth?.tenantId)) { res.status(401).json({ error: "unauthorized" }); return; }
    try {
      const status = await deps.readRetentionStatus?.(req.auth.tenantId);
      if (!status || status.status === "unavailable") { unavailable(); return; }
      const summary = status.status === "available" ? projectSummary({ ...status.summary, tenantId: req.auth.tenantId }, req.auth.tenantId) : null;
      if (status.status !== "never-run" && !summary) { unavailable(); return; }
      res.setHeader("X-LKB-Tenant", req.auth.tenantId);
      res.status(200).json(summary ? { status: "available", summary } : { status: "never-run" });
    } catch { unavailable(); }
  });
  return router;
}
