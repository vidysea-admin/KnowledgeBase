import { Router } from "express";
import { isValidTenantId, requireScope } from "../auth.js";
import type { KnowledgeCatalog } from "./catalog-store.js";
export function createKnowledgeCatalogRouter(catalog?: KnowledgeCatalog): Router {
  const router = Router();
  router.use("/knowledge", (req, res, next) => { res.set("Cache-Control", "private, no-store"); if (!isValidTenantId(req.auth?.tenantId)) { res.status(401).json({ error: "unauthorized" }); return; } next(); });
  router.get("/knowledge/topics", requireScope("sessions"), async (req, res) => {
    if (!catalog) { res.status(503).json({ error: "catalog_unavailable" }); return; }
    try { const rows = await catalog.topics(req.auth!.tenantId); res.json({ topics: rows.slice(0, 100), truncated: rows.length > 100 }); } catch { res.status(503).json({ error: "catalog_unavailable" }); }
  });
  router.get("/knowledge/topics/:id", requireScope("sessions"), async (req, res) => {
    if (!catalog) { res.status(503).json({ error: "catalog_unavailable" }); return; }
    try { const data = await catalog.topic(req.auth!.tenantId, req.params.id as string); if (!data) { res.status(404).json({ error: "not_found" }); return; } res.json(data); } catch { res.status(503).json({ error: "catalog_unavailable" }); }
  });
  router.get("/knowledge/resources", requireScope("sessions"), requireScope("sources"), async (req, res) => {
    if (!catalog) { res.status(503).json({ error: "catalog_unavailable" }); return; }
    try { res.json(await catalog.resources(req.auth!.tenantId)); } catch { res.status(503).json({ error: "catalog_unavailable" }); }
  });
  return router;
}
