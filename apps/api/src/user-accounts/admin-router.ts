/**
 * apps/api/src/user-accounts/admin-router.ts -- unit `ua-admin-api` (A6), spec UA-5..UA-8 / UA-19 / UA-25 / UA-28.
 *
 * `createAdminRouter(deps)`: the authenticated `/admin/*` routes, mounted by `mountUserAccounts` AFTER the shared
 * `requireAuth(keyStore, session)`, so `req.auth` is already a verified principal and the session guards (CSRF,
 * non-active, viewer read-only) have already run on the FULL path.
 *  - Reads (`GET /users`, `/users/:id`, `/audit`): scope `user-admin`. Held by an admin session and, by design (UA-28),
 *    by an API key that was minted with it.
 *  - Mutations (`POST /users/:id/{approve,reject,role,disable,enable,revoke-sessions,unlock,issue-link}`): an ACTIVE
 *    ADMIN SESSION only. An API key never mutates users, even one holding `user-admin`; the service additionally re-reads the
 *    acting admin from the database.
 *  - Bodies are strict: unknown fields are 400 (no mass assignment of `role`/`status`/`tenantId`). The tenant is always the
 *    principal's. Responses are `Cache-Control: no-store` (issue-link carries a credential).
 */
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { requireScope } from "../auth.js";
import { createAdminService, ipPrefixOf, USER_STATUS_VALUES, LIST_LIMIT_MAX, type Actor, type AdminService, type AdminServiceDeps, type Fail, type Result, type UserCursor, type UserStatus } from "./admin-service.js";
import { isRole, type Role } from "./roles.js";

export type AdminRouterDeps = AdminServiceDeps | { service: AdminService };

const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
const CURSOR_SHAPE = /^[A-Za-z0-9_-]{1,512}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

const send = (res: Response, f: Fail): void => { res.status(f.status).json({ error: f.error, message: f.message }); };
const invalidBody = (res: Response, message: string): void => { res.status(400).json({ error: "invalid_body", message }); };

/** Strict object: a plain object whose keys are all in `allowed`. Missing body = {}. */
function strictBody(req: Request, allowed: readonly string[]): Record<string, unknown> | string {
  const b: unknown = req.body === undefined ? {} : req.body;
  if (typeof b !== "object" || b === null || Array.isArray(b)) return "the body must be a JSON object";
  for (const k of Object.keys(b)) if (!allowed.includes(k)) return "the body has an unknown field";
  return b as Record<string, unknown>;
}

function encodeCursor(c: unknown): string { return Buffer.from(JSON.stringify(c), "utf8").toString("base64url"); }
function decodeCursor(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || !CURSOR_SHAPE.test(raw)) return null;
  try { const v: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")); return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null; } catch { return null; }
}
const isoString = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
const idString = (v: unknown): v is string => typeof v === "string" && ID_SHAPE.test(v);

function limitOf(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= LIST_LIMIT_MAX ? n : null;
}

/** Mutations: only an active admin SESSION holding `user-admin`. A key (any scopes), a member, a viewer or a pending user never gets here. */
export const requireAdminSession: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const a = req.auth;
  if (a?.principal === "session" && typeof a.userId === "string" && a.userId.length > 0 && a.userRole === "admin" && a.notActive !== true
    && Array.isArray(a.scopes) && a.scopes.includes("user-admin")) { next(); return; }
  res.status(403).json({ error: "admin_session_required", message: "this action needs a signed-in admin" });
};

export function createAdminRouter(deps: AdminRouterDeps): Router {
  const service: AdminService = "service" in deps ? deps.service : createAdminService(deps);
  const log = "service" in deps ? undefined : deps.log;
  const router = Router();
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  const reply = (res: Response, r: Result<unknown>): void => { if (r.ok) res.json(r.value); else send(res, r); };
  /** Async handler wrapper: a store/db failure is a generic 503, never a stack and never "treat as ok". */
  const h = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => {
    fn(req, res).catch((err: unknown) => {
      log?.warn("admin request failed", { error: err instanceof Error ? err.name : "unknown", code: (err as { code?: unknown } | null)?.code }); // name + code only: driver messages can echo keys such as emails
      if (!res.headersSent) res.status(503).json({ error: "admin_unavailable", message: "the user store is temporarily unavailable" }); else next(); });
  };
  const actorOf = (req: Request): Actor => {
    const a = req.auth!;
    const ip = ipPrefixOf(req.ip);
    return { tenantId: a.tenantId, userId: a.userId!, ...(ip ? { ipPrefix: ip } : {}) };
  };
  const idOf = (req: Request): string | null => { const id = req.params.id; return typeof id === "string" && ID_SHAPE.test(id) ? id : null; };
  const notFound = (res: Response): void => send(res, { ok: false, status: 404, error: "not_found", message: "no such user" });

  router.get("/users", requireScope("user-admin"), h(async (req, res) => {
    const { status, limit, cursor, ...rest } = req.query;
    if (Object.keys(rest).length > 0) { res.status(400).json({ error: "invalid_query", message: "unknown query parameter" }); return; }
    if (status !== undefined && !(typeof status === "string" && (USER_STATUS_VALUES as readonly string[]).includes(status))) { res.status(400).json({ error: "invalid_query", message: "unknown status" }); return; }
    const lim = limitOf(limit);
    if (lim === null) { res.status(400).json({ error: "invalid_query", message: "invalid limit" }); return; }
    let after: UserCursor | undefined;
    if (cursor !== undefined) {
      const c = decodeCursor(cursor);
      if (!c || !isoString(c.createdAt) || !idString(c.id)) { res.status(400).json({ error: "invalid_query", message: "invalid cursor" }); return; }
      after = { createdAt: c.createdAt, id: c.id };
    }
    const r = await service.listUsers(req.auth!.tenantId, { ...(status ? { status: status as UserStatus } : {}), ...(lim !== undefined ? { limit: lim } : {}), ...(after ? { after } : {}) });
    if (!r.ok) { send(res, r); return; }
    res.json({ users: r.value.users, next: r.value.next ? encodeCursor(r.value.next) : null, pendingCount: r.value.pendingCount });
  }));

  router.get("/users/:id", requireScope("user-admin"), h(async (req, res) => {
    const id = idOf(req);
    if (id === null) { notFound(res); return; }
    reply(res, await service.getUser(req.auth!.tenantId, id));
  }));

  router.get("/audit", requireScope("user-admin"), h(async (req, res) => {
    const { limit, cursor, targetUserId, ...rest } = req.query;
    if (Object.keys(rest).length > 0) { res.status(400).json({ error: "invalid_query", message: "unknown query parameter" }); return; }
    const lim = limitOf(limit);
    if (lim === null) { res.status(400).json({ error: "invalid_query", message: "invalid limit" }); return; }
    if (targetUserId !== undefined && !idString(targetUserId)) { res.status(400).json({ error: "invalid_query", message: "invalid targetUserId" }); return; }
    let after: { at: string; id: string } | undefined;
    if (cursor !== undefined) {
      const c = decodeCursor(cursor);
      if (!c || !isoString(c.at) || !idString(c.id)) { res.status(400).json({ error: "invalid_query", message: "invalid cursor" }); return; }
      after = { at: c.at, id: c.id };
    }
    const r = await service.audit(req.auth!.tenantId, { ...(lim !== undefined ? { limit: lim } : {}), ...(after ? { after } : {}), ...(typeof targetUserId === "string" ? { targetUserId } : {}) });
    if (!r.ok) { send(res, r); return; }
    res.json({ events: r.value.events, next: r.value.next ? encodeCursor(r.value.next) : null });
  }));

  /** One POST route: authorise (session admin) -> id shape -> strict body -> service. `parse` returns the service input or a message. */
  function post<I>(action: string, allowed: readonly string[], parse: (b: Record<string, unknown>) => I | string, run: (actor: Actor, id: string, input: I) => Promise<Result<unknown>>): void {
    router.post(`/users/:id/${action}`, requireAdminSession, h(async (req, res) => {
      const id = idOf(req);
      if (id === null) { notFound(res); return; }
      const body = strictBody(req, allowed);
      if (typeof body === "string") { invalidBody(res, body); return; }
      const input = parse(body);
      if (typeof input === "string") { invalidBody(res, input); return; }
      reply(res, await run(actorOf(req), id, input));
    }));
  }
  const none = (): true => true;
  const roleOf = (b: Record<string, unknown>): { role: Role } | string => (isRole(b.role) ? { role: b.role } : "role is required and must be admin, member or viewer");

  post("approve", ["role"], roleOf, (a, id, i) => service.approve(a, id, i));
  post("reject", ["reason"], (b) => (b.reason === undefined || (typeof b.reason === "string" && b.reason.length <= 200 && !CONTROL.test(b.reason)) ? true : "reason must be a short plain string"), (a, id) => service.reject(a, id));
  post("role", ["role"], roleOf, (a, id, i) => service.setRole(a, id, i));
  post("disable", [], none, (a, id) => service.disable(a, id));
  post("enable", [], none, (a, id) => service.enable(a, id));
  post("revoke-sessions", [], none, (a, id) => service.revokeSessions(a, id));
  post("unlock", [], none, (a, id) => service.unlock(a, id));
  post("issue-link", ["purpose"], (b): { purpose: "verify_email" | "password_reset" } | string => (b.purpose === "verify_email" || b.purpose === "password_reset" ? { purpose: b.purpose } : "purpose must be verify_email or password_reset"), (a, id, i) => service.issueLink(a, id, i));

  return router;
}
