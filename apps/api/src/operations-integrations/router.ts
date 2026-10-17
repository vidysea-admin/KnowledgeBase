import { Router, type Request, type Response } from "express";
import type { HostingService } from "../hosting/service.js";
import { HostingError, type HostingPrincipal } from "../hosting/types.js";
import { OperationsError, kinds, type IntegrationKind } from "./model.js";
import type { OperationsService } from "./service.js";
function principal(req: Request): HostingPrincipal {
  const auth = req.auth;
  if (!auth?.tenantId || typeof auth.keyId !== "string" || !auth.keyId || !Array.isArray(auth.scopes)) throw new OperationsError("unauthorized");
  return { tenantId: auth.tenantId, keyId: auth.keyId, scopes: [...auth.scopes] };
}
function kind(req: Request): IntegrationKind {
  if (!kinds.includes(req.params.kind as IntegrationKind)) throw new OperationsError("invalid");
  return req.params.kind as IntegrationKind;
}
function fail(res: Response, error: unknown) {
  if (error instanceof OperationsError) {
    const status = { invalid: 400, conflict: 409, unavailable: 503, unauthorized: 403, disabled: 409, uncertain: 409 }[error.code];
    res.status(status).json({ error: error.code, message: error.code === "uncertain" ? "This operation needs delivery reconciliation before it can be enabled again." : error.code === "disabled" ? "The approved destination or integration is unavailable; no operation ran." : "Operations integration request could not be completed." });
  } else if (error instanceof HostingError) res.status(error.status).json({ error: "operations_authorization", message: "Operations access is unavailable or not permitted." });
  else res.status(503).json({ error: "operations_unavailable", message: "Operations integrations are unavailable." });
}
export function createOperationsIntegrationsRouter(service: OperationsService, hosting: Pick<HostingService, "withPermission">): Router {
  const router = Router();
  const run = (permission: "operations:read" | "operations:manage" | "operations:run", action: (req: Request, p: HostingPrincipal) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      if (Object.keys(req.query).length > 0) throw new OperationsError("invalid");
      const p = principal(req);
      res.json(await hosting.withPermission(p, permission, () => action(req, p)));
    } catch (error) { fail(res, error); }
  };
  router.get("/operations-integrations", run("operations:read", (_req, p) => service.list(p.tenantId)));
  router.get("/operations-integrations/preview", run("operations:read", (_req, p) => service.preview(p.tenantId)));
  router.put("/operations-integrations/:kind", run("operations:manage", (req, p) => service.save(p.tenantId, kind(req), req.body, p.keyId)));
  router.post("/operations-integrations/:kind/run", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
    if (Object.keys(req.query).length) throw new OperationsError("invalid");
    const p = principal(req);
    const integration = kind(req), body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 2 || Object.keys(body).some(key => !["revision", "confirm"].includes(key)) ||
      !Number.isSafeInteger(body.revision) || Number(body.revision) < 0 || body.confirm !== (integration === "digest" ? "RUN_DIGEST" : "RUN_SHEETS")) throw new OperationsError("invalid");
    const authorization = {
      mutate: <T,>(callback: () => Promise<T>) => hosting.withPermission(p, "operations:run", callback),
      initialize: <T,>(callback: () => Promise<T>) => hosting.withPermission(p, "operations:run", async () => ({ work: callback() })),
    };
    // Initial check also refuses a no-op run from an unauthorized principal.
    await hosting.withPermission(p, "operations:run", async () => undefined);
    res.json(await service.run(p.tenantId, integration, Number(body.revision), p.keyId, authorization));
    } catch (error) { fail(res, error); }
  });
  router.post("/operations-integrations/:kind/reconcile", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      if (Object.keys(req.query).length) throw new OperationsError("invalid");
      const p = principal(req), integration = kind(req), body = req.body as Record<string, unknown> | null;
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 2 || Object.keys(body).some(key => !["revision", "confirm"].includes(key)) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0 || body.confirm !== (integration === "digest" ? "RECONCILE_DIGEST" : "RECONCILE_SHEETS")) throw new OperationsError("invalid");
      const authorization = { mutate: <T,>(callback: () => Promise<T>) => hosting.withPermission(p, "operations:run", callback), initialize: <T,>(callback: () => Promise<T>) => hosting.withPermission(p, "operations:run", async () => ({ work: callback() })) };
      await hosting.withPermission(p, "operations:run", async () => undefined);
      res.json(await service.reconcile(p.tenantId, integration, Number(body.revision), p.keyId, authorization));
    } catch (error) { fail(res, error); }
  });
  return router;
}
/** Absent configured authority is an explicit unavailable route, never an empty successful schedule. */
export function createUnavailableOperationsIntegrationsRouter(): Router {
  const router = Router();
  router.use("/operations-integrations", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.status(503).json({ error: "operations_unavailable", message: "Operations integrations are not configured." });
  });
  return router;
}
