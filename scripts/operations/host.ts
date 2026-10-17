import type { ApiKeyStore } from "../../apps/api/src/auth.js";
import { isValidTenantId } from "../../apps/api/src/auth.js";
import type { HostingService } from "../../apps/api/src/hosting/service.js";
import type { OperationsService } from "../../apps/api/src/operations-integrations/service.js";
import { runOperationsTick } from "./tick.js";
/** Register this callback with the existing supervisor. No timer/daemon or credential is created here. */
export function createOperationsTickHost(options: { service: OperationsService; hosting: Pick<HostingService, "withPermission">; keyStore: ApiKeyStore; env: NodeJS.ProcessEnv }) {
  return async () => {
    if (options.env.LKB_OPERATIONS_WORKER_ENABLED !== "1") return { status: "disabled" as const, outcomes: [] };
    const key = options.env.LKB_OPERATIONS_WORKER_KEY;
    if (!key) throw new Error("Operations worker identity unavailable");
    const verified = await options.keyStore.verify(key);
    if (!verified || !isValidTenantId(verified.tenantId) || typeof verified.keyId !== "string" || !verified.keyId || !Array.isArray(verified.scopes) || !verified.scopes.every(scope => typeof scope === "string")) throw new Error("Operations worker identity unavailable");
    const result = await runOperationsTick(options.service, options.hosting, { tenantId: verified.tenantId, keyId: verified.keyId, scopes: [...verified.scopes] });
    return { status: result.outcomes.some(outcome => ["refused", "failed", "uncertain", "blocked"].includes(outcome.lastResult)) ? "attention" as const : "checked" as const, ...result };
  };
}
