import type { AggregateOptions, Db, Document, FindOptions, FindOneOptions } from "mongodb";

type ReadDb = Pick<Db, "collection">;
type SnapshotDb = Pick<Db, "collection" | "client">;

/** All authority reads in run observe one Mongo snapshot at its first database read.
 * The facade exposes only reads and overrides any caller's session with the transaction's.
 * A real connected Mongo client/snapshot-capable deployment is required; no collection-only fallback.
 */
export async function withKnowledgeReadSnapshot<T>(db: SnapshotDb, run: (snapshotDb: ReadDb) => Promise<T>): Promise<T> {
  if (!db.client || typeof db.client.startSession !== "function") throw new Error("Knowledge snapshot unavailable");
  const session = db.client.startSession({ causalConsistency: false });
  const readDb = { collection(name: string) {
    const collection = db.collection(name);
    return {
      findOne(filter: Record<string, unknown>, options: FindOneOptions = {}) { return collection.findOne(filter, { ...options, session }); },
      find(filter: Record<string, unknown>, options: FindOptions = {}) { return collection.find(filter, { ...options, session }); },
      aggregate(pipeline: Document[] = [], options: AggregateOptions = {}) { return collection.aggregate(pipeline, { ...options, session }); },
    };
  } } as unknown as ReadDb;
  try {
    if (typeof session.withTransaction !== "function" || typeof session.endSession !== "function") throw new Error("Knowledge snapshot unavailable");
    const result = await session.withTransaction(() => run(readDb), { readConcern: { level: "snapshot" }, maxCommitTimeMS: 10000 });
    if (result === undefined) throw new Error("Knowledge snapshot unavailable");
    return result;
  } finally {
    try {
      // withTransaction normally commits/aborts itself. Close any still-active transaction on interruption/error.
      if (typeof session.inTransaction === "function" && session.inTransaction()) await session.abortTransaction();
    } finally { await session.endSession(); }
  }
}
