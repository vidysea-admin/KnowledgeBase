/**
 * apps/api/src/ask/tenant-test-kit.ts - shared test kit for the two tenant-isolation tests (auth-require-tenant-on-key, fix cycle 2).
 *
 * Provides (1) `BlindDb`, a TENANT-BLIND in-memory database with a Mongo-subset matcher (equality, null-matches-missing,
 * $ne/$gt/$in/$regex/$exists, array equality) that records every filter it receives, and (2) `realTreeStore`, which runs the
 * PRODUCTION `createMongoTreeStore().load` (apps/api/src/store.ts) over that fake. No flag and no module mock is needed: the real
 * `@lkb/db` `connect()` runs, and the `mongodb` driver's `MongoClient.prototype` (connect/db/close) is replaced so no socket opens
 * (`new MongoClient(url)` only parses the url). The shared module instance is the one `@lkb/db` imports, so `getDb()` inside the
 * real store returns the fake. Not a test file itself; imported by ask-tenant-hostile.test.ts and ask-tenant-isolation.test.ts.
 */
import { createHash } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { connect } from "@lkb/db";
import type { TreeIndexNode } from "@lkb/core";
import { createMongoTreeStore } from "../store.js";
import { chunkContentId } from "../indexing/chunk-integrity.js";
import type { TreeStore } from "../routes/ask/ask.js";
import { fakeSnapshotClient } from "../visibility/read-fixture.js";

export type Row = Record<string, unknown>;
export type QueryOp = "find" | "findOne" | "insertOne" | "insertMany" | "updateOne" | "replaceOne" | "bulkWrite" | "deleteMany" | "countDocuments";
export interface Query { coll: string; op: QueryOp; filter: Record<string, unknown>; returned: number; doc?: unknown }
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function fieldMatches(actual: unknown, want: unknown): boolean {
  if (isObj(want) && Object.keys(want).some((k) => k.startsWith("$"))) {
    return Object.entries(want).every(([op, arg]) => {
      switch (op) {
        case "$ne": return arg === null ? actual !== undefined && actual !== null : actual !== arg;
        case "$gt": return typeof actual === "string" && typeof arg === "string" && actual > arg;
        case "$in": return (arg as unknown[]).some((w) => fieldMatches(actual, w));
        case "$regex": return typeof actual === "string" && new RegExp(String(arg), String(want.$options ?? "")).test(actual);
        case "$options": return true; // consumed by $regex
        case "$exists": return (actual !== undefined) === Boolean(arg);
        default: return false;
      }
    });
  }
  if (want === undefined || want === null) return actual === undefined || actual === null;
  if (Array.isArray(want)) return JSON.stringify(actual) === JSON.stringify(want);
  return actual === want;
}
const at = (row: Row, path: string): unknown => path.split(".").reduce<unknown>((v, k) => (isObj(v) ? v[k] : undefined), row);
const matches = (row: Row, filter: Record<string, unknown>): boolean => Object.entries(filter).every(([k, v]) =>
  k === "$or" ? (v as Record<string, unknown>[]).some((branch) => matches(row, branch)) : fieldMatches(at(row, k), v));
/** Dotted-path `$set` / `$unset`, as the indexing attempt claim uses them (`"status.index"`). */
function applyUpdate(row: Row, update: { $set?: Row; $unset?: Row }): void {
  const walk = (path: string, write: (parent: Row, key: string) => void) => {
    const keys = path.split("."); let parent = row;
    for (const k of keys.slice(0, -1)) { if (!isObj(parent[k])) parent[k] = {}; parent = parent[k] as Row; }
    write(parent, keys.at(-1)!);
  };
  for (const [k, v] of Object.entries(update.$set ?? {})) walk(k, (p, key) => { p[key] = structuredClone(v); });
  for (const k of Object.keys(update.$unset ?? {})) walk(k, (p, key) => { delete p[key]; });
}

export class BlindDb {
  readonly queries: Query[] = [];
  constructor(private readonly data: Record<string, Row[]>) {}
  /** Rows of a collection exactly as stored (test-side inspection only). */
  all(coll: string): Row[] { return this.data[coll] ?? []; }
  asDb(): Pick<Db, "collection"> {
    const self = this;
    const rec = (coll: string, op: Query["op"], filter: Record<string, unknown>, returned: number) =>
      self.queries.push({ coll, op, filter: structuredClone(filter), returned });
    // Write-capable surface (ISS-AUTHTENANT-002): every call is recorded BEFORE it takes effect, in order, and applied to the in-memory rows.
    const rows = (coll: string) => (self.data[coll] ??= []);
    const write = (coll: string, op: QueryOp, filter: Record<string, unknown>, returned: number, doc?: unknown) =>
      self.queries.push({ coll, op, filter: structuredClone(filter), returned, ...(doc === undefined ? {} : { doc: structuredClone(doc) }) });
    const replace = (coll: string, filter: Record<string, unknown>, replacement: Row, upsert: boolean, op: QueryOp) => {
      const i = rows(coll).findIndex((r) => matches(r, filter));
      write(coll, op, filter, i >= 0 ? 1 : 0, replacement);
      if (i >= 0) rows(coll)[i] = structuredClone(replacement); else if (upsert) rows(coll).push(structuredClone(replacement));
      return { acknowledged: true, matchedCount: i >= 0 ? 1 : 0, modifiedCount: i >= 0 ? 1 : 0, upsertedCount: i < 0 && upsert ? 1 : 0 };
    };
    return { client: fakeSnapshotClient(), collection: (coll: string) => ({
      insertOne: async (doc: Row) => { write(coll, "insertOne", {}, 1, doc); rows(coll).push(structuredClone(doc)); return { acknowledged: true }; },
      insertMany: async (docs: Row[]) => { write(coll, "insertMany", {}, docs.length, docs); rows(coll).push(...structuredClone(docs)); return { acknowledged: true }; },
      countDocuments: async (filter: Record<string, unknown> = {}) => { const n = rows(coll).filter((r) => matches(r, filter)).length; write(coll, "countDocuments", filter, n); return n; },
      deleteMany: async (filter: Record<string, unknown> = {}) => {
        const keep = rows(coll).filter((r) => !matches(r, filter)), n = rows(coll).length - keep.length;
        write(coll, "deleteMany", filter, n); self.data[coll] = keep; return { acknowledged: true, deletedCount: n };
      },
      updateOne: async (filter: Record<string, unknown>, update: { $set?: Row; $unset?: Row; $setOnInsert?: Row }, opts: { upsert?: boolean } = {}) => {
        const row = rows(coll).find((r) => matches(r, filter)); write(coll, "updateOne", filter, row ? 1 : 0, update);
        if (row) applyUpdate(row, update);
        else if (opts.upsert) {
          // Mongo upsert: the filter's equality fields, then $setOnInsert, then $set.
          const doc: Row = Object.fromEntries(Object.entries(filter).filter(([, v]) => !(isObj(v) && Object.keys(v).some((k) => k.startsWith("$")))));
          applyUpdate(doc, { $set: { ...structuredClone(update.$setOnInsert ?? {}), ...(update.$set ?? {}) } }); rows(coll).push(doc);
        }
        return { acknowledged: true, matchedCount: row ? 1 : 0, modifiedCount: row ? 1 : 0, upsertedCount: !row && opts.upsert ? 1 : 0 };
      },
      replaceOne: async (filter: Record<string, unknown>, replacement: Row, opts: { upsert?: boolean } = {}) => replace(coll, filter, replacement, opts.upsert === true, "replaceOne"),
      bulkWrite: async (ops: { replaceOne: { filter: Record<string, unknown>; replacement: Row; upsert?: boolean } }[]) => {
        for (const o of ops) replace(coll, o.replaceOne.filter, o.replaceOne.replacement, o.replaceOne.upsert === true, "bulkWrite");
        return { acknowledged: true };
      },
      find: (filter: Record<string, unknown> = {}) => { let max = Number.POSITIVE_INFINITY; const cursor = { limit(n: number) { max = n; return cursor; }, toArray: async () => {
        const rows = (self.data[coll] ?? []).filter((r) => matches(r, filter)).slice(0, max); rec(coll, "find", filter, rows.length); return structuredClone(rows);
      } }; return cursor; },
      findOne: async (filter: Record<string, unknown> = {}) => {
        const row = (self.data[coll] ?? []).find((r) => matches(r, filter)) ?? null; rec(coll, "findOne", filter, row ? 1 : 0);
        return row ? structuredClone(row) : null;
      },
    }) } as unknown as Pick<Db, "collection">;
  }
}

// ---- the fake mongodb client behind the REAL @lkb/db connect()/getDb()
let current: BlindDb | null = null;
const clientDb = { databaseName: "tenant-test-kit", client: fakeSnapshotClient(), collection: (name: string) => {
  if (!current) throw new Error("tenant-test-kit: no BlindDb bound");
  return current.asDb().collection(name);
} };
MongoClient.prototype.connect = async function () { return this; };
MongoClient.prototype.db = (() => clientDb) as unknown as MongoClient["db"];
MongoClient.prototype.close = async () => {};
await connect("mongodb://kit.invalid:1", "tenant-test-kit"); // real @lkb/db connect(); idempotent per process

/** Points the fake mongodb client (and so the real `getDb()`) at `db` for the code under test. */
export function bindDb(db: BlindDb): void { current = db; }

/** The production `createMongoTreeStore().load`, bound to `db`; `loads` records the raw argument the router handed it. */
export function realTreeStore(db: BlindDb, loads: unknown[]): TreeStore {
  const real = createMongoTreeStore();
  return { load: async (tenantId: string): Promise<TreeIndexNode | null> => { loads.push(tenantId); current = db; return real.load(tenantId); } };
}

/** A consented recording source for tenant `t` (same shape as indexing/testutils' SOURCE): the visibility gate
 * admits a session for reading or aggregate indexing only through such a row. */
export function recordingSource(t: string, id = "src1", text = "A real sentence."): Row {
  return { _id: id, tenantId: t, kind: "recording", path: "fixture/recording", captureMode: "provided",
    hash: createHash("sha256").update(text).digest("hex"),
    consent: { given: true, recordedBy: "synthetic-fixture-owner", note: "Synthetic supplied recording model" }, createdAt: "2026-09-07T00:00:00.000Z" };
}

/**
 * One session the production read gate admits end to end for tenant `t`: a consented recording source, the session,
 * one whole turn carrying `text`, and a legacy session page whose summary IS that cited text. A tree session node
 * built by `sessionNodeFor` matches the page, so `eligibleTreeInput` retains the stored root instead of rebuilding it.
 */
export function visibleSession(t: string, sessionId: string, text: string, title = `Session ${sessionId}`): Record<string, Row[]> {
  const sourceId = `src-${sessionId}`, turnId = `${t}-${sessionId}-t1`;
  return {
    sessions: [{ _id: sessionId, tenantId: t, sourceId, title, date: "2026-09-07", status: { transcribe: "done", index: "done" } }],
    sources: [recordingSource(t, sourceId, text)],
    turns: [{ _id: turnId, tenantId: t, sessionId, speakerRef: "spk:0", tStart: 0, tEnd: 1, text }],
    session_pages: [{ _id: `${t}-${sessionId}-page`, tenantId: t, sessionId, summary: text, keyInsights: [], decisions: [], actionItems: [], evidence: [{ sessionId, turnId }] }],
  };
}
/** The session node a stored root must carry for `visibleSession(t, sessionId, text)`. */
export function sessionNodeFor(t: string, sessionId: string, title: string, text: string): TreeIndexNode {
  return { node_id: `tenant:${t}/session:${sessionId}`, title, level: "session", summary: text, evidence: { sessionRef: sessionId }, children: [] };
}
/** Concatenates corpus parts collection by collection. */
export function mergeCorpus(...parts: Record<string, Row[]>[]): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const part of parts) for (const [coll, rows] of Object.entries(part)) (out[coll] ??= []).push(...rows);
  return out;
}

/**
 * The read gate (visibility + eligible tree) admits only sessions with a consented source, the session row and a page
 * whose summary is the session's cited turn text, and serves only content-bound vectors (goal-t008). So every turn
 * below gets its session/source/page, each stored root session node carries that page summary, and each chunk's
 * id binds it to its turn text. Expects ONE turn per (tenant, session). The tenant-blindness of the fake is unchanged.
 */
export function admitCorpus(data: Record<string, Row[]>): Record<string, Row[]> {
  const textOf = (t: string, id: string) => data.turns!.find((r) => r.tenantId === t && r.sessionId === id)!.text as string;
  for (const r of data.tree_index!) r.children = (r.children as TreeIndexNode[]).map((n) => ({ ...n, summary: textOf(r.tenantId as string, n.evidence!.sessionRef!) }));
  for (const c of data.chunks!) c._id = chunkContentId(c.tenantId as string, c.sourceRef as string, c.turnRefs as string[],
    (c.turnRefs as string[]).map((id) => (data.turns!.find((t) => t._id === id)!.text as string).trim()).join(" "));
  const sessions = data.turns!.map((t) => visibleSession(t.tenantId as string, t.sessionId as string, t.text as string));
  const gate = mergeCorpus(...sessions);
  return { ...data, sessions: gate.sessions!, sources: gate.sources!, session_pages: gate.session_pages!.map((p, i) =>
    ({ ...p, evidence: [{ sessionId: data.turns![i]!.sessionId, turnId: data.turns![i]!._id }] })) };
}
