/**
 * apps/api/src/user-accounts/sessions.ts -- unit `ua-session-core`, spec UA-13 / UA-14 / UA-19 / UA-27.
 *
 * The session SERVICE: create, authenticate, revoke. Long-lived, rotating, revocable server-side session behind
 * an opaque 256-bit cookie token; only sha256(token) is stored. Storage is an injected `SessionStore` (Mongo in
 * production, an in-memory double in unit tests), so every rule below is tested without a database and the
 * race-sensitive ones (CAS rotation, unique hash) are re-proved against a real mongod.
 *
 * Tenant rule (ISS-415, UA-27): a cookie carries no tenant, so the ONE unscoped read is `findByTokenHash`
 * (tokenHash is globally unique). Everything after it is scoped to the tenant that row names, and the user row
 * fetched for it must carry the SAME tenant: any mismatch fails closed with the generic 401.
 *
 * Rotation (UA-14): when `rotatedAt` is >= 24 h old the token is replaced by compare-and-swap; the old hash stays
 * valid for a 30 s grace so parallel tabs do not fork the family. A retired hash presented after the grace is a
 * REPLAY: the whole family is revoked and an audit event is written. Idle expiry: 365 d since `lastUsedAt`.
 */
import type { UserSessions, Users } from "@lkb/core";
import type { AuthEventInput } from "@lkb/db";
import { isValidTenantId, type VerifiedKey } from "../auth.js";
import { principalFromUser } from "./roles.js";
import { generateToken, hashToken } from "./tokens.js";

export type SessionRow = UserSessions;
export type SessionRevokeReason = NonNullable<UserSessions["revokedReason"]>;
export const ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;
export const ROTATION_GRACE_MS = 30 * 1000;
export const IDLE_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
/** lastUsedAt is refreshed at most this often (idle expiry is measured in days; no write per request). */
export const TOUCH_AFTER_MS = 60 * 60 * 1000;

export interface SessionMeta { ipPrefix?: string; userAgentSummary?: string }
export interface SessionStore {
  insert(tenantId: string, input: SessionMeta & { userId: string; tokenHash: string }, now: Date): Promise<SessionRow>;
  /** GLOBAL by design (ISS-415): matches current, previous or retired hash. The only unscoped read. */
  findByTokenHash(tokenHash: string): Promise<SessionRow | null>;
  touch(tenantId: string, sessionId: string, now: Date): Promise<void>;
  /** Compare-and-swap on (id, current hash, rotatedAt, not revoked). True only for the call that did the swap. */
  rotate(tenantId: string, expect: { id: string; tokenHash: string; rotatedAt: string }, newTokenHash: string, now: Date): Promise<boolean>;
  revoke(tenantId: string, sessionId: string, reason: SessionRevokeReason, now: Date): Promise<boolean>;
  revokeFamily(tenantId: string, familyId: string, reason: SessionRevokeReason, now: Date): Promise<number>;
  revokeAllForUser(tenantId: string, userId: string, reason: SessionRevokeReason, exceptSessionId: string | undefined, now: Date): Promise<number>;
}
/** Tenant-scoped user read (`findUserById` in production). */
export interface UserLookup { getUser(tenantId: string, userId: string): Promise<Users | null> }
export type AuditSink = (tenantId: string, event: AuthEventInput) => Promise<void>;
export interface SessionLog { warn(message: string, fields?: Record<string, unknown>): void }

export type SessionFailCode = "unauthorized" | "session_revoked" | "session_expired" | "auth_unavailable";
export type SessionAuthOutcome =
  | { ok: true; auth: VerifiedKey; session: SessionRow; rotatedToken?: string }
  | { ok: false; status: 401 | 503; code: SessionFailCode };

export interface SessionServiceDeps { store: SessionStore; users: UserLookup; audit?: AuditSink; now?: () => Date; log?: SessionLog }

const fail = (code: SessionFailCode, status: 401 | 503 = 401): SessionAuthOutcome => ({ ok: false, status, code });
const ms = (iso: string | undefined): number => (typeof iso === "string" ? Date.parse(iso) : Number.NaN);

export function createSessionService(deps: SessionServiceDeps) {
  const { store, users } = deps;
  const clock = deps.now ?? (() => new Date());

  async function record(tenantId: string, event: AuthEventInput): Promise<void> {
    try { await deps.audit?.(tenantId, event); } catch { deps.log?.warn("auth event not written", { type: event.type }); }
  }

  async function replay(row: SessionRow, now: Date): Promise<SessionAuthOutcome> {
    await store.revokeFamily(row.tenantId, row.familyId, "reuse_detected", now);
    await record(row.tenantId, { type: "reuse_detected", outcome: "denied", detail: "family_revoked", targetUserId: row.userId });
    return fail("session_revoked");
  }

  async function resolve(hash: string): Promise<SessionAuthOutcome> {
    const now = clock();
    const row = await store.findByTokenHash(hash);
    if (!row || !isValidTenantId(row.tenantId) || typeof row.userId !== "string" || typeof row.familyId !== "string") return fail("unauthorized");
    const which = row.tokenHash === hash ? "current" : row.previousTokenHash === hash ? "previous" : (row.retiredTokenHashes as readonly string[] | undefined)?.includes(hash) ? "retired" : null;
    if (which === null) return fail("unauthorized");
    if (row.revokedAt !== undefined) return fail("session_revoked");
    const inGrace = which === "previous" && ms(row.previousValidUntil) >= now.getTime();
    if (which !== "current" && !inGrace) return replay(row, now);
    const usedAt = ms(row.lastUsedAt);
    if (!Number.isFinite(usedAt) || now.getTime() - usedAt > IDLE_EXPIRY_MS) {
      await store.revoke(row.tenantId, row._id, "idle_expired", now);
      return fail("session_expired");
    }
    // UA-27: scoped read, then an explicit equality check; a store that returned another tenant's row still fails closed.
    const user = await users.getUser(row.tenantId, row.userId);
    if (!user || user.tenantId !== row.tenantId || user._id !== row.userId) return fail("unauthorized");
    const auth = principalFromUser(user, row._id);
    if (!auth) return fail("session_revoked");
    let rotatedToken: string | undefined;
    if (which === "current" && now.getTime() - ms(row.rotatedAt) >= ROTATE_AFTER_MS) {
      const next = generateToken();
      if (await store.rotate(row.tenantId, { id: row._id, tokenHash: row.tokenHash, rotatedAt: row.rotatedAt }, next.tokenHash, now)) rotatedToken = next.token;
    } else if (now.getTime() - usedAt >= TOUCH_AFTER_MS) await store.touch(row.tenantId, row._id, now);
    return { ok: true, auth, session: row, ...(rotatedToken === undefined ? {} : { rotatedToken }) };
  }

  return {
    /** A new session for a user of this tenant. The raw token is returned ONCE (for the cookie); only its hash is stored. */
    async create(tenantId: string, userId: string, meta: SessionMeta = {}): Promise<{ token: string; session: SessionRow }> {
      if (!isValidTenantId(tenantId)) throw new Error("createSession: tenantId is required");
      const { token, tokenHash } = generateToken();
      const session = await store.insert(tenantId, { userId, tokenHash, ...meta }, clock());
      return { token, session };
    },
    /** Resolve a raw cookie token. Never throws: a storage failure is 503 `auth_unavailable`, never "logged in". */
    async authenticate(rawToken: string): Promise<SessionAuthOutcome> {
      const hash = hashToken(rawToken);
      if (hash === null) return fail("unauthorized");
      try { return await resolve(hash); } catch { deps.log?.warn("session lookup failed"); return fail("auth_unavailable", 503); }
    },
    revoke: (tenantId: string, sessionId: string, reason: SessionRevokeReason) => store.revoke(tenantId, sessionId, reason, clock()),
    revokeAllForUser: (tenantId: string, userId: string, reason: SessionRevokeReason, exceptSessionId?: string) => store.revokeAllForUser(tenantId, userId, reason, exceptSessionId, clock()),
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
