import type { Db } from "mongodb";
import { scopedCollection, assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import { acceptedSpeakerAttributes } from "./service.js";
import type { AttributeAuthority, AttributeRow, AttributeTransaction, SpeakerAttributeStore } from "./types.js";

export type AttributeAuthorityReader = (snapshotDb: Pick<Db, "collection">, tenantId: string, personId: string) => Promise<AttributeAuthority | null>;
/** Existing snapshot adapter, also consumed by the profile reader without nesting sessions. */
export function createSpeakerAttributeTransaction(snapshotDb: Pick<Db, "collection">, tenantId: string, loadAuthority: AttributeAuthorityReader): AttributeTransaction {
  assertValidTenantId(tenantId, "speaker attribute transaction");
  const rows = scopedCollection<AttributeRow>(snapshotDb, "speaker_attributes")(tenantId);
  return {
    get: id => rows.findOne({ _id: id }),
    async insert(row) { if (row.tenantId !== tenantId) throw new Error("Invalid attribute tenant"); await rows.insertOne(row); },
    async replaceCAS(id, baseRevision, row) {
      if (row._id !== id || row.tenantId !== tenantId || row.revision !== baseRevision + 1) throw new Error("Invalid attribute replacement");
      return (await rows.replaceOne({ _id: id, revision: baseRevision }, row)).modifiedCount === 1;
    },
    async list(personId, status) {
      const values = await rows.find({ personId, status }).sort({ _id: 1 }).limit(101).toArray();
      if (values.length > 100) throw new Error("Attribute inventory limit exceeded"); return values;
    },
    authority: personId => loadAuthority(snapshotDb, tenantId, personId),
  };
}
export async function readAcceptedSpeakerAttributes(snapshotDb: Pick<Db, "collection">, tenantId: string, personId: string, authority: AttributeAuthority) {
  return acceptedSpeakerAttributes(createSpeakerAttributeTransaction(snapshotDb, tenantId, async () => authority), tenantId, personId);
}
/** All authority/source reads and writes use the same tenant-pinned Mongo transaction. */
export function createMongoSpeakerAttributeStore(db: Db, loadAuthority: AttributeAuthorityReader): SpeakerAttributeStore {
  return {
    async transaction(tenantId, run) {
      assertValidTenantId(tenantId, "speaker attribute store");
      if (!db.client || typeof db.client.startSession !== "function") throw new Error("Attribute snapshot unavailable");
      const session = db.client.startSession({ causalConsistency: false });
      const snapshotDb = { collection(name: string) {
        const collection = db.collection(name);
        const scope = (row: unknown) => { if (!row || typeof row !== "object" || (row as { tenantId?: unknown }).tenantId !== tenantId) throw new Error("Unscoped attribute operation"); };
        return {
          findOne(filter: Record<string, unknown>, options: Record<string, unknown> = {}) { scope(filter); return collection.findOne(filter, { ...options, session }); },
          find(filter: Record<string, unknown>, options: Record<string, unknown> = {}) { scope(filter); return collection.find(filter, { ...options, session }); },
          insertOne(row: Record<string, unknown>) {
            scope(row); if (name !== "speaker_attributes") throw new Error("Attribute source writes forbidden"); return collection.insertOne(row, { session });
          },
          replaceOne(filter: Record<string, unknown>, row: Record<string, unknown>) {
            scope(filter); scope(row); if (name !== "speaker_attributes") throw new Error("Attribute source writes forbidden"); return collection.replaceOne(filter, row, { session, upsert: false });
          },
        };
      } } as unknown as Pick<Db, "collection">;
      try {
        if (typeof session.withTransaction !== "function" || typeof session.endSession !== "function") throw new Error("Attribute snapshot unavailable");
        const result = await session.withTransaction(() => run(createSpeakerAttributeTransaction(snapshotDb, tenantId, loadAuthority)),
          { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, maxCommitTimeMS: 10000 });
        if (result === undefined) throw new Error("Attribute snapshot unavailable"); return result;
      } finally {
        try { if (typeof session.inTransaction === "function" && session.inTransaction()) await session.abortTransaction(); }
        finally { await session.endSession(); }
      }
    },
  };
}
