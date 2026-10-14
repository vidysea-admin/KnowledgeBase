/**
 * T-056 persistent answer-policy admin API. NOT mounted by server.ts (follow-up); see mountAnswerPolicyAdmin.
 * Tenant comes only from req.auth. Reads need scope "answer-policy:read"; writes (save/retire/resolve) need "answer-policy:write".
 * `changedBy.actor` is derived from the verified tenant (keys carry no per-person id); `claimedBy` is an unverified label.
 */
import { Router, type Express, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
import { PolicyInputError, validPolicyId } from "./rules.js";
import { PolicyServiceError, type AnswerPolicyService } from "./service.js";
import type { Actor, ReviewStatus } from "./types.js";

const STATUS = ["open", "approved", "rejected", "acknowledged", "dismissed", "superseded"];
const HTTP = { not_found: 404, version_conflict: 409, invalid_state: 409, invalid_policy: 400 } as const;

function tenantOf(req: Request): string {
  const t = req.auth?.tenantId;
  if (typeof t !== "string" || !t) throw new Error("Missing verified tenant");
  return t;
}
function fail(res: Response, e: unknown): void {
  if (e instanceof PolicyInputError) { res.status(400).json({ error: e.code, message: e.message }); return; }
  if (e instanceof PolicyServiceError) { res.status(HTTP[e.code]).json({ error: e.code, message: e.message }); return; }
  res.status(503).json({ error: "answer_policy_unavailable", message: "Answer policies are unavailable" });
}

export function createAnswerPolicyAdminRouter(service: AnswerPolicyService): Router {
  const router = Router();
  const read = requireScope("answer-policy:read"), write = requireScope("answer-policy:write");
  const actor = (req: Request): Actor => ({ actor: `api-key:${tenantOf(req)}` });
  const run = (scope: ReturnType<typeof requireScope>, status: number, fn: (req: Request, tenant: string) => Promise<unknown>) =>
    [scope, async (req: Request, res: Response) => {
      res.setHeader("Cache-Control", "private, no-store");
      try { res.status(status).json(await fn(req, tenantOf(req))); } catch (e) { fail(res, e); }
    }] as const;
  const idOf = (req: Request): string => {
    const id = req.params.policyId;
    if (!validPolicyId(id)) throw new PolicyServiceError("invalid_policy", "Invalid policy id.");
    return id;
  };

  router.get("/answer-policies", ...run(read, 200, async (_r, t) => ({ policies: await service.list(t) })));
  router.get("/answer-policies/conflicts", ...run(read, 200, async (_r, t) => ({ conflicts: await service.conflicts(t) })));
  router.get("/answer-policies/review-queue", ...run(read, 200, async (req, t) => {
    const s = req.query.status;
    if (s !== undefined && (typeof s !== "string" || !STATUS.includes(s))) throw new PolicyServiceError("invalid_policy", "Invalid status filter.");
    return { items: await service.queue(t, s as ReviewStatus | undefined) };
  }));
  router.post("/answer-policies/review-queue/:itemId/resolve", ...run(write, 200, async (req, t) =>
    ({ item: await service.resolve(t, String(req.params.itemId), req.body, actor(req)) })));
  router.get("/answer-policies/:policyId/history", ...run(read, 200, async (req, t) => ({ history: await service.history(t, idOf(req)) })));
  router.put("/answer-policies/:policyId", ...run(write, 200, async (req, t) => service.save(t, idOf(req), req.body, actor(req))));
  router.post("/answer-policies/:policyId/retire", ...run(write, 200, async (req, t) => service.retire(t, idOf(req), req.body, actor(req))));
  return router;
}

/** Wiring for server.ts (not edited here): call AFTER requireAuth/rate-limit and express.json(), e.g.
 *  `mountAnswerPolicyAdmin(app, createAnswerPolicyService(store))`. */
export function mountAnswerPolicyAdmin(app: Pick<Express, "use">, service: AnswerPolicyService): void {
  app.use(createAnswerPolicyAdminRouter(service));
}
