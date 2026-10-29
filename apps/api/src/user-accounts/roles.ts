/**
 * apps/api/src/user-accounts/roles.ts -- unit `ua-session-core`, spec UA-9. The ONE role -> scope table.
 * A session's scopes are derived from the user's CURRENT role on every request (never copied into the
 * session row), so a role change applies on the very next request. No role ever holds an operator scope:
 * those stay API-key scopes (`OPERATOR_ONLY_SCOPES`, asserted against ALL_SCOPES in the tests).
 * Approved table: docs/user-accounts/roles.md.
 */
import type { Users } from "@lkb/core";
import type { VerifiedKey } from "../auth.js";

export type Role = "admin" | "member" | "viewer";

const VIEWER = ["ask", "search", "citations", "sessions", "graph", "gaps", "calendar", "sources"] as const;
const MEMBER = [...VIEWER, "ingest", "whatsapp", "whatsapp-link"] as const;
const ADMIN = [...MEMBER, "user-admin", "whatsapp-admin", "join-rules", "registration:approve", "answer-policy:read", "answer-policy:write"] as const;

export const ROLE_SCOPES: Readonly<Record<Role, readonly string[]>> = Object.freeze({
  viewer: Object.freeze([...VIEWER]), member: Object.freeze([...MEMBER]), admin: Object.freeze([...ADMIN]),
});

/** Scopes that stay with operator API keys; a role must never hold one. */
export const OPERATOR_ONLY_SCOPES: readonly string[] = Object.freeze([
  "hosting", "keys", "jobs", "operations:write", "automation:read", "automation:write", "automation:operate", "send-now", "webhooks", "gmail",
]);

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "member" || value === "viewer";
}

/** A fresh copy of the role's scopes; anything that is not exactly a known role yields none (fail closed). */
export function scopesForRole(role: unknown): string[] {
  return isRole(role) ? [...ROLE_SCOPES[role]] : [];
}

/** User row -> `req.auth`. active -> scopes from the CURRENT role; pending -> none + notActive; any other status -> no principal. */
export function principalFromUser(user: Users, sessionId: string): VerifiedKey | null {
  const base = { tenantId: user.tenantId, principal: "session" as const, userId: user._id, sessionId };
  if (user.status === "active") return isRole(user.role) ? { ...base, scopes: scopesForRole(user.role), userRole: user.role } : null;
  if (user.status === "pending") return { ...base, scopes: [], notActive: true };
  return null; // unverified | rejected | disabled: no access of any kind (UA-5, UA-12)
}
