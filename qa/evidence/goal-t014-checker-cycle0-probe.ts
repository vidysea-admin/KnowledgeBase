import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { ChampionshipEvent } from "../../apps/api/src/championship/model.js";
import { createServer } from "../../apps/api/src/server.js";
import { buildTestDeps, fakeKeyStore, fakeEvalRunStore } from "../../apps/api/src/fixtures.js";
import { createMongoChampionshipStore } from "../../apps/api/src/championship/mongo-store.js";

// Independent source-only probe: real app/auth/Compete/Ask/championship orchestration;
// all completion, knowledge and persistence are offline fixtures, never human/public evidence.
test("checker: actual mounted Compete feeds immutable partial 2x2 report; atomic conflicting imports and tenant refusals", { timeout: 15000 }, async () => {
  const rows = new Map<string, ChampionshipEvent>(), evalRuns = fakeEvalRunStore();
  let writes = 0;
  const matches = (e: ChampionshipEvent | undefined, f: { tenantId: string; _id: string; revision?: number }) =>
    !!e && e.tenantId === f.tenantId && (f.revision === undefined || e.revision === f.revision);
  const collection = {
    options: async () => ({ validator: { $jsonSchema: { required: ["tenantId", "bankDigest"] } }, validationAction: "error", validationLevel: "strict" }),
    listIndexes: () => ({ toArray: async () => [{ name: "championship_eval_once", unique: true, key: { tenantId: 1, "trials.evalRunId": 1 }, partialFilterExpression: { "trials.0": { $exists: true } } }] }),
    insertOne: async (e: ChampionshipEvent) => { assert.ok(!rows.has(e._id)); rows.set(e._id, structuredClone(e)); writes++; },
    findOne: async (f: { tenantId: string; _id: string; revision?: number }) => matches(rows.get(f._id), f) ? structuredClone(rows.get(f._id)!) : null,
    replaceOne: async (f: { tenantId: string; _id: string; revision: number }, e: ChampionshipEvent) => {
      if (!matches(rows.get(f._id), f)) return { modifiedCount: 0 };
      rows.set(f._id, structuredClone(e)); writes++; return { modifiedCount: 1 };
    },
  };
  const db = { collection: (name: string) => name === "eval_runs"
    ? { findOne: async (f: { tenantId: string; _id: string }) => {
      const row = evalRuns._rows.get(f._id); return row?.tenantId === f.tenantId ? structuredClone(row) : null;
    } } : collection } as unknown as Db;
  const keys = fakeKeyStore({ a: { tenantId: "a", scopes: ["compete"] }, b: { tenantId: "b", scopes: ["compete"] }, ask: { tenantId: "a", scopes: ["ask"] } });
  const app = createServer(buildTestDeps({ keyStore: keys, evalRuns, championship: createMongoChampionshipStore(db) }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, body?: unknown, key = "a") => fetch(base + path, {
    method: body === undefined ? "GET" : "POST", signal: AbortSignal.timeout(3000),
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    const plan = { title: "Synthetic checker fixture, no event", questions: [
      { id: "q1", text: "topic one", source: { kind: "toc", reference: "checker fixture only; not an authentic bank" } },
      { id: "q2", text: "Which topic?", source: { kind: "toc", reference: "checker fixture only; not an authentic bank" } },
    ], counsellors: [
      { id: "c1", name: "Synthetic A", evidenceReference: "no real participant" },
      { id: "c2", name: "Synthetic B", evidenceReference: "no real participant" },
    ], judges: [], rubric: { version: "fixture", reference: "no real rubric" }, reviewReference: "no human review" };
    const before = writes;
    assert.equal((await request("/championship", plan, "ask")).status, 403);
    assert.equal((await request("/championship", plan, "revoked")).status, 401);
    assert.equal(writes, before);
    const created = await request("/championship", { ...plan, tenantId: "b", credibility: "independent-human" });
    assert.equal(created.status, 201); const event = await created.json() as ChampionshipEvent;
    assert.equal(event.tenantId, "a");
    const freeze = await request(`/championship/${event._id}/freeze`, { expectedRevision: 0, bankDigest: event.bankDigest });
    assert.equal(freeze.status, 200);
    const prepared: { evalRunId: string; questionId: string; counsellorId: string; ai: number; human: number; aiAnswer: unknown }[] = [];
    for (const [i, q, c, ai, human] of [[0, plan.questions[0], plan.counsellors[0], 4, 3], [1, plan.questions[1], plan.counsellors[1], 2, 5]] as const) {
      const start = await request("/compete/start", { question: q.text, counsellor: { name: c.name }, tenantId: "b" });
      assert.equal(start.status, 200); const answer = await start.json() as { evalRunId: string; aiAnswer: unknown };
      assert.equal((await request(`/compete/${answer.evalRunId}/score`, { counsellorAnswer: { text: `Synthetic answer ${i}` }, score: { ai, counsellor: human } }, "b")).status, 404);
      assert.equal((await request(`/compete/${answer.evalRunId}/score`, { counsellorAnswer: { text: `Synthetic answer ${i}` }, score: { ai, counsellor: human } })).status, 200);
      prepared.push({ ...answer, questionId: q.id, counsellorId: c.id, ai, human });
    }
    const attempts = await Promise.all(prepared.map(r => request(`/championship/${event._id}/trials`, {
      expectedRevision: 1, questionId: r.questionId, counsellorId: r.counsellorId, evalRunId: r.evalRunId, score: { ai: 5, counsellor: 1 }, tenantId: "b",
    })));
    assert.deepEqual(attempts.map(r => r.status).sort(), [200, 409]);
    const first = await (await request(`/championship/${event._id}`)).json() as any;
    assert.equal(first.report.plannedPairs, 4); assert.equal(first.report.recordedPairs, 1); assert.equal(first.report.status, "incomplete");
    const absent = prepared.find(r => !first.report.trials.some((t: any) => t.evalRunId === r.evalRunId))!;
    assert.equal((await request(`/championship/${event._id}/trials`, { expectedRevision: first.event.revision,
      questionId: absent.questionId, counsellorId: absent.counsellorId, evalRunId: absent.evalRunId })).status, 200);
    const final = await (await request(`/championship/${event._id}`)).json() as any;
    assert.equal(final.report.recordedPairs, 2); assert.equal(final.report.plannedPairs, 4); assert.equal(final.report.publicResult, false);
    assert.equal(final.report.credibility, "internal"); assert.equal(final.report.status, "incomplete");
    assert.deepEqual(final.report.counsellors.map((c: any) => c.observedScoreTotals), [{ ai: 4, counsellor: 3 }, { ai: 2, counsellor: 5 }]);
    for (const r of prepared) assert.deepEqual(final.report.trials.find((t: any) => t.evalRunId === r.evalRunId).aiAnswer, r.aiAnswer);
    const bCreated = await request("/championship", plan, "b");
    assert.equal(bCreated.status, 201); const bEvent = await bCreated.json() as ChampionshipEvent;
    assert.equal(bEvent.tenantId, "b");
    assert.equal((await request(`/championship/${bEvent._id}`, undefined, "b")).status, 200);
    assert.equal((await request(`/championship/${bEvent._id}`)).status, 404);
    const stable = JSON.stringify([...rows.values()]);
    assert.equal((await request(`/championship/${event._id}`, undefined, "b")).status, 404);
    assert.equal((await request(`/championship/${event._id}/trials`, { expectedRevision: 3, questionId: prepared[0]!.questionId,
      counsellorId: prepared[0]!.counsellorId, evalRunId: prepared[0]!.evalRunId })).status, 400);
    assert.equal(JSON.stringify([...rows.values()]), stable); assert.equal(writes, 5);
    assert.equal(evalRuns._rows.size, 2);
    console.log("CHECKER_SOURCE_PROBE matchedTrials=2 plannedPairs=4 CAS=1-success/1-conflict tenantRefusals=positive-and-negative immutableSnapshots=2 fullTask=HOLD");
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
