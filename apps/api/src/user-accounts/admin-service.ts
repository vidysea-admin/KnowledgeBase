/**
 * apps/api/src/user-accounts/admin-service.ts -- unit `ua-admin-api` (A6), spec UA-5 / UA-6 / UA-7(8) / UA-19 / UA-25 / UA-28.
 *
 * The admin SERVICE behind `/admin/*`: list/read users, approve, reject, change role, disable, enable, revoke sessions,
 * unlock a locked email, issue a single-use verify/reset link (A5 mailer is DROPPED: no mail is ever sent, so an admin
 * hands the link over), and read the audit log. Storage is an injected `AdminStore` (Mongo in production through the A1
 * collection modules, an in-memory double in unit tests); the race-sensitive rules are re-proved on a real mongod (admin.mongo.test.ts).
 *
 * Rules enforced here (the router only authenticates and validates the shape):
 *  - Every mutation runs under a per-tenant lock and RE-READS the acting admin: a session that was valid when the
 *    request arrived but whose admin was demoted/disabled a moment ago is refused (403), not trusted.
 *  - Tenancy (UA-27): every store call carries the actor's tenant; another tenant's user id is `not_found` (404).
 *  - Last-admin guard (UA-6): demote / disable / revoke-sessions of the only active admin is 409 `last_admin`. It is a
 *    pre-check, then a compare-and-swap write, then a post-check that REVERTS the write when it left zero admins, so a
 *    second API instance racing this one (separate lock) can never leave a tenant with no admin.
 *  - An admin cannot change their own role or disable themself (403 `self_action_forbidden`); the last-admin check is
 *    evaluated first, so the sole admin acting on themself gets the 409 `last_admin` (plan A6 items 3 and 4).
 *  - Audit (UA-25): exactly one `auth_events` row per effective action, closed vocabulary only (the reject `reason` is
 *    validated but never stored: free text from a client never reaches the log).
 *  - issue-link: the link is built from the configured public origin + base path, NEVER from Host / X-Forwarded-Host.
 */
import type { AuthEvents, Users } from "@lkb/core";
import {
  authThrottles, findUserById, insertToken, listAuthEvents, recordAuthEvent, revokeUserSessions, userSessions, userTokens, users,
  type AuthEventInput, type AuthEventPage, type SessionRevokedReason, type TokenInput, type TokenPurpose,
} from "@lkb/db";
import type { Db } from "mongodb";
import { isValidTenantId } from "../auth.js";
import { isRole, type Role } from "./roles.js";
import { generateToken } from "./tokens.js";
import { normalizeBasePath } from "./cookie.js";

export type UserStatus = Users["status"];
export const USER_STATUS_VALUES: readonly UserStatus[] = ["unverified", "pending", "active", "rejected", "disabled"];
/** UA-4: unverified accounts older than this are swept and never shown to an admin. */
export const UNVERIFIED_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;
export const LIST_LIMIT_DEFAULT = 50;
export const LIST_LIMIT_MAX = 200;
/** Where the issued link points (relative to origin + base path). The token travels in the URL FRAGMENT so it is never sent to a server, logged or put in a Referer. */
export const LINK_PATHS: Readonly<Record<TokenPurpose, string>> = Object.freeze({ verify_email: "/verify", password_reset: "/reset" });
export const LINK_TOKEN_KEY = "token";

export type Fail = { ok: false; status: 400 | 403 | 404 | 409 | 503; error: string; message: string };
export type Result<T> = { ok: true; value: T } | Fail;
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (status: Fail["status"], error: string, message: string): Fail => ({ ok: false, status, error, message });

export interface Actor { tenantId: string; userId: string; ipPrefix?: string }

export interface UserView {
  id: string; email: string; displayName: string; status: UserStatus; role: Role | null;
  mailStatus?: "sent" | "not_sent"; emailVerifiedAt?: string; statusChangedAt?: string; statusChangedBy?: string; lastLoginAt?: string;
  createdAt: string; updatedAt: string;
}
/** The ONLY projection of a user row that leaves this module: no passwordHash, no tenantId. */
export function userView(u: Users): UserView {
  const v: UserView = { id: u._id, email: u.emailNormalized, displayName: u.displayName, status: u.status, role: isRole(u.role) ? u.role : null, createdAt: u.createdAt, updatedAt: u.updatedAt };
  if (u.mailStatus !== undefined) v.mailStatus = u.mailStatus;
  if (u.emailVerifiedAt !== undefined) v.emailVerifiedAt = u.emailVerifiedAt;
  if (u.statusChangedAt !== undefined) v.statusChangedAt = u.statusChangedAt;
  if (u.statusChangedBy !== undefined) v.statusChangedBy = u.statusChangedBy;
  if (u.lastLoginAt !== undefined) v.lastLoginAt = u.lastLoginAt;
  return v;
}

export interface AuditView { id: string; at: string; type: AuthEvents["type"]; outcome: AuthEvents["outcome"]; detail: AuthEvents["detail"]; actorUserId?: string; targetUserId?: string; ipPrefix?: string; userAgentSummary?: string }
function auditView(e: AuthEvents): AuditView {
  const v: AuditView = { id: e._id, at: e.at, type: e.type, outcome: e.outcome, detail: e.detail };
  if (e.actorUserId !== undefined) v.actorUserId = e.actorUserId;
  if (e.targetUserId !== undefined) v.targetUserId = e.targetUserId;
  if (e.ipPrefix !== undefined) v.ipPrefix = e.ipPrefix;
  if (e.userAgentSummary !== undefined) v.userAgentSummary = e.userAgentSummary;
  return v;
}

export interface UserPatch { status: UserStatus; role?: Role; statusChangedAt: string; statusChangedBy: string; updatedAt: string }
export interface UserCursor { createdAt: string; id: string }

/** Everything the service needs from storage. Every method takes the tenant: there is no unscoped read. */
export interface AdminStore {
  list(tenantId: string, q: { status?: UserStatus; unverifiedNotBefore: string; limit: number; after?: UserCursor }): Promise<Users[]>;
  get(tenantId: string, userId: string): Promise<Users | null>;
  countByStatus(tenantId: string, status: UserStatus): Promise<number>;
  countActiveAdmins(tenantId: string): Promise<number>;
  /** Compare-and-swap: applies `patch` only while the row still has `expect.status` (and `expect.role` when given). True only for the call that wrote. */
  cas(tenantId: string, userId: string, expect: { status: UserStatus; role?: Role }, patch: UserPatch): Promise<boolean>;
  revokeSessions(tenantId: string, userId: string, reason: SessionRevokedReason, now: Date): Promise<number>;
  activeSessionCount(tenantId: string, userId: string): Promise<number>;
  /** Marks every unused token of (user, purpose) as used, so a re-issued link replaces the previous one. */
  supersedeTokens(tenantId: string, userId: string, purpose: TokenPurpose, now: Date): Promise<number>;
  insertToken(tenantId: string, input: TokenInput, now: Date): Promise<{ expiresAt: string }>;
  clearThrottle(tenantId: string, subjectHash: string): Promise<boolean>;
  audit(tenantId: string, event: AuthEventInput, now: Date): Promise<void>;
  listAudit(tenantId: string, opts: { limit: number; after?: { at: string; id: string }; targetUserId?: string }): Promise<AuthEventPage>;
}

export interface AdminLog { warn(message: string, fields?: Record<string, unknown>): void }
export interface AdminServiceDeps {
  store: AdminStore;
  /** The salted throttle-subject function of the auth service (A4 throttle.ts). Unlock deletes the row keyed by exactly this value. */
  subjectHash: (tenantId: string, emailNormalized: string) => string;
  /** APP_PUBLIC_ORIGIN. Absent or not a bare http(s) origin: issue-link answers 503 (it never falls back to the request Host). */
  publicOrigin?: string;
  /** APP_BASE_PATH (normalised here). */
  basePath?: string;
  now?: () => Date;
  log?: AdminLog;
  /** R-10 (WhatsApp links), injected at composition: called AFTER a disable / reject / role change committed, with the post-change status and role. Best effort: a failure is logged and never fails or undoes the action. */
  onAccountChange?: (tenantId: string, userId: string, to: { status: UserStatus; role?: Role }) => Promise<unknown>;
}

/** "https://kb.example.org" only: scheme + host + optional port; no path, query, fragment or credentials. */
export function parsePublicOrigin(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/\/+$/, "");
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username !== "" || u.password !== "" || u.search !== "" || u.hash !== "" || u.pathname !== "/") return null;
  return u.origin;
}

/** "203.0.113.7" -> "203.0.113.0/24"; "2001:db8:1:2::9" -> "2001:db8:1::/48"; anything else (or a mapped v4) -> undefined. */
export function ipPrefixOf(ip: string | undefined): string | undefined {
  if (typeof ip !== "string") return undefined;
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(ip);
  if (v4) { const p = v4.slice(1).map(Number); return p.every((n) => n <= 255) ? `${p[0]}.${p[1]}.${p[2]}.0/24` : undefined; }
  if (/^[0-9a-f:]+$/i.test(ip) && ip.includes(":") && (ip.match(/::/g) ?? []).length <= 1) {
    const [head = "", tail] = ip.split("::");
    const h = head === "" ? [] : head.split(":");
    const t = tail === undefined || tail === "" ? [] : tail.split(":");
    const groups = tail === undefined ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
    if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return undefined;
    return `${groups.slice(0, 3).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/48`;
  }
  return undefined;
}

export function createAdminService(deps: AdminServiceDeps) {
  const { store } = deps;
  const clock = deps.now ?? (() => new Date());
  const origin = parsePublicOrigin(deps.publicOrigin);
  const basePath = normalizeBasePath(deps.basePath);

  // Per-tenant lock. One API instance is the documented deployment (UA-23); the post-check below covers a second one.
  const tails = new Map<string, Promise<unknown>>();
  function locked<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const run = (tails.get(tenantId) ?? Promise.resolve()).then(fn, fn);
    const tail = run.then(() => undefined, () => undefined);
    tails.set(tenantId, tail);
    void tail.then(() => { if (tails.get(tenantId) === tail) tails.delete(tenantId); });
    return run;
  }

  /** One audit row; with `to` (the post-change account) it then tells the injected hook, whose failure never reaches the caller. */
  async function event(actor: Actor, targetUserId: string, type: AuthEventInput["type"], detail: AuthEventInput["detail"], to?: { status: UserStatus; role?: Role }): Promise<void> {
    await store.audit(actor.tenantId, { type, outcome: "ok", detail, actorUserId: actor.userId, targetUserId, ...(actor.ipPrefix ? { ipPrefix: actor.ipPrefix } : {}) }, clock());
    if (to && deps.onAccountChange) try { await deps.onAccountChange(actor.tenantId, targetUserId, to); } catch (e) { deps.log?.warn("account_change_hook_failed", { error: e instanceof Error ? e.name : "unknown" }); }
  }
  const stamp = (actor: Actor, now: Date) => ({ statusChangedAt: now.toISOString(), statusChangedBy: actor.userId, updatedAt: now.toISOString() });
  const lastAdmin = () => fail(409, "last_admin", "this would leave the tenant without an active admin");
  const selfAction = () => fail(403, "self_action_forbidden", "an admin cannot change their own role or disable themself");
  const badState = (what: string) => fail(409, "invalid_state", what);

  /** Authorises the actor FRESH, finds the target in the actor's tenant, runs `fn` under the tenant lock. */
  function mutate<T>(actor: Actor, targetId: string, fn: (me: Users, target: Users) => Promise<Result<T>>): Promise<Result<T>> {
    if (!isValidTenantId(actor.tenantId)) return Promise.resolve(fail(403, "forbidden", "no tenant"));
    return locked(actor.tenantId, async () => {
      const me = await store.get(actor.tenantId, actor.userId);
      if (!me || me.status !== "active" || me.role !== "admin") return fail(403, "forbidden", "an active admin is required");
      const target = await store.get(actor.tenantId, targetId);
      if (!target) return fail(404, "not_found", "no such user");
      return fn(me, target);
    });
  }

  const reload = async (tenantId: string, id: string): Promise<UserView> => userView((await store.get(tenantId, id)) ?? (() => { throw new Error("user vanished after write"); })());

  /** Demote/disable of an ACTIVE ADMIN target: pre-check, caller's CAS, post-check. Returns a Fail when the write was refused or reverted. */
  async function guardAdminChange(actor: Actor, target: Users, write: () => Promise<boolean>, revert: () => Promise<boolean>): Promise<Fail | null> {
    if (await store.countActiveAdmins(actor.tenantId) <= 1) return lastAdmin();
    if (actor.userId === target._id) return selfAction();
    if (!(await write())) return fail(409, "conflict", "the user changed while this request ran; reload and retry");
    if (await store.countActiveAdmins(actor.tenantId) === 0) { await revert(); return lastAdmin(); }
    return null;
  }

  return {
    async listUsers(tenantId: string, q: { status?: UserStatus; limit?: number; after?: UserCursor }): Promise<Result<{ users: UserView[]; next: UserCursor | null; pendingCount: number }>> {
      if (!isValidTenantId(tenantId)) return fail(403, "forbidden", "no tenant");
      const limit = Math.min(Math.max(Math.trunc(q.limit ?? LIST_LIMIT_DEFAULT), 1), LIST_LIMIT_MAX);
      const rows = await store.list(tenantId, { ...(q.status ? { status: q.status } : {}), unverifiedNotBefore: new Date(clock().getTime() - UNVERIFIED_VISIBLE_MS).toISOString(), limit: limit + 1, ...(q.after ? { after: q.after } : {}) });
      const page = rows.slice(0, limit), last = page[page.length - 1];
      return ok({ users: page.map(userView), next: rows.length > limit && last ? { createdAt: last.createdAt, id: last._id } : null, pendingCount: await store.countByStatus(tenantId, "pending") });
    },

    async getUser(tenantId: string, id: string): Promise<Result<{ user: UserView; activeSessionCount: number }>> {
      if (!isValidTenantId(tenantId)) return fail(403, "forbidden", "no tenant");
      const u = await store.get(tenantId, id);
      if (!u) return fail(404, "not_found", "no such user");
      return ok({ user: userView(u), activeSessionCount: await store.activeSessionCount(tenantId, id) });
    },

    approve: (actor: Actor, id: string, input: { role: Role }) => mutate(actor, id, async (_me, target) => {
      if (target.status !== "pending" && target.status !== "rejected") return badState("only a pending or rejected account can be approved");
      const now = clock();
      if (!(await store.cas(actor.tenantId, id, { status: target.status }, { status: "active", role: input.role, ...stamp(actor, now) }))) return fail(409, "conflict", "the user changed while this request ran; reload and retry");
      await event(actor, id, "approved", "admin_action");
      return ok({ user: await reload(actor.tenantId, id) });
    }),

    /** `reason` is validated by the router and deliberately NOT stored: the audit log takes closed vocabulary only (UA-25). */
    reject: (actor: Actor, id: string) => mutate(actor, id, async (_me, target) => {
      if (target.status !== "pending") return badState("only a pending account can be rejected");
      const now = clock();
      if (!(await store.cas(actor.tenantId, id, { status: "pending" }, { status: "rejected", ...stamp(actor, now) }))) return fail(409, "conflict", "the user changed while this request ran; reload and retry");
      await event(actor, id, "rejected", "admin_action", { status: "rejected" });
      return ok({ user: await reload(actor.tenantId, id) });
    }),

    setRole: (actor: Actor, id: string, input: { role: Role }) => mutate(actor, id, async (_me, target) => {
      if (target.status !== "active" || !isRole(target.role)) return badState("only an active account has a role to change");
      const from = target.role, now = clock();
      const patch = (role: Role): UserPatch => ({ status: "active", role, ...stamp(actor, now) });
      if (from === input.role) {
        if (actor.userId === id) return selfAction();
        return ok({ user: userView(target), changed: false });
      }
      if (from === "admin") {
        const refused = await guardAdminChange(actor, target,
          () => store.cas(actor.tenantId, id, { status: "active", role: "admin" }, patch(input.role)),
          () => store.cas(actor.tenantId, id, { status: "active", role: input.role }, patch("admin")));
        if (refused) return refused;
      } else {
        if (actor.userId === id) return selfAction();
        if (!(await store.cas(actor.tenantId, id, { status: "active", role: from }, patch(input.role)))) return fail(409, "conflict", "the user changed while this request ran; reload and retry");
      }
      await event(actor, id, "role_changed", "admin_action", { status: "active", role: input.role });
      return ok({ user: await reload(actor.tenantId, id), changed: true });
    }),

    disable: (actor: Actor, id: string) => mutate(actor, id, async (_me, target) => {
      if (target.status !== "active") return badState("only an active account can be disabled");
      const now = clock();
      const to: UserPatch = { status: "disabled", ...stamp(actor, now) };
      if (target.role === "admin") {
        const refused = await guardAdminChange(actor, target,
          () => store.cas(actor.tenantId, id, { status: "active", role: "admin" }, to),
          () => store.cas(actor.tenantId, id, { status: "disabled" }, { status: "active", role: "admin", ...stamp(actor, now) }));
        if (refused) return refused;
      } else {
        if (actor.userId === id) return selfAction();
        if (!(await store.cas(actor.tenantId, id, { status: "active" }, to))) return fail(409, "conflict", "the user changed while this request ran; reload and retry");
      }
      const revoked = await store.revokeSessions(actor.tenantId, id, "disabled", now);
      await event(actor, id, "disabled", "admin_action", { status: "disabled" });
      return ok({ user: await reload(actor.tenantId, id), revokedSessions: revoked });
    }),

    enable: (actor: Actor, id: string) => mutate(actor, id, async (_me, target) => {
      if (target.status !== "disabled") return badState("only a disabled account can be enabled");
      if (!isRole(target.role)) return fail(409, "role_required", "this account has no role; approve it with a role instead");
      const now = clock();
      if (!(await store.cas(actor.tenantId, id, { status: "disabled" }, { status: "active", role: target.role, ...stamp(actor, now) }))) return fail(409, "conflict", "the user changed while this request ran; reload and retry");
      await event(actor, id, "enabled", "admin_action");
      return ok({ user: await reload(actor.tenantId, id) });
    }),

    revokeSessions: (actor: Actor, id: string) => mutate(actor, id, async (_me, target) => {
      if (target.status === "active" && target.role === "admin" && await store.countActiveAdmins(actor.tenantId) <= 1) return lastAdmin();
      const revoked = await store.revokeSessions(actor.tenantId, id, "admin", clock());
      await event(actor, id, "session_revoked", "admin_action");
      return ok({ revokedSessions: revoked });
    }),

    /** Clears the failed-login counter / lock of this user's email (UA-24). The row is keyed by the injected salted subject hash. */
    unlock: (actor: Actor, id: string) => mutate(actor, id, async (_me, target) => {
      const cleared = await store.clearThrottle(actor.tenantId, deps.subjectHash(actor.tenantId, target.emailNormalized));
      await event(actor, id, "unlocked", "admin_action");
      return ok({ cleared });
    }),

    /** A5 replacement: a single-use verify / reset token, handed over as a link. The raw token exists only in this return value. */
    issueLink: (actor: Actor, id: string, input: { purpose: TokenPurpose }) => mutate(actor, id, async (_me, target) => {
      if (origin === null) return fail(503, "link_origin_not_configured", "APP_PUBLIC_ORIGIN is not set to a valid origin; no link can be built");
      if (input.purpose === "verify_email" ? target.status !== "unverified" : target.status !== "pending" && target.status !== "active") return badState("no link of this kind can be issued for this account's state");
      const now = clock(), { token, tokenHash } = generateToken();
      await store.supersedeTokens(actor.tenantId, id, input.purpose, now);
      const row = await store.insertToken(actor.tenantId, { userId: id, purpose: input.purpose, tokenHash, issuedVia: "admin", issuedBy: actor.userId }, now);
      await event(actor, id, "link_issued", "admin_action");
      return ok({ link: `${origin}${basePath}${LINK_PATHS[input.purpose]}#${LINK_TOKEN_KEY}=${token}`, purpose: input.purpose, expiresAt: row.expiresAt });
    }),

    async audit(tenantId: string, q: { limit?: number; after?: { at: string; id: string }; targetUserId?: string }): Promise<Result<{ events: AuditView[]; next: { at: string; id: string } | null }>> {
      if (!isValidTenantId(tenantId)) return fail(403, "forbidden", "no tenant");
      const page = await store.listAudit(tenantId, { limit: q.limit ?? 50, ...(q.after ? { after: q.after } : {}), ...(q.targetUserId ? { targetUserId: q.targetUserId } : {}) });
      return ok({ events: page.rows.map(auditView), next: page.next });
    },
  };
}
export type AdminService = ReturnType<typeof createAdminService>;

/** Production store: the A1 collection modules, tenant-scoped, no raw handle. */
export function createMongoAdminStore(db: Db): AdminStore {
  const iso = (d: Date) => d.toISOString();
  return {
    list: async (tenantId, q) => {
      const filter: Record<string, unknown> = {};
      if (q.status === undefined) filter.status = { $ne: "unverified" };
      else { filter.status = q.status; if (q.status === "unverified") filter.createdAt = { $gte: q.unverifiedNotBefore }; }
      if (q.after) filter.$or = [{ createdAt: { $gt: q.after.createdAt } }, { createdAt: q.after.createdAt, _id: { $gt: q.after.id } }];
      return users(tenantId, db).find(filter).sort({ createdAt: 1, _id: 1 }).limit(q.limit).toArray();
    },
    get: (tenantId, userId) => findUserById(tenantId, userId, db),
    countByStatus: (tenantId, status) => users(tenantId, db).countDocuments({ status }),
    countActiveAdmins: (tenantId) => users(tenantId, db).countDocuments({ status: "active", role: "admin" }),
    cas: async (tenantId, userId, expect, patch) => {
      const res = await users(tenantId, db).updateOne({ _id: userId, status: expect.status, ...(expect.role ? { role: expect.role } : {}) }, { $set: { ...patch } });
      return res.modifiedCount === 1;
    },
    revokeSessions: (tenantId, userId, reason, now) => revokeUserSessions(tenantId, userId, reason, {}, db, now),
    activeSessionCount: (tenantId, userId) => userSessions(tenantId, db).countDocuments({ userId, revokedAt: { $exists: false } }),
    supersedeTokens: async (tenantId, userId, purpose, now) => (await userTokens(tenantId, db).bulkWrite([{ updateMany: { filter: { userId, purpose, usedAt: { $exists: false } }, update: { $set: { usedAt: iso(now) } } } }])).modifiedCount,
    insertToken: async (tenantId, input, now) => { const row = await insertToken(tenantId, input, db, now); return { expiresAt: row.expiresAt }; },
    clearThrottle: async (tenantId, subjectHash) => (await authThrottles(tenantId, db).deleteMany({ subjectHash })).deletedCount > 0,
    audit: (tenantId, event, now) => recordAuthEvent(tenantId, event, db, now),
    listAudit: (tenantId, opts) => listAuthEvents(tenantId, opts, db),
  };
}
