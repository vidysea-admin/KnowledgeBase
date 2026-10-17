import { Router } from "express";
import { isValidTenantId, requireScope } from "../auth.js";
import { parseNativeSourceLocator, type NativeEvidenceResolver } from "./resolver.js";

/** Mount behind requireAuth. No caller-supplied tenant is accepted. Central composition owns mounting. */
export function createNativeEvidenceRouter(resolver: NativeEvidenceResolver): Router {
  const router = Router();
  router.post("/citations/native/resolve", requireScope("citations"), async (req, res) => {
    if (!req.auth || !isValidTenantId(req.auth.tenantId)) { res.status(401).json({ error: "unauthorized" }); return; }
    const body: unknown = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "sourceLocator")) {
      res.status(400).json({ error: "invalid_locator" }); return;
    }
    const locator = parseNativeSourceLocator((body as { sourceLocator: unknown }).sourceLocator);
    if (!locator) { res.status(400).json({ error: "invalid_locator" }); return; }
    try {
      const evidence = await resolver.resolve(req.auth.tenantId, locator);
      if (!evidence) { res.status(404).json({ error: "evidence_unavailable" }); return; }
      res.status(200).json({ evidence });
    } catch { res.status(503).json({ error: "evidence_unavailable" }); }
  });
  return router;
}
