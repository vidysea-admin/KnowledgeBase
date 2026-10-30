/**
 * WhatsApp selection routes (whatsapp-multiuser W6; spec R-17..R-21), mounted by composition/integrations/routes.ts AFTER the
 * shared requireAuth + rate limiter, so req.auth is verified and the session guards (CSRF on every unsafe method, non-active,
 * viewer read-only) have already run on the full path. This file checks scopes, shapes strict bodies (unknown fields -> 400, no
 * tenant or owner id from a body), maps Result -> HTTP and never echoes archiver text. All responses are no-store.
 *
 *   GET /whatsapp/links/:id/groups                 owner (active link): every group; admin: marked groups only
 *   PUT /whatsapp/links/:id/groups/:jid            owner only  {marked, trackAllSenders?}
 *   GET /whatsapp/links/:id/groups/:jid/people     owner only
 *   PUT /whatsapp/links/:id/groups/:jid/people     owner only  {personIds}
 *
 * Without deps (the composition has not wired the archiver client yet) every route answers a stable 503 `selection_unavailable`
 * after the scope check; it never falls through to a raw 404 and never reaches an archiver.
 */
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { whatsAppLinkStores } from "@lkb/db";
import type { Db } from "mongodb";
import { requireScope } from "../../auth.js";
import type { Logger } from "../../composition/logger.js";
import { createArchiverClient } from "../archiver/client.js";
import { loadArchiverConfig } from "../archiver/config.js";
import { principalOf } from "../links/router.js";
import { createMongoLinksStore, type Principal, type Result } from "../links/service.js";
import { createSelectionService, type SelectionDeps, type SelectionService } from "./service.js";

export interface SelectionRouterDeps { service: SelectionService }

const anyScope = (...scopes: string[]): RequestHandler => (req, res, next) => {
  const held: unknown = req.auth?.scopes;
  if (Array.isArray(held) && scopes.some(s => held.some(x => x === s))) { next(); return; }
  res.status(403).json({ error: "forbidden", message: "this key is missing a required scope" });
};
function strictBody(req: Request, allowed: readonly string[]): Record<string, unknown> | null {
  const b: unknown = req.body === undefined ? {} : req.body;
  if (typeof b !== "object" || b === null || Array.isArray(b) || Object.keys(b).some(k => !allowed.includes(k))) return null;
  return b as Record<string, unknown>;
}
const param = (req: Request, name: string): string => { const v: unknown = req.params[name]; return typeof v === "string" ? v : ""; };

export function createWhatsAppSelectionRouter(deps?: SelectionRouterDeps, log?: Pick<Logger, "warn">): Router {
  const router = Router();
  const PREFIX = "/whatsapp/links/:id/groups";
  const READ = anyScope("whatsapp-link", "whatsapp-admin"), OWNER = requireScope("whatsapp-link");

  if (!deps) return router; // not wired: an empty router (W5 pins this); no route exists, so no archiver can be reached
  router.use(PREFIX, (_req, res, next) => { res.set({ "Cache-Control": "no-store", Pragma: "no-cache" }); next(); });
  const { service } = deps;
  const send = (res: Response, r: Result<unknown>): void => {
    if (r.ok) { res.status(200).json(r.value); return; }
    if (typeof r.extra?.retryAfterSec === "number") res.set("Retry-After", String(r.extra.retryAfterSec));
    res.status(r.status).json({ error: r.error, message: r.message, ...r.extra });
  };
  const bad = (res: Response, message: string): void => { res.status(400).json({ error: "invalid_body", message }); };
  /** authorised handler: principal first, any thrown error is a generic 503 (no driver or upstream text). */
  const h = (fn: (p: Principal, req: Request, res: Response) => Promise<void>): RequestHandler => (req: Request, res: Response, next: NextFunction) => {
    const p = principalOf(req);
    if (!p) { res.status(401).json({ error: "unauthorized", message: "authentication required" }); return; }
    fn(p, req, res).catch((e: unknown) => {
      log?.warn("whatsapp selection request failed", { code: "selection_unavailable", name: e instanceof Error ? e.name : "unknown" });
      if (!res.headersSent) res.status(503).json({ error: "selection_unavailable", message: "WhatsApp selection is temporarily unavailable" }); else next();
    });
  };

  router.get(PREFIX, READ, h(async (p, req, res) => { send(res, await service.listGroups(p, param(req, "id"))); }));
  router.put(`${PREFIX}/:jid`, OWNER, h(async (p, req, res) => {
    const b = strictBody(req, ["marked", "trackAllSenders"]);
    if (!b || typeof b.marked !== "boolean" || !(b.trackAllSenders === undefined || typeof b.trackAllSenders === "boolean")) { bad(res, "marked is required (boolean); trackAllSenders is an optional boolean"); return; }
    send(res, await service.setGroup(p, param(req, "id"), param(req, "jid"), { marked: b.marked, ...(b.trackAllSenders === undefined ? {} : { trackAllSenders: b.trackAllSenders }) }));
  }));
  router.get(`${PREFIX}/:jid/people`, OWNER, h(async (p, req, res) => { send(res, await service.listPeople(p, param(req, "id"), param(req, "jid"))); }));
  router.put(`${PREFIX}/:jid/people`, OWNER, h(async (p, req, res) => {
    const b = strictBody(req, ["personIds"]);
    if (!b || !Array.isArray(b.personIds)) { bad(res, "personIds is required (array of person ids)"); return; }
    send(res, await service.setPeople(p, param(req, "id"), param(req, "jid"), { personIds: b.personIds as string[] }));
  }));
  return router;
}

/**
 * Production composition: the link lookup is the W5 Mongo store used READ-ONLY (`get` only), the archiver client comes from env
 * (absent or invalid -> the service answers 503), the only KB write is the event insert. The composition passes the result to
 * `createWhatsAppSelectionRouter(...)` (see the W6 manifest open points: routes.ts is not W6-owned).
 */
export function buildWhatsAppSelection(env: Record<string, string | undefined>, db: Db, log: Pick<Logger, "warn" | "error">, overrides: Partial<SelectionDeps> = {}): SelectionRouterDeps {
  let archiver: SelectionDeps["archiver"] = null;
  try { const cfg = loadArchiverConfig(env); archiver = cfg ? createArchiverClient(cfg) : null; } catch { log.warn("whatsapp selection: archiver service API config is invalid, selection answers 503"); }
  const links = createMongoLinksStore(db), stores = whatsAppLinkStores(db);
  const service = createSelectionService({
    links: { get: (t, id) => links.get(t, id) }, archiver, log,
    appendEvent: async (t, e) => { await stores.events(t).insert(e); },
    ...overrides,
  });
  return { service };
}
