import type { Db } from "mongodb";
import { assertValidTenantId, scopedCollection } from "../../../../packages/db/src/lib/tenantScope.js";
import { isRefusedWorkDb } from "../db-name.js";
import { OutputError, type OutputDraft, type OutputRepository } from "./types.js";
import { assertOutputDraft } from "./validator.js";

/** New T-058 writes have no implicit authorization from another store's production opt-in. */
export function createMongoOutputRepository(db: Db): OutputRepository {
  if (isRefusedWorkDb(db.databaseName)) throw new OutputError("unavailable", 503);
  const rows = scopedCollection<OutputDraft>(db, "knowledge_outputs");
  return {
    async list(tenantId) { const result = await rows(tenantId).find({}).sort({ updatedAt: -1 }).limit(100).toArray(); result.forEach(assertOutputDraft); return result; },
    async get(tenantId, id) { const result = await rows(tenantId).findOne({ _id: id }); if (result) assertOutputDraft(result); return result; },
    async insert(tenantId, draft) {
      if (draft.tenantId !== tenantId || draft.revision !== 1) throw new OutputError("invalid_request", 400);
      assertOutputDraft(draft);
      await rows(tenantId).insertOne(draft);
    },
    async replace(tenantId, draft, expectedRevision) {
      if (draft.tenantId !== tenantId || draft.revision !== expectedRevision + 1) throw new OutputError("invalid_request", 400);
      assertOutputDraft(draft);
      const result = await rows(tenantId).replaceOne({ _id: draft._id, revision: expectedRevision }, draft);
      return result.matchedCount === 1;
    },
  };
}
export function createMemoryOutputRepository(): OutputRepository {
  const tenants = new Map<string, Map<string, OutputDraft>>();
  const tenant = (id: string) => { assertValidTenantId(id, "outputRepository"); return tenants.get(id); };
  return {
    async list(id) { const rows = structuredClone([...(tenant(id)?.values() ?? [])]); rows.forEach(assertOutputDraft); return rows; },
    async get(id, key) { const row = structuredClone(tenant(id)?.get(key) ?? null); if (row) assertOutputDraft(row); return row; },
    async insert(id, draft) {
      let rows = tenant(id);
      if (draft.tenantId !== id || draft.revision !== 1) throw new OutputError("invalid_request", 400);
      assertOutputDraft(draft);
      if (!rows) { rows = new Map(); tenants.set(id, rows); }
      if (rows.has(draft._id)) throw new OutputError("conflict", 409);
      rows.set(draft._id, structuredClone(draft));
    },
    async replace(id, draft, expected) {
      const rows = tenant(id), old = rows?.get(draft._id);
      if (draft.tenantId !== id || draft.revision !== expected + 1) throw new OutputError("invalid_request", 400);
      assertOutputDraft(draft);
      if (!rows || !old || old.revision !== expected) return false;
      rows.set(draft._id, structuredClone(draft)); return true;
    },
  };
}
