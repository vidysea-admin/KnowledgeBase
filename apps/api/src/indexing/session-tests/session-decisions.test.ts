/**
 * U2.5: decisions extraction inside indexSession. Flag OFF (default) must be byte-identical:
 * same db call sequence, no `decisions` collection touched, no `decisions` key in the result.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { indexSession } from "../session.js";
import { fakeDb, completeWith } from "../testutils.js";

const seq = (calls: { coll: string; op: string }[]) => calls.map((c) => `${c.coll}.${c.op}`);
const base = completeWith();
const withDecisions = (payload: unknown, fails = false) => async (job: { kind: string }) => {
  if (job.kind === "decisions") {
    if (fails) throw new Error("provider down");
    return { text: JSON.stringify(payload), json: undefined, usage: {}, provider: "fake", model: "fake" };
  }
  return base(job);
};

test("flag OFF: no decisions job, no decisions collection op, no result key; same ops as before", async () => {
  delete process.env.LKB_EXTRACT_DECISIONS;
  let decisionJobs = 0;
  const complete = async (job: { kind: string }) => { if (job.kind === "decisions") decisionJobs++; return withDecisions([{ text: "D.", turnIds: ["t1"] }])(job); };
  const a = fakeDb(), b = fakeDb();
  const ra = await indexSession("t", "s1", { complete: complete as never, db: a.db });
  const rb = await indexSession("t", "s1", { complete: complete as never, db: b.db, extractDecisions: false });
  assert.equal(decisionJobs, 0);
  assert.ok(!("decisions" in ra) && !("decisions" in rb));
  assert.equal(a.calls.filter((c) => c.coll === "decisions").length, 0);
  assert.deepEqual(seq(a.calls), seq(b.calls));
});

test("flag ON: replaces the session's decisions, tenant-scoped, with timestamp span and evidence", async () => {
  const { db, calls } = fakeDb();
  const r = await indexSession("t", "s1", { complete: withDecisions([{ text: "Ship.", turnIds: ["t1"], owner: "spk:0" }]) as never, db, extractDecisions: true });
  assert.deepEqual(r.decisions, { count: 1, degraded: null });
  const ops = calls.filter((c) => c.coll === "decisions");
  assert.deepEqual(ops.map((c) => c.op), ["find", "updateOne"]);
  assert.equal(ops[0]!.filter!.tenantId, "t");
  assert.equal(ops[0]!.filter!["evidence.sessionId"], "s1");
  const doc = ops[1]!.update!.$setOnInsert as Record<string, unknown>;
  assert.equal(ops[1]!.filter!.status, "proposed");
  assert.equal(ops[1]!.filter!._id, doc._id);
  assert.equal(ops[1]!.filter!["evidence.sessionId"], "s1");
  assert.deepEqual(ops[1]!.options, { upsert: true });
  assert.equal(doc.tenantId, "t");
  assert.equal(doc.status, "proposed");
  assert.equal(doc.owner, "spk:0");
  assert.equal(doc.tStart, 0);
  assert.equal(doc.tEnd, 1);
  assert.deepEqual(doc.evidence, [{ turnId: "t1", sessionId: "s1" }]);
});

test("flag ON via env var", async () => {
  process.env.LKB_EXTRACT_DECISIONS = "1";
  try {
    const { db, calls } = fakeDb();
    const r = await indexSession("t", "s1", { complete: withDecisions([]) as never, db });
    assert.deepEqual(r.decisions, { count: 0, degraded: null });
    assert.deepEqual(calls.filter((c) => c.coll === "decisions").map((c) => c.op), ["find"]);
  } finally { delete process.env.LKB_EXTRACT_DECISIONS; }
});

test("flag ON, degraded extraction: existing decisions untouched, indexing still completes", async () => {
  const { db, calls } = fakeDb();
  const r = await indexSession("t", "s1", { complete: withDecisions(null, true) as never, db, extractDecisions: true });
  assert.match(r.decisions!.degraded!, /decisions provider call failed/);
  assert.equal(calls.filter((c) => c.coll === "decisions").length, 0);
  assert.ok(calls.some((c) => c.coll === "sessions" && c.op === "updateOne"));
});

test("flag ON, decisions persistence refusal is reported degraded while indexing completes", async () => {
  const fixture = fakeDb();
  const db = { collection(name: string) {
    const coll = fixture.db.collection(name);
    return name === "decisions" ? { ...coll, updateOne: async () => { throw new Error("synthetic decisions write refusal"); } } : coll;
  } } as typeof fixture.db;
  const result = await indexSession("t", "s1", { complete: withDecisions([{ text: "Ship.", turnIds: ["t1"] }]) as never, db, extractDecisions: true });
  assert.equal(result.decisions!.count, 0);
  assert.match(result.decisions!.degraded!, /decisions persist failed: synthetic decisions write refusal/);
  assert.equal(fixture.calls.some((c) => c.coll === "decisions" && c.op === "deleteMany"), false);
  assert.ok(fixture.calls.some((c) => c.coll === "sessions" && c.op === "updateOne"));
});
