import { randomUUID } from "node:crypto";
import { HostingJournal } from "../hosting/journal.js";
import { HostingError, hostingId, type HostingJournalRecord } from "../hosting/types.js";
import { accountProfile, accountRevision, validateAccount } from "./validation.js";
import type { AccountAudit, CounsellorAccount } from "./types.js";

function replay(rows: HostingJournalRecord[]): Map<string, CounsellorAccount> {
  const accounts = new Map<string, CounsellorAccount>();
  for (const row of rows) {
    if (!["account.create", "account.update", "account.activate", "account.deactivate", "account.delete"].includes(row.operation) || row.outcome !== "committed") throw new HostingError("account_recovery_required", 503);
    let account: CounsellorAccount;
    try { account = validateAccount(row.data); } catch { throw new HostingError("account_recovery_required", 503); }
    const previous = accounts.get(row.target);
    if (account.id !== row.target || account.updatedAt !== row.at || account.revision !== (previous?.revision ?? 0) + 1 ||
        (!previous && (row.operation !== "account.create" || account.status !== "active" || account.createdAt !== row.at)) ||
        (previous && (previous.keyId !== account.keyId || previous.createdAt !== account.createdAt || previous.status === "deleted" || row.operation === "account.create"))) throw new HostingError("account_recovery_required", 503);
    if ((row.operation === "account.activate" && (previous?.status !== "inactive" || account.status !== "active")) ||
        (row.operation === "account.deactivate" && (previous?.status !== "active" || account.status !== "inactive")) ||
        (row.operation === "account.delete" && account.status !== "deleted") ||
        (row.operation === "account.update" && account.status !== previous?.status)) throw new HostingError("account_recovery_required", 503);
    if ([...accounts.values()].some(other => other.id !== account.id && other.status !== "deleted" &&
      (other.keyId === account.keyId || other.email === account.email))) throw new HostingError("account_recovery_required", 503);
    accounts.set(account.id, account);
  }
  return accounts;
}
function visible(accounts: Map<string, CounsellorAccount>, id: string): CounsellorAccount {
  hostingId(id, "account"); const account = accounts.get(id);
  if (!account || account.status === "deleted") throw new HostingError("account_not_found", 404);
  return account;
}

/** Profile state and actor audit are the same fsynced journal record; no second audit sink. */
export class CounsellorAccountStore {
  constructor(private readonly journal: HostingJournal, private readonly now = () => new Date().toISOString()) {}
  private at(): string {
    const at = this.now();
    if (!Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) throw new HostingError("invalid_account_clock", 503);
    return at;
  }
  async list(tenant: string, actor: string): Promise<CounsellorAccount[]> {
    return this.journal.transaction(tenant, actor, this.at(), async rows => ({ value: [...replay(rows).values()].filter(a => a.status !== "deleted") }));
  }
  async get(tenant: string, actor: string, id: string): Promise<CounsellorAccount> {
    return this.journal.transaction(tenant, actor, this.at(), async rows => ({ value: visible(replay(rows), id) }));
  }
  /** Authoritative lifecycle guard for generic hosting grants and verified consumers, including tombstones. */
  async identityStatus(tenant: string, keyId: string): Promise<"active" | "inactive" | "deleted" | null> {
    hostingId(keyId, "key");
    return this.journal.transaction(tenant, keyId, this.at(), async rows => {
      const matches = [...replay(rows).values()].filter(account => account.keyId === keyId);
      return { value: matches.at(-1)?.status ?? null };
    });
  }
  async audit(tenant: string, actor: string): Promise<AccountAudit[]> {
    return this.journal.transaction(tenant, actor, this.at(), async rows => {
      replay(rows); return { value: rows.map(({ sequence, at, actorId, operation, target, outcome }) => ({ sequence, at, actorId, operation, target, outcome })) };
    });
  }
  async create(tenant: string, actor: string, keyId: string, input: unknown): Promise<CounsellorAccount> {
    hostingId(keyId, "key"); const profile = accountProfile(input), at = this.at();
    return this.journal.transaction(tenant, actor, at, async rows => {
      const accounts = replay(rows);
      if ([...accounts.values()].some(a => a.status !== "deleted" && (a.keyId === keyId || a.email === profile.email))) throw new HostingError("account_exists", 409);
      const account: CounsellorAccount = { id: randomUUID(), keyId, ...profile, status: "active", revision: 1, createdAt: at, updatedAt: at };
      return { value: account, operation: "account.create", target: account.id, outcome: "committed", data: account };
    });
  }
  async update(tenant: string, actor: string, id: string, revision: number, input: unknown): Promise<CounsellorAccount> {
    const profile = accountProfile(input);
    return this.change(tenant, actor, id, revision, "account.update", previous => ({ ...previous, ...profile }));
  }
  async status(tenant: string, actor: string, id: string, revision: number, status: "active" | "inactive" | "deleted"): Promise<CounsellorAccount> {
    return this.change(tenant, actor, id, revision, status === "active" ? "account.activate" : status === "inactive" ? "account.deactivate" : "account.delete", previous => {
      if (status === previous.status) throw new HostingError("account_status_conflict", 409);
      return { ...previous, status };
    });
  }
  private async change(tenant: string, actor: string, id: string, revision: number, operation: string,
    apply: (previous: CounsellorAccount) => CounsellorAccount): Promise<CounsellorAccount> {
    accountRevision(revision); const at = this.at();
    return this.journal.transaction(tenant, actor, at, async rows => {
      const accounts = replay(rows), previous = visible(accounts, id);
      if (previous.revision !== revision) throw new HostingError("account_revision_conflict", 409);
      const account = { ...apply(previous), revision: revision + 1, updatedAt: at };
      if (at < previous.updatedAt) throw new HostingError("invalid_account_clock", 503);
      if ([...accounts.values()].some(a => a.id !== id && a.status !== "deleted" && a.email === account.email)) throw new HostingError("account_exists", 409);
      validateAccount(account);
      return { value: account, operation, target: id, outcome: "committed", data: account };
    });
  }
}
