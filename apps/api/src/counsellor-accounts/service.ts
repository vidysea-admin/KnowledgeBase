import { HostingError, hostingId, type HostingPrincipal, type HostingRole } from "../hosting/types.js";
import { CounsellorAccountStore } from "./store.js";
import { accountRevision } from "./validation.js";
import type { AccountView, AccountsHosting, AccountsKeyDirectory } from "./types.js";

export class CounsellorAccountsService {
  constructor(private readonly store: CounsellorAccountStore, private readonly hosting: AccountsHosting, private readonly keys: AccountsKeyDirectory) {}
  private async view(principal: HostingPrincipal, account: Awaited<ReturnType<CounsellorAccountStore["get"]>>): Promise<AccountView> {
    return { ...account, role: await this.hosting.getRole(principal, account.keyId) };
  }
  private async eligible(principal: HostingPrincipal, keyId: string): Promise<void> {
    if (!(await this.keys.activeKeyIds(principal.tenantId)).includes(keyId)) throw new HostingError("account_identity_not_found", 404);
  }
  async identities(principal: HostingPrincipal): Promise<string[]> {
    return this.hosting.withPermission(principal, "accounts:manage", () => this.keys.activeKeyIds(principal.tenantId));
  }
  async list(principal: HostingPrincipal): Promise<AccountView[]> {
    const accounts = await this.hosting.withPermission(principal, "accounts:read", () => this.store.list(principal.tenantId, principal.keyId));
    const views: AccountView[] = [];
    for (const account of accounts) views.push(await this.view(principal, account));
    return views;
  }
  async get(principal: HostingPrincipal, id: string): Promise<AccountView> {
    const account = await this.hosting.withPermission(principal, "accounts:read", () => this.store.get(principal.tenantId, principal.keyId, id));
    return this.view(principal, account);
  }
  async audit(principal: HostingPrincipal) {
    return this.hosting.withPermission(principal, "accounts:manage", () => this.store.audit(principal.tenantId, principal.keyId));
  }
  async create(principal: HostingPrincipal, keyId: string, profile: unknown) {
    hostingId(keyId, "key");
    return this.hosting.withPermission(principal, "accounts:manage", async () => {
      await this.eligible(principal, keyId);
      return this.store.create(principal.tenantId, principal.keyId, keyId, profile);
    });
  }
  async update(principal: HostingPrincipal, id: string, revision: number, profile: unknown) {
    return this.hosting.withPermission(principal, "accounts:manage", () => this.store.update(principal.tenantId, principal.keyId, id, revision, profile));
  }
  async activate(principal: HostingPrincipal, id: string, revision: number) {
    return this.hosting.withPermission(principal, "accounts:manage", async () => {
      const account = await this.store.get(principal.tenantId, principal.keyId, id);
      await this.eligible(principal, account.keyId);
      // Reactivation restores profile eligibility only; an administrator explicitly grants a role afterward.
      return this.store.status(principal.tenantId, principal.keyId, id, revision, "active");
    });
  }
  private async current(principal: HostingPrincipal, id: string, revision: number) {
    accountRevision(revision);
    const account = await this.store.get(principal.tenantId, principal.keyId, id);
    if (account.revision !== revision) throw new HostingError("account_revision_conflict", 409);
    return account;
  }
  async grant(principal: HostingPrincipal, id: string, revision: number, role: Exclude<HostingRole, "owner"> | null) {
    if (role !== null && !["viewer", "editor", "admin"].includes(role)) throw new HostingError("invalid_account_role");
    // Initial lookup avoids accepting a foreign account's supplied key; authoritative check repeats under hosting lock.
    const account = await this.hosting.withPermission(principal, "accounts:manage", () => this.current(principal, id, revision));
    await this.hosting.changeAccountRole(principal, account.keyId, role, async () => {
      const current = await this.current(principal, id, revision);
      if (current.keyId !== account.keyId || current.status !== "active") throw new HostingError("account_inactive", 409);
      await this.eligible(principal, current.keyId);
    });
    return { ok: true, keyId: account.keyId, role };
  }
  async deactivate(principal: HostingPrincipal, id: string, revision: number, deleted = false) {
    const account = await this.hosting.withPermission(principal, "accounts:manage", () => this.current(principal, id, revision));
    const changed = await this.hosting.changeAccountRole(principal, account.keyId, null, async () => {
      const current = await this.current(principal, id, revision);
      if (!deleted && current.status !== "active") throw new HostingError("account_status_conflict", 409);
    }, () => this.store.status(principal.tenantId, principal.keyId, id, revision, deleted ? "deleted" : "inactive"));
    if (!changed) throw new HostingError("account_recovery_required", 503);
    return changed;
  }
}
