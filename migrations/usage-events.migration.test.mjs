// Dry-run of 20261012100000-usage-events.cjs against an in-memory fake Db. Never connects to Mongo.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const migration = require("./20261012100000-usage-events.cjs");

function fakeDb(existing = []) {
  const calls = { created: [], indexes: [], dropped: [] };
  return {
    calls,
    listCollections: () => ({ toArray: async () => existing.map((name) => ({ name })) }),
    createCollection: async (name) => { calls.created.push(name); },
    collection: (name) => ({
      createIndex: async (keys, options) => { calls.indexes.push({ name, keys, options }); },
      drop: async () => { calls.dropped.push(name); },
    }),
  };
}

test("up creates usage_events and exactly the indexes declared in schema/index.json (no TTL, no unique)", async () => {
  const db = fakeDb();
  await migration.up(db);
  assert.deepEqual(db.calls.created, ["usage_events"]);
  assert.deepEqual(db.calls.indexes.map((i) => i.keys), [{ tenantId: 1 }, { tenantId: 1, day: 1 }]);
  for (const i of db.calls.indexes) {
    assert.equal(i.name, "usage_events");
    assert.deepEqual(i.options, {}, "no expireAfterSeconds / unique: no retention decision exists");
  }
  const declared = JSON.parse(readFileSync(new URL("../schema/index.json", import.meta.url), "utf8")).usage_events;
  assert.deepEqual(db.calls.indexes.map((i) => ({ keys: i.keys })), declared);
});

test("up is idempotent on an existing collection: no createCollection, indexes re-applied", async () => {
  const db = fakeDb(["usage_events", "jobs"]);
  await migration.up(db);
  assert.deepEqual(db.calls.created, []);
  assert.equal(db.calls.indexes.length, 2);
});

test("down drops only usage_events and swallows a missing collection", async () => {
  const db = fakeDb();
  await migration.down(db);
  assert.deepEqual(db.calls.dropped, ["usage_events"]);
  const missing = { collection: () => ({ drop: () => Promise.reject(new Error("ns not found")) }) };
  await migration.down(missing);
});
