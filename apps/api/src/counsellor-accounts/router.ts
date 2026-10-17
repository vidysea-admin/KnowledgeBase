import { Router, type Request, type Response } from "express";
import { requireAuth, type ApiKeyStore } from "../auth.js";
import { HostingError, hostingFields, hostingId, hostingObject, type HostingPrincipal, type HostingRole } from "../hosting/types.js";
import { CounsellorAccountsService } from "./service.js";

function principal(req: Request): HostingPrincipal {
  const auth = req.auth as (typeof req.auth & { keyId?: unknown });
  if (!auth || typeof auth.keyId !== "string") throw new HostingError("verified_identity_unavailable", 503);
  return { tenantId: auth.tenantId, keyId: hostingId(auth.keyId, "actor"), scopes: auth.scopes };
}
function handle(work: (req: Request) => Promise<unknown>, status = 200) {
  return async (req: Request, res: Response) => {
    try { res.status(status).json(await work(req)); }
    catch (error) {
      const known = error instanceof HostingError;
      res.status(known ? error.status : 503).json({ error: known ? error.code : "accounts_unavailable", message: known ? error.code : "Accounts are unavailable; no success was confirmed." });
    }
  };
}
export function createCounsellorAccountRouter(options: { service: CounsellorAccountsService; keys: ApiKeyStore }): Router {
  const router = Router(), s = options.service;
  router.use(requireAuth(options.keys));
  router.get("/", handle(async req => ({ accounts: await s.list(principal(req)) })));
  router.get("/identities", handle(async req => ({ keyIds: await s.identities(principal(req)) })));
  router.get("/audit", handle(async req => ({ audit: await s.audit(principal(req)), grantAuditPath: "/hosting/audit" })));
  router.get("/:id", handle(async req => ({ account: await s.get(principal(req), req.params.id as string) })));
  router.post("/", handle(async req => {
    const body = hostingObject(req.body); hostingFields(body, ["keyId", "displayName", "email"]);
    return { account: await s.create(principal(req), hostingId(body.keyId, "key"), { displayName: body.displayName, email: body.email }) };
  }, 201));
  router.put("/:id", handle(async req => {
    const body = hostingObject(req.body); hostingFields(body, ["expectedRevision", "displayName", "email"]);
    return { account: await s.update(principal(req), req.params.id as string, body.expectedRevision as number, { displayName: body.displayName, email: body.email }) };
  }));
  for (const action of ["activate", "deactivate", "delete"] as const) {
    router.post(`/:id/${action}`, handle(async req => {
      const body = hostingObject(req.body); hostingFields(body, ["expectedRevision"]);
      const p = principal(req), id = req.params.id as string, rev = body.expectedRevision as number;
      return { account: action === "activate" ? await s.activate(p, id, rev) : await s.deactivate(p, id, rev, action === "delete") };
    }));
  }
  router.put("/:id/role", handle(async req => {
    const body = hostingObject(req.body); hostingFields(body, ["expectedRevision", "role"]);
    return s.grant(principal(req), req.params.id as string, body.expectedRevision as number, body.role as Exclude<HostingRole, "owner"> | null);
  }));
  return router;
}
