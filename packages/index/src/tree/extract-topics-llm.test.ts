/**
 * U2.3 tests: fake LLM only, no network. Quality is NOT measured here (U2.2 gold is unadjudicated).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SessionPages } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";

import { buildTree } from "./build.js";
import { extractTopicRefs } from "./extract-topics.js";
import { evaluateExtractionCase } from "../eval/extraction.js";
import {
  extractTopicsLlm, prepareTopicExtractFn, isLlmTopicsEnabled, topicPredictedEntities,
  TOPICS_JOB_KIND, type TopicsCompleteFn,
} from "./extract-topics-llm.js";

function page(id: string, tenantId: string, summary: string, keyInsights?: string[]): SessionPages {
  return { _id: id, tenantId, sessionId: "s-" + id, summary, ...(keyInsights ? { keyInsights } : {}),
    evidence: [{ turnId: "t1", sessionId: "s-" + id }] };
}
function done(text: string, json?: unknown): CompleteResult {
  return { text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}
const P1 = page("p1", "toc", "Study in New Zealand needs a Student Visa. HDFC Credila funds loans.");

test("flag off: returns the heuristic itself and never calls the model", async () => {
  let calls = 0;
  const complete: TopicsCompleteFn = async () => { calls++; return done("[]"); };
  const prepared = await prepareTopicExtractFn([P1], complete, { enabled: false });
  assert.equal(prepared.extractFn, extractTopicRefs);
  assert.equal(calls, 0);
  assert.equal(prepared.results.size, 0);
});

test("flag defaults to OFF and only LKB_LLM_TOPICS=1 turns it on", () => {
  assert.equal(isLlmTopicsEnabled({}), false);
  assert.equal(isLlmTopicsEnabled({ LKB_LLM_TOPICS: "0" }), false);
  assert.equal(isLlmTopicsEnabled({ LKB_LLM_TOPICS: "true" }), false);
  assert.equal(isLlmTopicsEnabled({ LKB_LLM_TOPICS: "1" }), true);
});

test("flag off: buildTree output is deep-equal to the default heuristic path", async () => {
  const sessions = [{ _id: "s-p1", tenantId: "toc", sourceId: "src", title: "T", date: "2026-04-21",
    status: { transcribe: "done" as const, index: "done" as const } }];
  const prepared = await prepareTopicExtractFn([P1], async () => done("[]"), { enabled: false });
  assert.equal(JSON.stringify(buildTree(sessions as never, [P1], undefined, prepared.extractFn)),
    JSON.stringify(buildTree(sessions as never, [P1])));
});

test("valid LLM output is used, grounded, deduped, capped; job kind and page text sent", async () => {
  let job: Job | undefined;
  const complete: TopicsCompleteFn = async (j) => { job = j; return done("", ["New Zealand", "student visa", "New Zealand"]); };
  const r = await extractTopicsLlm(P1, complete);
  assert.deepEqual(r, { topics: ["New Zealand", "student visa"], degraded: null });
  assert.equal(job!.kind, TOPICS_JOB_KIND);
  assert.match(job!.messages[1]!.content, /New Zealand/);
  assert.ok(!JSON.stringify(job).includes("toc"), "prompt carries no tenant id");
});

test("fenced JSON text is parsed", async () => {
  const r = await extractTopicsLlm(P1, async () => done('```json\n["HDFC Credila"]\n```'));
  assert.deepEqual(r.topics, ["HDFC Credila"]);
});

test("model error falls back to the heuristic", async () => {
  const r = await extractTopicsLlm(P1, async () => { throw new Error("boom"); });
  assert.deepEqual(r, { topics: extractTopicRefs(P1), degraded: { reason: "error" } });
});

test("timeout falls back to the heuristic", async () => {
  const r = await extractTopicsLlm(P1, () => new Promise<CompleteResult>(() => {}), { timeoutMs: 20 });
  assert.deepEqual(r, { topics: extractTopicRefs(P1), degraded: { reason: "timeout" } });
});

test("schema-invalid output falls back (non-array, non-string item, empty item, over-long item, too many)", async () => {
  const bad: unknown[] = ["not json at all", { topics: ["New Zealand"] }, ["New Zealand", 3], ["New Zealand", "  "],
    ["x".repeat(81)], Array.from({ length: 25 }, () => "New Zealand")];
  for (const b of bad) {
    const r = await extractTopicsLlm(P1, async () => typeof b === "string" ? done(b) : done("", b));
    assert.deepEqual(r, { topics: extractTopicRefs(P1), degraded: { reason: "invalid-output" } }, JSON.stringify(b));
  }
});

test("ungrounded topics are dropped; all-ungrounded falls back; empty array is honoured", async () => {
  const mixed = await extractTopicsLlm(P1, async () => done("", ["New Zealand", "Quantum Computing"]));
  assert.deepEqual(mixed, { topics: ["New Zealand"], degraded: null });
  const none = await extractTopicsLlm(P1, async () => done("", ["Quantum Computing"]));
  assert.deepEqual(none, { topics: extractTopicRefs(P1), degraded: { reason: "ungrounded" } });
  const empty = await extractTopicsLlm(P1, async () => done("[]"));
  assert.deepEqual(empty, { topics: [], degraded: null });
});

test("null page -> [] without a model call", async () => {
  const r = await extractTopicsLlm(null, async () => { throw new Error("must not be called"); });
  assert.deepEqual(r, { topics: [], degraded: null });
});

test("prepared extractFn: per-page results, null page, stale page text and unknown page use the heuristic", async () => {
  const complete: TopicsCompleteFn = async () => done("", ["New Zealand"]);
  const { extractFn, results } = await prepareTopicExtractFn([P1], complete, { enabled: true });
  assert.deepEqual(extractFn(P1), ["New Zealand"]);
  assert.deepEqual(extractFn(null), []);
  assert.equal(results.size, 1);
  const edited = { ...P1, summary: "Funding: Prodigy Finance offers loans." };
  assert.deepEqual(extractFn(edited), extractTopicRefs(edited));
  const other = page("zz", "toc", "Visa rules in Canada Today.");
  assert.deepEqual(extractFn(other), extractTopicRefs(other));
});

test("tenant scoping: same page _id in two tenants never shares an answer", async () => {
  const a = page("same", "tenantA", "Alpha Program runs in Berlin.");
  const b = page("same", "tenantB", "Alpha Program runs in Berlin.");
  const complete: TopicsCompleteFn = async (j) =>
    done("", j.messages[1]!.content.includes("Berlin") ? ["Alpha Program"] : []);
  const { extractFn, results } = await prepareTopicExtractFn([a], complete, { enabled: true });
  assert.deepEqual(extractFn(a), ["Alpha Program"]);
  assert.deepEqual(extractFn(b), extractTopicRefs(b));
  assert.equal(results.size, 1);
  assert.ok([...results.keys()][0]!.startsWith("tenantA"));
});

test("prepared extractFn plugs into buildTree and yields LLM topic children", async () => {
  const sessions = [{ _id: "s-p1", tenantId: "toc", sourceId: "src", title: "T", date: "2026-04-21",
    status: { transcribe: "done" as const, index: "done" as const } }];
  const { extractFn } = await prepareTopicExtractFn([P1], async () => done("", ["Student Visa"]), { enabled: true });
  const tree = buildTree(sessions as never, [P1], undefined, extractFn)["toc"]!;
  const sessionNode = tree.children[0]!.children[0]!.children[0]!;
  assert.deepEqual(sessionNode.children.map((c) => c.title), ["Student Visa"]);
});

test("U2.2 harness can score the output: predictedEntities shape accepted, unlabeled stays unmeasured", async () => {
  const r = await extractTopicsLlm(P1, async () => done("", ["New Zealand", "Student Visa"]));
  const predicted = topicPredictedEntities(r.topics);
  assert.deepEqual(predicted, [{ id: "new-zealand", kind: "topic" }, { id: "student-visa", kind: "topic" }]);
  const report = evaluateExtractionCase({ id: "c1", tenantId: "toc", sessionId: "s-p1", artifactHash: "a".repeat(64),
    turns: [], predictedEntities: predicted });
  assert.equal(report.entities.topic.predicted, 2);
  assert.equal(report.entities.topic.measured, false);
  assert.equal(report.entities.topic.precision.value, null);
});
