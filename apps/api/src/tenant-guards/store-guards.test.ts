/**
 * apps/api/src/tenant-guards/store-guards.test.ts - tenant-filter-guards-outside-db (ISS-AUTHTENANT-002).
 *
 * The scoped accessor in packages/db refuses an invalid tenant; these sites build their tenant filter or stamp
 * their tenant by hand WITHOUT it (api_keys, tree_index, jobs, sources/sessions/turns raw writes, the WhatsApp
 * replaceOne/bulkWrite, the upload-queue reader). Each is driven here through its PRODUCTION function over the
 * recording, filter-evaluating fake from ../ask/tenant-test-kit.ts (it replaces only the mongodb client
 * prototype, so the real `@lkb/db` getDb() hands the code under test the fake). For every guarded site: a hostile
 * tenant table asserts the clean error AND that NO query/write reached the database (and no data changed), and a
 * two-tenant positive control with sentinel rows asserts each tenant sees/changes only its own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { BlindDb, bindDb, type Row } from "../ask/tenant-test-kit.js";
import { createMongoApiKeyStore, createMongoGraphReadDeps, createMongoJobWriter, createMongoKeysDeps, createMongoTreeStore } from "../store.js";
import { createMongoIngestDeps } from "../ingest-store.js";
import { createMongoWhatsAppDeps } from "../whatsapp/store.js";
import { indexSession } from "../indexing/session.js";
import { fakeDb, completeWith } from "../indexing/testutils.js";
import { createQueueActivityHealthReader, type QueueConfiguration } from "../activity-health/queue-reader.js";
import { sha256Hex } from "../hash.js";

const A = "tA", B = "tB", GUARD = /tenantId is required/;
const HOSTILE: ReadonlyArray<readonly [string, unknown]> = [
  ["empty string", ""], ["whitespace", "   "], ["undefined", undefined], ["null", null], ["number", 5],
  ["{$ne:null}", { $ne: null }], ["{$gt:''}", { $gt: "" }], ["{$in:[A,B]}", { $in: [A, B] }], ["{$regex:'.*'}", { $regex: ".*" }],
  ["array [A]", [A]], ["leading space", " tA"], ["trailing space", "tA "], ["control char", "t\u0000A"],
];
const SENT_A = "SENT-A-ALPHA-7f3", SENT_B = "SENT-B-BRAVO-9c1";
const snapshot = (db: BlindDb, colls: string[]) => JSON.stringify(colls.map((c) => db.all(c)));
const keyRow = (t: string, id: string, label: string, hash = id): Row => ({ _id: id, tenantId: t, keyHash: sha256Hex(hash), label, scopes: ["ask"], createdAt: "2026-10-11", revokedAt: null });
const sess = (t: string, title: string) => ({ node_id: `${t}/session:s1`, title, level: "session", summary: "", children: [], evidence: { sessionRef: "s1" } });
const corpus = (): Record<string, Row[]> => ({
  api_keys: [keyRow(A, "ka", SENT_A, "raw-a"), keyRow(B, "kb", SENT_B, "raw-b")],
  tree_index: [
    { _id: "ra", tenantId: A, node_id: `tenant:${A}`, title: SENT_A, level: "tenant", summary: "", children: [sess(A, SENT_A)] },
    { _id: "rb", tenantId: B, node_id: `tenant:${B}`, title: SENT_B, level: "tenant", summary: "", children: [sess(B, SENT_B)] },
  ],
  jobs: [], sources: [], sessions: [], turns: [], graph_edges: [],
});
const fresh = () => { const db = new BlindDb(corpus()); bindDb(db); return db; };
const has = (v: unknown, s: string) => JSON.stringify(v).includes(s);

// ---------------------------------------------------------------- api_keys list / create / revoke (store.ts)
for (const [name, bad] of HOSTILE) {
  test(`api_keys list/create/revoke: tenant ${name} throws the guard error, no query issued, no row changed`, async () => {
    const db = fresh(), deps = createMongoKeysDeps(), before = snapshot(db, ["api_keys"]);
    await assert.rejects(() => deps.listKeys(bad as string), GUARD);
    await assert.rejects(() => deps.createKey(bad as string, "x", ["ask"]), GUARD);
    await assert.rejects(() => deps.revokeKey(bad as string, "ka"), GUARD);
    assert.deepEqual(db.queries, [], "nothing reached the database");
    assert.equal(snapshot(db, ["api_keys"]), before, "no api_keys row changed");
  });
}
test("api_keys positive control: each tenant lists, creates and revokes only its own keys", async () => {
  const db = fresh(), deps = createMongoKeysDeps();
  assert.deepEqual((await deps.listKeys(A)).map((k) => k.label), [SENT_A]);
  assert.deepEqual((await deps.listKeys(B)).map((k) => k.label), [SENT_B]);
  const made = await deps.createKey(A, "new-a", ["ask"]);
  assert.deepEqual((await deps.listKeys(A)).map((k) => k.label).sort(), [SENT_A, "new-a"].sort());
  assert.ok(!has(await deps.listKeys(B), "new-a"), "B never sees A's new key");
  assert.equal(db.all("api_keys").find((r) => r._id === made.id)?.tenantId, A, "stored under exactly tA");
  assert.equal(await deps.revokeKey(A, "kb"), false, "A cannot revoke B's key");
  assert.equal(db.all("api_keys").find((r) => r._id === "kb")?.revokedAt, null);
  assert.equal(await deps.revokeKey(A, "ka"), true);
  assert.ok(db.queries.filter((q) => q.op === "find" || q.op === "updateOne").every((q) => typeof q.filter.tenantId === "string"), "every filter carries a plain string tenant");
});

// ---------------------------------------------------------------- api_keys lookup by key hash: runs BEFORE a tenant is known (deliberately unguarded)
test("api_keys verify (pre-tenant lookup): filter is exactly {keyHash: <64 hex>}; it resolves the tenant, never takes one", async () => {
  const db = fresh(), store = createMongoApiKeyStore();
  assert.equal((await store.verify("raw-a"))?.tenantId, A);
  assert.equal((await store.verify("raw-b"))?.tenantId, B);
  assert.equal(await store.verify("no-such-key"), null);
  for (const q of db.queries) { assert.deepEqual(Object.keys(q.filter), ["keyHash"]); assert.match(String(q.filter.keyHash), /^[0-9a-f]{64}$/); }
  for (const bad of [{ $ne: null }, { $gt: "" }, ["raw-a"]]) {
    const n = db.queries.length, got = await store.verify(bad as never).catch(() => null);
    assert.equal(got, null, "an operator-shaped key never resolves a record");
    for (const q of db.queries.slice(n)) assert.match(String(q.filter.keyHash), /^[0-9a-f]{64}$/, "keyHash is always a hex string, never an operator");
  }
});

// ---------------------------------------------------------------- tree_index via the production TreeStore
for (const [name, bad] of HOSTILE) {
  test(`tree store load: tenant ${name} returns null and issues NO query`, async () => {
    const db = fresh();
    assert.equal(await createMongoTreeStore().load(bad as string), null);
    assert.deepEqual(db.queries, []);
  });
}
test("tree store positive control: tA gets only its own root, tB only its own", async () => {
  const db = fresh(), store = createMongoTreeStore();
  const a = await store.load(A), b = await store.load(B);
  assert.ok(has(a, SENT_A) && !has(a, SENT_B)); assert.ok(has(b, SENT_B) && !has(b, SENT_A));
  assert.deepEqual(db.queries.map((q) => q.filter), [{ node_id: "tenant:tA", level: "tenant", tenantId: A }, { node_id: "tenant:tB", level: "tenant", tenantId: B }]);
});

// ---------------------------------------------------------------- graph loader: hand-built tree_index query + accessors
for (const [name, bad] of HOSTILE) {
  test(`graph load: tenant ${name} throws the guard error BEFORE the tree_index query`, async () => {
    const db = fresh();
    await assert.rejects(() => createMongoGraphReadDeps().loadGraph(bad as string), GUARD);
    assert.deepEqual(db.queries, [], "the hand-built tree_index query was not issued either");
  });
}
test("graph load positive control: tA's graph carries only tA's data, every query carries tA", async () => {
  const db = fresh();
  const g = await createMongoGraphReadDeps().loadGraph(A);
  assert.ok(g && has(g, SENT_A) && !has(g, SENT_B));
  assert.ok(db.queries.length >= 3 && db.queries.every((q) => q.filter.tenantId === A), JSON.stringify(db.queries.map((q) => q.filter)));
});

// ---------------------------------------------------------------- jobs ledger writer (raw insertOne of the entry)
for (const [name, bad] of HOSTILE) {
  test(`job writer: entry tenant ${name} throws the guard error, nothing written`, async () => {
    const db = fresh();
    await assert.rejects(() => createMongoJobWriter()({ tenantId: bad as string, kind: "ask", status: "ok", createdAt: "2026-10-11" } as never), GUARD);
    assert.deepEqual(db.queries, []); assert.deepEqual(db.all("jobs"), []);
  });
}
test("job writer positive control: each tenant's job row carries exactly its own id", async () => {
  const db = fresh(), write = createMongoJobWriter();
  await write({ tenantId: A, kind: "ask", status: "ok", createdAt: "2026-10-11" } as never); await write({ tenantId: B, kind: "ask", status: "ok", createdAt: "2026-10-11" } as never);
  assert.deepEqual(db.all("jobs").map((r) => r.tenantId), [A, B]);
});

// ---------------------------------------------------------------- URL ingest (raw insertOne of source/session/turns)
async function withFetchStub<T>(fn: (calls: string[]) => Promise<T>): Promise<T> {
  const real = globalThis.fetch, calls: string[] = [];
  globalThis.fetch = (async (u: unknown) => { calls.push(String(u)); return { ok: true, status: 200, text: async () => "Hello world.\n\nA second paragraph about visas." }; }) as never;
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}
for (const [name, bad] of HOSTILE) {
  test(`ingestUrl: tenant ${name} throws the guard error before any fetch or write`, async () => {
    const db = fresh();
    await withFetchStub(async (calls) => {
      await assert.rejects(() => createMongoIngestDeps().ingestUrl(bad as string, "https://example.com/p"), GUARD);
      assert.deepEqual(calls, [], "no outbound fetch");
    });
    assert.deepEqual(db.queries, []); assert.deepEqual([db.all("sources"), db.all("sessions"), db.all("turns")], [[], [], []]);
  });
}
test("ingestUrl positive control: two tenants ingest the same URL; every stored row carries exactly its own tenant", async () => {
  const db = fresh();
  await withFetchStub(async () => { await createMongoIngestDeps().ingestUrl(A, "https://example.com/p"); await createMongoIngestDeps().ingestUrl(B, "https://example.com/p"); });
  for (const c of ["sources", "sessions", "turns"]) { const t = new Set(db.all(c).map((r) => r.tenantId)); assert.deepEqual([...t].sort(), [A, B], `${c} rows carry exactly tA and tB`); }
  assert.ok(db.queries.every((q) => q.op === "insertOne" || q.op === "insertMany"));
});

// ---------------------------------------------------------------- WhatsApp ingest (raw replaceOne / bulkWrite filters)
const OWNER = "111111111111111111111111";
function waDeps(db: BlindDb, effects: { owner: number; fetch: number }) {
  return createMongoWhatsAppDeps(undefined, {
    resolveOwner: async () => { effects.owner++; return OWNER; }, // resolves ANY tenant: only the tenant guard can stop a hostile one
    appDb: () => db.asDb() as unknown as Db,
    listGroups: async (o: string) => [{ groupJid: "g1", ownerUserId: o, subject: "G", trackedPersonCount: 1 }] as never,
    fetchMessages: async () => { effects.fetch++; return [{ messageId: "m1", personId: "p1", displayName: "P", text: "hello", ts: "2026-10-09T01:02:03.000Z" }] as never; },
  });
}
for (const [name, bad] of HOSTILE) {
  test(`whatsapp ingestGroup: tenant ${name} throws the guard error before owner resolution, fetch or any write`, async () => {
    const db = fresh(), fx = { owner: 0, fetch: 0 };
    await assert.rejects(() => waDeps(db, fx).ingestGroup(bad as string, "g1"), GUARD);
    assert.deepEqual(fx, { owner: 0, fetch: 0 }); assert.deepEqual(db.queries, []);
  });
}
test("whatsapp ingestGroup positive control: every write filter and stored row carries exactly the calling tenant", async () => {
  const db = fresh(), fx = { owner: 0, fetch: 0 };
  await waDeps(db, fx).ingestGroup(A, "g1"); await waDeps(db, fx).ingestGroup(B, "g1");
  for (const q of db.queries) assert.ok(q.filter.tenantId === A || q.filter.tenantId === B, JSON.stringify(q.filter));
  assert.ok(db.queries.some((q) => q.op === "replaceOne" && q.filter.tenantId === A) && db.queries.some((q) => q.op === "bulkWrite" && q.filter.tenantId === B));
  for (const c of ["sources", "sessions", "turns"]) assert.deepEqual(db.all(c).map((r) => r.tenantId).sort(), [A, B], c);
});

// ---------------------------------------------------------------- indexSession (tree_index findOne + replaceOne with hand-built filters)
// NOT given its own guard: the first statement after the db handle is `turnsColl(tenantId).find`, whose accessor already throws, so the hand-built
// tree_index read/upsert below it are unreachable for an invalid tenant. These tests PIN that ordering: any raw query placed before the accessor fails them.
for (const [name, bad] of HOSTILE) {
  test(`indexSession: tenant ${name} throws the guard error before ANY read, delete or upsert`, async () => {
    const { db, calls } = fakeDb();
    await assert.rejects(() => indexSession(bad as string, "s1", { complete: completeWith() as never, db }), GUARD);
    assert.deepEqual(calls, []);
  });
}
test("indexSession positive control: tree_index is read and upserted with exactly the tenant's root filter", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith() as never, db });
  const root = calls.filter((c) => c.coll === "tree_index");
  assert.deepEqual(root.map((c) => c.op), ["findOne", "replaceOne"]);
  for (const c of root) assert.deepEqual(c.filter, { node_id: "tenant:t", level: "tenant", tenantId: "t" });
  assert.equal(root[1]!.docs![0]!.tenantId, "t");
});

// ---------------------------------------------------------------- upload-queue activity reader (env tenant, hand-built filter)
function queue(rows: unknown[] = []) {
  const finds: Record<string, unknown>[] = [];
  return { finds, collection: { find: (f: Record<string, unknown>) => { finds.push(structuredClone(f)); return { toArray: async () => rows }; } } };
}
const cfg = (tenantId: unknown): QueueConfiguration => ({ tenantId: tenantId as string, actor: "a", database: "upload_queue_abcdefgh", mongodbUrl: "mongodb://x" });
for (const [name, bad] of HOSTILE) {
  test(`activity-health reader: configured/requested tenant ${name} never reaches collection.find`, async () => {
    const q = queue();
    await assert.rejects(() => createQueueActivityHealthReader(cfg(bad), q.collection).readActivityHealth(bad as string, 5));
    assert.deepEqual(q.finds, []);
  });
}
test("activity-health reader: a configured tenant with a control character is refused by the guard (not by the equality check)", async () => {
  const q = queue();
  await assert.rejects(() => createQueueActivityHealthReader(cfg("up\tload"), q.collection).readActivityHealth("up\tload", 5), GUARD);
  assert.deepEqual(q.finds, []);
});
test("activity-health reader positive control: a valid tenant queries once with exactly its own id; a different tenant is refused", async () => {
  const q = queue();
  const reader = createQueueActivityHealthReader(cfg("tUp"), q.collection);
  await reader.readActivityHealth("tUp", 5);
  assert.deepEqual(q.finds.map((f) => f), [{ tenantId: "tUp", kind: "transcribe.rpc" }]);
  await assert.rejects(() => reader.readActivityHealth("tOther", 5), /Upload queue unavailable for tenant/);
  assert.equal(q.finds.length, 1);
});
