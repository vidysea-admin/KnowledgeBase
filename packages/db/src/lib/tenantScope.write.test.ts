/**
 * packages/db/src/lib/tenantScope.write.test.ts - ISS-AUTHTENANT2-001: scopedCollection.replaceOne / bulkWrite (and the
 * tenantId pinning of update documents). The fake EVALUATES equality filters, so a dropped tenant scope shows up as a real
 * cross-tenant effect on rows, not only as a different recorded payload.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { scopedCollection } from "./tenantScope.js";

type R = Record<string, unknown>;
interface Call { op: string; filter?: R; docs?: unknown; update?: unknown; options?: unknown }
interface Row { _id: string; tenantId: string; v?: string }

function memDb(seed: R[]): { db: Db; rows: R[]; calls: Call[] } {
  const rows = structuredClone(seed), calls: Call[] = [];
  const hit = (r: R, f: R) => Object.entries(f).every(([k, v]) => r[k] === v);
  const applyUpdate = (r: R, u: R) => { Object.assign(r, (u.$set as R) ?? {}); for (const k of Object.keys((u.$unset as R) ?? {})) delete r[k]; };
  const replace = (f: R, doc: R, upsert: boolean) => {
    const i = rows.findIndex((r) => hit(r, f));
    if (i >= 0) rows[i] = structuredClone(doc); else if (upsert) rows.push(structuredClone(doc));
  };
  const db = { collection: () => ({
    replaceOne: async (f: R, doc: R, o: { upsert?: boolean } = {}) => { calls.push({ op: "replaceOne", filter: f, docs: [doc], options: o }); replace(f, doc, o.upsert === true); return {}; },
    bulkWrite: async (ops: R[], o?: unknown) => {
      calls.push({ op: "bulkWrite", docs: ops, options: o });
      for (const op of ops) {
        const kind = Object.keys(op)[0]!; const b = (op as Record<string, R>)[kind]!;
        if (kind === "insertOne") rows.push(structuredClone(b.document as R));
        else if (kind === "replaceOne") replace(b.filter as R, b.replacement as R, b.upsert === true);
        else if (kind === "updateOne" || kind === "updateMany") {
          const m = rows.filter((r) => hit(r, b.filter as R)); const targets = kind === "updateOne" ? m.slice(0, 1) : m;
          for (const r of targets) applyUpdate(r, b.update as R);
          if (!targets.length && b.upsert === true) { const d = { ...(b.filter as R) }; applyUpdate(d, b.update as R); rows.push(d); }
        } else if (kind === "deleteOne") { const i = rows.findIndex((r) => hit(r, b.filter as R)); if (i >= 0) rows.splice(i, 1); }
        else if (kind === "deleteMany") for (let i = rows.length - 1; i >= 0; i--) if (hit(rows[i]!, b.filter as R)) rows.splice(i, 1);
      }
      return {};
    },
    updateOne: async (f: R, u: R, o: unknown) => { calls.push({ op: "updateOne", filter: f, update: u, options: o }); const r = rows.find((x) => hit(x, f)); if (r) applyUpdate(r, u); return {}; },
  }) } as unknown as Db;
  return { db, rows, calls };
}

const coll = (db: Db) => scopedCollection<Row>(db, "rows");
const A_ROW = { _id: "x", tenantId: "tA", v: "A-ORIGINAL" }, B_ROW = { _id: "y", tenantId: "tB", v: "B-ORIGINAL" };
const rowsOf = (rows: R[], t: string) => JSON.stringify(rows.filter((r) => r.tenantId === t));

test("replaceOne: filter gets the tenant ANDed in and the replacement is stamped (tenantId last)", async () => {
  const { db, calls } = memDb([]);
  await coll(db)("t1").replaceOne({ _id: "x" }, { _id: "x", v: "1" }, { upsert: true });
  assert.deepEqual(calls[0], { op: "replaceOne", filter: { _id: "x", tenantId: "t1" }, docs: [{ _id: "x", v: "1", tenantId: "t1" }], options: { upsert: true } });
});

test("replaceOne: a caller-supplied tenantId on the replacement or in the filter is overridden", async () => {
  const { db, calls } = memDb([]);
  await coll(db)("t1").replaceOne({ _id: "x", tenantId: "tVictim" }, { _id: "x", tenantId: "tVictim" }, { upsert: true });
  assert.deepEqual(calls[0]!.filter, { _id: "x", tenantId: "t1" });
  assert.equal((calls[0]!.docs as R[])[0]!.tenantId, "t1");
});

test("replaceOne: tenant B cannot match or overwrite A's row by A's _id; a forged-tenant upsert lands under B and A is untouched", async () => {
  const { db, rows } = memDb([A_ROW, B_ROW]);
  const before = rowsOf(rows, "tA");
  await coll(db)("tB").replaceOne({ _id: "x" }, { _id: "x", v: "B-WROTE" });
  assert.equal(rowsOf(rows, "tA"), before);
  assert.equal(rows.length, 2, "no upsert flag: nothing created");
  await coll(db)("tB").replaceOne({ _id: "x" }, { _id: "x", tenantId: "tA", v: "B-UPSERT" }, { upsert: true });
  assert.equal(rowsOf(rows, "tA"), before, "A's row byte-identical");
  assert.deepEqual(rows.filter((r) => r.v === "B-UPSERT").map((r) => r.tenantId), ["tB"]);
});

test("replaceOne refuses hostile tenants before the driver is touched", () => {
  const { db, calls } = memDb([]);
  for (const bad of ["", " tA", { $ne: null }, null, 5, "t\u0000"]) assert.throws(() => coll(db)(bad as never).replaceOne({}, { _id: "x" }), /tenantId is required/);
  assert.equal(calls.length, 0);
});

const OPS = ["insertOne", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany"] as const;

test("bulkWrite: every op type gets the tenant merged into its filter / stamped on its document (recorded driver payload)", async () => {
  const { db, calls } = memDb([]);
  await coll(db)("t1").bulkWrite([
    { insertOne: { document: { _id: "i", v: "1" } } },
    { updateOne: { filter: { _id: "u1" }, update: { $set: { v: "2" } } } },
    { updateMany: { filter: { v: "q" }, update: { $set: { v: "3" } } } },
    { replaceOne: { filter: { _id: "r" }, replacement: { _id: "r", v: "4" }, upsert: true } },
    { deleteOne: { filter: { _id: "d1" } } },
    { deleteMany: { filter: { v: "z" } } },
  ] as never, { ordered: false });
  const ops = calls[0]!.docs as Record<string, R>[];
  assert.deepEqual(ops.map((o) => Object.keys(o)[0]), [...OPS]);
  assert.deepEqual(ops[0]!.insertOne!.document, { _id: "i", v: "1", tenantId: "t1" });
  for (const k of ["updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany"] as const) {
    assert.equal((ops.find((x) => k in x)![k]!.filter as R).tenantId, "t1", `${k} filter must carry the tenant`);
  }
  assert.equal((ops[3]!.replaceOne!.replacement as R).tenantId, "t1");
  assert.equal(ops[3]!.replaceOne!.upsert, true, "other op fields are preserved");
  assert.deepEqual(calls[0]!.options, { ordered: false });
});

for (const kind of OPS) {
  test(`bulkWrite ${kind}: tenant B cannot match, overwrite, delete or upsert into A's row (ids shared across tenants)`, async () => {
    const { db, rows } = memDb([A_ROW, B_ROW]);
    const before = rowsOf(rows, "tA");
    const op = {
      insertOne: { insertOne: { document: { _id: "x", tenantId: "tA", v: "B-INS" } } },
      updateOne: { updateOne: { filter: { _id: "x" }, update: { $set: { v: "B-UPD" } } } },
      updateMany: { updateMany: { filter: { _id: "x" }, update: { $set: { v: "B-UPD" } } } },
      replaceOne: { replaceOne: { filter: { _id: "x" }, replacement: { _id: "x", tenantId: "tA", v: "B-REP" } } },
      deleteOne: { deleteOne: { filter: { _id: "x" } } },
      deleteMany: { deleteMany: { filter: { v: "A-ORIGINAL" } } },
    }[kind];
    await coll(db)("tB").bulkWrite([op] as never);
    assert.equal(rowsOf(rows, "tA"), before, `${kind}: A's rows byte-identical`);
    for (const r of rows) if (r._id !== "x" && r.v !== "B-ORIGINAL") assert.fail("unexpected row " + JSON.stringify(r));
    for (const r of rows) if (r.v === "B-INS") assert.equal(r.tenantId, "tB", "inserted doc stamped with B, not the forged tA");
  });
}

test("bulkWrite deleteMany by a shared value deletes only the caller's rows", async () => {
  const { db, rows } = memDb([A_ROW, { _id: "z", tenantId: "tB", v: "A-ORIGINAL" }]);
  await coll(db)("tB").bulkWrite([{ deleteMany: { filter: { v: "A-ORIGINAL" } } }] as never);
  assert.deepEqual(rows.map((r) => r.tenantId), ["tA"]);
});

test("bulkWrite upserts (replaceOne and updateOne) stamp the caller's tenant, never a forged one", async () => {
  const { db, rows } = memDb([A_ROW]);
  await coll(db)("tB").bulkWrite([
    { replaceOne: { filter: { _id: "n1" }, replacement: { _id: "n1", tenantId: "tA", v: "R" }, upsert: true } },
    { updateOne: { filter: { _id: "n2" }, update: { $set: { v: "U", tenantId: "tA" } }, upsert: true } },
  ] as never);
  assert.deepEqual(rows.filter((r) => r._id === "n1" || r._id === "n2").map((r) => r.tenantId), ["tB", "tB"]);
  assert.equal(rowsOf(rows, "tA"), JSON.stringify([A_ROW]));
});

test("a caller-supplied tenantId in an UPDATE is overridden / dropped (updateOne and bulkWrite), other fields untouched", async () => {
  const { db, calls } = memDb([A_ROW]);
  await coll(db)("tA").updateOne({ _id: "x" }, { $set: { v: "1", tenantId: "tB" }, $setOnInsert: { tenantId: "tB" }, $unset: { tenantId: "" }, $rename: { v: "tenantId" } } as never);
  assert.deepEqual(calls[0]!.update, { $set: { v: "1", tenantId: "tA" }, $setOnInsert: { tenantId: "tA" }, $unset: {}, $rename: {} });
  await coll(db)("tA").bulkWrite([{ updateMany: { filter: {}, update: { $set: { tenantId: "tB", v: "2" }, $unset: { tenantId: "" } } } }] as never);
  assert.deepEqual((calls[1]!.docs as Record<string, R>[])[0]!.updateMany!.update, { $set: { tenantId: "tA", v: "2" }, $unset: {} });
});

test("an update that never mentions tenantId passes through byte-identical", async () => {
  const { db, calls } = memDb([A_ROW]);
  await coll(db)("tA").updateOne({ _id: "x" }, { $set: { v: "1" }, $inc: { n: 1 } } as never);
  assert.deepEqual(calls[0]!.update, { $set: { v: "1" }, $inc: { n: 1 } });
});

test("aggregation-pipeline updates are refused (cannot be tenant-pinned)", () => {
  const { db, calls } = memDb([]);
  assert.throws(() => coll(db)("tA").updateOne({}, [{ $set: { tenantId: "tB" } }] as never), /operator-style/);
  assert.throws(() => coll(db)("tA").bulkWrite([{ updateOne: { filter: {}, update: [{ $set: { tenantId: "tB" } }] } }] as never), /operator-style/);
  assert.equal(calls.length, 0);
});

test("bulkWrite rejects unknown op types and multi-key ops BEFORE any driver call, even when other ops are valid", () => {
  const { db, calls } = memDb([]);
  const ok = { insertOne: { document: { _id: "a" } } };
  for (const bad of [{ updateOneX: { filter: {} } }, { replaceMany: {} }, {}, { insertOne: { document: {} }, deleteMany: { filter: {} } }, null, "deleteMany"]) {
    assert.throws(() => coll(db)("tA").bulkWrite([ok, bad] as never), /unsupported bulk operation/);
  }
  assert.equal(calls.length, 0, "nothing reaches the driver, not even the valid first op");
});

test("bulkWrite refuses hostile tenants before the driver is touched", () => {
  const { db, calls } = memDb([]);
  for (const bad of ["", "  ", { $ne: null }, null, 5, ["tA"]]) assert.throws(() => coll(db)(bad as never).bulkWrite([{ deleteMany: { filter: {} } }] as never), /tenantId is required/);
  assert.equal(calls.length, 0);
});
