import { isValidTenantId, type ApiKeyStore } from "../../apps/api/src/auth.js";
import type { ConnectorWorkflowDeps } from "../../apps/api/src/connector-workflow/types.js";
import { createConnectorWatchVerifier } from "../../apps/api/src/connector-workflow/watched.js";

export interface WatchedHostOptions {
  workflow: ConnectorWorkflowDeps;
  keyStore: ApiKeyStore;
  env: NodeJS.ProcessEnv;
}

/** A trusted host owns this callback. No credentials, timers, or files are created. */
export function createWatchedSourceTickHost(options: WatchedHostOptions) {
  let busy = false;
  let identity: string | undefined;
  let verify = createConnectorWatchVerifier(options.workflow);
  return async () => {
    if (options.env.LKB_WATCHED_WORKER_ENABLED !== "1") return { status: "disabled" as const, outcomes: [], remaining: 0 };
    if (busy) return { status: "busy" as const, outcomes: [], remaining: 0 };
    busy = true;
    try {
      const key = options.env.LKB_WATCHED_WORKER_KEY;
      if (!key || !options.workflow.sourceJobs) throw new Error("Watched worker unavailable");
      // Resolve current stored identity on every tick; no configured/request tenant is accepted.
      const auth = await options.keyStore.verify(key);
      if (!auth || !isValidTenantId(auth.tenantId) || typeof auth.keyId !== "string" || !auth.keyId ||
          !Array.isArray(auth.scopes) || !auth.scopes.every(scope => typeof scope === "string") ||
          !["sources", "ingest"].every(scope => auth.scopes.includes(scope))) throw new Error("Watched worker unauthorized");
      const current = JSON.stringify([auth.tenantId, auth.keyId]);
      if (identity !== current) {
        verify = createConnectorWatchVerifier(options.workflow);
        identity = current;
      }
      const result = await verify(auth.tenantId, auth);
      return { status: result.outcomes.some(outcome => outcome.status === "failed") ? "attention" as const :
        result.outcomes.some(outcome => outcome.status === "queued") ? "queued" as const : "checked" as const, ...result };
    } finally { busy = false; }
  };
}
