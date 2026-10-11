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
export interface Query { coll: string; op: "find" | "findOne"; filter: Record<string, unknown>; returned: number }
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
    return { collection: (coll: string) => ({
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

/** The production `createMongoTreeStore().load`, bound to `db`; `loads` records the raw argument the router handed it. */
export function realTreeStore(db: BlindDb, loads: unknown[]): TreeStore {
  const real = createMongoTreeStore();
  return { load: async (tenantId: string): Promise<TreeIndexNode | null> => { loads.push(tenantId); current = db; return real.load(tenantId); } };
}
