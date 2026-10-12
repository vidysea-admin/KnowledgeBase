// Dry-run of 20261013100000-speaker-suggestions.cjs against an in-memory fake Db. Never connects to Mongo.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const migration = require("./20261013100000-speaker-suggestions.cjs");

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

test("up creates speaker_suggestions and exactly the indexes in schema/index.json, one unique", async () => {
  const db = fakeDb();
  await migration.up(db);
  assert.deepEqual(db.calls.created, ["speaker_suggestions"]);
  const declared = JSON.parse(readFileSync(new URL("../schema/index.json", import.meta.url), "utf8")).speaker_suggestions;
  assert.deepEqual(db.calls.indexes.map((i) => i.keys), declared.map((d) => d.keys));
  assert.deepEqual(db.calls.indexes.filter((i) => i.options.unique).map((i) => i.keys), [{ tenantId: 1, sessionId: 1, speakerRef: 1, personId: 1 }]);
  for (const i of db.calls.indexes) assert.equal(i.options.expireAfterSeconds, undefined, "a rejection tombstone must never expire");
});

test("up is idempotent on an existing collection; down drops only speaker_suggestions", async () => {
  const db = fakeDb(["speaker_suggestions", "jobs"]);
  await migration.up(db);
  assert.deepEqual(db.calls.created, []);
  await migration.down(db);
  assert.deepEqual(db.calls.dropped, ["speaker_suggestions"]);
});
