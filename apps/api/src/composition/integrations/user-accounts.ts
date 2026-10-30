/**
 * apps/api/src/composition/integrations/user-accounts.ts -- unit `ua-session-core` (D-206). Composition of the
 * user-accounts perimeter; every piece is injected, so absent `deps.userAccounts` leaves createServer unchanged.
 *  - `applyTrustProxy`: Express `trust proxy` ONLY as configured by TRUST_PROXY_HOPS (UA-23); logs the effective value.
 *  - `createMongoSessionStore`: the Mongo `SessionStore` (the one unscoped read is the hash lookup, ISS-415).
 *  - `createMongoAuthStore` (unit A4, ua-auth-api): the Mongo `AuthStore` behind the `/auth` service (users, tokens, throttles, audit).
 *  - `buildUserAccounts`: env + db -> session service, auth service + router, cookie/CSRF config and the authenticator `requireAuth` takes.
 *  - `mountUserAccounts`: mounts `/auth` (public perimeter, soft principal; A4's `authRouter`) and the `/admin` (authenticated) placeholder
 *    that unit A6 (admin-router) replaces by passing `adminRouter`.
 */
import { randomUUID } from "node:crypto";
import type { UserSessions } from "@lkb/core";
import { authThrottles, consumeToken as consumeTokenRow, findSessionById, findUserById, insertSession, insertToken as insertTokenRow, insertUser as insertUserRow, recordAuthEvent, revocationFields, revokeSession, revokeUserSessions, throttlePurgeAt, userSessions, userTokens, users } from "@lkb/db";
import type { Db } from "mongodb";
import { Router, type Express, type Request, type RequestHandler, type Response } from "express";
import { isValidTenantId, requireAuth, type ApiKeyStore, type SessionAuthenticator } from "../../auth.js";
import type { Logger } from "../logger.js";
import { createAuthRouter } from "../../user-accounts/auth-router.js";
import { createAuthService, DEFAULT_SIGNUP_DAILY_CAP, type AuthService, type AuthStore } from "../../user-accounts/auth-service.js";
import { normalizeBasePath, type CookieConfig } from "../../user-accounts/cookie.js";
import { assertCsrfSecret, type CsrfConfig } from "../../user-accounts/csrf.js";
import * as password from "../../user-accounts/password.js";
import { createSessionAuth } from "../../user-accounts/principal.js";
import { createSessionService, ROTATION_GRACE_MS, type SessionService, type SessionStore } from "../../user-accounts/sessions.js";

const TRUST_PROXY_MAX_HOPS = 5;

/** "" / undefined -> 0; "0".."5" -> that count; anything else -> 0 (fail closed: no proxy is trusted). */
export function parseTrustProxyHops(raw: string | undefined): number {
  const v = (raw ?? "").trim();
  return /^[0-5]$/.test(v) && Number(v) <= TRUST_PROXY_MAX_HOPS ? Number(v) : 0;
}

type Say = Pick<Logger, "info" | "warn">;
export function applyTrustProxy(app: Express, raw: string | undefined, log: Say): number {
  const hops = parseTrustProxyHops(raw);
  if ((raw ?? "").trim() !== "" && String(hops) !== (raw ?? "").trim()) log.warn(`trust proxy: TRUST_PROXY_HOPS is invalid, no proxy is trusted (hops=0)`);
  app.set("trust proxy", hops > 0 ? hops : false);
  log.info(`trust proxy: effective hops=${hops}`);
  return hops;
}

export function createMongoSessionStore(db: Db): SessionStore {
  const raw = db.collection("user_sessions");
  const iso = (d: Date) => d.toISOString();
  return {
    insert: async (tenantId, input, now) => ({ ...(await insertSession(tenantId, input, db, now)), tenantId }),
    // ISS-415: the single deliberate unscoped read. tokenHash is globally unique; the row names its tenant and
    // every later operation is tenant-scoped. The extra predicates let the partial indexes serve the fallbacks.
    findByTokenHash: async (hash) => (await raw.findOne({ tokenHash: hash }) ?? await raw.findOne({ previousTokenHash: { $eq: hash, $type: "string" } })
      ?? await raw.findOne({ retiredTokenHashes: hash, "retiredTokenHashes.0": { $exists: true } })) as UserSessions | null,
    touch: async (tenantId, id, now) => { await userSessions(tenantId, db).updateOne({ _id: id, revokedAt: { $exists: false } }, { $set: { lastUsedAt: iso(now) } }); },
    rotate: async (tenantId, e, newHash, now) => {
      const update = { $set: { tokenHash: newHash, previousTokenHash: e.tokenHash, previousValidUntil: iso(new Date(now.getTime() + ROTATION_GRACE_MS)), rotatedAt: iso(now), lastUsedAt: iso(now) },
        $push: { retiredTokenHashes: { $each: [e.tokenHash], $slice: -5 } } };
      const res = await userSessions(tenantId, db).updateOne({ _id: e.id, tokenHash: e.tokenHash, rotatedAt: e.rotatedAt, revokedAt: { $exists: false } }, update as never);
      return res.modifiedCount === 1;
    },
    revoke: (tenantId, id, reason, now) => revokeSession(tenantId, id, reason, db, now),
    revokeFamily: async (tenantId, familyId, reason, now) =>
      (await userSessions(tenantId, db).bulkWrite([{ updateMany: { filter: { familyId, revokedAt: { $exists: false } }, update: { $set: revocationFields(reason, now) } } }])).modifiedCount,
    revokeAllForUser: (tenantId, userId, reason, except, now) => revokeUserSessions(tenantId, userId, reason, except === undefined ? {} : { exceptSessionId: except }, db, now),
  };
}

const isDuplicateKey = (err: unknown): boolean => (err as { code?: unknown } | null)?.code === 11000;

/** The Mongo `AuthStore` (unit A4). Every access is tenant-scoped through the @lkb/db accessors; the only global constraint is the unique
 * `users.emailNormalized` index, whose E11000 `insertUser` lets through for the service to map to the generic signup response (ISS-415). */
export function createMongoAuthStore(db: Db): AuthStore {
  return {
    findUserByEmail: async (tenantId, email) => users(tenantId, db).findOne({ emailNormalized: email }),
    findUserById: (tenantId, userId) => findUserById(tenantId, userId, db),
    insertUser: async (tenantId, input, now) => ({ ...(await insertUserRow(tenantId, input, db, now)), tenantId }),
    updateUser: async (tenantId, userId, set, expectStatus) =>
      (await users(tenantId, db).updateOne({ _id: userId, ...(expectStatus !== undefined ? { status: expectStatus } : {}) }, { $set: set })).matchedCount === 1,
    countUsersCreatedSince: (tenantId, since) => users(tenantId, db).countDocuments({ createdAt: { $gte: since.toISOString() } }),
    deleteStaleUnverified: async (tenantId, olderThan) => (await users(tenantId, db).deleteMany({ status: "unverified", createdAt: { $lt: olderThan.toISOString() } })).deletedCount,
    insertToken: async (tenantId, input, now) => { await insertTokenRow(tenantId, input, db, now); },
    peekToken: async (tenantId, tokenHash, purpose, now) =>
      (await userTokens(tenantId, db).findOne({ tokenHash, purpose, usedAt: { $exists: false }, expiresAt: { $gt: now.toISOString() } }))?.userId ?? null,
    consumeToken: (tenantId, tokenHash, purpose, now) => consumeTokenRow(tenantId, tokenHash, purpose, db, now),
    listSessions: (tenantId, userId) => userSessions(tenantId, db).find({ userId, revokedAt: { $exists: false } }).sort({ lastUsedAt: -1 }).limit(100).toArray(),
    getSession: (tenantId, sessionId) => findSessionById(tenantId, sessionId, db),
    throttle: {
      get: async (tenantId, subjectHash) => {
        const r = await authThrottles(tenantId, db).findOne({ subjectHash });
        return r ? { failures: r.failures, lockCount: r.lockCount, windowStartedAt: r.windowStartedAt, lastFailureAt: r.lastFailureAt, ...(r.lockedUntil !== undefined ? { lockedUntil: r.lockedUntil } : {}) } : null;
      },
      // Compare-and-set (UA-24): parallel guesses on one address cannot overwrite each other's count. No row yet -> insert (E11000 = lost the race).
      put: async (tenantId, subjectHash, next, prev) => {
        const purgeAt = throttlePurgeAt(new Date(next.lastFailureAt), next.lockedUntil !== undefined ? new Date(next.lockedUntil) : undefined);
        const fields = { failures: next.failures, lockCount: next.lockCount, windowStartedAt: next.windowStartedAt, lastFailureAt: next.lastFailureAt, purgeAt };
        const coll = authThrottles(tenantId, db);
        if (prev === null) {
          try { await coll.insertOne({ _id: randomUUID(), subjectHash, ...fields, ...(next.lockedUntil !== undefined ? { lockedUntil: next.lockedUntil } : {}) }); return true; }
          catch (err) { if (isDuplicateKey(err)) return false; throw err; }
        }
        const res = await coll.updateOne(
          { subjectHash, failures: prev.failures, lockCount: prev.lockCount, lastFailureAt: prev.lastFailureAt, lockedUntil: prev.lockedUntil !== undefined ? prev.lockedUntil : { $exists: false } },
          next.lockedUntil !== undefined ? { $set: { ...fields, lockedUntil: next.lockedUntil } } : { $set: fields, $unset: { lockedUntil: "" } });
        return res.matchedCount === 1;
      },
      clear: async (tenantId, subjectHash) => { await authThrottles(tenantId, db).deleteMany({ subjectHash }); },
    },
    recordEvent: (tenantId, event, now) => recordAuthEvent(tenantId, event, db, now),
  };
}

export interface UserAccountsDeps {
  session: SessionAuthenticator;
  /** Public `/auth/*` routes (unit A4, `createAuthRouter`). Absent: a 503 placeholder. They receive `req.auth` from `session.attach`. */
  authRouter?: RequestHandler;
  /** Authenticated `/admin/*` routes (unit A6). Absent: a 503 placeholder. Scope checks are the router's own job. */
  adminRouter?: RequestHandler;
}
/** `auth` is the credential service A6 (admin-router) reuses: `issueToken`, `unlockEmail`, `revokeAllSessions`. */
export interface UserAccountsRuntime extends UserAccountsDeps { sessions: SessionService; cookie: CookieConfig; csrf: CsrfConfig; auth: AuthService }

/** USER_SIGNUP_DAILY_CAP: a positive integer, else the default (200 signups per rolling 24 h per tenant). */
export function parseSignupCap(raw: string | undefined): number {
  const v = (raw ?? "").trim();
  return /^[1-9][0-9]{0,6}$/.test(v) ? Number(v) : DEFAULT_SIGNUP_DAILY_CAP;
}

/** undefined (session path OFF, API keys unaffected) unless AUTH_CSRF_SECRET is a usable secret. */
export function buildUserAccounts(env: Record<string, string | undefined>, db: Db, log: Pick<Logger, "warn">): UserAccountsRuntime | undefined {
  try { assertCsrfSecret(env.AUTH_CSRF_SECRET); } catch { log.warn("user accounts disabled: AUTH_CSRF_SECRET is missing or shorter than 32 bytes"); return undefined; }
  const cookie: CookieConfig = { basePath: normalizeBasePath(env.APP_BASE_PATH), production: env.NODE_ENV === "production" };
  const allowedOrigins = [env.APP_PUBLIC_ORIGIN, ...(env.CORS_ORIGINS ?? "").split(",")].map((s) => (s ?? "").trim()).filter(Boolean);
  const csrf: CsrfConfig = { secret: env.AUTH_CSRF_SECRET, allowedOrigins };
  const sessions = createSessionService({ store: createMongoSessionStore(db), users: { getUser: (tenantId, userId) => findUserById(tenantId, userId, db) },
    audit: (tenantId, event) => recordAuthEvent(tenantId, event, db), log });
  const rawTenant = (env.USER_SIGNUP_TENANT ?? "").trim();
  const signupTenant = isValidTenantId(rawTenant) ? rawTenant : undefined;
  if (signupTenant === undefined) log.warn("user accounts: USER_SIGNUP_TENANT is unset or invalid, signup and sign-in answer 503");
  const auth = createAuthService({ store: createMongoAuthStore(db), sessions, password, csrfSecret: env.AUTH_CSRF_SECRET, signupDailyCap: parseSignupCap(env.USER_SIGNUP_DAILY_CAP), log });
  const authRouter = createAuthRouter({ service: auth, cookie, csrf, signupTenant, log });
  return { session: createSessionAuth({ sessions, cookie, csrf }), authRouter, sessions, cookie, csrf, auth };
}

const placeholder = (what: string): RequestHandler => (_req: Request, res: Response) => { res.status(503).json({ error: "not_implemented", message: `${what} routes are not available yet` }); };
const notFound: RequestHandler = (_req: Request, res: Response) => { res.status(404).json({ error: "not_found", message: "no such route" }); };

/** Call BEFORE the shared `requireAuth`. `/auth` is the public perimeter; `/admin` authenticates itself. Both end in a terminal 404, never fall through. */
export function mountUserAccounts(app: Express, ua: UserAccountsDeps | undefined, keyStore: ApiKeyStore): void {
  if (!ua) return;
  app.use("/auth", ua.session.attach, ua.authRouter ?? Router().use(placeholder("auth")), notFound);
  app.use("/admin", requireAuth(keyStore, ua.session), ua.adminRouter ?? Router().use(placeholder("admin")), notFound);
}
