/** Native publication and human decisions share one durable session write fence. */
import type { ClientSession, Db } from "mongodb";
import type { SpeakerSuggestions } from "@lkb/core";
import { assertValidTenantId } from "./tenantScope.js";

type RecordRow = Record<string, any>;
type DbRow = RecordRow & { _id: string };
const transactions = new WeakSet<object>();
const object = (v: unknown): v is RecordRow => !!v && typeof v === "object" && !Array.isArray(v);
const fail = (): never => { throw new Error("native_publication_stale_or_unavailable"); };

/** Explicit transaction: never replay a callback containing decisions or publication side effects. */
export async function runNativePublicationTransaction<T>(db: Db, tenantId: string, work: (txDb: Db) => Promise<T>): Promise<T> {
  assertValidTenantId(tenantId, "native publication");
  if (transactions.has(db) || typeof db.client?.startSession !== "function") throw new Error("native_publication_transaction_required");
  const session = db.client.startSession();
  const view = transactionView(db, session, tenantId);
  const txDb = view.db;
  let unknownCommit = false;
  try {
    session.startTransaction({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    const result = await work(txDb);
    await view.drain();
    for (let attempt = 1; ; attempt++) {
      try { await session.commitTransaction(); break; }
      catch (error) {
        unknownCommit = unknownCommit || object(error) && typeof error.hasErrorLabel === "function" && error.hasErrorLabel("UnknownTransactionCommitResult");
        if (attempt >= 3 || !object(error) || typeof error.hasErrorLabel !== "function" || !error.hasErrorLabel("UnknownTransactionCommitResult")) throw error;
      }
    }
    return result;
  } catch (error) {
    await view.drain().catch(() => undefined);
    if (!unknownCommit) try { await session.abortTransaction(); } catch { /* Preserve original failure. */ }
    throw error;
  } finally { view.close(); await session.endSession(); }
}

export async function bumpNativePublicationRevision(txDb: Db, tenantId: string, sessionId: string): Promise<number> {
  if (!transactions.has(txDb)) throw new Error("native_publication_transaction_required");
  const coll = txDb.collection<DbRow>("sessions");
  const row = await coll.findOne({ _id: sessionId, tenantId } as never);
  if (!row) return fail();
  const present = Object.hasOwn(row, "nativePublicationRevision"), previous = present ? row.nativePublicationRevision : 0;
  if (!Number.isSafeInteger(previous) || previous < 0 || previous >= Number.MAX_SAFE_INTEGER) return fail();
  const result = await coll.updateOne({ _id: sessionId, tenantId, nativePublicationRevision: present ? previous : { $exists: false } } as never, { $inc: { nativePublicationRevision: 1 } });
  if (!result.acknowledged || result.matchedCount !== 1 || result.modifiedCount !== 1) return fail();
  return previous + 1;
}

export async function isNativeCaptureSession(db: Db, tenantId: string, sessionId: string): Promise<boolean> {
  assertValidTenantId(tenantId, "native capture session");
  const session = await db.collection<DbRow>("sessions").findOne({ _id: sessionId, tenantId } as never);
  if (!session || typeof session.sourceId !== "string") return false;
  const source = await db.collection<DbRow>("sources").findOne({ _id: session.sourceId, tenantId } as never);
  return source?.kind === "recording" && object(source.captureConsent) && source.captureConsent.sessionId === sessionId;
}

/** Machine evidence is current only while every durable owner and publication head agrees. */
export async function assertNativeSuggestionCurrent(db: Db, tenantId: string, row: SpeakerSuggestions): Promise<void> {
  if (!row.provenance.some(p => p.evidenceKind === "tile")) return;
  if (row.tenantId !== tenantId) return fail();
  const b = row.nativePublication;
  if (!object(b) || ![b.sourceId, b.generation, b.captureGeneration].every(v => typeof v === "string" && v.length > 0) ||
    ![b.turnDigest, b.receiptSha256].every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v)) || !(b.reviewRevision === null || typeof b.reviewRevision === "string" && b.reviewRevision.length > 0)) return fail();
  const session = await db.collection<DbRow>("sessions").findOne({ _id: row.sessionId, tenantId, sourceId: b.sourceId } as never);
  const a = session?.indexAttempt;
  if (!session || session.status?.index !== "done" || !object(a) || a.state !== "complete" || a.sourceId !== b.sourceId || a.sessionId !== row.sessionId || a.generation !== b.generation || a.turnDigest !== b.turnDigest) return fail();
  const source = await db.collection<DbRow>("sources").findOne({ _id: b.sourceId, tenantId } as never);
  const c = source?.captureConsent;
  if (!source || source.kind !== "recording" || source.consent?.given !== true || !object(c) || c.sessionId !== row.sessionId || c.generation !== b.captureGeneration || c.receiptSha256 !== b.receiptSha256 || c.sanitizedAudioSha256 !== source.hash || typeof source.hash !== "string" || !/^[a-f0-9]{64}$/.test(source.hash)) return fail();
  const owners = await db.collection<DbRow>("sessions").find({ tenantId, sourceId: b.sourceId }).toArray();
  if (owners.length !== 1 || owners[0]?._id !== row.sessionId) return fail();
  const heads = await db.collection<DbRow>("transcript_reviews").find({ tenantId, sessionId: row.sessionId }).toArray();
  if (b.reviewRevision === null) { if (heads.length) return fail(); return; }
  if (heads.length !== 1) return fail();
  const h = heads[0]!, r = h.refresh;
  if (h.revision !== b.reviewRevision || !object(r) || r.status !== "complete" || r.revision !== b.reviewRevision || !Array.isArray(r.targets) || !Array.isArray(r.completed) || !["claims", "session-page", "chunks", "tree", "graph"].every(target => r.targets.includes(target) && r.completed.includes(target)) || r.targets.some((target: unknown) => !r.completed.includes(target))) return fail();
}

function transactionView(db: Db, session: ClientSession, tenantId: string) {
  let tail: Promise<unknown> = Promise.resolve();
  let active = true;
  const serial = <R>(fn: () => Promise<R>): Promise<R> => {
    if (!active || !session.inTransaction()) return Promise.reject(new Error("native_publication_transaction_closed"));
    const result = tail.then(fn); tail = result; return result;
  };
  // Local input refusal never reaches Mongo and must not poison an otherwise healthy
  // transaction queue. Real operation failures still reject tail and force abort.
  const validated = <R>(prepare: () => () => Promise<R>): Promise<R> => {
    try { return serial(prepare()); } catch (error) { return Promise.reject(error); }
  };
  const filter = (v: RecordRow = {}) => {
    if (v.tenantId !== tenantId) throw new Error("native_publication_tenant_mismatch");
    return { ...v, tenantId };
  };
  const doc = (v: RecordRow) => { if (v.tenantId !== tenantId) throw new Error("native_publication_tenant_mismatch"); return { ...v, tenantId }; };
  const txDb = new Proxy(db, { get(_target, key) {
    if (key !== "collection") throw new Error("native_publication_unsupported_db_operation");
    return (name: string) => {
      const raw = db.collection(name) as any;
      return new Proxy({}, { get(_collection, op: string) {
        if (op === "find") return (query: RecordRow) => {
          let cursor = raw.find(filter(query), { session });
          const wrapped: any = new Proxy({}, { get(_cursor, method: string) {
            if (method === "toArray") return () => serial(() => cursor.toArray());
            if (["sort", "limit", "skip", "project"].includes(method)) return (...args: unknown[]) => { cursor = cursor[method](...args); return wrapped; };
            throw new Error("native_publication_unsupported_cursor_operation");
          } });
          return wrapped;
        };
        if (["findOne", "countDocuments", "deleteMany", "deleteOne"].includes(op)) return (query: RecordRow, options = {}) => validated(() => {
          const scoped = filter(query);
          return () => raw[op](scoped, { ...options, session });
        });
        if (["updateOne", "updateMany", "replaceOne"].includes(op)) return (query: RecordRow, update: RecordRow, options = {}) => validated(() => {
          const scoped = filter(query);
          if (op === "replaceOne") doc(update);
          else {
            if (Array.isArray(update) || !object(update) || Object.entries(update).some(([operator, body]) =>
              !operator.startsWith("$") || !object(body) || Object.entries(body).some(([k, v]) =>
                ((k === "tenantId" || k.startsWith("tenantId.")) && !(k === "tenantId" && ["$set", "$setOnInsert"].includes(operator) && v === tenantId)) ||
                (operator === "$rename" && typeof v === "string" && (v === "tenantId" || v.startsWith("tenantId.")))))) {
              throw new Error("native_publication_tenant_update_refused");
            }
          }
          return () => raw[op](scoped, update, { ...options, session });
        });
        if (op === "insertOne") return (row: RecordRow, options = {}) => validated(() => {
          const scoped = doc(row); return () => raw.insertOne(scoped, { ...options, session });
        });
        if (op === "insertMany") return (rows: RecordRow[], options = {}) => validated(() => {
          const scoped = rows.map(doc); return () => raw.insertMany(scoped, { ...options, session });
        });
        throw new Error("native_publication_unsupported_collection_operation");
      } });
    };
  } }) as Db;
  transactions.add(txDb);
  return { db: txDb, drain: () => tail, close: () => { active = false; } };

}
/** For an existing explicit snapshot/majority transaction owned by the API refresh executor. */
export function nativePublicationTransactionView(db: Db, session: ClientSession, tenantId: string): Db {
  assertValidTenantId(tenantId, "native publication");
  if (transactions.has(db) || !session.inTransaction()) throw new Error("native_publication_transaction_required");
  return transactionView(db, session, tenantId).db;
}





