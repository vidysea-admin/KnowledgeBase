import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createSourceIntakeDeps } from "../source-intake/store.js";
import { indexSession } from "../indexing/session.js";
import { IndexGenerationError } from "../indexing/generation.js";
import { createSourceRequestDepsFor } from "../ask/source-context.js";
import { treeSearch } from "@lkb/index";
import { unpackContext } from "../../../../packages/ask/src/bounded-refine.js";
import type { TreeIndexNode } from "@lkb/core";
import { createMongoFlywheelStore } from "./store.js";
import { createEvaluationFlywheel } from "./workflow.js";
import { buildFlywheelAsk } from "./ask.js";
import { memoryDb, ORIGINAL, SOURCE, ANSWER, TURN } from "./test-fixture.js";

test("memory fixture distinguishes missing dotted fields and acknowledges only matched CAS writes", async () => {
  const mem = memoryDb({ sessions: [
    { _id: "absent", tenantId: "t", revision: 1 },
    { _id: "present", tenantId: "t", nested: { value: undefined } },
    { _id: "null", tenantId: "t", nested: { value: null } },
  ] });
  type FixtureSession = { _id: string; tenantId: string; revision?: number; nested?: { value?: unknown }; indexAttempt?: { generation: string } };
  const rows = mem.db.collection<FixtureSession>("sessions");
  assert.ok(await rows.findOne({ _id: "absent", "nested.value": { $exists: false } }));
  assert.equal(await rows.findOne({ _id: "present", "nested.value": { $exists: false } }), null);
  assert.ok(await rows.findOne({ _id: "present", "nested.value": { $exists: true } }));
  assert.ok(await rows.findOne({ _id: "null", "nested.value": { $exists: true } }));
  const first = await rows.updateOne({ _id: "absent", tenantId: "t", revision: 1, indexAttempt: { $exists: false } },
    { $set: { revision: 2, "indexAttempt.generation": "owned" } });
  assert.equal(first.acknowledged, true); assert.equal(first.matchedCount, 1); assert.equal(first.modifiedCount, 1);
  const unchanged = await rows.updateOne({ _id: "absent", tenantId: "t", revision: 2 }, { $set: { revision: 2 } });
  assert.equal(unchanged.matchedCount, 1); assert.equal(unchanged.modifiedCount, 0);
  for (const filter of [
    { _id: "absent", tenantId: "t", revision: 1 },
    { _id: "absent", tenantId: "foreign", revision: 2 },
    { _id: "absent", tenantId: "t", indexAttempt: { $exists: false } },
  ]) {
    const refused = await rows.updateOne(filter, { $set: { revision: 99 } });
    assert.equal(refused.acknowledged, true); assert.equal(refused.matchedCount, 0); assert.equal(refused.modifiedCount, 0);
  }
  assert.equal((await rows.findOne({ _id: "absent", tenantId: "t" }))?.revision, 2);
});

test("actual source intake -> grounded indexSession -> request-bound source hydration/askV2 -> immutable child", { timeout: 20000 }, async () => {
  const mem = memoryDb({ eval_runs: [ORIGINAL] }), store = createMongoFlywheelStore(mem.db);
  // Inject the existing production sink rather than its global DB accessor.
  const { createMongoIntakeSink } = await import("../source-intake/store.js");
  const collections = { sources: (t: string) => scoped("sources", t), media: (t: string) => scoped("media", t),
    sessions: (t: string) => scoped("sessions", t), turns: (t: string) => scoped("turns", t) };
  function scoped(name: string, t: string) {
    const c = mem.db.collection(name);
    return { findOne: (f: any = {}) => c.findOne({ ...f, tenantId: t }),
      insertOne: (doc: any) => c.insertOne({ ...doc, tenantId: t }), insertMany: (docs: any[]) => c.insertMany(docs.map((d) => ({ ...d, tenantId: t }))),
      deleteMany: (f: any = {}) => c.deleteMany({ ...f, tenantId: t }) };
  }
  const actualIntake = createSourceIntakeDeps({ newId: () => "s1", now: () => ORIGINAL.createdAt,
    sink: createMongoIntakeSink(collections as never), adapters: [{ name: "provided-fixture", detect: () => true,
      fetch: async () => ({ source: SOURCE, media: [] }), toTurns: async () => [{ text: ANSWER, speakerRef: TURN.speakerRef, tStart: TURN.tStart, tEnd: TURN.tEnd }] }] });
  const ev = { turnId: TURN._id, sessionId: "s1", quote: ANSWER };
  const model = async (job: any) => {
    const p = JSON.parse(job.messages[1].content);
    const json = p.phase === "extract-summary" ? { processed: p.inventory, items: [{ kind: "insight", text: ANSWER, origin: "speaker-statement", verification: "unverified", evidence: [ev] }], qa: [] }
      : p.phase === "extract-claims" ? { processed: p.inventory, claims: [{ text: ANSWER, origin: "speaker-statement", verification: "unverified", evidence: [ev] }] }
        : { processed: p.inventory, complete: true, noContent: false, noClaims: false, verdicts: p.items.map((i: any) => ({ id: i.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
    return { text: JSON.stringify(json), usage: { inputTokens: 1, outputTokens: 1 }, provider: "offline", model: "fixture", costUsd: 0 };
  };
  let attack = "", asks = 0;
  const complete = (json: unknown) => ({ text: JSON.stringify(json), json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "offline", model: "fixture", costUsd: 0 });
  const requestDepsFor = createSourceRequestDepsFor({ db: mem.db, treeSearchFn: treeSearch,
    write: async () => {}, embed: async () => ({ vectors: [[1, 0]], dims: 2, provider: "offline", model: "fixture" }),
    dispatch: async (job, tenant) => {
      assert.equal(tenant, "t"); assert.ok(!JSON.stringify(job).includes("FOREIGN_SECRET"));
      if (job.kind === "ask.select_nodes") {
        asks++; const root = mem.tables.tree_index![0] as TreeIndexNode;
        const session = (n: TreeIndexNode): TreeIndexNode | undefined => n.level === "session" ? n : n.children.map(session).find(Boolean);
        return complete({ node_ids: [session(root)!.node_id] });
      }
      if (job.kind === "evaluator") return complete({ score: attack === "insufficient" ? 0.1 : 0.95, reason: "fixture score; no calibration claim" });
      if (job.kind === "ask.answer_grounding") return complete({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
      const strips = unpackContext(JSON.parse(job.messages[1]!.content).context);
      assert.equal(strips[0]!.text, ANSWER);
      return complete({ sentences: [{ text: ANSWER, sourceIds: [attack === "foreign" ? "foreign-source" : strips[0]!.sourceId] }] });
    } });
  const ask = buildFlywheelAsk({ tree: { load: async (t) => await mem.db.collection("tree_index").findOne({ tenantId: t }) as unknown as TreeIndexNode },
    askDeps: requestDepsFor("t"), requestDepsFor });
  const errorClasses = new Set(["Error", "TypeError", "RangeError", "AssertionError", "IndexGenerationError", "FlywheelError", "BoundedAskError"]);
  const generationCodes = new Set([
    "empty_index_transcript", "index_artifact_generation_incomplete", "index_attempt_claim_lost",
    "index_attempt_claim_unconfirmed", "index_attempt_completion_unconfirmed", "index_attempt_requires_recovery",
    "index_attempt_write_fence_unconfirmed", "index_source_unavailable", "index_tree_cas_unconfirmed",
    "index_tree_insert_unconfirmed", "index_tree_revision_invalid", "legacy_index_attempt_unconfirmed",
    "preserved_claim_not_reviewed", "preserved_claim_source_invalid",
  ]);
  const operations = new Set(["find", "findOne", "insertOne", "insertMany", "updateOne", "replaceOne", "deleteMany"]);
  const operators = new Set(["$exists", "$in", "$nin", "$ne", "$eq", "$or", "$and", "$nor", "$gt", "$gte", "$lt", "$lte", "$elemMatch", "$not"]);
  async function observed<T>(phase: "intake" | "index" | "ask", call: () => Promise<T>): Promise<T> {
    try { return await call(); }
    catch (error) {
      const seen = new Set<string>();
      const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        for (const [key, nested] of Object.entries(value)) {
          if (operators.has(key)) seen.add(key);
          visit(nested);
        }
      };
      for (const entry of mem.calls) visit(entry.filter);
      console.error(JSON.stringify({ phase,
        errorClass: error instanceof Error && errorClasses.has(error.name) ? error.name : "Other",
        indexGenerationError: error instanceof IndexGenerationError,
        generationCode: error instanceof IndexGenerationError && generationCodes.has(error.code) ? error.code : "UNLISTED",
        operations: [...new Set(mem.calls.map(entry => entry.operation).filter(name => operations.has(name)))],
        filterOperators: [...seen].sort() }));
      throw error;
    }
  }
  const workflow = createEvaluationFlywheel({ store, intake: req => observed("intake", () => actualIntake.intake(req)),
    index: (t, s) => observed("index", () => indexSession(t, s, { db: mem.db, complete: model as never, strictWebinar: true,
      embed: async ({ texts }) => ({ vectors: texts.map(() => [1, 0]), dims: 2, provider: "offline", model: "fixture" }) })),
    ask: (t, q, receipt) => observed("ask", () => ask(t, q, receipt)) });
  await workflow.open("t", "loss");
  const child = await workflow.retest("t", "loss", { sourceUrl: SOURCE.url!, requestId: "actual-composition" });
  assert.equal(child.aiAnswer?.text, ANSWER); assert.equal(child.score, undefined);
  const quote = (child.aiAnswer!.sources!.internal as any[])[0].evidence.sourceQuotes[0];
  assert.equal(quote.sessionRef, "s1"); assert.equal(quote.turnId, TURN._id); assert.equal(quote.speakerRef, TURN.speakerRef);
  assert.equal(quote.tStart, 3); assert.equal(quote.tEnd, 7); assert.equal(quote.quote, ANSWER);
  assert.deepEqual(mem.tables.eval_runs![0], ORIGINAL); assert.equal(mem.tables.sources!.length, 1); assert.equal(mem.tables.sessions!.length, 1);
  const duplicate = await workflow.retest("t", "loss", { sourceUrl: SOURCE.url!, requestId: "actual-composition" }); assert.deepEqual(duplicate, child); assert.equal(asks, 1);
  const dir = "qa/evidence/goal-t059-maker"; mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/rows.json`, JSON.stringify({ gap: await workflow.inspect("t", "loss"), retest: child, original: ORIGINAL }, null, 2));
  assert.ok(mem.calls.filter((c) => c.filter).every((c) => c.filter!.tenantId === "t"), "all actual production collection reads/writes pinned");
  attack = "foreign";
  await assert.rejects(workflow.retest("t", "loss", { sourceUrl: SOURCE.url!, requestId: "foreign-citation" }));
  assert.equal(mem.tables.eval_runs!.length, 2);
  attack = "insufficient";
  const insufficient = await workflow.retest("t", "loss", { sourceUrl: SOURCE.url!, requestId: "insufficient" });
  assert.equal(insufficient.aiAnswer!.insufficient_coverage, true); assert.equal(insufficient.score, undefined);
});
