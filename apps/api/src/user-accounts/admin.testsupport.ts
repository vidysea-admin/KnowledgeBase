/** Test doubles for the admin API (unit A6): an in-memory AdminStore with Mongo's CAS semantics sharing the user list with the session lookup, and a rig that mounts createAdminRouter through the REAL createServer the way mountUserAccounts mounts /admin. No real-Mongo claim here (see admin.mongo.test.ts). */
import { createHash, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { AuthEvents, Users } from "@lkb/core";
import { buildAuthEvent, type TokenInput } from "@lkb/db";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import type { VerifiedKey } from "../auth.js";
import { createServer } from "../server.js";
import { createAdminRouter } from "./admin-router.js";
import { createAdminService, type AdminStore, type AdminServiceDeps, type UserPatch } from "./admin-service.js";
import { COOKIE_NAME_SECURE } from "./cookie.js";
import { csrfTokenFor } from "./csrf.js";
import { createSessionAuth } from "./principal.js";
import { createSessionService } from "./sessions.js";
import { fakeClock, memorySessionStore, memoryUsers, user } from "./sessions.testsupport.js";

export const ORIGIN = "https://kb.example.org";
export const SECRET = "k".repeat(48);
export const subjectHashFor = (tenantId: string, email: string): string => createHash("sha256").update(`test-salt:${tenantId}:${email}`).digest("hex");

export interface MemoryAdminState {
  events: Array<AuthEvents & { tenantId: string }>;
  tokens: Array<{ tenantId: string; userId: string; purpose: string; tokenHash: string; usedAt?: string; issuedVia?: string; issuedBy?: string; expiresAt: string }>;
  throttles: Array<{ tenantId: string; subjectHash: string }>;
}

export function memoryAdminStore(list: Users[], sessions: ReturnType<typeof memorySessionStore>, state: MemoryAdminState): AdminStore {
  const scoped = (t: string) => list.filter((u) => u.tenantId === t);
  return {
    async list(t, q) {
      let rows = scoped(t).filter((u) => (q.status === undefined ? u.status !== "unverified" : u.status === q.status && (u.status !== "unverified" || u.createdAt >= q.unverifiedNotBefore)));
      rows = rows.sort((a, b) => (a.createdAt === b.createdAt ? a._id.localeCompare(b._id) : a.createdAt.localeCompare(b.createdAt)));
      if (q.after) rows = rows.filter((u) => u.createdAt > q.after!.createdAt || (u.createdAt === q.after!.createdAt && u._id > q.after!.id));
      return structuredClone(rows.slice(0, q.limit));
    },
    async get(t, id) { const u = scoped(t).find((x) => x._id === id); return u ? structuredClone(u) : null; },
    async countByStatus(t, status) { return scoped(t).filter((u) => u.status === status).length; },
    async countActiveAdmins(t) { return scoped(t).filter((u) => u.status === "active" && u.role === "admin").length; },
    async cas(t, id, expect, patch: UserPatch) {
      const u = scoped(t).find((x) => x._id === id);
      if (!u || u.status !== expect.status || (expect.role !== undefined && u.role !== expect.role)) return false;
      Object.assign(u, patch);
      return true;
    },
    async revokeSessions(t, userId, reason, now) { return sessions.store.revokeAllForUser(t, userId, reason, undefined, now); },
    async activeSessionCount(t, userId) { return [...sessions.rows.values()].filter((r) => r.tenantId === t && r.userId === userId && !r.revokedAt).length; },
    async supersedeTokens(t, userId, purpose, now) { let n = 0; for (const k of state.tokens) if (k.tenantId === t && k.userId === userId && k.purpose === purpose && !k.usedAt) { k.usedAt = now.toISOString(); n++; } return n; },
    async insertToken(t, input: TokenInput, now) {
      const expiresAt = new Date(now.getTime() + (input.purpose === "verify_email" ? 86_400_000 : 3_600_000)).toISOString();
      state.tokens.push({ tenantId: t, userId: input.userId, purpose: input.purpose, tokenHash: input.tokenHash, ...(input.issuedVia ? { issuedVia: input.issuedVia } : {}), ...(input.issuedBy ? { issuedBy: input.issuedBy } : {}), expiresAt });
      return { expiresAt };
    },
    async clearThrottle(t, h) { const n = state.throttles.length; state.throttles = state.throttles.filter((x) => !(x.tenantId === t && x.subjectHash === h)); return state.throttles.length < n; },
    async audit(t, event, now) { state.events.push({ ...buildAuthEvent(event, now, randomUUID()), tenantId: t }); }, // the real closed-vocabulary builder: a bad event throws here too
    async listAudit(t, opts) {
      let rows = state.events.filter((e) => e.tenantId === t && (opts.targetUserId === undefined || e.targetUserId === opts.targetUserId)).sort((a, b) => (a.at === b.at ? b._id.localeCompare(a._id) : b.at.localeCompare(a.at)));
      if (opts.after) rows = rows.filter((e) => e.at < opts.after!.at || (e.at === opts.after!.at && e._id < opts.after!.id));
      const page = rows.slice(0, opts.limit);
      return { rows: structuredClone(page) as AuthEvents[], next: rows.length > opts.limit ? { at: page[page.length - 1]!.at, id: page[page.length - 1]!._id } : null };
    },
  };
}

export type Who = { user: string; csrf?: string | null; origin?: string | null } | { key: string } | null;

export async function adminRig(opts: { users: Users[]; keys?: Record<string, VerifiedKey>; service?: Partial<AdminServiceDeps>; storeWrap?: (s: AdminStore) => AdminStore }) {
  const clock = fakeClock(), mem = memorySessionStore(), lookup = memoryUsers(opts.users);
  const state: MemoryAdminState = { events: [], tokens: [], throttles: [] };
  const baseStore = memoryAdminStore(opts.users, mem, state);
  const store = opts.storeWrap ? opts.storeWrap(baseStore) : baseStore;
  const sessions = createSessionService({ store: mem.store, users: lookup, now: clock.now });
  const serviceDeps: AdminServiceDeps = { store, subjectHash: subjectHashFor, publicOrigin: ORIGIN, basePath: "/knowledgebase", now: clock.now, ...opts.service };
  const adminRouter = createAdminRouter(serviceDeps);
  const userAccounts = { session: createSessionAuth({ sessions, cookie: { basePath: "", production: true }, csrf: { secret: SECRET, allowedOrigins: [ORIGIN] } }), adminRouter };
  const app = createServer(buildTestDeps({ keyStore: fakeKeyStore(opts.keys ?? {}), userAccounts }));
  const http = app.listen(0, "127.0.0.1"); await new Promise((r) => http.once("listening", r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const live = new Map<string, { token: string; sessionId: string }>();
  async function login(userId: string, tenantId: string): Promise<void> {
    const { token, session } = await sessions.create(tenantId, userId);
    live.set(userId, { token, sessionId: session._id });
  }
  async function call(who: Who, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { connection: "close", ...extraHeaders };
    if (who && "user" in who) {
      const s = live.get(who.user)!;
      headers.cookie = `${COOKIE_NAME_SECURE}=${s.token}`;
      if (who.origin !== null) headers.origin = who.origin ?? ORIGIN;
      if (who.csrf !== null) headers["x-lkb-csrf"] = who.csrf ?? csrfTokenFor(s.sessionId, SECRET);
    } else if (who && "key" in who) headers.authorization = `Bearer ${who.key}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
    const text = await res.text();
    let json: Record<string, any> | null = null;
    try { json = JSON.parse(text) as Record<string, any>; } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return { call, login, clock, state, mem, users: opts.users, store, close: () => new Promise<void>((r) => http.close(() => r())) };
}

export { user, createAdminService };
