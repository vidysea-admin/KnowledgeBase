/**
 * packages/db/src/lib/tenantScope.test.ts — the tenant boundary is the one invariant in this
 * codebase whose failure is unrecoverable: a cross-tenant delete destroys data belonging to
 * someone who never touched the system.
 *
 * It had ZERO runtime tests until ISS-060. `packages/db` did not even declare a `test` script,
 * so `pnpm -r test` skipped the package silently — the accessor whose entire purpose is to make
 * a tenant-less query impossible was the least-tested file in the workspace. The sibling
 * `collections/tenantScope.typecheck-test.ts` pins only that OMITTING the argument fails to
 * compile; nothing pinned that the argument is actually APPLIED to the query.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { scopedCollection, withTenant } from "./tenantScope.js";

interface Row { _id: string; tenantId: string; sessionId?: string }

interface Call { op: string; filter?: unknown; docs?: unknown; update?: unknown; options?: unknown }

/** Records what actually reaches the driver — the filter, not just the method name. */
function fakeDb(): { db: Db; calls: Call[] } {
  const calls: Call[] = [];
  const db = {
    collection: () => ({
      find: (filter: unknown) => { calls.push({ op: "find", filter }); return { toArray: async () => [] }; },
      findOne: async (filter: unknown) => { calls.push({ op: "findOne", filter }); return null; },
      insertOne: async (doc: unknown) => { calls.push({ op: "insertOne", docs: [doc] }); return {}; },
      insertMany: async (docs: unknown) => { calls.push({ op: "insertMany", docs }); return {}; },
      deleteMany: async (filter: unknown) => { calls.push({ op: "deleteMany", filter }); return { deletedCount: 0 }; },
      updateOne: async (filter: unknown, update: unknown, options?: unknown) => { calls.push({ op: "updateOne", filter, update, options }); return { matchedCount: 0 }; },
      countDocuments: async (filter: unknown) => { calls.push({ op: "countDocuments", filter }); return 0; },
    }),
  } as unknown as Db;
  return { db, calls };
}

const coll = (db: Db) => scopedCollection<Row>(db, "rows");

test("every read merges the tenantId into the filter", async () => {
  const { db, calls } = fakeDb();
  coll(db)("t1").find({ sessionId: "s1" });
  await coll(db)("t1").findOne({ sessionId: "s1" });
  assert.deepEqual(calls[0]!.filter, { sessionId: "s1", tenantId: "t1" });
  assert.deepEqual(calls[1]!.filter, { sessionId: "s1", tenantId: "t1" });
});

test("an EMPTY filter still carries the tenantId — the dangerous default", async () => {
  // `find()` / `deleteMany()` with no argument is exactly the call that would otherwise span
  // every tenant in the collection.
  const { db, calls } = fakeDb();
  coll(db)("t1").find();
  await coll(db)("t1").deleteMany();
  assert.deepEqual(calls[0]!.filter, { tenantId: "t1" });
  assert.deepEqual(calls[1]!.filter, { tenantId: "t1" });
});

test("deleteMany is tenant-scoped — ISS-060, the mutation that survived the whole suite", async () => {
  const { db, calls } = fakeDb();
  await coll(db)("t1").deleteMany({ sessionId: "s1" });
  assert.deepEqual(calls[0], { op: "deleteMany", filter: { sessionId: "s1", tenantId: "t1" } });
});

test("a caller CANNOT override the tenantId by putting a different one in the filter", async () => {
  // The scoping would be decorative if a caller-supplied tenantId won: any code path that
  // forwards a user-controlled filter would become a cross-tenant read/delete.
  const { db, calls } = fakeDb();
  await coll(db)("t1").deleteMany({ tenantId: "t2-victim" } as never);
  assert.deepEqual(calls[0]!.filter, { tenantId: "t1" }, "the accessor's own tenantId must win");
});

test("updateOne is tenant-scoped, and its update body is passed through untouched (ISS-065)", async () => {
  // ISS-065: updateOne had no tenant-merged accessor at all, so seven call sites across this
  // package and apps/api went around this guard via a now-removed `raw` escape hatch, each
  // hand-carrying its own tenantId in the filter.
  const { db, calls } = fakeDb();
  await coll(db)("t1").updateOne({ _id: "a" }, { $set: { sessionId: "s2" } });
  assert.deepEqual(calls[0], { op: "updateOne", filter: { _id: "a", tenantId: "t1" }, update: { $set: { sessionId: "s2" } }, options: {} });
});

test("updateOne's tenantId cannot be overridden by a caller-supplied one either", async () => {
  const { db, calls } = fakeDb();
  await coll(db)("t1").updateOne({ tenantId: "t2-victim" } as never, { $set: { sessionId: "s2" } });
  assert.deepEqual(calls[0]!.filter, { tenantId: "t1" });
});

test("countDocuments is tenant-scoped — ISS-069, the accessor that shipped with no coverage at all", async () => {
  // ISS-068/ISS-069: countDocuments was added to close the eighth `raw` call site
  // (scripts/sync-real-turns.mjs) but was never given a test of its own — a checker's own
  // mutation dispatch found the gap: stripping its tenant merge reddened zero tests.
  const { db, calls } = fakeDb();
  await coll(db)("t1").countDocuments({ sessionId: "s1" });
  assert.deepEqual(calls[0], { op: "countDocuments", filter: { sessionId: "s1", tenantId: "t1" } });
});

test("countDocuments's tenantId cannot be overridden by a caller-supplied one either", async () => {
  const { db, calls } = fakeDb();
  await coll(db)("t1").countDocuments({ tenantId: "t2-victim" } as never);
  assert.deepEqual(calls[0]!.filter, { tenantId: "t1" });
});

test("an EMPTY countDocuments filter still carries the tenantId", async () => {
  const { db, calls } = fakeDb();
  await coll(db)("t1").countDocuments();
  assert.deepEqual(calls[0]!.filter, { tenantId: "t1" });
});

test("insertOne and insertMany stamp the tenantId onto every document", async () => {
  const { db, calls } = fakeDb();
  await coll(db)("t1").insertOne({ _id: "a" });
  await coll(db)("t1").insertMany([{ _id: "b" }, { _id: "c" }]);
  assert.deepEqual(calls[0]!.docs, [{ _id: "a", tenantId: "t1" }]);
  assert.deepEqual(calls[1]!.docs, [{ _id: "b", tenantId: "t1" }, { _id: "c", tenantId: "t1" }]);
});

test("insertMany of an empty list does not silently become an untenanted call", async () => {
  const { db, calls } = fakeDb();
  await coll(db)("t1").insertMany([]);
  assert.deepEqual(calls[0]!.docs, []);
});

test("an empty tenantId is refused at the accessor, not passed to Mongo as a match-all", async () => {
  const { db, calls } = fakeDb();
  assert.throws(() => coll(db)(""), /tenantId is required/);
  assert.equal(calls.length, 0, "nothing may reach the driver on a refused tenantId");
});

test("withTenant is pure — it does not mutate the caller's filter object", async () => {
  const original = { sessionId: "s1" };
  const merged = withTenant<Row>("t1", original);
  assert.deepEqual(original, { sessionId: "s1" }, "the input filter must be left alone");
  assert.deepEqual(merged, { sessionId: "s1", tenantId: "t1" });
});

test("updateOne's UPSERT still merges the tenantId into the filter (ISS-118)", async () => {
  // The `options` parameter was added so ISS-118 could upsert one gap row per session. An upsert
  // builds the INSERTED document from the filter when nothing matches, so if the tenant merge were
  // skipped on this path a brand-new document would be created with NO tenantId at all — a
  // tenant-less row written by the very helper whose job is to make that impossible. This asserts
  // the merge happens on the upsert path specifically, not just the plain-update path above.
  const { db, calls } = fakeDb();
  await coll(db)("t1").updateOne({ _id: "a" }, { $set: { kind: "vector-pending" } }, { upsert: true });
  assert.deepEqual(calls[0], {
    op: "updateOne",
    filter: { _id: "a", tenantId: "t1" },
    update: { $set: { kind: "vector-pending" } },
    options: { upsert: true },
  });
});

test("an invalid tenantId (undefined, null, non-string, whitespace, control chars) is refused and nothing reaches the driver", async () => {
  // A truthy non-string such as { $ne: null } used to pass `!tenantId` and become a match-every-tenant filter.
  const { db, calls } = fakeDb();
  const bad: unknown[] = [undefined, null, "", 0, 5, true, ["t1"], { $ne: null }, { $exists: true }, "  ", " t1", "t1 ", "t1\n", "t\u0000", "a\tb"];
  for (const t of bad) {
    assert.throws(() => coll(db)(t as string), /tenantId is required/, JSON.stringify(t));
    assert.throws(() => withTenant<Row>(t as string, {}), /tenantId is required/, JSON.stringify(t));
  }
  assert.equal(calls.length, 0);
  for (const ok of ["toc", "tenant-1", "tA", "synthetic-capture", "system", "t"]) assert.deepEqual(withTenant<Row>(ok, {}), { tenantId: ok });
});
