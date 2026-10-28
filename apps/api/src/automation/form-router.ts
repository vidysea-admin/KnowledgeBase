import { Router, type Request, type Response } from "express";
import { requireScope, type VerifiedKey } from "../auth.js";
import { AutomationError } from "./types.js";
import type { AutomationPermission } from "./router.js";
import { ApplicationFormRuntime } from "./form-runtime.js";
import { applicationObject } from "./form-validation.js";
import { applicationOperationView, type ApplicationPrincipal } from "./form-types.js";
export interface ApplicationFormsRouterDeps {
  runtime: ApplicationFormRuntime;
  withPermission<T>(key: VerifiedKey, permission: AutomationPermission, callback: () => Promise<T>): Promise<T>;
}
export function createApplicationFormsRouter(deps?: ApplicationFormsRouterDeps): Router {
  const router = Router();
  const handler = (permission: AutomationPermission, run: (req: Request, p: ApplicationPrincipal) => Promise<unknown>) => async (req: Request, res: Response) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    if (!deps || !req.auth.keyId) { res.status(503).json({ error: "applications_unavailable" }); return; }
    try {
      if (Object.keys(req.query).length || req.method === "GET" && (req.headers["transfer-encoding"] || Number(req.headers["content-length"] ?? 0) > 0)) throw new AutomationError("invalid_request");
      const result = await deps.withPermission(req.auth, permission, async () => run(req, { tenantId: req.auth!.tenantId, actorId: req.auth!.keyId! }));
      res.set("cache-control", "private, no-store").json(result);
    } catch (e) {
      const code = e instanceof AutomationError ? e.code : e && typeof e === "object" && "status" in e && e.status === 403 ? "forbidden" : "unavailable";
      res.status({ invalid_request: 400, not_found: 404, conflict: 409, forbidden: 403, unavailable: 503 }[code]).json({ error: `applications_${code}` });
    }
  };
  router.get("/automation/forms/targets", requireScope("automation:read"), handler("automation:read", async () => ({ targets: deps!.runtime.registeredTargets() })));
  router.put("/automation/forms/definitions", requireScope("automation:operate"), handler("automation:manage", async (req, p) => {
    const d = await deps!.runtime.configure(p, req.body); return { definition: { id: d._id, targetId: d.targetId, enabled: d.enabled, version: d.version, maxAttempts: d.maxAttempts, timeoutMs: d.timeoutMs } };
  }));
  router.get("/automation/forms/definitions", requireScope("automation:read"), handler("automation:read", async (_req, p) => ({ definitions: (await deps!.runtime.store.list(p.tenantId, "definition")).map(d => ({ id: d._id, targetId: d.targetId, version: d.version, enabled: "enabled" in d ? d.enabled : false })) })));
  router.post("/automation/forms/operations", requireScope("automation:write"), handler("automation:manage", async (req, p) => { const result = await deps!.runtime.submit(p, req.body); return { operation: applicationOperationView(result.operation), replay: result.replay }; }));
  router.get("/automation/forms/operations", requireScope("automation:read"), handler("automation:read", async (_req, p) => { const rows = await deps!.runtime.store.list(p.tenantId, "operation"); return { operations: rows.map(r => { if (r.recordType !== "operation") throw new AutomationError("unavailable"); return applicationOperationView(r); }), truncated: rows.length === 100 }; }));
  router.get("/automation/forms/operations/:id", requireScope("automation:read"), handler("automation:read", async (req, p) => ({ operation: applicationOperationView(await deps!.runtime.load(p.tenantId, String(req.params.id))) })));
  router.get("/automation/forms/operations/:id/review", requireScope("automation:operate"), handler("automation:operate", async (req, p) => {
    const operation = await deps!.runtime.load(p.tenantId, String(req.params.id));
    return { review: { id: operation._id, version: operation.version, targetId: operation.targetId, payloadDigest: operation.payloadDigest, targetFingerprint: operation.targetFingerprint, evidence: operation.fields.map(({ name, source }) => ({ name, source })) } };
  }));
  const version = (body: unknown) => { const value = applicationObject(body, ["expectedVersion"]); if (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1) throw new AutomationError("invalid_request"); return Number(value.expectedVersion); };
  router.post("/automation/forms/operations/:id/approve", requireScope("automation:operate"), handler("automation:operate", async (req, p) => ({ operation: applicationOperationView(await deps!.runtime.approve(p, String(req.params.id), version(req.body))) })));
  router.put("/automation/forms/operations/:id/fields", requireScope("automation:write"), handler("automation:manage", async (req, p) => ({ operation: applicationOperationView(await deps!.runtime.revise(p, String(req.params.id), req.body)) })));
  router.post("/automation/forms/operations/:id/execute", requireScope("automation:operate"), handler("automation:operate", async (req, p) => ({ operation: applicationOperationView(await deps!.runtime.execute(p, String(req.params.id), version(req.body))) })));
  router.post("/automation/forms/operations/:id/intervene", requireScope("automation:operate"), handler("automation:operate", async (req, p) => ({ operation: applicationOperationView(await deps!.runtime.intervene(p, String(req.params.id), req.body)) })));
  router.post("/automation/forms/monitor", requireScope("automation:operate"), handler("automation:operate", async (req, p) => { applicationObject(req.body, []); return deps!.runtime.monitor(p); }));
  return router;
}
