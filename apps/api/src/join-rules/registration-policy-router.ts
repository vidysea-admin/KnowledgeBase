import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
export interface RegistrationPolicyDeps {
  load(tenantId: string): unknown | Promise<unknown>;
  mutate(tenantId: string, expected: string, action: "replace" | "approve" | "revoke", policy?: unknown): unknown | Promise<unknown>;
}
/** Auth middleware surrounds this router. No caller tenant or approval boolean is accepted. */
export function createRegistrationPolicyRouter(deps?: RegistrationPolicyDeps): Router {
  const router = Router(), base = "/calendar/join-rules/registration-policy";
  const error = (res: Response, status: number, code: string) => res.status(status).json({error: code});
  async function perform(req: Request, res: Response, action?: "replace" | "approve" | "revoke") {
    if (!deps) { error(res, 503, "registration_policy_unavailable"); return; }
    try {
      if (!action) { res.json(await deps.load(req.auth!.tenantId)); return; }
      const body: unknown = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) { error(res, 400, "invalid_registration_policy_request"); return; }
      const b = body as Record<string, unknown>, allowed = action === "replace" ? ["expectedRevision", "policy"] : ["expectedRevision"];
      if (Object.keys(b).some(k => !allowed.includes(k)) || typeof b.expectedRevision !== "string" ||
          !/^(absent|[0-9a-f]{64})$/.test(b.expectedRevision)) { error(res, 400, "invalid_registration_policy_request"); return; }
      res.json(await deps.mutate(req.auth!.tenantId, b.expectedRevision, action, b.policy));
    } catch (e) {
      const code = (e as {code?: unknown}).code;
      error(res, code === "invalid" ? 400 : code === "conflict" ? 412 : 503,
        code === "conflict" ? "registration_policy_changed" : code === "invalid" ? "invalid_registration_policy" : "registration_policy_unavailable");
    }
  }
  router.get(base, requireScope("join-rules"), (req, res) => void perform(req, res));
  router.put(base, requireScope("join-rules"), (req, res) => void perform(req, res, "replace"));
  router.post(`${base}/approve`, requireScope("join-rules"), (req, res) => void perform(req, res, "approve"));
  router.post(`${base}/revoke`, requireScope("join-rules"), (req, res) => void perform(req, res, "revoke"));
  return router;
}
