import type { AutomationCollection } from "./store.js";
import { AutomationError } from "./types.js";
import type { ApplicationStore } from "./form-types.js";
import { validateApplicationRecord } from "./form-validation.js";
/** Inject only packages/db's application_operations(tenantId) accessor. */
export function createMongoApplicationStore(collection: (tenantId: string) => AutomationCollection): ApplicationStore {
  return {
    async get(tenantId, id) { const value = await collection(tenantId).findOne({ _id: id }); return value === null ? null : validateApplicationRecord(value, tenantId); },
    async insert(tenantId, record) {
      validateApplicationRecord(record, tenantId);
      try { if (!(await collection(tenantId).insertOne(record)).acknowledged) throw new AutomationError("unavailable"); return true; }
      catch (e) { if (e && typeof e === "object" && "code" in e && e.code === 11000) return false; throw e; }
    },
    async cas(tenantId, previous, next) {
      validateApplicationRecord(previous, tenantId); validateApplicationRecord(next, tenantId);
      if (previous._id !== next._id || next.version !== previous.version + 1) throw new AutomationError("invalid_request");
      const result = await collection(tenantId).replaceOne({ _id: previous._id, version: previous.version, recordType: previous.recordType }, next);
      if (!result.acknowledged) throw new AutomationError("unavailable"); return result.matchedCount === 1;
    },
    async list(tenantId, recordType, status) {
      const values = await collection(tenantId).find({ recordType, ...(status ? { status } : {}) }).sort(status ? { leaseUntil: 1, _id: 1 } : { updatedAt: -1, _id: 1 }).limit(100).toArray();
      if (!Array.isArray(values) || values.length > 100) throw new AutomationError("unavailable");
      return values.map(value => { const row = validateApplicationRecord(value, tenantId); if (row.recordType !== recordType) throw new AutomationError("unavailable"); return row; });
    },
  };
}
