import { MongoClient } from "mongodb";
import { assertActivityLimit, projectActivitySnapshot, queueTimestamp, type ActivityHealthDeps, type ActivityJob } from "./types.js";

export interface QueueConfiguration { tenantId: string; actor: string; database: string; mongodbUrl: string }
export interface QueueReadCollection {
  find(filter: Record<string, unknown>, options: { projection: Record<string, number>; sort: Record<string, 1 | -1>; limit: number; maxTimeMS: number }): { toArray(): Promise<unknown[]> };
}
export interface QueueConnection { tenantId: string; database: string; collection: QueueReadCollection; close(): Promise<void> }
export type QueueConnector = (configuration: QueueConfiguration) => Promise<QueueConnection>;
/** Matches scripts/upload/queue.mjs connectQueue + security.mjs identity; parity tested against both. */
export function readQueueConfiguration(env: Record<string, string | undefined>): QueueConfiguration {
  const tenantId = env.UPLOAD_TENANT_ID?.trim(), actor = env.UPLOAD_ACTOR?.trim(), database = env.UPLOAD_QUEUE_DB, mongodbUrl = env.MONGODB_URL;
  if (!tenantId || tenantId.length > 200 || !actor || actor.length > 200 ||
      !/^upload_queue_[a-zA-Z0-9_]{8,55}$/.test(database ?? "") || !mongodbUrl) throw new Error("Upload queue configuration unavailable");
  return { tenantId, actor, database: database!, mongodbUrl };
}
const projection = { _id: 1, tenantId: 1, kind: 1, status: 1, createdAt: 1, updatedAt: 1, deadlineMs: 1, attempts: 1, maxAttempts: 1, error: 1 };
function errorClass(value: unknown): ActivityJob["errorClass"] {
  switch (value) {
    case "producer-cancelled": return "cancelled";
    case "producer-timeout-or-failure": return "timeout-or-failure";
    case "deadline-or-attempts-exhausted": return "deadline-or-attempts-exhausted";
    case "worker-provider-key-missing": return "configuration";
    case "invalid-job-contract": return "invalid-job";
    case "worker-operation-failed": return "operation-failed";
    default: return "unknown";
  }
}
export function createQueueActivityHealthReader(configuration: QueueConfiguration, collection: QueueReadCollection, now = () => new Date()): ActivityHealthDeps {
  return { async readActivityHealth(tenantId, limit) {
    assertActivityLimit(limit);
    if (!tenantId || tenantId !== configuration.tenantId) throw new Error("Upload queue unavailable for tenant");
    const rows = await collection.find({ tenantId: configuration.tenantId, kind: "transcribe.rpc" },
      { projection, sort: { createdAt: -1, _id: -1 }, limit: limit + 1, maxTimeMS: 5000 }).toArray();
    if (!Array.isArray(rows) || rows.length > limit + 1) throw new Error("Invalid queue read");
    const jobs = rows.slice(0, limit).map(value => {
      if (!value || typeof value !== "object") throw new Error("Invalid queue row");
      const row = value as Record<string, unknown>;
      if (row.tenantId !== configuration.tenantId || row.kind !== "transcribe.rpc" || typeof row.deadlineMs !== "number" ||
          !Number.isSafeInteger(row.deadlineMs) || row.deadlineMs < 1 || row.deadlineMs > 8640000000000000) throw new Error("Invalid queue row");
      return { id: row._id, status: row.status, createdAt: queueTimestamp(row.createdAt), updatedAt: row.updatedAt === undefined ? null : queueTimestamp(row.updatedAt),
        deadlineAt: new Date(row.deadlineMs).toISOString(), attempts: row.attempts, maxAttempts: row.maxAttempts,
        automaticRetryCount: Math.max(0, Number(row.attempts) - 1), errorClass: row.status === "failed" ? errorClass(row.error) : null };
    });
    return projectActivitySnapshot({ jobs, limit, truncated: rows.length > limit, observedAt: now().toISOString() }, limit);
  } };
}
async function connect(configuration: QueueConfiguration): Promise<QueueConnection> {
  const client = new MongoClient(configuration.mongodbUrl, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect(); const database = client.db(configuration.database);
    return { tenantId: configuration.tenantId, database: database.databaseName, collection: database.collection("jobs"), close: () => client.close() };
  }
  catch (error) { await client.close(); throw error; }
}
/** Captures trusted config at composition time; never connects for a foreign or unconfigured request. */
export function createConfiguredActivityHealthDeps(env: Record<string, string | undefined> = process.env, connector: QueueConnector = connect): ActivityHealthDeps {
  let configuration: QueueConfiguration | null = null;
  try { configuration = readQueueConfiguration(env); } catch { /* Explicit unavailable reader, without main database fallback. */ }
  const configured = configuration;
  let reader: Promise<ActivityHealthDeps> | null = null;
  let owned: QueueConnection | null = null;
  let closed = false;
  return { async readActivityHealth(tenantId, limit) {
    assertActivityLimit(limit);
    if (closed || !configured || tenantId !== configured.tenantId) throw new Error("Upload queue unavailable for tenant");
    reader ??= connector(configured).then(async connection => {
      if (closed || connection.tenantId !== configured.tenantId || connection.database !== configured.database) {
        await connection.close(); throw new Error("Upload queue binding unavailable");
      }
      owned = connection; return createQueueActivityHealthReader(configured, connection.collection);
    }).catch(error => { reader = null; throw error; });
    return (await reader).readActivityHealth(tenantId, limit);
  }, async close() {
    closed = true;
    await reader?.catch(() => undefined);
    const connection = owned; owned = null; reader = null;
    await connection?.close();
  } };
}
