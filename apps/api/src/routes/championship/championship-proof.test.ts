/** w17-champproof: GET /championship/:id recomputes stored quote proofs; stale citations are stripped and flagged. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import express from "express";
import { requireAuth } from "../../auth.js";
import { createChampionshipEvent, type ChampionshipEvent } from "../../championship/model.js";
import { addChampionshipTrial, freezeChampionship } from "../../championship/runtime.js";
import { createMongoEvidenceVerifier } from "../../answer-policy/answer-evidence.js";
import { answerTestDb } from "../../answer-policy/answer-testdb.js";
import { createChampionshipRouter, type ChampionshipStore } from "./championship.js";

const text = "Fee is 100.", sha = (v: string) => createHash("sha256").update(v).digest("hex");
const plan = { title: "Plan", questions: [{ id: "q", text: "Fee?", source: { kind: "toc", reference: "turn:1" } }], counsellors: [{ id: "c", name: "Name", evidenceReference: "pending" }], judges: [], rubric: { version: "draft", reference: "pending" }, reviewReference: "pending" };
async function fixture() {
  const db = answerTestDb();
  const quote = { id: "q1", nodeId: "n1", sessionRef: "s1", turnId: "t1", speakerRef: "spk:0", tStart: 10, tEnd: 20, charStart: 0, charEnd: text.length,
    byteStart: 0, byteEnd: Buffer.byteLength(text), turnTextSHA256: sha(text), sliceSHA256: sha(text), quote: text, origin: "speech" };
  db.rows("sessions").push({ _id: "s1", tenantId: "a", sourceId: "src" });
  db.rows("sources").push({ _id: "src", tenantId: "a", kind: "recording" });
  db.rows("turns").push({ _id: "t1", tenantId: "a", sessionId: "s1", speakerRef: "spk:0", tStart: 10, tEnd: 20, text });
  const answer = { text: "Fee is 100", answer: "Fee is 100", sources: { internal: [{ node_id: "n1", evidence: { sessionRef: "s1", sourceQuotes: [quote] } }], web: [] } };
  const created = createChampionshipEvent("a", plan, "2026-10-14T00:00:00Z");
  let event = freezeChampionship(created, created.bankDigest, "2026-10-14T00:01:00Z");
  event = addChampionshipTrial(event, "q", "c", { _id: "e1", tenantId: "a", question: "Fee?", counsellor: { name: "Name" }, aiAnswer: answer as never,
    counsellorAnswer: { text: "Human" }, score: { ai: 4, counsellor: 3 }, credibility: "internal", createdAt: "2026-10-14T00:02:00Z" }, "2026-10-14T00:03:00Z");
  const reads: string[] = [];
  const store: ChampionshipStore = { create: async () => {}, replace: async () => false, getEvalRun: async () => null,
    get: async (t, id) => t === event!.tenantId && id === event!._id ? structuredClone(event!) : null,
    verifyEvidence: createMongoEvidenceVerifier(db.db) };
  const app = express(); app.use(express.json()); app.use(requireAuth({ verify: async k => k === "a" || k === "b" ? { tenantId: k, scopes: ["compete"] } : null }));
  app.use(createChampionshipRouter(store));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const addr = server.address() as { port: number };
  const get = async () => (await (await fetch(`http://127.0.0.1:${addr.port}/championship/${event!._id}`, { headers: { authorization: "Bearer a" } })).json()) as { event: ChampionshipEvent; report: { missingSourceEvidenceRunIds: string[] } };
  return { db, event: event!, get, reads, close: () => new Promise<void>(r => server.close(() => r())), store };
}
const sourcesOf = (e: ChampionshipEvent) => (e.trials[0]!.aiAnswer as { sources: { internal: unknown[] } }).sources.internal;

test("valid proof keeps sources and response shape unchanged", async () => {
  const f = await fixture();
  try { const r = await f.get(); assert.equal(sourcesOf(r.event).length, 1); assert.equal((r.event.trials[0] as { state?: unknown }).state, undefined);
    assert.deepEqual(r.event, JSON.parse(JSON.stringify(f.event))); assert.deepEqual(r.report.missingSourceEvidenceRunIds, []);
  } finally { await f.close(); }
});
for (const [name, mutate] of [
  ["turn text changed", (db: Awaited<ReturnType<typeof fixture>>["db"]) => { db.rows("turns")[0]!.text = "Fee is 200."; }],
  ["turn missing", (db: Awaited<ReturnType<typeof fixture>>["db"]) => { db.rows("turns").length = 0; }],
  ["cross-tenant turn id", (db: Awaited<ReturnType<typeof fixture>>["db"]) => { db.rows("turns")[0]!.tenantId = "b"; }],
] as const) test(`${name}: sources stripped and stale flag set`, async () => {
  const f = await fixture();
  try { mutate(f.db); const r = await f.get(), t = r.event.trials[0] as unknown as { state?: string; aiAnswer: { reason?: string; text: string } };
    assert.equal(sourcesOf(r.event).length, 0); assert.equal(t.state, "stale"); assert.match(t.aiAnswer.reason!, /cannot be verified/);
    assert.equal(t.aiAnswer.text, "Fee is 100"); assert.deepEqual(r.report.missingSourceEvidenceRunIds, ["e1"]);
  } finally { await f.close(); }
});
test("store without a verifier fails closed for cited trials", async () => {
  const f = await fixture();
  try { delete f.store.verifyEvidence; const r = await f.get(); assert.equal(sourcesOf(r.event).length, 0); } finally { await f.close(); }
});
