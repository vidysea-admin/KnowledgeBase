import type { AggregateOptions, Db, Document, FindOptions, FindOneOptions } from "mongodb";
import { isStandaloneMongo } from "./topology.js";

type ReadDb = Pick<Db, "collection">;
type SnapshotDb = Pick<Db, "collection" | "client">;

/** All authority reads in run observe one Mongo snapshot at its first database read.
 * The facade exposes only reads and overrides any caller's session with the transaction's.
 * On a replica set / mongos a real connected snapshot-capable client is required; no collection-only fallback.
 *
 * STANDALONE mongod (w27-standalone): snapshot transactions are impossible there, so the same run executes over the
 * same read facade WITHOUT a session or transaction, with readConcern "local". Query predicates are passed through
 * untouched (tenant filters are applied by callers, never here). Consistency caveat: reads across collections are no
 * longer one point-in-time snapshot, so a concurrent publication may be observed half-applied; each read is still
 * individually tenant-scoped and the visibility gates re-check authority on every read.
 */
export async function withKnowledgeReadSnapshot<T>(db: SnapshotDb, run: (snapshotDb: ReadDb) => Promise<T>): Promise<T> {
  if (await isStandaloneMongo(db)) return runWithoutSession(db, run);
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

async function runWithoutSession<T>(db: SnapshotDb, run: (snapshotDb: ReadDb) => Promise<T>): Promise<T> {
  const readConcern = { level: "local" } as const;
  const readDb = { collection(name: string) {
    const collection = db.collection(name);
    return {
      findOne(filter: Record<string, unknown>, options: FindOneOptions = {}) { return collection.findOne(filter, { ...options, readConcern }); },
      find(filter: Record<string, unknown>, options: FindOptions = {}) { return collection.find(filter, { ...options, readConcern }); },
      aggregate(pipeline: Document[] = [], options: AggregateOptions = {}) { return collection.aggregate(pipeline, { ...options, readConcern }); },
    };
  } } as unknown as ReadDb;
  const result = await run(readDb);
  if (result === undefined) throw new Error("Knowledge snapshot unavailable");
  return result;
}
