/**
 * apps/api/src/tenant-guards/scoped-routing.test.ts - ISS-AUTHTENANT-002 (fix: route hand-built tenant filters through scopedCollection).
 *
 * Converted sites: api_keys list/create/revoke, tree_index load (store.ts), graph tree root (store.ts), jobs writer (store.ts),
 * sources/sessions/turns inserts (ingest-store.ts), tree_index read (indexing/session.ts). For each: tenant B, with rows that SHARE ids with tenant A's,
 * cannot read or change A's rows, and every recorded filter carries the caller's tenant. Runs over the filter-evaluating fake kit; no MongoDB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BlindDb, bindDb, visibleSession, type Row } from "../ask/tenant-test-kit.js";
import { createMongoGraphReadDeps, createMongoJobWriter, createMongoKeysDeps, createMongoTreeStore } from "../store.js";
import { createMongoIngestDeps } from "../ingest-store.js";
import { indexSession } from "../indexing/session.js";
import { completeWith } from "../indexing/testutils.js";

const A = "tA", B = "tB", GUARD = /tenantId is required/;
const HOSTILE: ReadonlyArray<readonly [string, unknown]> = [
  ["empty string", ""], ["whitespace", "   "], ["undefined", undefined], ["null", null], ["number", 5],
  ["{$ne:null}", { $ne: null }], ["{$gt:''}", { $gt: "" }], ["{$in:[A,B]}", { $in: [A, B] }], ["{$regex:'.*'}", { $regex: ".*" }],
  ["array [A]", [A]], ["leading space", " tA"], ["trailing space", "tA "], ["control char", "t\u0000A"],
];
const key = (t: string, id: string, label: string): Row => ({ _id: id, tenantId: t, keyHash: `h-${id}`, label, scopes: ["ask"], createdAt: "2026-10-12", revokedAt: null });
const root = (t: string, title: string): Row => ({ _id: `root-${t}`, tenantId: t, node_id: `tenant:${t}`, title, level: "tenant", summary: "", children: [] });
const fresh = (over: Record<string, Row[]> = {}) => {
  const db = new BlindDb({ api_keys: [key(A, "shared-id", "A-KEY"), key(B, "b-only", "B-KEY")], tree_index: [root(A, "A-TREE")], jobs: [], sources: [], sessions: [], turns: [], graph_edges: [], ...over });
  bindDb(db); return db;
};
const snap = (db: BlindDb, c: string) => JSON.stringify(db.all(c));
const carries = (db: BlindDb, t: string) => db.queries.length > 0 && db.queries.every((q) => q.filter.tenantId === t);

test("api_keys: tenant B cannot list, revoke or overwrite tenant A's key, even by A's key id", async () => {
  const db = fresh(), deps = createMongoKeysDeps(), before = snap(db, "api_keys");
  assert.deepEqual((await deps.listKeys(B)).map((k) => k.label), ["B-KEY"]);
  assert.equal(await deps.revokeKey(B, "shared-id"), false, "B revoking A's id matches nothing");
  assert.equal(db.all("api_keys").find((r) => r._id === "shared-id")?.revokedAt, null);
  assert.ok(carries(db, B));
  const made = await deps.createKey(B, "new-b", ["ask"]);
  assert.equal(db.all("api_keys").find((r) => r._id === made.id)?.tenantId, B);
  assert.equal(JSON.stringify(db.all("api_keys").filter((r) => r.tenantId === A)), JSON.stringify(JSON.parse(before).filter((r: Row) => r.tenantId === A)), "A's rows byte-identical");
});

test("tree load + graph: tenant B with no root of its own gets nothing, never A's root", async () => {
  const db = fresh();
  assert.equal(await createMongoTreeStore().load(B), null);
  // The trusted reader also reads B's sessions/pages to admit a root; B has none, so nothing (of A's) comes back.
  assert.ok(carries(db, B) && db.queries.every((q) => q.returned === 0), JSON.stringify(db.queries));
  const db2 = fresh();
  assert.equal(await createMongoGraphReadDeps().loadGraph(B), null);
  assert.ok(carries(db2, B), JSON.stringify(db2.queries.map((q) => q.filter)));
  fresh({ tree_index: [root(A, "A-TREE"), root(B, "B-TREE")] });
  const mine = await createMongoTreeStore().load(B);
  assert.equal(mine?.title, "B-TREE");
});

test("job writer: B's entry lands only under B and A's rows are untouched", async () => {
  const db = fresh({ jobs: [{ _id: "ja", tenantId: A, kind: "ask" }] }), before = snap(db, "jobs");
  await createMongoJobWriter()({ tenantId: B, kind: "ask", status: "ok", createdAt: "2026-10-12" } as never);
  const rows = db.all("jobs");
  assert.equal(rows.length, 2); assert.equal(JSON.stringify(rows[0]), JSON.parse(before).length === 1 ? JSON.stringify(JSON.parse(before)[0]) : "");
  assert.equal(rows[1]!.tenantId, B);
});

test("ingestUrl: B's ingest adds only B-stamped rows and leaves A's sources/sessions/turns byte-identical", async () => {
  const db = fresh({ sources: [{ _id: "sa", tenantId: A }], sessions: [{ _id: "xa", tenantId: A }], turns: [{ _id: "ta", tenantId: A }] });
  const before = ["sources", "sessions", "turns"].map((c) => snap(db, c));
  const real = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => "Hello world.\n\nSecond paragraph." })) as never;
  try { await createMongoIngestDeps().ingestUrl(B, "https://example.com/p"); } finally { globalThis.fetch = real; }
  for (const [i, c] of ["sources", "sessions", "turns"].entries()) {
    const rows = db.all(c);
    assert.equal(JSON.stringify(rows[0]), JSON.parse(before[i]!).length ? JSON.stringify(JSON.parse(before[i]!)[0]) : "", `${c}: A row unchanged`);
    assert.ok(rows.length > 1 && rows.slice(1).every((r) => r.tenantId === B), `${c}: every new row is B's`);
  }
});

test("indexSession tree_index read: B never loads A's root", async () => {
  // B owns an indexable session s1 (the gate refuses before the root read otherwise); A's root sits in the same collection.
  const own = visibleSession(B, "s1", "A real sentence.");
  const db = fresh({ sessions: own.sessions!, sources: own.sources!, turns: own.turns! });
  await indexSession(B, "s1", { complete: completeWith() as never, db: db.asDb() }).catch(() => undefined);
  const reads = db.queries.filter((q) => q.coll === "tree_index" && q.op === "findOne");
  assert.ok(reads.length >= 1, "root was read");
  for (const q of reads) { assert.equal(q.filter.tenantId, B); assert.equal(q.returned, 0, "A's root not returned to B"); }
});

for (const [name, bad] of HOSTILE) {
  test(`hostile tenant ${name}: every converted site refuses with no database contact`, async () => {
    const db = fresh(), keys = createMongoKeysDeps();
    await assert.rejects(() => keys.listKeys(bad as string), GUARD);
    await assert.rejects(() => keys.createKey(bad as string, "x", ["ask"]), GUARD);
    await assert.rejects(() => keys.revokeKey(bad as string, "shared-id"), GUARD);
    assert.equal(await createMongoTreeStore().load(bad as string), null);
    await assert.rejects(() => createMongoGraphReadDeps().loadGraph(bad as string), GUARD);
    await assert.rejects(() => createMongoJobWriter()({ tenantId: bad, kind: "ask", status: "ok", createdAt: "x" } as never), GUARD);
    await assert.rejects(() => createMongoIngestDeps().ingestUrl(bad as string, "https://example.com/p"), GUARD);
    await assert.rejects(() => indexSession(bad as string, "s1", { complete: completeWith() as never, db: db.asDb() }), GUARD);
    assert.deepEqual(db.queries, []);
  });
}
