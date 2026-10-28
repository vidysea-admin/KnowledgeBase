import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
import { HostingService } from "./service.js";
import { HostingWorker } from "./worker.js";
import { HostingError, hostingFields, hostingId, hostingObject, type HostingPrincipal } from "./types.js";

export interface HostingRouterDeps { service: HostingService; worker: HostingWorker }
function principal(req: Request): HostingPrincipal {
  const auth = req.auth;
  if (!auth || typeof auth.keyId !== "string" || !auth.keyId) throw new HostingError("verified_identity_unavailable", 503);
  return { tenantId: auth.tenantId, keyId: auth.keyId, scopes: auth.scopes };
}
export function createHostingRouter(deps?: HostingRouterDeps): Router {
  const router = Router();
  const endpoint = (handler: (req: Request, p: HostingPrincipal) => Promise<unknown>, status = 200) => async (req: Request, res: Response) => {
    try {
      if (!deps) throw new HostingError("hosting_unavailable", 503);
      const value = await handler(req, principal(req)); res.status(status).json(value ?? { ok: true });
    } catch (failure) {
      const error = failure instanceof HostingError ? failure : new HostingError("hosting_unavailable", 503);
      if (error.status === 503) res.setHeader("Retry-After", "1");
      res.status(error.status).json({ error: error.code });
    }
  };
  router.use(["/hosting", "/webhooks"], requireScope("hosting"));
  router.get("/hosting/roles", endpoint(async (_req, p) => deps!.service.getRoles(p)));
  router.put("/hosting/roles/:keyId", endpoint(async (req, p) => {
    const body = hostingObject(req.body); hostingFields(body, ["role"]);
    if (body.role !== null && !["viewer", "editor", "admin"].includes(body.role as string)) throw new HostingError("invalid_role");
    await deps!.service.setRole(p, hostingId(req.params.keyId, "key"), body.role as "viewer" | "editor" | "admin" | null); return { ok: true };
  }));
  router.get("/hosting/audit", endpoint(async (_req, p) => deps!.service.audit(p)));
  router.post("/webhooks/register", endpoint(async (req, p) => {
    const body = hostingObject(req.body); hostingFields(body, ["url", "events"]);
    return deps!.service.register(p, body.url, body.events);
  }, 201));
  router.get("/webhooks", endpoint(async (_req, p) => deps!.service.subscriptions(p)));
  router.delete("/webhooks/:id", endpoint(async (req, p) => { await deps!.service.revoke(p, hostingId(req.params.id, "subscription")); return { ok: true }; }));
  router.post("/webhooks/events", endpoint(async (req, p) => {
    const body = hostingObject(req.body); hostingFields(body, ["id", "type", "payload"]);
    return deps!.service.publish(p, hostingId(body.id, "event"), hostingId(body.type, "event_type"), body.payload);
  }, 202));
  router.get("/webhooks/deliveries", endpoint(async (_req, p) => deps!.service.deliveries(p)));
  router.post("/webhooks/dispatch", endpoint(async (req, p) => {
    const body = req.body === undefined ? {} : hostingObject(req.body); hostingFields(body, ["limit"]);
    return deps!.worker.dispatch(p, body.limit === undefined ? 5 : body.limit as number);
  }));
  return router;
}
