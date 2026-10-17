import type { Db } from "mongodb";
import { scopedCollection, assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import type { RelationshipAuthority, RelationshipRow, SpeakerRelationshipStore } from "./types.js";

export type RelationshipAuthorityReader = (snapshotDb: Pick<Db, "collection">, tenantId: string, personId: string) => Promise<RelationshipAuthority | null>;

/** Source authority reads and relationship CAS share one snapshot. No collection-only fallback,
 * no provider calls and no relation proposals in the public graph_edges collection. */
export function createMongoSpeakerRelationshipStore(db: Db, loadAuthority: RelationshipAuthorityReader): SpeakerRelationshipStore {
  return {
    async transaction(tenantId, run) {
      assertValidTenantId(tenantId, "speaker relationship store");
      if (!db.client || typeof db.client.startSession !== "function") throw new Error("Relationship snapshot unavailable");
      const session = db.client.startSession({ causalConsistency: false });
      // Only the relationship collection is writable. Every operation is session-bound and
      // tenant-pinned; authority callbacks cannot mutate speakers, claims or source records.
      const snapshotDb = { collection(name: string) {
        const coll = db.collection(name);
        const scope = (row: unknown) => {
          if (!row || typeof row !== "object" || (row as { tenantId?: unknown }).tenantId !== tenantId) throw new Error("Unscoped relationship operation");
        };
        return {
          findOne(filter: Record<string, unknown>, options: Record<string, unknown> = {}) { scope(filter); return coll.findOne(filter, { ...options, session }); },
          find(filter: Record<string, unknown>, options: Record<string, unknown> = {}) { scope(filter); return coll.find(filter, { ...options, session }); },
          insertOne(row: Record<string, unknown>) {
            scope(row); if (name !== "speaker_relationships") throw new Error("Relationship source writes forbidden");
            return coll.insertOne(row, { session });
          },
          replaceOne(filter: Record<string, unknown>, row: Record<string, unknown>) {
            scope(filter); scope(row); if (name !== "speaker_relationships") throw new Error("Relationship source writes forbidden");
            return coll.replaceOne(filter, row, { session, upsert: false });
          },
        };
      } } as unknown as Pick<Db, "collection">;
      try {
        if (typeof session.withTransaction !== "function" || typeof session.endSession !== "function") throw new Error("Relationship snapshot unavailable");
        const result = await session.withTransaction(async () => {
          const rows = scopedCollection<RelationshipRow>(snapshotDb, "speaker_relationships")(tenantId);
          return run({
            get: id => rows.findOne({ _id: id }),
            async insert(row) {
              if (row.tenantId !== tenantId) throw new Error("Invalid relationship tenant");
              await rows.insertOne(row);
            },
            async replaceCAS(id, baseRevision, row) {
              if (row._id !== id || row.tenantId !== tenantId || row.revision !== baseRevision + 1) throw new Error("Invalid relationship replacement");
              return (await rows.replaceOne({ _id: id, revision: baseRevision }, row)).modifiedCount === 1;
            },
            async list(personId, status) {
              const values = await rows.find({ "from.personId": personId, "to.personId": personId, status }).sort({ _id: 1 }).limit(101).toArray();
              if (values.length > 100) throw new Error("Relationship inventory limit exceeded");
              return values;
            },
            authority: personId => loadAuthority(snapshotDb, tenantId, personId),
          });
        }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, maxCommitTimeMS: 10000 });
        if (result === undefined) throw new Error("Relationship snapshot unavailable");
        return result;
      } finally {
        try { if (typeof session.inTransaction === "function" && session.inTransaction()) await session.abortTransaction(); }
        finally { await session.endSession(); }
      }
    },
  };
}
