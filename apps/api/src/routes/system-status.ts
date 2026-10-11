/**
 * apps/api/src/routes/system-status.ts — ISS-T057SCREEN-001. `GET /system-status`: the db ping plus
 * per-collection document counts for the CALLER'S OWN tenant only. Mounted AFTER `requireAuth`; the
 * tenant is `req.auth.tenantId` (derived from the verified key), never a query/body/header value.
 * The unauthenticated `/health` probe keeps its service-wide counts for ops; a signed-in tenant page
 * must read this route instead, so one tenant never sees another tenant's volume.
 */
import { Router, type Request, type Response } from "express";

export interface TenantStatusReport {
  db: "ok" | "error";
  /** Count of THIS tenant's documents per collection — empty when `db` is "error". */
  collections: Record<string, number>;
}

export interface SystemStatusDeps {
  /** Must be tenant-scoped (scopedCollection/withTenant); the tenant id comes from the auth layer. */
  tenantStatus(tenantId: string): Promise<TenantStatusReport>;
}

/** Fail closed: with no real reader wired the route answers 503, never an unscoped fallback. */
export const unavailableSystemStatusDeps: SystemStatusDeps = {
  async tenantStatus() { throw new Error("System status is unavailable"); },
};

export function createSystemStatusRouter(deps: SystemStatusDeps): Router {
  const router = Router();
  router.get("/system-status", async (req: Request, res: Response) => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) { res.status(401).json({ error: "unauthorized", message: "authentication required" }); return; }
    let report: TenantStatusReport;
    try { report = await deps.tenantStatus(tenantId); }
    catch { res.status(503).json({ db: "error", collections: {} }); return; }
    // Rebuild the body from known fields so a reader cannot smuggle extra data out.
    res.status(report.db === "ok" ? 200 : 503).json({ db: report.db, collections: report.collections });
  });
  return router;
}
