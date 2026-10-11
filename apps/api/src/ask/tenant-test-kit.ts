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
import { MongoClient, type Db } from "mongodb";
import { connect } from "@lkb/db";
import type { TreeIndexNode } from "@lkb/core";
import { createMongoTreeStore } from "../store.js";
import type { TreeStore } from "../routes/ask/ask.js";

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
        case "$regex": return typeof actual === "string" && new RegExp(String(arg)).test(actual);
        case "$exists": return (actual !== undefined) === Boolean(arg);
        default: return false;
      }
    });
  }
  if (want === undefined || want === null) return actual === undefined || actual === null;
  if (Array.isArray(want)) return JSON.stringify(actual) === JSON.stringify(want);
  return actual === want;
}
const matches = (row: Row, filter: Record<string, unknown>) => Object.entries(filter).every(([k, v]) => fieldMatches(row[k], v));

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
    };
    return { collection: (coll: string) => ({
      insertOne: async (doc: Row) => { write(coll, "insertOne", {}, 1, doc); rows(coll).push(structuredClone(doc)); return { acknowledged: true }; },
      insertMany: async (docs: Row[]) => { write(coll, "insertMany", {}, docs.length, docs); rows(coll).push(...structuredClone(docs)); return { acknowledged: true }; },
      countDocuments: async (filter: Record<string, unknown> = {}) => { const n = rows(coll).filter((r) => matches(r, filter)).length; write(coll, "countDocuments", filter, n); return n; },
      deleteMany: async (filter: Record<string, unknown> = {}) => {
        const keep = rows(coll).filter((r) => !matches(r, filter)), n = rows(coll).length - keep.length;
        write(coll, "deleteMany", filter, n); self.data[coll] = keep; return { deletedCount: n };
      },
      updateOne: async (filter: Record<string, unknown>, update: { $set?: Row }) => {
        const row = rows(coll).find((r) => matches(r, filter)); write(coll, "updateOne", filter, row ? 1 : 0, update);
        if (row) Object.assign(row, update.$set ?? {}); return { matchedCount: row ? 1 : 0 };
      },
      replaceOne: async (filter: Record<string, unknown>, replacement: Row, opts: { upsert?: boolean } = {}) => replace(coll, filter, replacement, opts.upsert === true, "replaceOne"),
      bulkWrite: async (ops: { replaceOne: { filter: Record<string, unknown>; replacement: Row; upsert?: boolean } }[]) => {
        for (const o of ops) replace(coll, o.replaceOne.filter, o.replaceOne.replacement, o.replaceOne.upsert === true, "bulkWrite");
      },
      find: (filter: Record<string, unknown> = {}) => ({ toArray: async () => {
        const rows = (self.data[coll] ?? []).filter((r) => matches(r, filter)); rec(coll, "find", filter, rows.length); return structuredClone(rows);
      } }),
      findOne: async (filter: Record<string, unknown> = {}) => {
        const row = (self.data[coll] ?? []).find((r) => matches(r, filter)) ?? null; rec(coll, "findOne", filter, row ? 1 : 0);
        return row ? structuredClone(row) : null;
      },
    }) } as unknown as Pick<Db, "collection">;
  }
}

// ---- the fake mongodb client behind the REAL @lkb/db connect()/getDb()
let current: BlindDb | null = null;
const clientDb = { databaseName: "tenant-test-kit", collection: (name: string) => {
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
