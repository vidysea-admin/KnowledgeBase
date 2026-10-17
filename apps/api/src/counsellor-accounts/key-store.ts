import { isValidTenantId, type ApiKeyStore } from "../auth.js";
import { HostingError } from "../hosting/types.js";
import type { CounsellorAccountStore } from "./store.js";

/** Existing key verification remains authoritative; lifecycle gating applies before every scoped consumer. */
export function createAccountAwareKeyStore(base: ApiKeyStore, accounts: CounsellorAccountStore): ApiKeyStore {
  return {
    async verify(rawKey) {
      const verified = await base.verify(rawKey);
      if (!verified) return null;
      const keyId = (verified as typeof verified & { keyId?: unknown }).keyId;
      if (!isValidTenantId(verified.tenantId) || !isValidTenantId(keyId) || keyId.length > 256) return null;
      let status: Awaited<ReturnType<CounsellorAccountStore["identityStatus"]>>;
      try { status = await accounts.identityStatus(verified.tenantId, keyId); }
      catch { throw new HostingError("accounts_identity_unavailable", 503); }
      return status === null || status === "active" ? verified : null;
    },
  };
}
