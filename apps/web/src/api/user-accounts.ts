/**
 * apps/web/src/api/user-accounts.ts -- unit `ua-web` (A7). Typed wrappers for the `/auth/*` and `/admin/*` routes of
 * apps/api/src/user-accounts/{auth-router,admin-router}.ts (spec UA-12, UA-16, UA-18, UA-20, UA-30).
 *
 * Every call goes through `apiFetch` with SESSION_CREDENTIAL: cookie + `X-LKB-CSRF` from client.ts, no Authorization header,
 * no token in JS-readable storage. Bodies are exactly the strict shapes the server accepts (unknown fields are 400 there).
 */
import { ApiError, apiFetch, SESSION_CREDENTIAL as S } from "./client.js";

export type Role = "admin" | "member" | "viewer";
export type UserStatus = "unverified" | "pending" | "active" | "rejected" | "disabled";
export const ROLES: readonly Role[] = ["admin", "member", "viewer"];
export const USER_STATUSES: readonly UserStatus[] = ["unverified", "pending", "active", "rejected", "disabled"];

/** Account sign-in is dark until the container writes `userAccounts: true` into config.js (read at call time so tests can toggle it). */
export function accountsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const raw = (window as unknown as { __LKB_CONFIG__?: { userAccounts?: unknown } }).__LKB_CONFIG__;
  return typeof raw === "object" && raw !== null && raw.userAccounts === true;
}

export interface SessionUser { id: string; displayName: string; role: Role | null }
export interface SessionInfo { state: "active" | "pending"; user: SessionUser; csrfToken: string }

/** The body of a successful login / `GET /auth/session`; null when it is not exactly that (never trust the shape). */
export function parseSession(body: unknown): SessionInfo | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as { state?: unknown; user?: unknown; csrfToken?: unknown };
  if ((b.state !== "active" && b.state !== "pending") || typeof b.csrfToken !== "string" || b.csrfToken === "") return null;
  if (typeof b.user !== "object" || b.user === null) return null;
  const u = b.user as { id?: unknown; displayName?: unknown; role?: unknown };
  if (typeof u.id !== "string" || typeof u.displayName !== "string") return null;
  const role = u.role === "admin" || u.role === "member" || u.role === "viewer" ? u.role : null;
  if (b.state === "active" && role === null) return null; // an active account always has a role
  return { state: b.state, user: { id: u.id, displayName: u.displayName, role }, csrfToken: b.csrfToken };
}

// ---- public + self-service (/auth) -------------------------------------------------------------------------------------------------

export type LoginResult = { kind: "session"; session: SessionInfo } | { kind: "blocked"; state: "rejected" | "disabled" };

/** 200 {state:"rejected"|"disabled"} carries no session; any other 200 must be a full session body. */
export async function login(email: string, password: string): Promise<LoginResult> {
  const body = await apiFetch<unknown>("/auth/login", S, { method: "POST", body: { email, password } });
  const session = parseSession(body);
  if (session) return { kind: "session", session };
  const state = (body as { state?: unknown } | null)?.state;
  if (state === "rejected" || state === "disabled") return { kind: "blocked", state };
  throw new ApiError(502, "unexpected sign-in response");
}

/** The signed-in person, or null when the response is not a session body. A 401 (no cookie / revoked) throws ApiError(401). */
export async function fetchSession(): Promise<SessionInfo | null> {
  return parseSession(await apiFetch<unknown>("/auth/session", S));
}

export function signup(input: { email: string; password: string; displayName: string }): Promise<{ ok: true; next: string }> {
  return apiFetch("/auth/signup", S, { method: "POST", body: input });
}
export function verifyEmail(token: string): Promise<{ ok: true; state: "pending" }> {
  return apiFetch("/auth/verify-email", S, { method: "POST", body: { token } });
}
export function forgotPassword(email: string): Promise<{ ok: true }> {
  return apiFetch("/auth/password/forgot", S, { method: "POST", body: { email } });
}
export function resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
  return apiFetch("/auth/password/reset", S, { method: "POST", body: { token, newPassword } });
}
export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return apiFetch("/auth/password/change", S, { method: "POST", body: { currentPassword, newPassword } });
}
export function logout(): Promise<{ ok: true }> { return apiFetch("/auth/logout", S, { method: "POST", body: {} }); }
export function logoutAll(): Promise<{ ok: true }> { return apiFetch("/auth/logout-all", S, { method: "POST", body: {} }); }

export interface MySession { id: string; current: boolean; createdAt: string; lastUsedAt: string; ipPrefix?: string; userAgentSummary?: string }
export function listMySessions(): Promise<{ sessions: MySession[] }> { return apiFetch("/auth/sessions", S); }
export function revokeMySession(id: string): Promise<{ ok: true }> {
  return apiFetch(`/auth/sessions/${encodeURIComponent(id)}`, S, { method: "DELETE" });
}

// ---- admin (/admin) ----------------------------------------------------------------------------------------------------------------

export interface AdminUser {
  id: string; email: string; displayName: string; status: UserStatus; role: Role | null;
  mailStatus?: "sent" | "not_sent"; emailVerifiedAt?: string; statusChangedAt?: string; statusChangedBy?: string; lastLoginAt?: string;
  createdAt: string; updatedAt: string;
}
export interface AdminUserPage { users: AdminUser[]; next: string | null; pendingCount: number }
export interface AuditEvent { id: string; at: string; type: string; outcome: string; detail: string; actorUserId?: string; targetUserId?: string; ipPrefix?: string; userAgentSummary?: string }
export interface AuditPage { events: AuditEvent[]; next: string | null }
export interface IssuedLink { link: string; purpose: "verify_email" | "password_reset"; expiresAt: string }

function query(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  return q ? `?${q}` : "";
}

export function listUsers(opts: { status?: UserStatus; cursor?: string; limit?: number } = {}): Promise<AdminUserPage> {
  return apiFetch(`/admin/users${query(opts)}`, S);
}
export function getUser(id: string): Promise<{ user: AdminUser; activeSessionCount: number }> {
  return apiFetch(`/admin/users/${encodeURIComponent(id)}`, S);
}
export function listAudit(opts: { cursor?: string; limit?: number; targetUserId?: string } = {}): Promise<AuditPage> {
  return apiFetch(`/admin/audit${query(opts)}`, S);
}

export type UserAction =
  | { action: "approve" | "role"; role: Role }
  | { action: "reject" | "disable" | "enable" | "revoke-sessions" | "unlock" }
  | { action: "issue-link"; purpose: "verify_email" | "password_reset" };

/** One POST per action with exactly the strict body the router accepts (`role` for approve/role, `purpose` for issue-link, else none). */
export function userAction(id: string, a: UserAction): Promise<Record<string, unknown>> {
  const body = a.action === "approve" || a.action === "role" ? { role: a.role } : a.action === "issue-link" ? { purpose: a.purpose } : {};
  return apiFetch(`/admin/users/${encodeURIComponent(id)}/${a.action}`, S, { method: "POST", body });
}

// ---- messages ---------------------------------------------------------------------------------------------------------------------

const POLICY_TEXT: Record<string, string> = {
  too_short: "use at least 12 characters", too_long: "use at most 128 characters", common: "that password is too common",
  contains_email: "do not include your email name", invalid: "that password cannot be used",
};

/** One human sentence for any failure of the calls above. Generic by design where the server is generic (no account or lock oracle). */
export function describeAuthError(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Try again.";
  const wait = err.retryAfterSeconds !== undefined ? ` Try again in about ${Math.max(1, Math.ceil(err.retryAfterSeconds / 60))} minute(s).` : "";
  switch (err.status) {
    case 0: return "Cannot reach the server. Check your connection and try again.";
    case 429: return err.code === "signup_capacity" ? "Sign-ups are full for now. Try again later." : `Too many attempts.${wait || " Wait a little and try again."}`;
    case 503:
      if (err.code === "signup_not_configured") return "Sign-up is not open on this server.";
      if (err.code === "auth_not_configured") return "Sign-in is not set up on this server yet.";
      return "Sign-in is temporarily unavailable. Try again shortly.";
    case 401: return err.code === "invalid_credentials" ? "That email or password is not right." : "You were signed out. Sign in again.";
    case 403: return err.code === "invalid_credentials" ? "That current password is not right." : err.code === "account_not_active" ? "This account is waiting for approval." : err.code === "read_only_role" ? "Your role is read-only." : err.code === "csrf" ? "Your session needs a refresh. Reload the page." : "You do not have access to that.";
    case 400: {
      if (err.code === "invalid_token") return "This link is invalid or has expired. Ask an admin for a new one.";
      const why = (err.reasons ?? []).map((r) => POLICY_TEXT[r]).filter(Boolean);
      return why.length > 0 ? `Check the password: ${why.join("; ")}.` : "Check the fields and try again.";
    }
    case 404: return "Not found.";
    case 409: return err.code === "last_admin" ? "This is the only admin; keep at least one." : err.code === "self_action" ? "You cannot do that to your own account." : err.message;
    default: return "Something went wrong. Try again.";
  }
}
