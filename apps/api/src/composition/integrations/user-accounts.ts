/**
 * apps/api/src/composition/integrations/user-accounts.ts -- unit `ua-session-core` (D-206). Composition of the
 * user-accounts perimeter; every piece is injected, so absent `deps.userAccounts` leaves createServer unchanged.
 *  - `applyTrustProxy`: Express `trust proxy` ONLY as configured by TRUST_PROXY_HOPS (UA-23); logs the effective value.
 *  - `createMongoSessionStore`: the Mongo `SessionStore` (the one unscoped read is the hash lookup, ISS-415).
 *  - `buildUserAccounts`: env + db -> session service, cookie/CSRF config and the authenticator `requireAuth` takes.
 *  - `mountUserAccounts`: mounts `/auth` (public perimeter, soft principal) and `/admin` (authenticated) placeholders
 *    that unit A4 (auth-router) and A6 (admin-router) replace by passing `authRouter` / `adminRouter`.
 */
import type { UserSessions } from "@lkb/core";
import { findUserById, insertSession, recordAuthEvent, revocationFields, revokeSession, revokeUserSessions, userSessions } from "@lkb/db";
import type { Db } from "mongodb";
import { Router, type Express, type Request, type RequestHandler, type Response } from "express";
import { requireAuth, type ApiKeyStore, type SessionAuthenticator } from "../../auth.js";
import type { Logger } from "../logger.js";
import { normalizeBasePath, type CookieConfig } from "../../user-accounts/cookie.js";
import { assertCsrfSecret, type CsrfConfig } from "../../user-accounts/csrf.js";
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

export interface UserAccountsDeps {
  session: SessionAuthenticator;
  /** Public `/auth/*` routes (unit A4). Absent: a 503 placeholder. They receive `req.auth` from `session.attach`. */
  authRouter?: RequestHandler;
  /** Authenticated `/admin/*` routes (unit A6). Absent: a 503 placeholder. Scope checks are the router's own job. */
  adminRouter?: RequestHandler;
}
export interface UserAccountsRuntime extends UserAccountsDeps { sessions: SessionService; cookie: CookieConfig; csrf: CsrfConfig }

/** undefined (session path OFF, API keys unaffected) unless AUTH_CSRF_SECRET is a usable secret. */
export function buildUserAccounts(env: Record<string, string | undefined>, db: Db, log: Pick<Logger, "warn">): UserAccountsRuntime | undefined {
  try { assertCsrfSecret(env.AUTH_CSRF_SECRET); } catch { log.warn("user accounts disabled: AUTH_CSRF_SECRET is missing or shorter than 32 bytes"); return undefined; }
  const cookie: CookieConfig = { basePath: normalizeBasePath(env.APP_BASE_PATH), production: env.NODE_ENV === "production" };
  const allowedOrigins = [env.APP_PUBLIC_ORIGIN, ...(env.CORS_ORIGINS ?? "").split(",")].map((s) => (s ?? "").trim()).filter(Boolean);
  const csrf: CsrfConfig = { secret: env.AUTH_CSRF_SECRET, allowedOrigins };
  const sessions = createSessionService({ store: createMongoSessionStore(db), users: { getUser: (tenantId, userId) => findUserById(tenantId, userId, db) },
    audit: (tenantId, event) => recordAuthEvent(tenantId, event, db), log });
  return { session: createSessionAuth({ sessions, cookie, csrf }), sessions, cookie, csrf };
}

const placeholder = (what: string): RequestHandler => (_req: Request, res: Response) => { res.status(503).json({ error: "not_implemented", message: `${what} routes are not available yet` }); };
const notFound: RequestHandler = (_req: Request, res: Response) => { res.status(404).json({ error: "not_found", message: "no such route" }); };

/** Call BEFORE the shared `requireAuth`. `/auth` is the public perimeter; `/admin` authenticates itself. Both end in a terminal 404, never fall through. */
export function mountUserAccounts(app: Express, ua: UserAccountsDeps | undefined, keyStore: ApiKeyStore): void {
  if (!ua) return;
  app.use("/auth", ua.session.attach, ua.authRouter ?? Router().use(placeholder("auth")), notFound);
  app.use("/admin", requireAuth(keyStore, ua.session), ua.adminRouter ?? Router().use(placeholder("admin")), notFound);
}
