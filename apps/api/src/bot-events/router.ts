/**
 * GET /bot-events (scope `jobs`): the bot's recent activity for the /meeting-bot page - will-join, recording, stopped-early,
 * failed and done events written by the schedule tick (packages/meeting-bot autojoin alerts). Read-only; tenant only from the
 * verified key; every row is re-projected to fixed, bounded, URL-free fields so a tampered feed file cannot leak or inject.
 * The reader is injected (apps/* may not import packages/meeting-bot); absent -> 503, fail closed.
 */
import { Router } from "express";
import { requireScope } from "../auth.js";

export const BOT_EVENT_KINDS = ["about-to-join", "capture-started", "capture-stopped-early", "capture-failed", "capture-done", "rules-degraded"] as const;
export interface BotEventRow {
  id: string; at: string; kind: (typeof BOT_EVENT_KINDS)[number]; sessionKey: string; title: string;
  startTime?: string; endTime?: string; careerGuidance?: boolean; testData?: boolean; matchedKeywords?: string[]; detail?: string; outputPath?: string;
}
export interface BotEventsDeps { list(tenantId: string, limit: number): Promise<readonly unknown[]> | readonly unknown[] }
export const unavailableBotEventsDeps: BotEventsDeps = { list() { throw new Error("Bot events unavailable"); } };

const text = (v: unknown, max: number): string => String(v ?? "").replace(/https?:\/\/\S+/gi, "[link removed]").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
const iso = (v: unknown): string | undefined => (typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : undefined);

export function projectBotEvent(raw: unknown): BotEventRow | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const at = iso(r.at);
  if (!at || !(BOT_EVENT_KINDS as readonly unknown[]).includes(r.kind) || typeof r.id !== "string") return undefined;
  return {
    id: text(r.id, 64), at, kind: r.kind as BotEventRow["kind"], sessionKey: text(r.sessionKey, 120), title: text(r.title, 200),
    ...(iso(r.startTime) ? { startTime: iso(r.startTime) } : {}), ...(iso(r.endTime) ? { endTime: iso(r.endTime) } : {}),
    ...(typeof r.careerGuidance === "boolean" ? { careerGuidance: r.careerGuidance } : {}), ...(typeof r.testData === "boolean" ? { testData: r.testData } : {}),
    ...(Array.isArray(r.matchedKeywords) ? { matchedKeywords: r.matchedKeywords.slice(0, 20).map((k) => text(k, 60)).filter(Boolean) } : {}),
    ...(r.detail ? { detail: text(r.detail, 300) } : {}), ...(r.outputPath ? { outputPath: text(r.outputPath, 260) } : {}),
  };
}

export function createBotEventsRouter(deps: BotEventsDeps): Router {
  const router = Router();
  router.get("/bot-events", requireScope("jobs"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const params = new URL(req.originalUrl, "http://localhost").searchParams, raw = params.get("limit");
    if ([...params.keys()].some((k) => k !== "limit") || params.getAll("limit").length > 1 || (raw !== null && (!/^[1-9][0-9]{0,2}$/.test(raw) || Number(raw) > 100))) {
      res.status(400).json({ error: "invalid_bot_events_query", message: "Invalid bot events query" }); return;
    }
    const limit = raw === null ? 50 : Number(raw);
    try {
      if (typeof req.auth?.tenantId !== "string" || !req.auth.tenantId.trim()) throw new Error("Missing verified tenant");
      const events = (await deps.list(req.auth.tenantId, limit)).map(projectBotEvent).filter((e): e is BotEventRow => e !== undefined).slice(0, limit);
      res.status(200).json({ events });
    } catch { res.status(503).json({ error: "bot_events_unavailable", message: "Bot events are unavailable" }); }
  });
  return router;
}
