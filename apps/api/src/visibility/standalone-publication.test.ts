/** w27-standalone: Ask-critical WRITES on a standalone mongod. No transaction exists, so safety comes from the generation
 * head (one conditional single-document flip) plus fail-closed readers. In-memory fakes only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { TreeIndexRootDocument } from "@lkb/core";
import { runNativePublicationTransaction } from "@lkb/db";
import { connectorFixture } from "../connector-workflow/fixtures.js";
import { publishIndexWithCommit } from "../indexing/post-commit.js";
import { acquireIndexAttempt, enterIndexWrites, failIndexAttempt, persistIndexTree, verifyIndexGeneration } from "../indexing/generation.js";
import type { IndexSessionResult } from "../indexing/types.js";

type Row = Record<string, unknown>;

function fakeServer(topology: "standalone" | "replica") {
  const state = { sessions: 0, begun: 0, committed: 0, aborted: 0, writes: [] as { name: string; doc: Row; options: Row }[] };
  const rows: Record<string, Row[]> = {};
  const collection = (name: string) => ({
    insertOne: async (doc: Row, options: Row = {}) => { state.writes.push({ name, doc, options }); (rows[name] ??= []).push(doc); return { acknowledged: true }; },
    findOne: async (filter: Row) => (rows[name] ?? []).find(r => Object.entries(filter).every(([k, v]) => r[k] === v)) ?? null,
  });
  const client = { startSession: () => { state.sessions++; let active = false; return {
    startTransaction: () => { state.begun++; active = true; }, commitTransaction: async () => { state.committed++; active = false; },
    abortTransaction: async () => { state.aborted++; active = false; }, endSession: async () => { active = false; }, inTransaction: () => active,
  }; } };
  const db = { client, collection, command: async () => topology === "standalone" ? { isWritablePrimary: true } : { setName: "rs0" } };
  return { db: db as unknown as Db, state, rows };
}

const complete = { completion: { complete: true, generation: "g" } } as unknown as IndexSessionResult;

test("standalone index publication runs the indexer once, with no session, and a tenant-pinned view", async () => {
  const { db, state } = fakeServer("standalone");
  let seen: Pick<Db, "collection"> | undefined;
  const result = await publishIndexWithCommit(db, "tenant-a", "s1", undefined, async view => { seen = view; await view.collection("pages").insertOne({ _id: "p", tenantId: "tenant-a" } as never); return complete; });
  assert.equal(result, complete);
  assert.equal(state.sessions, 0);
  assert.equal("session" in state.writes[0]!.options && state.writes[0]!.options.session !== undefined, false);
  assert.throws(() => seen!.collection("pages").insertOne({ _id: "x", tenantId: "tenant-b" } as never), /Unscoped refresh operation/);
  assert.throws(() => (seen!.collection("pages") as never as { deleteMany(f: Row): unknown }).deleteMany({ tenantId: "tenant-b-not-a" }), /Unscoped|tenant/i);
});

test("standalone index publication: an incomplete result is refused, never reported as published", async () => {
  const { db } = fakeServer("standalone");
  await assert.rejects(publishIndexWithCommit(db, "tenant-a", "s1", undefined, async () => ({ completion: { complete: false } }) as never), /incomplete/);
});

test("replica set index publication is unchanged: one transaction, committed", async () => {
  const { db, state } = fakeServer("replica");
  await publishIndexWithCommit(db, "tenant-a", "s1", undefined, async () => complete);
  assert.deepEqual([state.sessions, state.begun, state.committed], [1, 1, 1]);
});

test("standalone native publication: sessionless, tenant-pinned, foreign-tenant write refused, replica set still transactional", async () => {
  const s = fakeServer("standalone");
  const out = await runNativePublicationTransaction(s.db, "tenant-a", async tx => { await tx.collection("sessions").insertOne({ _id: "a", tenantId: "tenant-a" } as never); return "ok"; });
  assert.equal(out, "ok");
  assert.equal(s.state.sessions, 0);
  assert.equal(s.rows.sessions!.length, 1);
  await assert.rejects(runNativePublicationTransaction(s.db, "tenant-a", async tx => { await tx.collection("sessions").insertOne({ _id: "b", tenantId: "tenant-b" } as never); }), /tenant_mismatch/);
  assert.equal(s.rows.sessions!.length, 1, "tenant B row never written");
  const r = fakeServer("replica");
  await runNativePublicationTransaction(r.db, "tenant-a", async tx => { await tx.collection("sessions").insertOne({ _id: "a", tenantId: "tenant-a" } as never); });
  assert.deepEqual([r.state.sessions, r.state.begun, r.state.committed], [1, 1, 1]);
});

const URL = "https://zoom.us/rec/share/AbCdEfGh12345678";
async function indexed() {
  const f = connectorFixture(); f.useHostedRecording(true);
  const res = await f.call("POST", "/connector-workflow/intake", { url: URL });
  assert.equal(res.status, 201);
  const sessionId = String(res.body.sessionId); const generation = String(f.rows("sessions")[0]!.indexAttempt.generation);
  return { f, sessionId, generation };
}

test("crash AFTER the flip: the new generation is live without any later step", async () => {
  const { f, sessionId, generation } = await indexed();
  assert.equal(f.rows("sessions")[0]!.indexAttempt.state, "complete");
  assert.ok(await verifyIndexGeneration(f.db, "tenant-a", sessionId, generation));
});

test("crash BEFORE the flip: a half-rewritten session is hidden (fail closed), never torn, and needs explicit recovery", async () => {
  const { f, sessionId, generation } = await indexed();
  const turns = f.rows("turns") as never[];
  const attempt = await acquireIndexAttempt(f.db, "tenant-a", sessionId, turns, true);
  await enterIndexWrites(f.db, "tenant-a", attempt);
  f.rows("chunks").splice(0, f.rows("chunks").length); // partial in-place rewrite, then the process dies
  await failIndexAttempt(f.db, "tenant-a", attempt);
  assert.equal(await verifyIndexGeneration(f.db, "tenant-a", sessionId, generation), null, "old generation not served over torn artifacts");
  assert.equal(await verifyIndexGeneration(f.db, "tenant-a", sessionId, attempt.generation), null, "unflipped new generation not served");
  await assert.rejects(acquireIndexAttempt(f.db, "tenant-a", sessionId, turns, true), /index_attempt_requires_recovery/);
});

test("a stale generation id never verifies, and another tenant never verifies", async () => {
  const { f, sessionId, generation } = await indexed();
  assert.ok(await verifyIndexGeneration(f.db, "tenant-a", sessionId, generation));
  assert.equal(await verifyIndexGeneration(f.db, "tenant-a", sessionId, "00000000-0000-4000-8000-000000000000"), null);
  assert.equal(await verifyIndexGeneration(f.db, "tenant-b", sessionId, generation), null);
});

test("concurrent publish race: two writers on the same tree head, exactly one conditional flip wins", async () => {
  const { f, sessionId } = await indexed();
  const turns = f.rows("turns") as never[];
  const attempt = await acquireIndexAttempt(f.db, "tenant-a", sessionId, turns, true);
  await enterIndexWrites(f.db, "tenant-a", attempt);
  const base = structuredClone(f.rows("tree_index")[0]) as TreeIndexRootDocument & { _id: string };
  const settled = await Promise.allSettled([persistIndexTree(f.db, "tenant-a", attempt, base, base), persistIndexTree(f.db, "tenant-a", attempt, base, base)]);
  assert.equal(settled.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.rows("tree_index").length, 1);
  assert.equal(f.rows("tree_index")[0]!.indexRevision, (base as { indexRevision?: number }).indexRevision! + 1);
});

test("F1 standalone native view: tenant B cannot read or query tenant A's rows through the view", async () => {
  const s = fakeServer("standalone");
  s.rows.sessions = [{ _id: "a", tenantId: "tenant-a", secret: "A" }, { _id: "b", tenantId: "tenant-b", secret: "B" }];
  await runNativePublicationTransaction(s.db, "tenant-b", async tx => {
    const sessions = tx.collection("sessions") as unknown as { findOne(f: Row): Promise<Row | null>; find(f: Row): unknown };
    assert.equal((await sessions.findOne({ _id: "b", tenantId: "tenant-b" }))?.secret, "B");
    await assert.rejects(sessions.findOne({ _id: "a", tenantId: "tenant-a" }), /tenant_mismatch/);
    await assert.rejects(sessions.findOne({ _id: "a" }), /tenant_mismatch/);
    assert.throws(() => sessions.find({ tenantId: "tenant-a" }), /tenant_mismatch/);
  });
});

test("F2 re-index replaces an existing session page even when a unique (tenantId, sessionId) index rejects a second page", async () => {
  const { replacePageInsertFirst } = await import("../indexing/grounded-write.js");
  const rows: Row[] = [{ _id: "old", tenantId: "t", sessionId: "s", summary: "v1" }];
  const log: string[] = [];
  const coll = {
    find: () => ({ toArray: async () => structuredClone(rows) }),
    insertOne: async (d: Row) => { log.push("insert"); if (rows.some(r => r.tenantId === d.tenantId && r.sessionId === d.sessionId)) throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 }); rows.push(d); return { acknowledged: true }; },
    insertMany: async () => ({ acknowledged: true }),
    deleteMany: async (f: { _id?: { $in: string[] } }) => { log.push("delete"); for (const id of f._id?.$in ?? []) rows.splice(rows.findIndex(r => r._id === id), 1); return { acknowledged: true }; },
  };
  await replacePageInsertFirst(coll as never, "s", { _id: "new", tenantId: "t", sessionId: "s", summary: "v2" } as never, { assertOwned: async () => {} });
  assert.deepEqual(rows.map(r => r.summary), ["v2"], "exactly one page, the new one");
  assert.deepEqual(log, ["insert", "delete", "insert"]);
  const other = { ...coll, insertOne: async () => { throw new Error("write failed"); } };
  await assert.rejects(replacePageInsertFirst(other as never, "s", { _id: "x", tenantId: "t", sessionId: "s" } as never), /write failed/, "a non-duplicate failure never deletes the old page");
  assert.deepEqual(rows.map(r => r.summary), ["v2"]);
});
