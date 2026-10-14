/**
 * T-008: semantic-search-store — fakes only (in-memory db that APPLIES filters, stub embedder).
 * The tenant boundary is asserted on the filter that reaches `find`/`findOne` (ISS-078), and
 * behaviourally: another tenant's closer vector must never be returned.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMongoSemanticSearchDeps, semanticSearchEnabled } from "./semantic-search-store.js";

const CHUNKS = [
  { _id: "c1", tenantId: "toc", sourceRef: "s1", vector: [1, 0] },
  { _id: "c2", tenantId: "toc", sourceRef: "s1", vector: [0.9, 0.1] },
  { _id: "c3", tenantId: "toc", sourceRef: "s2", vector: [0, 1] },
  { _id: "c4", tenantId: "toc", sourceRef: "s3", vector: [1, 0, 0] }, // dimension mismatch: skipped
  { _id: "c5", tenantId: "toc", sourceRef: "s4" }, // no vector
  { _id: "x1", tenantId: "other", sourceRef: "s9", vector: [1, 0] }, // other tenant, perfect match
];
const SESSIONS = [
  { _id: "s1", tenantId: "toc", title: "One" },
  { _id: "s2", tenantId: "toc", title: "Two" },
  { _id: "s9", tenantId: "other", title: "Other" },
];
interface Call { coll: string; op: string; filter: Record<string, unknown> }

function matches(f: Record<string, unknown>, d: Record<string, unknown>): boolean {
  if (f.tenantId !== undefined && d.tenantId !== f.tenantId) return false;
  if (f._id !== undefined && d._id !== f._id) return false;
  const v = f.vector as { $exists?: boolean } | undefined;
  if (v?.$exists !== undefined && ("vector" in d) !== v.$exists) return false;
  return true;
}
function fakeDb() {
  const calls: Call[] = [];
  const rows = (n: string) => (n === "chunks" ? CHUNKS : SESSIONS) as unknown as Record<string, unknown>[];
  const db = {
    collection: (name: string) => ({
      find: (filter: Record<string, unknown>) => {
        calls.push({ coll: name, op: "find", filter });
        return { toArray: async () => rows(name).filter((d) => matches(filter, d)) };
      },
      findOne: async (filter: Record<string, unknown>) => {
        calls.push({ coll: name, op: "findOne", filter });
        return rows(name).find((d) => matches(filter, d)) ?? null;
      },
    }),
  };
  return { db: db as never, calls };
}
const embed = async () => ({ vectors: [[1, 0]], dims: 2, provider: "fake", model: "fake" });

test("every query carries the tenantId inside the filter (ISS-078)", async () => {
  const { db, calls } = fakeDb();
  await createMongoSemanticSearchDeps({ embed, db }).search("toc", "q", 10);
  assert.ok(calls.some((c) => c.coll === "chunks") && calls.some((c) => c.coll === "sessions"));
  for (const c of calls) assert.equal(c.filter.tenantId, "toc", `${c.coll}.${c.op} lacks tenantId`);
});

test("another tenant's perfect match is never returned; ranking, dedupe, mismatch and missing vector handled", async () => {
  const { db } = fakeDb();
  const hits = await createMongoSemanticSearchDeps({ embed, db }).search("toc", "q", 10);
  assert.deepEqual(hits.map((h) => h.sessionId), ["s1", "s2"]);
  assert.equal(hits[0]?.chunkId, "c1");
  assert.equal(hits[0]?.session?.title, "One");
  assert.ok(hits.every((h) => (h.session as { tenantId?: string } | null)?.tenantId === "toc"));
  const other = await createMongoSemanticSearchDeps({ embed, db }).search("other", "q", 10);
  assert.deepEqual(other.map((h) => h.sessionId), ["s9"]);
});

test("k limits results; invalid tenantId is refused before any read", async () => {
  const { db, calls } = fakeDb();
  const deps = createMongoSemanticSearchDeps({ embed, db });
  assert.equal((await deps.search("toc", "q", 1)).length, 1);
  calls.length = 0;
  await assert.rejects(() => deps.search("", "q", 5));
  await assert.rejects(() => deps.search({ $ne: null } as never, "q", 5));
  assert.equal(calls.length, 0);
});

test("embedder returning no vector throws instead of ranking garbage", async () => {
  const { db } = fakeDb();
  const deps = createMongoSemanticSearchDeps({ embed: async () => ({ vectors: [], dims: 0, provider: "f", model: "f" }), db });
  await assert.rejects(() => deps.search("toc", "q", 5), /no query vector/);
});

test("flag is OFF unless exactly LKB_SEMANTIC_SEARCH=1", () => {
  assert.equal(semanticSearchEnabled({}), false);
  for (const v of ["0", "true", "", "yes"]) assert.equal(semanticSearchEnabled({ LKB_SEMANTIC_SEARCH: v }), false);
  assert.equal(semanticSearchEnabled({ LKB_SEMANTIC_SEARCH: "1" }), true);
});
