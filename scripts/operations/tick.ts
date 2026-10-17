import type { HostingPrincipal } from "../../apps/api/src/hosting/types.js";
import type { HostingService } from "../../apps/api/src/hosting/service.js";
import type { OperationsService } from "../../apps/api/src/operations-integrations/service.js";
import { OperationsError } from "../../apps/api/src/operations-integrations/model.js";
/** One-shot supervisor callback. Principal is resolved from a verified configured service key by the trusted host, never CLI/user fields. */
export async function runOperationsTick(service: OperationsService, hosting: Pick<HostingService, "withPermission">, principal: HostingPrincipal) {
    const current = await hosting.withPermission(principal, "operations:run", () => service.list(principal.tenantId)), outcomes = [];
    const authorization = {
      mutate: <T,>(callback: () => Promise<T>) => hosting.withPermission(principal, "operations:run", callback),
      initialize: <T,>(callback: () => Promise<T>) => hosting.withPermission(principal, "operations:run", async () => ({ work: callback() })),
    };
    for (const schedule of current.schedules) {
      if (!schedule.enabled && schedule.lastResult !== "running") continue;
      try { outcomes.push(await service.run(principal.tenantId, schedule.kind, schedule.revision, principal.keyId, authorization, true)); }
      catch (error) { outcomes.push({ kind: schedule.kind, lastResult: "refused" as const, reason: error instanceof OperationsError ? error.code : "unavailable" }); }
    }
    return { outcomes };
}
