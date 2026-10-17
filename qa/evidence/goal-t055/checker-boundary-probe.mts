import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { KnowledgeCollections } from "@lkb/core";
import { createMongoKnowledgeStore } from "../../../apps/api/src/knowledge/collections-store.js";

// Independently authored synthetic storage boundary. Every actual scoped predicate is
// evaluated and recorded; unknown operators fail rather than pretending to match.
type Row = Record<string, unknown>;
const record = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value);
function fixture() {
  const data: Record<string, Row[]> = {
    sources: [
      { _id: "source-safe", tenantId: "a", kind: "recording", consent: { given: true } },
      { _id: "source-changing", tenantId: "a", kind: "recording", consent: { given: true } },
    ],
    sessions: [
      { _id: "safe", tenantId: "a", sourceId: "source-safe" },
      { _id: "changing", tenantId: "a", sourceId: "source-changing" },
    ],
    knowledge_collections: [],
  };
  const queries: { name: string; operation: string; filter: Row }[] = [];
  const writes: { name: string; filter: Row; update: Row }[] = [];
  const match = (row: Row, filter: Row): boolean => Object.entries(filter).every(([key, expected]) => {
    assert.equal(record(expected), false, `Unexpected fixture operator ${key}`);
    return row[key] === expected;
  });
  const observe = (name: string, operation: string, filter: Row) => {
    assert.ok(filter.tenantId === "a" || filter.tenantId === "b", "Every concrete query must carry verified tenant");
    queries.push({ name, operation, filter: structuredClone(filter) });
  };
  const capability = { databaseName: "checker-t055-synthetic", collection(name: string) {
    const rows = data[name] ??= [];
    return {
      async findOne(filter: Row) { observe(name, "findOne", filter); return structuredClone(rows.find(row => match(row, filter)) ?? null); },
      find(filter: Row) { observe(name, "find", filter); return { toArray: async () => structuredClone(rows.filter(row => match(row, filter))) }; },
      async insertOne(row: Row) {
        assert.equal(typeof row.tenantId, "string");
        if (rows.some(existing => existing._id === row._id)) throw Object.assign(new Error("Duplicate natural ID"), { code: 11000 });
        rows.push(structuredClone(row)); return { acknowledged: true };
      },
      async updateOne(filter: Row, update: Row) {
        observe(name, "updateOne", filter); writes.push({ name, filter: structuredClone(filter), update: structuredClone(update) });
        const row = rows.find(existing => match(existing, filter)); if (!row) return { matchedCount: 0 };
        assert.ok(record(update.$set), "Independent collection probe accepts only actual $set updates");
        Object.assign(row, structuredClone(update.$set)); return { matchedCount: 1 };
      },
    };
  } };
  // The fake exposes the concrete driver methods exercised here; it never replaces product predicates.
  return { data, queries, writes, store: createMongoKnowledgeStore(capability as unknown as Db) };
}
const collection = (id: string, tenantId: string, members: KnowledgeCollections["members"]): KnowledgeCollections => ({
  _id: id.repeat(64), tenantId, title: "Synthetic saved collection", members, revision: 1, updatedAt: "2026-10-15T00:00:00.000Z",
});

test("withdrawal after a previously visible read refuses replacement and preserves complete stored curation", async () => {
  const f = fixture(); const original = collection("a", "a", [{ kind: "session", id: "safe" }, { kind: "session", id: "changing" }]);
  f.data.knowledge_collections.push(structuredClone(original));
  assert.equal(await f.store.memberExists("a", original.members[1]!), true);
  const initiallyRead = await f.store.getCollection("a", original._id); assert.deepEqual(initiallyRead, original);
  const source = f.data.sources.find(row => row._id === "source-changing")!; source.consent = { given: false };
  assert.equal(await f.store.memberExists("a", original.members[1]!), false);
  for (const members of [[original.members[0]!], []]) {
    const replacement = { ...original, title: "Attempted partial edit", members, revision: 2, updatedAt: "2026-10-15T01:00:00.000Z" };
    assert.equal(await f.store.writeCollection("a", replacement, 1), false);
    assert.deepEqual(f.data.knowledge_collections[0], original);
  }
  assert.equal(f.writes.length, 0, "Refusal occurs before an update is attempted");
});

test("concrete tenant and revision predicates refuse foreign and stale updates while a safe update preserves sibling", async () => {
  const f = fixture(); const own = collection("a", "a", [{ kind: "session", id: "safe" }]);
  const sibling = collection("c", "a", [{ kind: "session", id: "safe" }]);
  const foreign = collection("b", "b", []);
  f.data.knowledge_collections.push(structuredClone(own), structuredClone(sibling), structuredClone(foreign));
  const beforeSibling = structuredClone(f.data.knowledge_collections[1]); const beforeForeign = structuredClone(f.data.knowledge_collections[2]);
  assert.equal(await f.store.writeCollection("a", { ...foreign, tenantId: "a", revision: 2 }, 1), false);
  const updated = { ...own, title: "Safe exact update", revision: 2 };
  assert.equal(await f.store.writeCollection("a", updated, 1), true);
  assert.equal(await f.store.writeCollection("a", { ...own, title: "Stale overwrite", revision: 2 }, 1), false);
  assert.deepEqual(f.data.knowledge_collections[0], updated);
  assert.deepEqual(f.data.knowledge_collections[1], beforeSibling); assert.deepEqual(f.data.knowledge_collections[2], beforeForeign);
  assert.deepEqual(f.writes.map(write => write.filter), [{ _id: own._id, revision: 1, tenantId: "a" }]);
  assert.ok(f.queries.every(query => query.filter.tenantId === "a"));
});
