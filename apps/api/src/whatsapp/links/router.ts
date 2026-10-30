/**
 * WhatsApp links HTTP surface (whatsapp-multiuser W5), mounted by composition/integrations/routes.ts AFTER the shared
 * requireAuth + rate limiter, so req.auth is verified and the session guards (CSRF on every unsafe method, non-active,
 * viewer read-only) have already run on the full path. This file checks scopes, shapes strict bodies (unknown fields -> 400,
 * no tenant or owner id from a body), maps Result -> HTTP and never echoes provider text. All responses are no-store: link rows
 * are personal and /connect carries the pairing QR, a capture credential (R-13). Since W8 this file also holds the Mongo LinksStore adapter and
 * wires the link data port (moved out of service.ts, which sits at the 300-line budget).
 */
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { findUserById, isLiveLinkState, users, whatsAppLinkStores } from "@lkb/db";
import type { Db } from "mongodb";
import { actorId, isValidTenantId, requireScope } from "../../auth.js";
import type { Logger } from "../../composition/logger.js";
import { createArchiverClient } from "../archiver/client.js";
import { loadArchiverConfig } from "../archiver/config.js";
import { tryLoadNotice, type Notice } from "./notice.js";
import { createLinkDataPort } from "../review/store.js";
import { createLinksService, LiveLinkExistsError, REASON_RE, type Guard, type LinkRow, type LinksService, type LinksServiceDeps, type LinksStore, type Principal, type Result, type StudentData } from "./service.js";

const hasControl = (s: string): boolean => [...s].some(c => { const n = c.charCodeAt(0); return n < 32 || (n >= 127 && n <= 159) || n === 0x2028 || n === 0x2029; });
const USER_ID_RE = /^[A-Za-z0-9_.:@-]{1,200}$/;
export interface LinksRouterDeps { service: LinksService; notice: () => Notice | null }

/** Verified principal -> service Principal. Admin = the exact `whatsapp-admin` scope; a session without a userId acts as a key (fails closed in the service). */
export function principalOf(req: Request): Principal | null {
  const a = req.auth;
  if (!a || !isValidTenantId(a.tenantId)) return null;
  const scopes: unknown = a.scopes, has = (s: string): boolean => Array.isArray(scopes) && scopes.some(x => x === s);
  const session = a.principal === "session" && typeof a.userId === "string" && a.userId.length > 0;
  return { tenantId: a.tenantId, kind: session ? "session" : "key", userId: session ? a.userId! : null, actor: actorId(a) ?? null, link: has("whatsapp-link"), admin: has("whatsapp-admin") };
}
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
const code = (v: unknown): v is string | undefined => v === undefined || (typeof v === "string" && REASON_RE.test(v));

export function createWhatsAppLinksRouter(deps: LinksRouterDeps, log?: Pick<Logger, "warn">): Router {
  const { service } = deps, router = Router();
  router.use("/whatsapp/links", (_req, res, next) => { res.set({ "Cache-Control": "no-store", Pragma: "no-cache" }); next(); });
  const send = (res: Response, r: Result<unknown>, okStatus = 200): void => {
    if (r.ok) { res.status(okStatus).json(r.value); return; }
    if (typeof r.extra?.retryAfterSec === "number") res.set("Retry-After", String(r.extra.retryAfterSec));
    res.status(r.status).json({ error: r.error, message: r.message, ...r.extra });
  };
  const bad = (res: Response, message: string): void => { res.status(400).json({ error: "invalid_body", message }); };
  /** authorised handler: principal + :id, any thrown store error is a generic 503 (no driver text). */
  const h = (fn: (p: Principal, req: Request, res: Response) => Promise<void>): RequestHandler => (req: Request, res: Response, next: NextFunction) => {
    const p = principalOf(req);
    if (!p) { res.status(401).json({ error: "unauthorized", message: "authentication required" }); return; }
    fn(p, req, res).catch((e: unknown) => {
      log?.warn("whatsapp links request failed", { code: "links_unavailable", name: e instanceof Error ? e.name : "unknown" });
      if (!res.headersSent) res.status(503).json({ error: "links_unavailable", message: "WhatsApp links are temporarily unavailable" }); else next();
    });
  };
  const idOf = (req: Request): string => (typeof req.params.id === "string" ? req.params.id : "");
  const READ = anyScope("whatsapp-link", "whatsapp-admin"), OWNER = requireScope("whatsapp-link"), ADMIN = requireScope("whatsapp-admin");

  router.get("/whatsapp/links/notice", OWNER, h(async (_p, _req, res) => {
    const n = deps.notice();
    if (!n) { res.status(503).json({ error: "notice_unavailable", message: "the notice text is unavailable" }); return; }
    res.json({ version: n.version, text: n.text });
  }));
  router.get("/whatsapp/links", READ, h(async (p, _req, res) => { send(res, await service.list(p)); }));
  router.post("/whatsapp/links", OWNER, h(async (p, req, res) => {
    const b = strictBody(req, ["label", "noticeVersion"]);
    const label = typeof b?.label === "string" ? b.label.trim() : "";
    if (!b || label.length < 1 || label.length > 120 || hasControl(label)) { bad(res, "label is required (1-120 plain characters)"); return; }
    if (typeof b.noticeVersion !== "string" || !/^[0-9a-f]{64}$/.test(b.noticeVersion)) { bad(res, "noticeVersion is required"); return; }
    send(res, await service.request(p, { label, noticeVersion: b.noticeVersion }), 201);
  }));
  router.get("/whatsapp/links/:id", READ, h(async (p, req, res) => { send(res, await service.get(p, idOf(req))); }));
  router.get("/whatsapp/links/:id/connect", OWNER, h(async (p, req, res) => { send(res, await service.connect(p, idOf(req))); }));

  router.post("/whatsapp/links/:id/approve", ADMIN, h(async (p, req, res) => {
    const b = strictBody(req, ["studentData"]);
    if (!b || !(b.studentData === undefined || b.studentData === "yes" || b.studentData === "no" || b.studentData === "unknown")) { bad(res, "studentData must be yes, no or unknown"); return; }
    send(res, await service.approve(p, idOf(req), b.studentData === undefined ? {} : { studentData: b.studentData as StudentData }));
  }));
  for (const [verb, run] of [["reject", service.reject], ["suspend", service.suspend], ["revoke", service.revoke]] as const) {
    router.post(`/whatsapp/links/:id/${verb}`, ADMIN, h(async (p, req, res) => {
      const b = strictBody(req, ["reason"]);
      if (!b || !code(b.reason)) { bad(res, "reason must be a short lowercase code"); return; }
      send(res, await run(p, idOf(req), b.reason === undefined ? {} : { reason: b.reason }));
    }));
  }
  router.post("/whatsapp/links/:id/resume", ADMIN, h(async (p, req, res) => {
    if (!strictBody(req, [])) { bad(res, "the body must be empty"); return; }
    send(res, await service.resume(p, idOf(req)));
  }));
  router.post("/whatsapp/links/:id/bind", ADMIN, h(async (p, req, res) => {
    const b = strictBody(req, ["userId"]);
    if (!b || typeof b.userId !== "string" || !USER_ID_RE.test(b.userId)) { bad(res, "userId is required"); return; }
    send(res, await service.bind(p, idOf(req), { userId: b.userId }));
  }));
  router.post("/whatsapp/links/:id/unlink", READ, h(async (p, req, res) => { // owner (own link) or admin; the service decides
    const b = strictBody(req, ["reason"]);
    if (!b || !code(b.reason)) { bad(res, "reason must be a short lowercase code"); return; }
    send(res, await service.unlink(p, idOf(req), b.reason === undefined ? {} : { reason: b.reason }));
  }));
  return router;
}

/** Production composition: Mongo store over `db`, the W3 archiver client from env (absent -> connect answers 503), the notice file read once. */
export function buildWhatsAppLinks(env: Record<string, string | undefined>, db: Db, log: Pick<Logger, "warn" | "error">, overrides: Partial<LinksServiceDeps> = {}): LinksRouterDeps {
  let archiver: LinksServiceDeps["archiver"] = null;
  try { const cfg = loadArchiverConfig(env); archiver = cfg ? createArchiverClient(cfg) : null; } catch { log.warn("whatsapp links: archiver service API config is invalid, connect answers 503"); }
  const notice = tryLoadNotice(undefined, env);
  if (!notice) log.warn("whatsapp links: notice file unreadable, link requests answer 503");
  const service = createLinksService({
    store: createMongoLinksStore(db), archiver, data: createLinkDataPort(db), notice: () => notice, log,
    countActiveAdmins: (tenantId) => users(tenantId, db).countDocuments({ status: "active", role: "admin" }),
    userStatus: async (tenantId, userId) => { const u = await findUserById(tenantId, userId, db); return u ? { status: u.status, ...(u.role ? { role: u.role } : {}) } : null; },
    ...overrides,
  });
  return { service, notice: () => notice };
}

const isDupKey = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === 11000;
const GUARDS: Record<Guard, Record<string, unknown>> = { owner_id: { archiverOwnerId: { $type: "string" } }, activated: { activatedAt: { $type: "string" } }, needs_relink: { "health.flags": "needs-relink" }, legacy: { userId: null } };

/** Mongo LinksStore over the W1 accessors (every query is tenant-scoped by scopedCollection). The unique partial indexes are the R-2 authority. */
export function createMongoLinksStore(db: Pick<Db, "collection">): LinksStore {
  const s = whatsAppLinkStores(db);
  const get = async (t: string, id: string): Promise<LinkRow | null> => (await s.getLink(t, id)) as unknown as LinkRow | null;
  const rows = async (c: ReturnType<ReturnType<typeof s.links>["find"]>): Promise<LinkRow[]> => (await c.toArray()) as unknown as LinkRow[];
  return {
    get,
    async insert(t, row) {
      const { _id, live: _l, studentData: _s, ...rest } = row as LinkRow;
      try { return (await s.insertLink(t, { ...rest, ...(_id ? { _id } : {}) } as never)) as unknown as LinkRow; }
      catch (e) { throw isDupKey(e) ? new LiveLinkExistsError() : e; }
    },
    listForUser: (t, userId) => rows(s.links(t).find({ userId } as never).sort({ createdAt: -1, _id: -1 }).limit(50)),
    listAll: (t, limit) => rows(s.links(t).find({}).sort({ createdAt: -1, _id: -1 }).limit(limit)),
    hasBlockingLink: async (t, userId) => (await s.links(t).findOne({ userId, state: "revoked", blocksNewRequests: true } as never)) !== null,
    async transition(t, id, tr) {
      const filter: Record<string, unknown> = { _id: id, state: { $in: [...tr.from] }, ...Object.assign({}, ...(tr.require ?? []).map(g => GUARDS[g])) };
      const update: Record<string, unknown> = { $set: { ...tr.set, state: tr.to, live: isLiveLinkState(tr.to), updatedAt: new Date().toISOString() } };
      if (tr.unset?.length) update.$unset = Object.fromEntries(tr.unset.map(k => [k, ""]));
      try { if ((await s.links(t).updateOne(filter as never, update as never)).matchedCount !== 1) return null; }
      catch (e) { throw isDupKey(e) ? new LiveLinkExistsError() : e; }
      return get(t, id);
    },
    async setOwnerId(t, id, ownerId) {
      try {
        const r = await s.links(t).updateOne({ _id: id, state: { $in: ["approved", "active", "suspended"] }, archiverOwnerId: { $exists: false } } as never, { $set: { archiverOwnerId: ownerId, updatedAt: new Date().toISOString() } } as never);
        if (r.matchedCount === 1) return "set";
      } catch (e) { if (isDupKey(e)) return "conflict"; throw e; }
      const cur = await get(t, id);
      return !cur || !cur.archiverOwnerId ? "gone" : cur.archiverOwnerId === ownerId ? "same" : "conflict";
    },
    async appendEvent(t, e) { await s.events(t).insert(e as never); },
    async touch(t, id, from) { return (await s.links(t).updateOne({ _id: id, state: { $in: [...from] } } as never, { $set: { updatedAt: new Date().toISOString() } } as never)).matchedCount === 1; },
    async ownerInUseByOther(t, ownerId, exceptLinkId) { return (await s.links(t).findOne({ archiverOwnerId: ownerId, _id: { $ne: exceptLinkId } } as never)) !== null; },
  };
}
