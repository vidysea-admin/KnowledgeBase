import { apiFetch } from "../../api/client.js";
export interface Account { id: string; keyId: string; displayName: string; email: string; status: "active" | "inactive"; revision: number; role: "viewer" | "editor" | "admin" | "owner" | null }
export interface Audit { sequence: number; at: string; actorId: string; operation: string; target: string; outcome: string }
const base = "/counsellor-accounts";
export function accounts(key: string | null) { return apiFetch<{ accounts: Account[] }>(base, key); }
export function identities(key: string | null) { return apiFetch<{ keyIds: string[] }>(`${base}/identities`, key); }
export function createAccount(key: string | null, profile: { keyId: string; displayName: string; email: string }) { return apiFetch(`${base}`, key, { method: "POST", body: profile }); }
export function updateAccount(key: string | null, account: Account, displayName: string, email: string) { return apiFetch(`${base}/${encodeURIComponent(account.id)}`, key, { method: "PUT", body: { expectedRevision: account.revision, displayName, email } }); }
export function accountStatus(key: string | null, account: Account, action: "activate" | "deactivate" | "delete") { return apiFetch(`${base}/${encodeURIComponent(account.id)}/${action}`, key, { method: "POST", body: { expectedRevision: account.revision } }); }
export function accountRole(key: string | null, account: Account, role: string | null) { return apiFetch(`${base}/${encodeURIComponent(account.id)}/role`, key, { method: "PUT", body: { expectedRevision: account.revision, role } }); }
export function accountAudit(key: string | null) { return apiFetch<{ audit: Audit[]; grantAuditPath: string }>(`${base}/audit`, key); }
export function hostingAudit(key: string | null) { return apiFetch<{ records: Audit[] }>("/hosting/audit", key); }
