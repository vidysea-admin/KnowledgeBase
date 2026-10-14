// Dry-run of 20261014100000-transcript-reviews.cjs against an in-memory fake Db. Never connects to Mongo.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const migration = require("./20261014100000-transcript-reviews.cjs");

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
const declared = JSON.parse(readFileSync(new URL("../schema/index.json", import.meta.url), "utf8"));

test("up creates both collections and exactly the declared indexes; the head is unique per tenant+session", async () => {
  const db = fakeDb();
  await migration.up(db);
  assert.deepEqual(db.calls.created, ["transcript_reviews", "transcript_review_revisions"]);
  const want = [...declared.transcript_reviews, ...declared.transcript_review_revisions].map((d) => d.keys);
  assert.deepEqual(db.calls.indexes.map((i) => i.keys), want);
  const unique = db.calls.indexes.filter((i) => i.options.unique).map((i) => `${i.name}:${Object.keys(i.keys).join(",")}`);
  assert.deepEqual(unique, ["transcript_reviews:tenantId,sessionId", "transcript_review_revisions:tenantId,sessionId,revision"]);
  for (const i of db.calls.indexes) assert.equal(i.options.expireAfterSeconds, undefined, "history must never expire");
});

test("up is idempotent on existing collections; down drops only the two review collections", async () => {
  const db = fakeDb(["transcript_reviews", "transcript_review_revisions", "turns"]);
  await migration.up(db);
  assert.deepEqual(db.calls.created, []);
  await migration.down(db);
  assert.deepEqual(db.calls.dropped, ["transcript_reviews", "transcript_review_revisions"]);
});

test("every index leads with tenantId (ARCHITECTURE section 5)", () => {
  for (const name of ["transcript_reviews", "transcript_review_revisions"]) {
    for (const spec of declared[name]) assert.equal(Object.keys(spec.keys)[0], "tenantId");
  }
});
