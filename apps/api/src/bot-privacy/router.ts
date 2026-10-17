import { Router } from "express";
import { isValidTenantId, requireScope } from "../auth.js";
import type { BotPrivacyCaptureView, BotPrivacyDeps } from "./types.js";

const SESSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/;
const GENERATION = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const unavailable = {error: "bot_privacy_unavailable", message: "The recorder could not confirm this privacy request. Privacy was not confirmed; stop speaking privately until the recorder confirms it."};
function project(value: unknown, tenantId: string): Omit<BotPrivacyCaptureView, "tenantId"> {
  const row = value as BotPrivacyCaptureView;
  if (!row || typeof row !== "object" || row.tenantId !== tenantId || !SESSION.test(row.sessionId ?? "") || !GENERATION.test(row.generation ?? "") ||
    !["joining", "recording", "interrupted"].includes(row.status) || !["public", "private", "conservative", "unavailable"].includes(row.privacy)) {
    throw new Error("Invalid bot privacy status");
  }
  return {sessionId: row.sessionId, generation: row.generation, status: row.status, privacy: row.privacy};
}
/** Mount after real requireAuth; all identity comes from its verified req.auth, never the body. */
export function createBotPrivacyRouter(deps?: BotPrivacyDeps): Router {
  const router = Router();
  router.use((req, res, next) => {
    if (!req.auth || !isValidTenantId(req.auth.tenantId)) {res.status(401).json({error: "unauthorized"}); return;}
    next();
  });
  router.get("/meeting-bot/privacy", requireScope("jobs"), async (req, res) => {
    if (Object.keys(req.query).length) {res.status(400).json({error: "bad_request"}); return;}
    if (!deps) {res.status(503).json(unavailable); return;}
    try {
      const rows = await deps.list(req.auth!.tenantId);
      if (!Array.isArray(rows) || rows.length > 100) throw new Error("Invalid bot privacy list");
      const captures = rows.map(row => project(row, req.auth!.tenantId));
      if (new Set(captures.map(row => row.sessionId)).size !== captures.length) throw new Error("Duplicate capture privacy identities");
      res.setHeader("Cache-Control", "no-store"); res.json({captures});
    } catch {res.status(503).json({error: "bot_privacy_unavailable", message: "Live recorder privacy status is unavailable."});}
  });
  router.post("/meeting-bot/privacy/:sessionId", requireScope("send-now"), async (req, res) => {
    const {sessionId} = req.params, value: unknown = req.body;
    if (typeof sessionId !== "string" || !SESSION.test(sessionId) || !value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== 2 || Object.keys(value).some(key => !["generation", "action"].includes(key))) {
      res.status(400).json({error: "bad_request"}); return;
    }
    const {generation, action} = value as Record<string, unknown>;
    if (typeof generation !== "string" || !GENERATION.test(generation) || (action !== "private-start" && action !== "private-end")) {
      res.status(400).json({error: "bad_request"}); return;
    }
    if (!deps) {res.status(503).json(unavailable); return;}
    try {
      const result = await deps.set(req.auth!.tenantId, sessionId, generation, action);
      res.setHeader("Cache-Control", "no-store");
      if (result === "stale") {res.status(409).json({error: "bot_privacy_stale", message: "The recorder changed. Refresh its status before requesting privacy."}); return;}
      if (result !== "accepted") {res.status(503).json(unavailable); return;}
      res.json({status: "accepted", action});
    } catch {res.status(503).json(unavailable);}
  });
  return router;
}
