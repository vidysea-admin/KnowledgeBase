import { isAbsolute, resolve } from "node:path";
import type { Db } from "mongodb";
import type { ApiKeys, Sessions } from "@lkb/core";
import { scopedCollection } from "@lkb/db";
import type { ApiKeyStore, VerifiedKey } from "../../auth.js";
import type { BoundIndexer } from "../../indexing/session.js";
import type { AskRouteDeps } from "../../routes/ask/ask.js";
import type { KeysDeps } from "../../routes/keys.js";
import type { SourceIntakeDeps } from "../../source-intake/store.js";
import type { IntegrationRouting } from "./types.js";
import { createConfiguredHostingDeps } from "../../hosting/config.js";
import { HostingJournal } from "../../hosting/journal.js";
import { HostingError, hostingId, type HostingPrincipal } from "../../hosting/types.js";
import type { HostingRouterDeps } from "../../hosting/router.js";
import { CounsellorAccountStore } from "../../counsellor-accounts/store.js";
import { CounsellorAccountsService } from "../../counsellor-accounts/service.js";
import { createAccountAwareKeyStore } from "../../counsellor-accounts/key-store.js";
import type { RetentionStatusDeps } from "../../retention-status/router.js";
import { createRetentionStatusReader } from "../../retention-status/store.js";
import type { OperationsService, OperationsDeps } from "../../operations-integrations/service.js";
import { createOperationsService } from "../../operations-integrations/service.js";
import { createMongoScheduleStore } from "../../operations-integrations/store.js";
import { createConfiguredOperationsAdapters } from "../../operations-integrations/adapters.js";

export interface HostingIntegrations {
  hosting?: HostingRouterDeps;
  counsellorAccounts?: { service: CounsellorAccountsService; keys: ApiKeyStore };
  retentionStatus?: RetentionStatusDeps;
  operationsSchedules?: { service: OperationsService; hosting: HostingRouterDeps["service"] };
  keyStore?: ApiKeyStore;
  keys?: KeysDeps;
}
export interface HostingIntegrationInput {
  db: Db; env: NodeJS.ProcessEnv; root: string; index: BoundIndexer; ask: AskRouteDeps;
  sourceIntake?: SourceIntakeDeps; routing: IntegrationRouting;
  keyStore: ApiKeyStore; keys: KeysDeps;
  notifications?: OperationsDeps["notifications"];
}
function principal(tenant: string, actor?: VerifiedKey): HostingPrincipal {
  if (!actor || actor.tenantId !== tenant || !Array.isArray(actor.scopes) || !actor.scopes.every(s => typeof s === "string")) throw new HostingError("verified_identity_unavailable", 503);
  return { tenantId: hostingId(tenant, "tenant"), keyId: hostingId(actor.keyId, "actor"), scopes: [...actor.scopes] };
}
function unavailable(): never { throw new HostingError("hosting_unavailable", 503); }
const failedKeys: KeysDeps = { listKeys: async () => unavailable(), createKey: async () => unavailable(), revokeKey: async () => unavailable() };
const failedAuthentication: ApiKeyStore = { verify: async () => unavailable() };

/** Construction reads configuration only. No journal append, Mongo mutation or provider invocation. */
export function buildHostingIntegrations(input: HostingIntegrationInput): HostingIntegrations {
  const retentionRoot = input.env.LKB_RETENTION_DATA_ROOT;
  const retentionStatus: RetentionStatusDeps | undefined = retentionRoot && isAbsolute(retentionRoot) && !/(?:^|[\\/])(?:public|wwwroot|static|assets)(?:[\\/]|$)/i.test(retentionRoot)
    ? { readRetentionStatus: createRetentionStatusReader(retentionRoot) } : undefined;
  const apiKeys = (tenant: string) => scopedCollection<ApiKeys>(input.db, "api_keys")(hostingId(tenant, "tenant"));
  const hosting = createConfiguredHostingDeps(input.env, {
    keyExists: async (tenant, keyId) => Boolean(await apiKeys(tenant).find({ _id: hostingId(keyId, "key"), revokedAt: null }).project<Pick<ApiKeys, "_id">>({ _id: 1 }).maxTimeMS(15000).limit(1).next()),
  });
  // Every live key mutation requires the configured authority; absence cannot fall back to ungated writes.
  const result: HostingIntegrations = { hosting, retentionStatus, keys: failedKeys };
  if (!hosting) {
    if (["LKB_HOSTING_STATE_DIR", "LKB_HOSTING_ENCRYPTION_KEY", "LKB_HOSTING_BOOTSTRAP_ADMINS", "LKB_HOSTING_WEBHOOK_ORIGINS", "LKB_COUNSELLOR_STATE_DIR"].some(name => input.env[name] !== undefined)) result.keyStore = failedAuthentication;
    return result;
  }
  let keyStore = input.keyStore;
  const accountRoot = input.env.LKB_COUNSELLOR_STATE_DIR;
  if (accountRoot !== undefined) {
    try {
      if (!isAbsolute(accountRoot) || /(?:^|[\\/])(?:public|wwwroot|static|assets)(?:[\\/]|$)/i.test(accountRoot) || resolve(accountRoot).toLowerCase() === hosting.service.options.journal.root.toLowerCase()) unavailable();
      const accounts = new CounsellorAccountStore(new HostingJournal(accountRoot));
      hosting.service.setAccountStatusProvider(async (tenant, id) => await accounts.identityStatus(tenant, id) ?? "unbound");
      keyStore = createAccountAwareKeyStore(input.keyStore, accounts);
      result.counsellorAccounts = {
        service: new CounsellorAccountsService(accounts, hosting.service, {
          activeKeyIds: async (tenant) => {
            const rows = await apiKeys(tenant).find({ revokedAt: null, scopes: "hosting" }).project<Pick<ApiKeys, "_id">>({ _id: 1 }).maxTimeMS(15000).limit(1001).toArray();
            if (rows.length > 1000) throw new HostingError("identity_directory_capacity", 503);
            return rows.map(row => row._id);
          },
        }), keys: keyStore,
      };
    } catch { return { hosting: undefined, retentionStatus, keyStore: failedAuthentication, keys: failedKeys }; }
  }
  const lifecycleKeys: ApiKeyStore = {
    async verify(rawKey) {
      const verified = await keyStore.verify(rawKey);
      if (!verified) return null;
      if (!verified.keyId) throw new HostingError("verified_identity_unavailable", 503);
      return await hosting.service.isIdentityActive(verified.tenantId, verified.keyId) ? verified : null;
    },
  };
  result.keyStore = lifecycleKeys;
  if (result.counsellorAccounts) result.counsellorAccounts.keys = lifecycleKeys;
  result.keys = {
    listKeys: async (tenant, actor) => hosting.service.withPermission(principal(tenant, actor), "keys:read", () => input.keys.listKeys(tenant)),
    createKey: async (tenant, label, scopes, actor) => {
      const p = principal(tenant, actor);
      if (!Array.isArray(scopes) || !scopes.length || scopes.some(scope => typeof scope !== "string" || !p.scopes.includes(scope))) throw new HostingError("scope_elevation_forbidden", 403);
      return hosting.service.keyMutation(p, "create", null, () => input.keys.createKey(tenant, label, scopes), value => value.id);
    },
    revokeKey: async (tenant, id, actor) => hosting.service.keyMutation(principal(tenant, actor), "revoke", hostingId(id, "key"), () => input.keys.revokeKey(tenant, id), () => id),
  };
  // The adopted job/CLI and reader share only the explicit root; no legacy summary fallback.
  result.operationsSchedules = {
    hosting: hosting.service,
    service: createOperationsService({
      // This unit has no separately authorized production Mongo write target.
      store: createMongoScheduleStore(() => false, () => input.db),
      adapters: createConfiguredOperationsAdapters(input.env),
      notifications: input.notifications,
      sessions: async (tenant, limit) => {
        if (!Number.isInteger(limit) || limit < 1 || limit > 501) throw new HostingError("invalid_snapshot_limit");
        return scopedCollection<Sessions>(input.db, "sessions")(hostingId(tenant, "tenant"))
          .find({}).project<Sessions>({ _id: 1, tenantId: 1, title: 1, date: 1, status: 1 }).maxTimeMS(15000)
          .sort({ date: -1, _id: -1 }).limit(limit).toArray();
      },
    }),
  };
  return result;
}
