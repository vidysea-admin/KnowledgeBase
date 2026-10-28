import { Router, type Request, type Response, type NextFunction } from "express";
import { requireScope } from "../auth.js";
import { FlywheelError } from "./types.js";
import type { EvaluationFlywheel } from "./workflow.js";

export function createEvaluationFlywheelRouter(workflow?: EvaluationFlywheel): Router {
  const r = Router();
  const auth = [requireScope("compete"), requireScope("gaps")];
  const handler = (action: (t: string, id: string, req: Request) => Promise<unknown>) => async (req: Request, res: Response, _next: NextFunction) => {
    if (!workflow) { res.status(503).json({ error: "flywheel_unavailable" }); return; }
    try { res.json(await action(req.auth!.tenantId, req.params.id as string, req)); }
    catch (e) { res.status(e instanceof FlywheelError ? e.status : 503).json({ error: e instanceof FlywheelError ? e.code : "flywheel_unavailable" }); }
  };
  const publicHead = (row: Awaited<ReturnType<EvaluationFlywheel["inspect"]>>) => {
    const copy = structuredClone(row);
    if (copy.flywheel.lock) {
      const { requestId, expiresAt } = copy.flywheel.lock;
      return { ...copy, flywheel: { ...copy.flywheel, lock: { requestId, expiresAt } } };
    }
    return copy;
  };
  r.get("/evaluations/:id/flywheel", ...auth, handler(async (t, id) => publicHead(await workflow!.inspect(t, id))));
  r.post("/evaluations/:id/gap", ...auth, requireScope("ingest"), requireScope("ask"), handler((t, id, req) => {
    if (req.body !== undefined && (req.body === null || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length))
      throw new FlywheelError("invalid", 400);
    return workflow!.open(t, id).then(publicHead);
  }));
  r.post("/evaluations/:id/retest", ...auth, requireScope("ingest"), requireScope("ask"), handler((t, id, req) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)
      || Object.keys(req.body).some((key) => !["sourceUrl", "requestId"].includes(key))) throw new FlywheelError("invalid", 400);
    return workflow!.retest(t, id, req.body);
  }));
  return r;
}
