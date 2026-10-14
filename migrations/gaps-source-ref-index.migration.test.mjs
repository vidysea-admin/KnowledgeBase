// Dry-run of 20261013110000-gaps-source-ref-index.cjs against an in-memory fake Db. Never connects to Mongo.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const migration = require("./20261013110000-gaps-source-ref-index.cjs");
const declared = JSON.parse(readFileSync(new URL("../schema/index.json", import.meta.url), "utf8")).gaps;

function fakeDb(existing = []) {
  const calls = { created: [], indexes: [], dropped: [], droppedIndexes: [] };
  return {
    calls,
    listCollections: () => ({ toArray: async () => existing.map((name) => ({ name })) }),
    createCollection: async (name) => { calls.created.push(name); },
    collection: (name) => ({
      createIndex: async (keys, options) => { calls.indexes.push({ name, keys, options }); },
      dropIndex: async (idx) => { calls.droppedIndexes.push({ name, idx }); },
      drop: async () => { calls.dropped.push(name); },
    }),
  };
}

test("schema/index.json declares gaps with { tenantId, sourceRef }, tenantId-leading", () => {
  assert.ok(declared, "gaps is declared");
  assert.deepEqual(declared.map((d) => d.keys), [{ tenantId: 1 }, { tenantId: 1, sourceRef: 1 }]);
  for (const d of declared) assert.equal(Object.keys(d.keys)[0], "tenantId");
});

test("up creates gaps and exactly the declared indexes, including { tenantId, sourceRef }", async () => {
  const db = fakeDb();
  await migration.up(db);
  assert.deepEqual(db.calls.created, ["gaps"]);
  assert.deepEqual(db.calls.indexes.map((i) => i.keys), declared.map((d) => d.keys));
  assert.ok(db.calls.indexes.some((i) => i.name === "gaps" && JSON.stringify(i.keys) === '{"tenantId":1,"sourceRef":1}'));
});

test("up is idempotent on an existing collection (no createCollection)", async () => {
  const db = fakeDb(["gaps"]);
  await migration.up(db);
  await migration.up(db);
  assert.deepEqual(db.calls.created, []);
});

test("down drops only the gaps indexes and never the collection (it holds real rows)", async () => {
  const db = fakeDb(["gaps"]);
  await migration.down(db);
  assert.deepEqual(db.calls.dropped, []);
  assert.deepEqual(db.calls.droppedIndexes, [{ name: "gaps", idx: "tenantId_1" }, { name: "gaps", idx: "tenantId_1_sourceRef_1" }]);
});
