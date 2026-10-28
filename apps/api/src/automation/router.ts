import { Router, type Request, type Response } from "express";
import { requireScope, type VerifiedKey } from "../auth.js";
import { AutomationRuntime } from "./runtime.js";
import { AutomationError, automationRunView, type AutomationDefinition, type AutomationPrincipal } from "./types.js";

export type AutomationPermission = "automation:read" | "automation:manage" | "automation:operate";
export interface AutomationRouterDeps {
  runtime: AutomationRuntime;
  /** T060 must hold current role authorization through the callback's mutation, not only return a boolean. */
  withPermission<T>(verified: VerifiedKey, permission: AutomationPermission, callback: () => Promise<T>): Promise<T>;
}
const definitionView = (d: AutomationDefinition) => ({ id: d._id, kind: d.kind, enabled: d.enabled, maxAttempts: d.maxAttempts, timeoutMs: d.timeoutMs, version: d.version, updatedAt: d.updatedAt });
function principal(req: Request): AutomationPrincipal {
  const auth = req.auth as (VerifiedKey & { keyId?: string }) | undefined;
  if (!auth?.keyId) throw new AutomationError("unavailable");
  return { tenantId: auth.tenantId, actorId: auth.keyId };
}
const version = (body: unknown): number => {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).join(",") !== "expectedVersion" || !Number.isSafeInteger((body as { expectedVersion: unknown }).expectedVersion) || Number((body as { expectedVersion: unknown }).expectedVersion) < 1) throw new AutomationError("invalid_request");
  return Number((body as { expectedVersion: unknown }).expectedVersion);
};
/** Full route paths: mount once after existing requireAuth. Missing configuration is an honest 503. */
export function createAutomationRouter(deps?: AutomationRouterDeps): Router {
  const router = Router();
  const route = (permission: AutomationPermission, action: (req: Request, res: Response, p: AutomationPrincipal) => Promise<void>) => async (req: Request, res: Response) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    if (!deps) { res.status(503).json({ error: "automation_unavailable" }); return; }
    try {
      if (Object.keys(req.query).length || req.method === "GET" && (req.headers["transfer-encoding"] || Number(req.headers["content-length"] ?? 0) > 0)) throw new AutomationError("invalid_request");
      const p = principal(req);
      await deps.withPermission(req.auth, permission, async () => action(req, res, p));
    } catch (error) {
      if (res.headersSent) return;
      const code = error instanceof AutomationError ? error.code : error && typeof error === "object" && "status" in error && error.status === 403 ? "forbidden" : "unavailable";
      const statuses = { invalid_request: 400, not_found: 404, conflict: 409, unavailable: 503, forbidden: 403 };
      res.status(statuses[code]).json({ error: `automation_${code}` });
    }
  };
  router.get("/automation/definitions", requireScope("automation:read"), route("automation:read", async (_req, res, p) => {
    const definitions = await deps!.runtime.store.list(p.tenantId, "definition", 100);
    res.set("cache-control", "private, no-store").json({ definitions: definitions.map(d => definitionView(d as AutomationDefinition)), registeredKinds: ["application-readiness"] });
  }));
  router.put("/automation/definitions/application-readiness", requireScope("automation:operate"), route("automation:manage", async (req, res, p) => {
    const definition = await deps!.runtime.configure(p, req.body); res.json({ definition: definitionView(definition) });
  }));
  router.post("/automation/runs", requireScope("automation:write"), route("automation:manage", async (req, res, p) => {
    const result = await deps!.runtime.submit(p, req.body); res.status(result.replay ? 200 : 201).json({ run: automationRunView(result.run), replay: result.replay });
  }));
  router.get("/automation/runs", requireScope("automation:read"), route("automation:read", async (_req, res, p) => {
    const records = await deps!.runtime.store.list(p.tenantId, "run", 100);
    res.set("cache-control", "private, no-store").json({ runs: records.map(r => automationRunView(r as Awaited<ReturnType<AutomationRuntime["load"]>>)), truncated: records.length === 100 });
  }));
  router.get("/automation/runs/:id", requireScope("automation:read"), route("automation:read", async (req, res, p) => {
    res.set("cache-control", "private, no-store").json({ run: automationRunView(await deps!.runtime.load(p.tenantId, String(req.params.id))) });
  }));
  router.post("/automation/runs/:id/execute", requireScope("automation:operate"), route("automation:operate", async (req, res, p) => {
    const run = await deps!.runtime.execute(p, String(req.params.id), version(req.body)); res.json({ run: automationRunView(run) });
  }));
  router.post("/automation/runs/:id/intervene", requireScope("automation:operate"), route("automation:operate", async (req, res, p) => {
    res.json({ run: automationRunView(await deps!.runtime.intervene(p, String(req.params.id), req.body)) });
  }));
  router.post("/automation/monitor", requireScope("automation:operate"), route("automation:operate", async (req, res, p) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length) throw new AutomationError("invalid_request");
    res.json(await deps!.runtime.monitor(p));
  }));
  return router;
}
