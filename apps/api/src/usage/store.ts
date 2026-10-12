/**
 * apps/api/src/usage/store.ts - T-057 D4 production wiring: the tenant-scoped @lkb/db usage_events accessor
 * behind the recorder and the GET /usage reader. Relative import of the collection file, as jobs/store.ts does.
 */
import { listUsageEvents, recordUsageEvent } from "../../../../packages/db/src/collections/usage-events.js";
import type { UsageReadDeps } from "./router.js";
import type { UsageRecordDeps } from "./recorder.js";

export type UsageDeps = UsageRecordDeps & UsageReadDeps;
export interface UsageStoreIo {
  record: (tenantId: string, input: Parameters<UsageRecordDeps["record"]>[1]) => Promise<void>;
  list: (tenantId: string, sinceDay: string) => Promise<{ rows: unknown[]; truncated: boolean }>;
}

export function createMongoUsageDeps(io: UsageStoreIo = { record: (t, i) => recordUsageEvent(t, i), list: (t, s) => listUsageEvents(t, s) }): UsageDeps {
  return {
    async record(tenantId, input) {
      if (typeof tenantId !== "string" || !tenantId.trim()) throw new Error("Invalid usage tenant");
      await io.record(tenantId, { kind: input.kind, outcome: input.outcome, latencyMs: input.latencyMs });
    },
    async readUsage(tenantId, sinceDay) {
      if (typeof tenantId !== "string" || !tenantId.trim()) throw new Error("Invalid usage tenant");
      return io.list(tenantId, sinceDay);
    },
  };
}
