import type { HostingPrincipal, HostingRole } from "../hosting/types.js";

export interface CounsellorAccount {
  id: string; keyId: string; displayName: string; email: string;
  status: "active" | "inactive" | "deleted"; revision: number; createdAt: string; updatedAt: string;
}
export interface AccountView extends CounsellorAccount { role: HostingRole | null }
export interface AccountAudit { sequence: number; at: string; actorId: string; operation: string; target: string; outcome: string }
export interface AccountsHosting {
  withPermission<T>(principal: HostingPrincipal, permission: "accounts:read" | "accounts:manage" | "roles:manage", callback: () => Promise<T>): Promise<T>;
  getRole(principal: HostingPrincipal, target: string): Promise<HostingRole | null>;
  changeAccountRole<T>(principal: HostingPrincipal, target: string, role: Exclude<HostingRole, "owner"> | null,
    before: () => Promise<void>, after?: () => Promise<T>): Promise<T | undefined>;
}
export interface AccountsKeyDirectory {
  /** Existing verified registry only. Return IDs of unrevoked tenant keys; never raw values/hashes. */
  activeKeyIds(tenantId: string): Promise<string[]>;
}
