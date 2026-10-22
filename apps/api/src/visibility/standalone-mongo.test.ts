/** w27-standalone: reads work on a standalone mongod (no transactions), replica-set behaviour is unchanged, and the
 * tenant filter reaches Mongo byte-identical on the standalone path. In-memory fake only; no network, no browser. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { withKnowledgeReadSnapshot } from "./read-snapshot.js";
import { isStandaloneHello, isStandaloneMongo, standaloneOverride } from "./topology.js";
import { createMongoGraphSnapshotReader } from "../ask/graph-context.js";
import { trustedTreeReads } from "../composition/integrations/trusted-readers.js";
import { answerWorkflowFailure } from "../answer-policy/answer-router.js";
import { AnswerWorkflowError } from "../answer-policy/answer-workflow.js";
import { describeCause } from "./safe-cause.js";

const NOT_RS = "Transaction numbers are only allowed on a replica set member or mongos";
type Row = Record<string, unknown>;
type Loose = { collection(n: string): { findOne(f: Row): Promise<Row | null>; find(f: Row): { toArray(): Promise<Row[]> } } };
const loose = (s: unknown) => s as Loose;
type Call = { name: string; op: string; filter: Row; options: Row };

function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([k, want]) => want && typeof want === "object" && "$in" in (want as Row)
    ? ((want as { $in: unknown[] }).$in).includes(row[k]) : row[k] === want);
}

function fakeMongo(topology: "standalone" | "replica" | "mongos", data: Record<string, Row[]> = {}) {
  const calls: Call[] = []; const state = { sessionsStarted: 0, transactions: [] as Row[], hello: 0 };
  const collection = (name: string) => ({
    findOne: async (filter: Row, options: Row = {}) => { calls.push({ name, op: "findOne", filter, options }); return structuredClone((data[name] ?? []).find(r => matches(r, filter)) ?? null); },
    find: (filter: Row, options: Row = {}) => { calls.push({ name, op: "find", filter, options });
      let rows = (data[name] ?? []).filter(r => matches(r, filter));
      const cursor = { limit: (n: number) => { rows = rows.slice(0, n); return cursor; }, sort: () => cursor, toArray: async () => structuredClone(rows) };
      return cursor; },
  });
  const client = { startSession: () => { state.sessionsStarted++; let active = false; return {
    withTransaction: async (run: () => Promise<unknown>, options: Row) => {
      if (topology === "standalone") throw new Error(NOT_RS);
      state.transactions.push(options); active = true; try { return await run(); } finally { active = false; } },
    inTransaction: () => active, abortTransaction: async () => { active = false; }, endSession: async () => { active = false; },
  }; } };
  const db = { client, collection,
    command: async (c: Row) => { assert.deepEqual(c, { hello: 1 }); state.hello++;
      return topology === "standalone" ? { isWritablePrimary: true } : topology === "mongos" ? { msg: "isdbgrid" } : { setName: "rs0", isWritablePrimary: true }; } };
  return { db: db as unknown as Db, calls, state };
}

test("topology detection: standalone only without setName and not mongos", () => {
  assert.equal(isStandaloneHello({ isWritablePrimary: true }), true);
  assert.equal(isStandaloneHello({ setName: "rs0" }), false);
  assert.equal(isStandaloneHello({ msg: "isdbgrid" }), false);
  assert.equal(standaloneOverride({ LKB_MONGO_STANDALONE: "1" } as never), true);
  assert.equal(standaloneOverride({ LKB_MONGO_STANDALONE: "0" } as never), false);
  assert.equal(standaloneOverride({} as never), null);
});

test("topology is probed once per client and cached", async () => {
  const s = fakeMongo("standalone"), r = fakeMongo("replica"), m = fakeMongo("mongos");
  assert.deepEqual([await isStandaloneMongo(s.db), await isStandaloneMongo(s.db), await isStandaloneMongo(r.db), await isStandaloneMongo(m.db)], [true, true, false, false]);
  assert.equal(s.state.hello, 1);
  assert.equal(await isStandaloneMongo({ collection: () => ({}) } as never), false, "a handle without command keeps transactional behaviour");
});

test("standalone: snapshot read runs with no session or transaction, readConcern local, filters untouched", async () => {
  const { db, calls, state } = fakeMongo("standalone", { sessions: [{ _id: "s1", tenantId: "tenant-a" }] });
  const filter = { _id: "s1", tenantId: "tenant-a" };
  const got = await withKnowledgeReadSnapshot(db, async s => { const snap = loose(s); return {
    one: await snap.collection("sessions").findOne(filter), many: await snap.collection("sessions").find(filter).toArray() }; });
  assert.deepEqual(got.one, { _id: "s1", tenantId: "tenant-a" });
  assert.equal(got.many.length, 1);
  assert.equal(state.sessionsStarted, 0);
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(JSON.stringify(c.filter), JSON.stringify(filter), "filter byte-identical");
    assert.equal("session" in c.options, false);
    assert.deepEqual(c.options.readConcern, { level: "local" });
  }
});

test("standalone: tenant B cannot read tenant A through the snapshot facade", async () => {
  const { db } = fakeMongo("standalone", { sessions: [{ _id: "s1", tenantId: "tenant-a", title: "A secret" }] });
  const asB = await withKnowledgeReadSnapshot(db, async s => { const snap = loose(s); return {
    one: await snap.collection("sessions").findOne({ _id: "s1", tenantId: "tenant-b" }),
    many: await snap.collection("sessions").find({ tenantId: "tenant-b" }).toArray() }; });
  assert.equal(asB.one, null);
  assert.deepEqual(asB.many, []);
});

test("standalone: a callback returning undefined is still refused like the transactional path", async () => {
  const { db } = fakeMongo("standalone");
  await assert.rejects(withKnowledgeReadSnapshot(db, async () => undefined as never), /snapshot unavailable/);
});

test("replica set and mongos: unchanged, one snapshot transaction with the session on every read", async () => {
  for (const topology of ["replica", "mongos"] as const) {
    const { db, calls, state } = fakeMongo(topology, { sessions: [{ _id: "s1", tenantId: "tenant-a" }] });
    await withKnowledgeReadSnapshot(db, s => loose(s).collection("sessions").findOne({ _id: "s1", tenantId: "tenant-a" }) as Promise<Row>);
    assert.equal(state.sessionsStarted, 1);
    assert.deepEqual(state.transactions, [{ readConcern: { level: "snapshot" }, maxCommitTimeMS: 10000 }]);
    assert.ok(calls[0]!.options.session, "session attached");
    assert.equal("readConcern" in calls[0]!.options, false);
  }
});

test("standalone tree read succeeds (was masked as 503) and every query stays tenant-scoped", async () => {
  const { db, calls, state } = fakeMongo("standalone");
  const root = await trustedTreeReads(() => db).load("tenant-a");
  assert.equal(root, null);
  assert.equal(state.sessionsStarted, 0);
  assert.ok(calls.length > 0);
  for (const c of calls) assert.ok(JSON.stringify(c.filter).includes("tenant-a"), `${c.name}.${c.op} carries the tenant: ${JSON.stringify(c.filter)}`);
});

test("standalone graph snapshot reader: no session, topic query pinned to the caller's tenant, B sees nothing of A", async () => {
  const data = { topics: [{ _id: "tenant-a:t1", tenantId: "tenant-a", sessionRefs: ["s1"] }] };
  const a = fakeMongo("standalone", data), b = fakeMongo("standalone", data);
  const ra = await createMongoGraphSnapshotReader(a.db)("tenant-a", { topicRefs: ["tenant-a:t1"] });
  const rb = await createMongoGraphSnapshotReader(b.db)("tenant-b", { topicRefs: ["tenant-a:t1"] });
  assert.deepEqual([a.state.sessionsStarted, b.state.sessionsStarted], [0, 0]);
  const topicCallA = a.calls.find(c => c.name === "topics")!, topicCallB = b.calls.find(c => c.name === "topics")!;
  assert.equal(topicCallA.filter.tenantId, "tenant-a");
  assert.equal(topicCallB.filter.tenantId, "tenant-b");
  assert.deepEqual(topicCallB.options.readConcern, { level: "local" });
  assert.equal("session" in topicCallB.options, false);
  assert.ok(a.calls.some(c => c.name === "claims"), "tenant A proceeds to its claims");
  assert.ok(!b.calls.some(c => c.name === "claims"), "tenant B finds no topic of A and stops");
  assert.deepEqual([ra.edges, rb.edges, rb.turns, rb.visibleSources], [[], [], [], []]);
});

test("error mapping: an unknown failure is store_unavailable with the real cause only in the server log", () => {
  const out: { status?: number; body?: Row } = {};
  const res = { status(n: number) { out.status = n; return res; }, json(b: Row) { out.body = b; return res; } };
  const logged: string[] = []; const orig = console.error; console.error = (...a: unknown[]) => { logged.push(a.join(" ")); };
  try { answerWorkflowFailure(res as never, new Error(`${NOT_RS} via mongodb://admin:hunter2@13.202.206.101:27017`)); } finally { console.error = orig; }
  assert.equal(out.status, 503);
  assert.equal(out.body!.error, "store_unavailable");
  assert.doesNotMatch(JSON.stringify(out.body), /replica|hunter2|mongodb/);
  assert.match(logged.join("\n"), /Transaction numbers are only allowed/);
  assert.doesNotMatch(logged.join("\n"), /hunter2/);
  assert.match(describeCause(new Error("Bearer abc.def-123 failed")), /Bearer <redacted>/);
});

test("error mapping: typed workflow errors keep their own status and code", () => {
  const out: { status?: number; body?: Row } = {};
  const res = { status(n: number) { out.status = n; return res; }, json(b: Row) { out.body = b; return res; } };
  answerWorkflowFailure(res as never, new AnswerWorkflowError("evidence_unavailable", "x"));
  assert.deepEqual([out.status, out.body!.error], [503, "evidence_unavailable"]);
  answerWorkflowFailure(res as never, new AnswerWorkflowError("not_found", "x"));
  assert.deepEqual([out.status, out.body!.error], [404, "not_found"]);
});

test("F5 LKB_MONGO_STANDALONE=1 cannot override a replica set or mongos: ignored with one warning; confirms a real standalone", async () => {
  const saved = process.env.LKB_MONGO_STANDALONE; process.env.LKB_MONGO_STANDALONE = "1";
  const warnings: string[] = []; const orig = console.warn; console.warn = (...a: unknown[]) => { warnings.push(a.join(" ")); };
  try {
    const r = fakeMongo("replica"), m = fakeMongo("mongos"), s = fakeMongo("standalone");
    assert.deepEqual([await isStandaloneMongo(r.db), await isStandaloneMongo(r.db), await isStandaloneMongo(m.db), await isStandaloneMongo(s.db)], [false, false, false, true]);
    assert.equal(warnings.length, 2, "one warning per client, not per call");
    assert.match(warnings[0]!, /ignored/);
    process.env.LKB_MONGO_STANDALONE = "0";
    assert.equal(await isStandaloneMongo(s.db), false, "=0 still forces transactional behaviour");
  } finally { console.warn = orig; if (saved === undefined) delete process.env.LKB_MONGO_STANDALONE; else process.env.LKB_MONGO_STANDALONE = saved; }
});
