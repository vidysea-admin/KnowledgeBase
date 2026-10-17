import { getDb, scopedCollection, assertValidTenantId } from "@lkb/db";
import type { Db } from "mongodb";
import type { Schedule, IntegrationKind } from "./model.js";
import { OperationsError, scheduleId, validateSchedule } from "./model.js";
export interface ScheduleStore {
  load(tenant: string, kind: IntegrationKind): Promise<Schedule | null>;
  replace(tenant: string, expected: Schedule | null, next: Schedule): Promise<boolean>;
}
export function createMongoScheduleStore(allowProductionWrites: () => boolean = () => false, database: () => Db = getDb): ScheduleStore {
  const collection = (tenant: string) => {
    assertValidTenantId(tenant, "operations schedules");
    return scopedCollection<Schedule>(database(), "operations_schedules")(tenant);
  };
  return {
    async load(tenant, kind) {
      const row = await collection(tenant).find({ _id: scheduleId(tenant, kind) }).maxTimeMS(15000).limit(1).next();
      return row === null ? null : validateSchedule(row, tenant, kind);
    },
    async replace(tenant, expected, next) {
      validateSchedule(next, tenant, next.kind);
      if (database().databaseName === "lkb" && !allowProductionWrites()) throw new OperationsError("unauthorized");
      if (!expected) {
        if (next.revision !== 1) throw new OperationsError("invalid");
        try { const inserted = await collection(tenant).replaceOne({ _id: next._id, revision: -1 }, next, { upsert: true, timeoutMS: 15000 }); return inserted.upsertedCount === 1; }
        catch (error) { if ((error as { code?: unknown })?.code === 11000) return false; throw error; }
      }
      validateSchedule(expected, tenant, next.kind);
      if (next.revision !== expected.revision + 1 || JSON.stringify(next.audit.slice(0, -1)) !== JSON.stringify(expected.audit)) throw new OperationsError("invalid");
      const result = await collection(tenant).replaceOne({ _id: expected._id, revision: expected.revision, leaseToken: expected.leaseToken }, next, { timeoutMS: 15000 });
      return result.matchedCount === 1;
    },
  };
}
