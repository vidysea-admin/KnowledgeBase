import type { ApiKeyStore } from "../../apps/api/src/auth.js";
import type { HostingService } from "../../apps/api/src/hosting/service.js";
import type { OperationsService } from "../../apps/api/src/operations-integrations/service.js";
import { runAutonomousCycles } from "../webinar/scheduler/service.mjs";
import { createOperationsTickHost } from "./host.js";

/** Trusted host calls this after listening and awaits it during shutdown. Import is passive. */
export async function runOperationsSupervisor(options: {
  service: OperationsService;
  hosting: Pick<HostingService, "withPermission">;
  keyStore: ApiKeyStore;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  log?: (message: string) => void;
}): Promise<void> {
  if (options.env.LKB_OPERATIONS_WORKER_ENABLED !== "1" || options.signal.aborted) return;
  const tick = createOperationsTickHost(options);
  const log = (message: string) => { try { options.log?.(message); } catch { /* Logging cannot interrupt audited work. */ } };
  await runAutonomousCycles({
    signal: options.signal,
    async cycle() {
      if (options.signal.aborted) return;
      try {
        const result = await tick();
        log(result.status === "disabled" ? "Operations worker disabled." : result.status === "attention" ? "Operations worker requires attention." : "Operations worker checked due schedules.");
      } catch { log("Operations worker unavailable or unauthorized; no successful cycle established."); }
    },
    // Cycles await the complete bounded tick and never spawn background execution.
    // The existing supervisor therefore has no outstanding task to drain here.
    drain: async () => undefined,
  });
}
