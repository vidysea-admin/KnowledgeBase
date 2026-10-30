/**
 * apps/api/src/user-accounts/auth-service.ts -- unit `ua-auth-api`, spec UA-1 / UA-4 / UA-5 / UA-11 / UA-12 / UA-18 / UA-20..UA-25.
 *
 * The credential-handling service behind `/auth/*`. Transport-free: every method returns an `ApiResult` (status + JSON body + optional
 * session token / clear-cookie flag) that the router maps onto Express. Storage is the injected `AuthStore` (Mongo in
 * composition/integrations/user-accounts.ts, an in-memory double in tests).
 *
 * v1 sends NO mail (D-206, A5 dropped): an ADMIN issues a verify / reset link (`issueToken`, unit A6) that is redeemed here
 * (`verifyEmail`, `resetPassword`); `forgotPassword` only answers the uniform 202 and issues nothing.
 * Rules enforced here (each pinned by auth-service.test.ts):
 *  - no enumeration: signup answers byte-equally for a new, an existing and a cross-tenant address (and hashes the password in every
 *    case); login answers one 401 `invalid_credentials` for unknown email, wrong password, invalid email shape AND a locked email, and
 *    always runs a full password verify; the account status is revealed only after the password verified.
 *  - lockout is keyed on a salted hash of the email (a row exists for a never-registered address too; the raw address is never stored).
 *  - tokens are single use (atomic consume) and purpose-bound; their failures are one generic 400. Reset revokes ALL sessions, change all OTHERS.
 *  - every transition writes one closed-vocabulary `auth_events` row; no password, token, cookie, client free text or raw email of an
 *    unknown account ever reaches it.
 */
import { createHmac } from "node:crypto";
import type { UserSessions, Users } from "@lkb/core";
import type { AuthEventInput, TokenInput, UserInput } from "@lkb/db";
import type { VerifiedKey } from "../auth.js";
import { csrfTokenFor } from "./csrf.js";
import { parseEmail } from "./email.js";
import { checkPassword } from "./password-policy.js";
import { GENERIC_SIGNUP_RESPONSE, isDuplicateEmailError } from "./principal.js";
import { isRole } from "./roles.js";
import type { SessionRevokeReason, SessionService } from "./sessions.js";
import { createThrottle, createWindowLimiter, type ThrottleStore } from "./throttle.js";
import { generateToken, hashToken, tokenExpiry, type TokenPurpose } from "./tokens.js";

export const UNVERIFIED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_SIGNUP_DAILY_CAP = 200;
const SWEEP_EVERY_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DISPLAY_NAME_MAX = 100;
const hasControl = (s: string): boolean => { for (const ch of s) { const c = ch.codePointAt(0)!; if (c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return true; } return false; };
const IP_PREFIX = /^[0-9A-Fa-f:.]+\/(24|48)$/;
const UA_SUMMARY = /^[A-Za-z0-9 ._+-]*$/;

/** The password module surface (./password.ts exports exactly this). */
export interface PasswordApi {
  hash(password: string): Promise<string>;
  verify(storedHash: string | null | undefined, password: string): Promise<boolean>;
  needsRehash(storedHash: string): boolean;
}

export interface AuthStore {
  /** Tenant-scoped. `email` is the UA-2 normalised form. */
  findUserByEmail(tenantId: string, email: string): Promise<Users | null>;
  findUserById(tenantId: string, userId: string): Promise<Users | null>;
  /** Throws the Mongo E11000 on a duplicate normalised email (global index). */
  insertUser(tenantId: string, input: UserInput, now: Date): Promise<Users>;
  /** `$set`; with `expectStatus` it is a compare-and-set on the status. True when a row matched. */
  updateUser(tenantId: string, userId: string, set: Partial<Users>, expectStatus?: Users["status"]): Promise<boolean>;
  countUsersCreatedSince(tenantId: string, since: Date): Promise<number>;
  deleteStaleUnverified(tenantId: string, olderThan: Date): Promise<number>;
  insertToken(tenantId: string, input: TokenInput, now: Date): Promise<void>;
  /** The owning user id of an unused, unexpired token of this purpose, WITHOUT spending it. */
  peekToken(tenantId: string, tokenHash: string, purpose: TokenPurpose, now: Date): Promise<string | null>;
  /** Atomic single use: the user id for exactly one caller, null for everyone else. */
  consumeToken(tenantId: string, tokenHash: string, purpose: TokenPurpose, now: Date): Promise<string | null>;
  /** Active (not revoked) sessions of one user. */
  listSessions(tenantId: string, userId: string): Promise<UserSessions[]>;
  getSession(tenantId: string, sessionId: string): Promise<UserSessions | null>;
  throttle: ThrottleStore;
  recordEvent(tenantId: string, event: AuthEventInput, now: Date): Promise<void>;
}

export interface RequestMeta { ipPrefix?: string; userAgentSummary?: string }
export interface ApiResult { status: number; body: Record<string, unknown>; sessionToken?: string; clearCookie?: boolean }
export interface AuthServiceDeps {
  store: AuthStore;
  sessions: SessionService;
  password: PasswordApi;
  /** AUTH_CSRF_SECRET: keys the CSRF token and the salted subject hash. */
  csrfSecret: string;
  now?: () => Date;
  signupDailyCap?: number;
  log?: { warn(message: string, fields?: Record<string, unknown>): void };
}

const INVALID_CREDENTIALS = (): ApiResult => ({ status: 401, body: { error: "invalid_credentials", message: "invalid email or password" } });
const INVALID_TOKEN = (): ApiResult => ({ status: 400, body: { error: "invalid_token", message: "this link is invalid or has expired" } });
const RATE_LIMITED = (): ApiResult => ({ status: 429, body: { error: "rate_limited", message: "too many requests — slow down and retry after the window" } });
const NOT_FOUND_SESSION = (): ApiResult => ({ status: 404, body: { error: "not_found", message: "no such session" } });
const invalidRequest = (fields: string[], reasons?: string[]): ApiResult => ({ status: 400, body: { error: "invalid_request", message: "the request is not acceptable", fields, ...(reasons ? { reasons } : {}) } });

function cleanMeta(meta: RequestMeta | undefined): RequestMeta {
  const out: RequestMeta = {};
  if (typeof meta?.ipPrefix === "string" && meta.ipPrefix.length <= 64 && IP_PREFIX.test(meta.ipPrefix)) out.ipPrefix = meta.ipPrefix;
  if (typeof meta?.userAgentSummary === "string" && meta.userAgentSummary.length <= 80 && UA_SUMMARY.test(meta.userAgentSummary)) out.userAgentSummary = meta.userAgentSummary;
  return out;
}
const publicUser = (u: Users) => ({ id: u._id, displayName: u.displayName, role: u.role ?? null });

export function createAuthService(deps: AuthServiceDeps) {
  const { store, sessions, password } = deps;
  const clock = deps.now ?? (() => new Date());
  const cap = deps.signupDailyCap ?? DEFAULT_SIGNUP_DAILY_CAP;
  const throttle = createThrottle({ store: store.throttle, now: clock });
  const nowMs = () => clock().getTime();
  const signupPerEmail = createWindowLimiter({ max: 3, windowMs: HOUR_MS, now: nowMs });
  const forgotPerEmail = createWindowLimiter({ max: 3, windowMs: HOUR_MS, now: nowMs });
  const lastSweep = new Map<string, number>();

  const subjectHash = (tenantId: string, email: string): string => createHmac("sha256", deps.csrfSecret).update(`lkb-subject:${tenantId}:${email}`, "utf8").digest("hex");

  async function emit(tenantId: string, event: AuthEventInput, meta?: RequestMeta): Promise<void> {
    try { await store.recordEvent(tenantId, { ...event, ...cleanMeta(meta) }, clock()); } catch { deps.log?.warn("auth event not written", { type: event.type }); }
  }

  const isStaleUnverified = (u: { status: string; createdAt: string }): boolean => u.status === "unverified" && !(nowMs() - Date.parse(u.createdAt) <= UNVERIFIED_MAX_AGE_MS);

  async function sweepUnverified(tenantId: string): Promise<number> {
    return store.deleteStaleUnverified(tenantId, new Date(nowMs() - UNVERIFIED_MAX_AGE_MS));
  }
  async function maybeSweep(tenantId: string): Promise<void> {
    const last = lastSweep.get(tenantId) ?? 0;
    if (nowMs() - last < SWEEP_EVERY_MS && last !== 0) return;
    lastSweep.set(tenantId, nowMs());
    try { await sweepUnverified(tenantId); } catch { deps.log?.warn("unverified sweep failed"); }
  }

  /** The generic failure: a locked or failing attempt still costs a full verify, so timing does not tell. */
  async function failedLogin(tenantId: string, hash: string | null, user: Users | null, meta: RequestMeta): Promise<ApiResult> {
    let newlyLocked = false;
    if (hash !== null) newlyLocked = (await throttle.fail(tenantId, hash)).newlyLocked;
    await emit(tenantId, { type: "login_failed", outcome: "failed", detail: user ? "invalid_credentials" : "unknown_account", ...(hash ? { subjectHash: hash } : {}), ...(user ? { targetUserId: user._id } : {}) }, meta);
    if (newlyLocked) await emit(tenantId, { type: "locked", outcome: "denied", detail: "locked", ...(hash ? { subjectHash: hash } : {}), ...(user ? { targetUserId: user._id } : {}) }, meta);
    return INVALID_CREDENTIALS();
  }

  return {
    subjectHash,
    isStaleUnverified,
    sweepUnverified,

    /** UA-1. Identical response for new / existing / other-tenant address; the password is hashed on every path. */
    async signup(tenantId: string, input: { email: string; password: string; displayName: string }, meta?: RequestMeta): Promise<ApiResult> {
      const parsed = parseEmail(input.email);
      if (!parsed.ok) return invalidRequest(["email"]);
      const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
      if (displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX || hasControl(displayName)) return invalidRequest(["displayName"]);
      const policy = checkPassword(input.password, { email: parsed.email });
      if (!policy.ok) return invalidRequest(["password"], policy.reasons);
      if (!signupPerEmail.hit(`${tenantId}|${parsed.email}`)) return RATE_LIMITED();
      if ((await store.countUsersCreatedSince(tenantId, new Date(nowMs() - 24 * HOUR_MS))) >= cap) return { status: 429, body: { error: "signup_capacity", message: "signups are temporarily full; try again later" } };
      await maybeSweep(tenantId);
      const hash = subjectHash(tenantId, parsed.email);
      const passwordHash = await password.hash(input.password);
      const generic = (): ApiResult => ({ status: GENERIC_SIGNUP_RESPONSE.status, body: { ...GENERIC_SIGNUP_RESPONSE.body } });
      if (await store.findUserByEmail(tenantId, parsed.email)) {
        await emit(tenantId, { type: "signup", outcome: "denied", detail: "existing_account", subjectHash: hash }, meta);
        return generic();
      }
      try {
        const row = await store.insertUser(tenantId, { emailNormalized: parsed.email, displayName, passwordHash }, clock());
        await emit(tenantId, { type: "signup", outcome: "ok", detail: "new_account", subjectHash: hash, targetUserId: row._id }, meta);
      } catch (err) {
        if (!isDuplicateEmailError(err)) throw err;
        // E11000 on the GLOBAL unique index: the address lives in this or another tenant. One generic response (ISS-415).
        await emit(tenantId, { type: "signup", outcome: "denied", detail: "existing_account", subjectHash: hash }, meta);
      }
      return generic();
    },

    /** UA-4. Redeems an admin-issued verify token: unverified -> pending. Every failure is the same 400. */
    async verifyEmail(tenantId: string, token: string, meta?: RequestMeta): Promise<ApiResult> {
      const fail = async (): Promise<ApiResult> => { await emit(tenantId, { type: "email_verified", outcome: "failed", detail: "token_invalid" }, meta); return INVALID_TOKEN(); };
      const tokenHash = hashToken(token);
      if (tokenHash === null) return fail();
      const userId = await store.consumeToken(tenantId, tokenHash, "verify_email", clock());
      if (userId === null) return fail();
      const user = await store.findUserById(tenantId, userId);
      if (!user || user.status !== "unverified" || isStaleUnverified(user)) return fail();
      const at = clock().toISOString();
      if (!(await store.updateUser(tenantId, user._id, { status: "pending", emailVerifiedAt: at, statusChangedAt: at, updatedAt: at }, "unverified"))) return fail();
      await emit(tenantId, { type: "email_verified", outcome: "ok", detail: "none", targetUserId: user._id }, meta);
      return { status: 200, body: { ok: true, state: "pending" } };
    },

    /** UA-11 / UA-12 / UA-24. */
    async login(tenantId: string, input: { email: string; password: string }, meta?: RequestMeta): Promise<ApiResult> {
      const m = cleanMeta(meta);
      const pw = typeof input.password === "string" ? input.password : "";
      const parsed = parseEmail(input.email);
      const hash = parsed.ok ? subjectHash(tenantId, parsed.email) : null;
      if (hash !== null && (await throttle.isLocked(tenantId, hash))) {
        await password.verify(null, pw); // same cost as a real attempt; a lock must not be visible by timing
        await emit(tenantId, { type: "login_failed", outcome: "denied", detail: "locked", subjectHash: hash }, m);
        return INVALID_CREDENTIALS();
      }
      const user = parsed.ok ? await store.findUserByEmail(tenantId, parsed.email) : null;
      const verified = await password.verify(user?.passwordHash ?? null, pw);
      if (!user || !verified) return failedLogin(tenantId, hash, user, m);
      if (hash !== null) await throttle.clear(tenantId, hash);
      if (user.status !== "active" && user.status !== "pending") {
        await emit(tenantId, { type: "login_failed", outcome: "denied", detail: "not_active", targetUserId: user._id, ...(hash ? { subjectHash: hash } : {}) }, m);
        return { status: 200, body: { state: user.status } };
      }
      if (user.status === "active" && !isRole(user.role)) return INVALID_CREDENTIALS(); // an active user without a role is corrupt: no session
      const at = clock().toISOString();
      const set: Partial<Users> = { lastLoginAt: at, updatedAt: at };
      if (password.needsRehash(user.passwordHash)) set.passwordHash = await password.hash(pw);
      const { token, session } = await sessions.create(tenantId, user._id, m);
      await store.updateUser(tenantId, user._id, set);
      await emit(tenantId, { type: "login_ok", outcome: "ok", detail: "none", actorUserId: user._id, targetUserId: user._id }, m);
      return { status: 200, body: { state: user.status, user: publicUser(user), csrfToken: csrfTokenFor(session._id, deps.csrfSecret) }, sessionToken: token };
    },

    /** `GET /auth/session`: who am I, plus the CSRF token for this session (held in page memory only). */
    async currentSession(auth: VerifiedKey): Promise<ApiResult> {
      const user = auth.userId && auth.sessionId ? await store.findUserById(auth.tenantId, auth.userId) : null;
      if (!user || (user.status !== "active" && user.status !== "pending")) return { status: 401, body: { error: "unauthorized", message: "invalid session" } };
      return { status: 200, body: { state: user.status, user: publicUser(user), csrfToken: csrfTokenFor(auth.sessionId!, deps.csrfSecret) } };
    },

    /** UA-18. */
    async logout(auth: VerifiedKey, meta?: RequestMeta): Promise<ApiResult> {
      await sessions.revoke(auth.tenantId, auth.sessionId!, "logout");
      await emit(auth.tenantId, { type: "logout", outcome: "ok", detail: "none", actorUserId: auth.userId!, targetUserId: auth.userId! }, meta);
      return { status: 200, body: { ok: true }, clearCookie: true };
    },
    async logoutAll(auth: VerifiedKey, meta?: RequestMeta): Promise<ApiResult> {
      await sessions.revokeAllForUser(auth.tenantId, auth.userId!, "logout");
      await emit(auth.tenantId, { type: "logout", outcome: "ok", detail: "self_action", actorUserId: auth.userId!, targetUserId: auth.userId! }, meta);
      return { status: 200, body: { ok: true }, clearCookie: true };
    },

    /** UA-20. Never exposes token hashes or family ids. */
    async listSessions(auth: VerifiedKey): Promise<ApiResult> {
      const rows = await store.listSessions(auth.tenantId, auth.userId!);
      return { status: 200, body: { sessions: rows.map((r) => ({ id: r._id, current: r._id === auth.sessionId, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt, ...(r.ipPrefix ? { ipPrefix: r.ipPrefix } : {}), ...(r.userAgentSummary ? { userAgentSummary: r.userAgentSummary } : {}) })) } };
    },
    async revokeOwnSession(auth: VerifiedKey, sessionId: string, meta?: RequestMeta): Promise<ApiResult> {
      const row = typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 64 ? await store.getSession(auth.tenantId, sessionId) : null;
      if (!row || row.userId !== auth.userId || row.revokedAt !== undefined) return NOT_FOUND_SESSION();
      await sessions.revoke(auth.tenantId, row._id, "logout");
      await emit(auth.tenantId, { type: "session_revoked", outcome: "ok", detail: "self_action", actorUserId: auth.userId!, targetUserId: auth.userId! }, meta);
      return { status: 200, body: { ok: true }, clearCookie: row._id === auth.sessionId };
    },

    /** UA-21. Always 202: v1 sends no mail and issues nothing; an admin issues the reset link. */
    async forgotPassword(tenantId: string, email: string): Promise<ApiResult> {
      const parsed = parseEmail(email);
      if (parsed.ok && !forgotPerEmail.hit(`${tenantId}|${parsed.email}`)) return RATE_LIMITED();
      return { status: 202, body: { ok: true } };
    },

    /** UA-21. Redeems an admin-issued reset token. A policy failure does not spend the token. */
    async resetPassword(tenantId: string, input: { token: string; newPassword: string }, meta?: RequestMeta): Promise<ApiResult> {
      const fail = async (): Promise<ApiResult> => { await emit(tenantId, { type: "password_reset", outcome: "failed", detail: "token_invalid" }, meta); return INVALID_TOKEN(); };
      const shape = checkPassword(input.newPassword);
      if (!shape.ok) return invalidRequest(["newPassword"], shape.reasons);
      const tokenHash = hashToken(input.token);
      if (tokenHash === null) return fail();
      const userId = await store.peekToken(tenantId, tokenHash, "password_reset", clock());
      if (userId === null) return fail();
      const user = await store.findUserById(tenantId, userId);
      if (!user || user.status === "rejected" || user.status === "disabled") return fail();
      const policy = checkPassword(input.newPassword, { email: user.emailNormalized });
      if (!policy.ok) return invalidRequest(["newPassword"], policy.reasons);
      const newHash = await password.hash(input.newPassword);
      if ((await store.consumeToken(tenantId, tokenHash, "password_reset", clock())) !== user._id) return fail();
      const at = clock().toISOString();
      await store.updateUser(tenantId, user._id, { passwordHash: newHash, passwordChangedAt: at, updatedAt: at });
      await sessions.revokeAllForUser(tenantId, user._id, "password_reset");
      await emit(tenantId, { type: "password_reset", outcome: "ok", detail: "none", targetUserId: user._id }, meta);
      return { status: 200, body: { ok: true } };
    },

    /** UA-22. Needs the current password (counted toward the same lockout); revokes the user's OTHER sessions. */
    async changePassword(auth: VerifiedKey, input: { currentPassword: string; newPassword: string }, meta?: RequestMeta): Promise<ApiResult> {
      const m = cleanMeta(meta);
      const user = auth.userId ? await store.findUserById(auth.tenantId, auth.userId) : null;
      if (!user || (user.status !== "active" && user.status !== "pending")) return { status: 401, body: { error: "unauthorized", message: "invalid session" } };
      const policy = checkPassword(input.newPassword, { email: user.emailNormalized });
      if (!policy.ok) return invalidRequest(["newPassword"], policy.reasons);
      const hash = subjectHash(auth.tenantId, user.emailNormalized);
      const wrong = (): ApiResult => ({ status: 403, body: { error: "invalid_credentials", message: "the current password is not correct" } });
      if (await throttle.isLocked(auth.tenantId, hash)) { await password.verify(null, typeof input.currentPassword === "string" ? input.currentPassword : ""); await emit(auth.tenantId, { type: "password_changed", outcome: "denied", detail: "locked", actorUserId: user._id, targetUserId: user._id }, m); return wrong(); }
      if (!(await password.verify(user.passwordHash, typeof input.currentPassword === "string" ? input.currentPassword : ""))) {
        const { newlyLocked } = await throttle.fail(auth.tenantId, hash);
        await emit(auth.tenantId, { type: "password_changed", outcome: "failed", detail: "invalid_credentials", actorUserId: user._id, targetUserId: user._id }, m);
        if (newlyLocked) await emit(auth.tenantId, { type: "locked", outcome: "denied", detail: "locked", subjectHash: hash, targetUserId: user._id }, m);
        return wrong();
      }
      await throttle.clear(auth.tenantId, hash);
      const newHash = await password.hash(input.newPassword);
      const at = clock().toISOString();
      await store.updateUser(auth.tenantId, user._id, { passwordHash: newHash, passwordChangedAt: at, updatedAt: at });
      await sessions.revokeAllForUser(auth.tenantId, user._id, "password_change", auth.sessionId);
      await emit(auth.tenantId, { type: "password_changed", outcome: "ok", detail: "self_action", actorUserId: user._id, targetUserId: user._id }, m);
      return { status: 200, body: { ok: true } };
    },

    // ---- Exports for A6 (admin-service) ------------------------------------------------------------------------------------------

    /** Issues a single-use verify / reset token for a user of THIS tenant and writes the `link_issued` event. The raw token is returned ONCE
     * (A6 turns it into a link from APP_PUBLIC_ORIGIN + base path); only its sha256 is stored. Null when the user does not exist here. */
    async issueToken(tenantId: string, purpose: TokenPurpose, userId: string, issuedBy?: string): Promise<{ token: string; expiresAt: string; purpose: TokenPurpose } | null> {
      const user = typeof userId === "string" && userId.length > 0 ? await store.findUserById(tenantId, userId) : null;
      if (!user) return null;
      const { token, tokenHash } = generateToken();
      const now = clock();
      await store.insertToken(tenantId, { userId: user._id, purpose, tokenHash, issuedVia: "admin", ...(issuedBy !== undefined ? { issuedBy } : {}) }, now);
      await emit(tenantId, { type: "link_issued", outcome: "ok", detail: "admin_action", targetUserId: user._id, ...(issuedBy !== undefined ? { actorUserId: issuedBy } : {}) });
      return { token, expiresAt: tokenExpiry(purpose, now).toISOString(), purpose };
    },
    /** Admin unlock (UA-24): clears the throttle row of that address and writes `unlocked`. False for an unusable address. */
    async unlockEmail(tenantId: string, email: string, actorUserId?: string): Promise<boolean> {
      const parsed = parseEmail(email);
      if (!parsed.ok) return false;
      const hash = subjectHash(tenantId, parsed.email);
      await throttle.clear(tenantId, hash);
      await emit(tenantId, { type: "unlocked", outcome: "ok", detail: "admin_action", subjectHash: hash, ...(actorUserId !== undefined ? { actorUserId } : {}) });
      return true;
    },
    /** Revokes every active session of one user (admin disable / revoke-sessions). Writes no event: the calling admin route owns its own. */
    revokeAllSessions: (tenantId: string, userId: string, reason: SessionRevokeReason, exceptSessionId?: string): Promise<number> => sessions.revokeAllForUser(tenantId, userId, reason, exceptSessionId),
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
