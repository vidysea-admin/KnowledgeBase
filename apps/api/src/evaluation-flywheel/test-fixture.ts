import type { Db } from "mongodb";
import type { EvalRuns, Sources, Sessions, Turns } from "@lkb/core";
import { tenantSourceId } from "@lkb/ingest";
import assert from "node:assert/strict";
import { createMongoFlywheelStore } from "./store.js";
import { createEvaluationFlywheel } from "./workflow.js";
import type { FlywheelDeps } from "./types.js";

export const QUESTION = "When does registration open?";
export const ANSWER = "Registration opens on the first of April.";
export const ORIGINAL: EvalRuns = { _id: "loss", tenantId: "t", question: QUESTION, counsellor: { name: "fixture judge" },
  aiAnswer: { text: "I do not have the date.", sources: { internal: [], web: [] }, insufficient_coverage: true },
  counsellorAnswer: { text: ANSWER }, score: { ai: 1, counsellor: 4 }, credibility: "internal", createdAt: "2026-10-14T00:00:00.000Z" };
export const SOURCE: Sources = { _id: tenantSourceId("t", "fixture-digest"), tenantId: "t", kind: "url", hash: "fixture-digest",
  captureMode: "provided", consent: { given: true, recordedBy: "test-only" }, url: "https://example.org/session", createdAt: ORIGINAL.createdAt };
export const SESSION: Sessions = { _id: "s1", tenantId: "t", sourceId: SOURCE._id, title: "Registration information", date: "2026-10-14", status: { transcribe: "done", index: "pending" } };
export const TURN: Turns = { _id: "s1-t001", tenantId: "t", sessionId: "s1", text: ANSWER, speakerRef: "speaker:fixture", tStart: 3, tEnd: 7 };
type Row = Record<string, any>;
function get(row: Row, path: string): unknown { return path.split(".").reduce((r: any, key) => r?.[key], row); }
/** Mongo dotted filters traverse each embedded array element; absent paths yield no values. */
function fieldValues(row: unknown, keys: string[]): unknown[] {
  if (!keys.length) return [row];
  if (Array.isArray(row)) return row.flatMap(value => fieldValues(value, keys));
  const [key, ...rest] = keys;
  if (row === null || typeof row !== "object" || !Object.hasOwn(row, key!)) return [];
  return fieldValues((row as Row)[key!], rest);
}
function matchesValue(values: unknown[], expected: unknown): boolean {
  // Mongo null equality also selects a wholly absent field.
  if (!values.length) return expected === null || expected === undefined;
  return values.some(actual => actual === expected || Array.isArray(actual) && actual.some(value => value === expected));
}
function set(row: Row, path: string, value: unknown): void {
  const keys = path.split("."), last = keys.pop()!; let target = row;
  for (const key of keys) target = target[key] ??= {};
  target[last] = structuredClone(value);
}
function match(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (k === "$or") return (v as Row[]).some((f) => match(row, f));
    const values = fieldValues(row, k.split("."));
    if (v && typeof v === "object") {
      const operators = Object.keys(v);
      if (operators.some(key => key.startsWith("$"))) return operators.every(key => {
        if (key === "$exists") return (values.length > 0) === v.$exists;
        if (key === "$in") return Array.isArray(v.$in) && v.$in.some((value: unknown) => matchesValue(values, value));
        if (key === "$nin") return Array.isArray(v.$nin) && !v.$nin.some((value: unknown) => matchesValue(values, value));
        if (key === "$ne") return !matchesValue(values, v.$ne);
        return false;
      });
    }
    return matchesValue(values, v);
  });
}
/** Faithful scoped filters/CAS/upsert fixture, with a real mutable indexed output consumed downstream. */
export function memoryDb(seed: Record<string, Row[]> = {}, databaseName = "lkb_t059_fixture") {
  const tables = structuredClone(seed), calls: { collection: string; operation: string; filter?: Row }[] = [];
  const db = {
    databaseName,
    collection(name: string) {
      const rows = tables[name] ??= [];
      const log = (operation: string, filter?: Row) => calls.push({ collection: name, operation, filter: structuredClone(filter) });
      const insert = (row: Row) => {
        if (rows.some((r) => r._id === row._id)) throw Object.assign(new Error("duplicate"), { code: 11000 });
        rows.push(structuredClone(row));
      };
      return {
        find(filter: Row = {}) {
          let sort: Row = {};
          const cursor = { sort(s: Row) { sort = s; return cursor; }, async toArray() {
            log("find", filter); return structuredClone(rows.filter((r) => match(r, filter)).sort((a, b) => {
              for (const [k, direction] of Object.entries(sort)) { const av = get(a, k) as any, bv = get(b, k) as any;
                if (av !== bv) return (av < bv ? -1 : 1) * Number(direction); } return 0;
            }));
          } }; return cursor;
        },
        async findOne(filter: Row = {}) { log("findOne", filter); return structuredClone(rows.find((r) => match(r, filter)) ?? null); },
        async insertOne(row: Row) { log("insertOne"); insert(row); return { acknowledged: true, insertedId: row._id }; },
        async insertMany(rs: Row[]) { log("insertMany"); rs.forEach(insert); return { acknowledged: true, insertedCount: rs.length }; },
        async deleteMany(filter: Row) { log("deleteMany", filter); const keep = rows.filter((r) => !match(r, filter)); const n = rows.length - keep.length; rows.splice(0, rows.length, ...keep); return { acknowledged: true, deletedCount: n }; },
        async replaceOne(filter: Row, row: Row, options: Row = {}) {
          log("replaceOne", filter); const i = rows.findIndex((r) => match(r, filter));
          const modified = i >= 0 && JSON.stringify(rows[i]) !== JSON.stringify(row);
          if (i >= 0) rows[i] = structuredClone(row); else if (options.upsert) insert(row);
          return { acknowledged: true, matchedCount: i >= 0 ? 1 : 0, modifiedCount: modified ? 1 : 0, upsertedCount: i < 0 && options.upsert ? 1 : 0 };
        },
        async updateOne(filter: Row, update: Row, options: Row = {}) {
          log("updateOne", filter); let row = rows.find((r) => match(r, filter)); const found = !!row;
          const before = row ? JSON.stringify(row) : undefined;
          if (!row && options.upsert) { row = structuredClone(filter); insert(row); row = rows.at(-1)!; for (const [k, v] of Object.entries(update.$setOnInsert ?? {})) set(row, k, v); }
          if (row) for (const [k, v] of Object.entries(update.$set ?? {})) set(row, k, v);
          return { acknowledged: true, matchedCount: found ? 1 : 0, modifiedCount: found && before !== JSON.stringify(row) ? 1 : 0 };
        },
      };
    },
  } as unknown as Db;
  return { db, tables, calls };
}

export function rig() {
  const mem = memoryDb({ eval_runs: [ORIGINAL], sources: [SOURCE], sessions: [SESSION], turns: [TURN],
    tree_index: [{ _id: "tree", tenantId: "t", node_id: "tenant:t", level: "tenant", title: "T", summary: "", children: [{ node_id: "tenant:t/session:s1", level: "session", title: "S", summary: TURN.text, evidence: { sessionRef: "s1" }, children: [] }] }],
    chunks: [{ _id: "c1", tenantId: "t", sourceRef: "s1", turnRefs: [TURN._id], chunkIndex: 0, vector: [1, 0], dims: 2, embeddingModel: "fixture" }] });
  const calls = { intake: 0, index: 0, ask: 0 };
  let clock = new Date("2026-10-14T01:00:00Z");
  const deps: FlywheelDeps = {
    store: createMongoFlywheelStore(mem.db), now: () => clock,
    intake: async ({ tenantId }) => { assert.equal(tenantId, "t"); calls.intake++; return { status: "already-ingested", sourceId: SOURCE._id, sessionId: "s1" }; },
    index: async (t, s) => { assert.equal(t, "t"); assert.equal(s, "s1"); calls.index++; return { sessionId: s, summary: { degraded: null }, claims: { degraded: null }, chunks: { written: 1, skipped: null }, entities: null, gapRecorded: true,
      completion: { version: 2, strict: true, complete: true, generation: `index-${calls.index}`, turnCount: 1, treeWritten: true } }; },
    ask: async (t, q) => { assert.equal(t, "t"); assert.equal(q, ORIGINAL.question); calls.ask++; return { text: TURN.text, sources: { internal: [], web: [] }, insufficient_coverage: true }; },
  };
  return { ...mem, calls, deps, workflow: () => createEvaluationFlywheel(deps), advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}
