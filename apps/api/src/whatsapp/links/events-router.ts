/**
 * WhatsApp event feed (whatsapp-multiuser W12; spec R-38..R-41, docs/whatsapp/events.md). The ONLY extension surface: one read-only GET,
 * cursor-paged, at-least-once, `whatsapp-admin` only (an admin session or an API key holding the scope), tenant from req.auth only.
 * No push, no webhook, no consumer registry, no outbound call (D-211). Also holds the best-effort event sink the writers share:
 * state is authoritative, so a failed event write is logged by code and never fails the transition that already happened.
 */
import { Router, type Request, type Response } from "express";
import { EVENT_DATA_KEYS, whatsAppLinkStores, type NewWhatsAppEvent } from "@lkb/db";
import type { WhatsappEvents } from "@lkb/core";
import type { Db } from "mongodb";
import { isValidTenantId, requireScope } from "../../auth.js";
import type { Logger } from "../../composition/logger.js";

export interface EventsFeed { list(tenantId: string, opts: { afterId?: string; limit?: number }): Promise<WhatsappEvents[]> }
export interface EventsRouterDeps { feed: EventsFeed }
/** Appends one event for a tenant (the Mongo accessor validates the closed payload, R-39). */
export type EventSink = (tenantId: string, event: NewWhatsAppEvent) => Promise<void>;

const CURSOR_RE = /^[0-9a-f]{24}$/;
const LIMIT_RE = /^[0-9]{1,3}$/;
const UNKNOWN_CURSOR = /unknown cursor/;

/** Best-effort write: never throws; a failure is logged by code and event type only. */
export async function emitBestEffort(sink: EventSink | undefined, tenantId: string, event: NewWhatsAppEvent, log?: Pick<Logger, "error">): Promise<void> {
  if (!sink) return;
  try { await sink(tenantId, event); }
  catch { log?.error("whatsapp event write failed", { code: "event_write_failed", eventType: event.eventType }); }
}

/** Allowlist projection (never a spread of the stored row): no tenant id, no unknown field, only contract data keys. */
export function toEventView(row: WhatsappEvents): Record<string, unknown> {
  const out: Record<string, unknown> = { id: row._id, eventType: row.eventType, at: row.at, actorKind: row.actorKind };
  if (row.linkId !== undefined) out.linkId = row.linkId;
  if (row.actorId !== undefined) out.actorId = row.actorId;
  const data = (row.data ?? {}) as Record<string, unknown>;
  out.data = Object.fromEntries((EVENT_DATA_KEYS as readonly string[]).filter(k => data[k] !== undefined).map(k => [k, data[k]]));
  return out;
}

export function createWhatsAppEventsRouter(deps: EventsRouterDeps, log?: Pick<Logger, "warn">): Router {
  const router = Router();
  router.use("/whatsapp/events", (_req, res, next) => { res.set({ "Cache-Control": "no-store", Pragma: "no-cache" }); next(); });
  router.get("/whatsapp/events", requireScope("whatsapp-admin"), (req: Request, res: Response) => {
    const tenantId = req.auth?.tenantId;
    if (!isValidTenantId(tenantId)) { res.status(401).json({ error: "unauthorized", message: "authentication required" }); return; }
    const after: unknown = req.query.after, limit: unknown = req.query.limit;
    if (after !== undefined && !(typeof after === "string" && CURSOR_RE.test(after))) { res.status(400).json({ error: "invalid_cursor", message: "after must be an event id returned by this feed" }); return; }
    if (limit !== undefined && !(typeof limit === "string" && LIMIT_RE.test(limit) && Number(limit) >= 1 && Number(limit) <= 500)) { res.status(400).json({ error: "invalid_limit", message: "limit must be an integer from 1 to 500" }); return; }
    deps.feed.list(tenantId, { ...(after !== undefined ? { afterId: after as string } : {}), limit: limit === undefined ? 100 : Number(limit) }).then(rows => {
      const events = rows.map(toEventView);
      res.status(200).json({ events, nextCursor: rows.length ? rows[rows.length - 1]!._id : null });
    }).catch((e: unknown) => {
      if (e instanceof Error && UNKNOWN_CURSOR.test(e.message)) { res.status(400).json({ error: "unknown_cursor", message: "that cursor is not an event of this tenant" }); return; }
      log?.warn("whatsapp events request failed", { code: "events_unavailable" });
      res.status(503).json({ error: "events_unavailable", message: "the event feed is temporarily unavailable" });
    });
  });
  return router;
}

/** Production composition: the W1 append-only accessor (read side) over `db`. */
export function buildWhatsAppEvents(db: Pick<Db, "collection">): EventsRouterDeps {
  const stores = whatsAppLinkStores(db);
  return { feed: { list: (tenantId, opts) => stores.events(tenantId).list(opts) } };
}
