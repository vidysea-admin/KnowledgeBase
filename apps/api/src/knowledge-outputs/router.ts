import { Router, type RequestHandler } from "express";
import { requireScope } from "../auth.js";
import { OutputError, record } from "./types.js";
import type { OutputService } from "./service.js";

/** Mount after requireAuth. Every operation reuses the verified tenant; body identities are rejected. */
export function createOutputRouter(service?: OutputService): Router {
  const router = Router();
  router.use("/knowledge-outputs", requireScope("sessions"));
  const run = (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler => async (req, res) => {
    if (!service) { res.status(503).json({ error: "unavailable", message: "Knowledge output persistence is unavailable." }); return; }
    try { await fn(req, res); }
    catch (error) {
      if (error instanceof OutputError) { res.status(error.status).json({ error: error.code, message: error.message }); return; }
      // Providers can include prompts/credentials in errors: fixed public message; central handler may log only internal errors.
      res.status(503).json({ error: "unavailable", message: "Knowledge output operation failed." });
    }
  };
  const revision = (body: unknown): number => {
    if (!record(body) || Object.keys(body).some((k) => k !== "revision") || !Number.isSafeInteger(body.revision) || (body.revision as number) < 1) throw new OutputError("invalid_request", 400);
    return body.revision as number;
  };
  router.get("/knowledge-outputs", run(async (req, res) => { res.json({ outputs: await service!.list(req.auth!.tenantId) }); }));
  router.post("/knowledge-outputs", requireScope("ask"), run(async (req, res) => { res.status(201).json(await service!.create(req.auth!.tenantId, req.body)); }));
  router.get("/knowledge-outputs/:id", run(async (req, res) => { res.json(await service!.get(req.auth!.tenantId, req.params.id as string)); }));
  router.put("/knowledge-outputs/:id", requireScope("ask"), run(async (req, res) => { res.json(await service!.edit(req.auth!.tenantId, req.params.id as string, req.body)); }));
  router.post("/knowledge-outputs/:id/revalidate", requireScope("ask"), run(async (req, res) => { res.json(await service!.revalidate(req.auth!.tenantId, req.params.id as string, revision(req.body))); }));
  router.post("/knowledge-outputs/:id/export", run(async (req, res) => { res.json(await service!.export(req.auth!.tenantId, req.params.id as string, revision(req.body))); }));
  return router;
}
