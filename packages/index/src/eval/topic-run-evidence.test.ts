import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { CompleteResult } from "@lkb/ai";
import { acquireTopicRunEvidence, type TopicRunEvidenceInput } from "./topic-run-evidence.js";
import { treeSearch } from "../tree/search.js";
import { evaluateExtractionCase } from "./extraction.js";

const input = (): TopicRunEvidenceInput => ({ tenantId: "a", execution: "injected-fixture", enabled: true,
  sources: [{ sessionJson: JSON.stringify({ _id: "s", tenantId: "a", sourceId: "source", date: "2026-01-01",
    title: "Example", status: { transcribe: "done", index: "done" } }),
    pageJson: JSON.stringify({ _id: "p", tenantId: "a", sessionId: "s", summary: "Student Visa in New Zealand.",
      evidence: [{ sessionId: "s", turnId: "t" }] }) }] });
const response = (json: unknown = ["Student Visa"]): CompleteResult => ({ text: JSON.stringify(json), json,
  provider: "fixture", model: "example", usage: { inputTokens: 12, outputTokens: 3 }, costUsd: 0.01, costStatus: "reported" });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const noCall = async (): Promise<CompleteResult> => { throw new Error("unexpected completion"); };

test("records exact source and completion artifacts through actual tree and evaluation consumers", async () => {
  const source = input(), raw = response();
  const report = await acquireTopicRunEvidence(source, async () => raw);
  assert.equal(report.sourceBindings[0]!.sessionSha256, hash(source.sources[0]!.sessionJson));
  assert.equal(report.sourceBindings[0]!.pageSha256, hash(source.sources[0]!.pageJson!));
  assert.deepEqual(report.logicalCalls[0]!.response, { text: raw.text, json: raw.json });
  assert.deepEqual(report.totals, { logicalCalls: 1, usage: { inputTokens: 12, outputTokens: 3 }, costUsd: 0.01 });
  assert.equal(report.logicalCalls[0]!.provider, "fixture");
  const node = report.observations[0]!.treeTopics[0]!;
  assert.equal(treeSearch(report.downstream.root!, [node.nodeId])[0]!.title, "Student Visa");
  const measured = evaluateExtractionCase({ id: "case", tenantId: "a", sessionId: "s", artifactHash: report.inputSha256,
    turns: [], predictedEntities: report.observations[0]!.predictedEntities! });
  assert.equal(measured.entities.topic.predicted, 1);
  assert.equal(measured.entities.topic.precision.value, null);
  assert.equal(report.physicalAttempts, null);
  assert.equal(report.executionAttested, false);
  assert.ok(Object.values(report.unavailableStages).every(value => value === null));
  raw.json = ["changed"];
  assert.deepEqual(report.logicalCalls[0]!.response!.json, ["Student Visa"]);
});

test("disabled, missing and empty pages preserve distinct unavailable extraction and actual tree evidence", async () => {
  const disabled = await acquireTopicRunEvidence({ ...input(), enabled: false }, noCall);
  assert.equal(disabled.totals.logicalCalls, 0);
  assert.equal(disabled.observations[0]!.extraction, null);
  assert.ok(disabled.observations[0]!.treeTopics.length > 0);
  assert.equal(disabled.totals.usage, null);
  assert.equal(disabled.totals.costUsd, null);
  const absentInput = input(); absentInput.sources[0]!.pageJson = null;
  const absent = await acquireTopicRunEvidence(absentInput, noCall);
  assert.equal(absent.sourceBindings[0]!.pageSha256, null);
  assert.equal(absent.observations[0]!.extraction, null);
  const emptyInput = input();
  emptyInput.sources[0]!.pageJson = JSON.stringify({ ...JSON.parse(emptyInput.sources[0]!.pageJson!), summary: "" });
  const empty = await acquireTopicRunEvidence(emptyInput, noCall);
  assert.deepEqual(empty.observations[0]!.extraction, { topics: [], degraded: null });
  assert.equal(empty.logicalCalls.length, 0);
});

test("actual producer fallback and valid-empty results remain distinguishable", async () => {
  for (const [reason, complete] of [
    ["error", async () => { throw new Error("private credential detail"); }],
    ["timeout", () => new Promise<CompleteResult>(() => {})],
    ["invalid-output", async () => response({ topics: [] })],
    ["ungrounded", async () => response(["Not Mentioned"])],
  ] as const) {
    const report = await acquireTopicRunEvidence({ ...input(), timeoutMs: 5 }, complete);
    assert.equal(report.observations[0]!.extraction!.degraded!.reason, reason);
    assert.ok(report.observations[0]!.treeTopics.length > 0);
    assert.ok(!JSON.stringify(report).includes("private credential detail"));
    if (reason === "timeout") {
      assert.equal(report.logicalCalls[0]!.outcome, "unsettled");
      assert.equal(report.totals.usage, null);
    }
  }
  const empty = await acquireTopicRunEvidence(input(), async () => response([]));
  assert.deepEqual(empty.observations[0]!.extraction, { topics: [], degraded: null });
  assert.deepEqual(empty.observations[0]!.treeTopics, []);
});

test("unknown or malformed usage and unpriced zero never become measured aggregate cost", async () => {
  const result = { ...response(), costUsd: 0, costStatus: "unknown" as const, usage: undefined } as unknown as CompleteResult;
  const report = await acquireTopicRunEvidence({ ...input(), execution: "configured-provider" }, async () => result);
  assert.equal(report.executionAttested, false);
  assert.equal(report.logicalCalls[0]!.costUsd, 0);
  assert.equal(report.logicalCalls[0]!.costStatus, "unknown");
  assert.equal(report.totals.costUsd, null);
  assert.equal(report.totals.usage, null);
  for (const invalid of [-1, NaN, 1.5]) {
    const malformed = await acquireTopicRunEvidence(input(), async () => ({ ...response(), usage: { inputTokens: invalid, outputTokens: 1 } }));
    assert.equal(malformed.totals.usage, null);
  }
});

test("foreign, mismatched, duplicate and invalid inputs refuse before completion", async () => {
  let calls = 0;
  const complete = async () => { calls++; return response(); };
  const variants = [input(), input(), input(), input(), input(), input()];
  variants[0]!.tenantId = "foreign";
  variants[1]!.sources[0]!.pageJson = JSON.stringify({ ...JSON.parse(variants[1]!.sources[0]!.pageJson!), tenantId: "foreign" });
  variants[2]!.sources[0]!.pageJson = JSON.stringify({ ...JSON.parse(variants[2]!.sources[0]!.pageJson!), sessionId: "other" });
  variants[3]!.sources.push(variants[3]!.sources[0]!);
  variants[4]!.timeoutMs = Infinity;
  variants[5]!.changedSessionIds = ["unknown"];
  for (const variant of variants) await assert.rejects(acquireTopicRunEvidence(variant, complete));
  assert.equal(calls, 0);
});

test("returned evidence stays immutable after late timed-out completion and caller mutation", async () => {
  let finish!: (value: CompleteResult) => void;
  const source = input();
  const pending = acquireTopicRunEvidence({ ...source, timeoutMs: 5 }, () => new Promise(resolve => { finish = resolve; }));
  source.sources[0]!.pageJson = "caller changed bytes";
  const report = await pending;
  const before = JSON.stringify(report);
  finish(response());
  await Promise.resolve(); await Promise.resolve();
  assert.equal(JSON.stringify(report), before);
  assert.equal(report.logicalCalls[0]!.outcome, "unsettled");
});

test("exact-byte identity changes and actual regeneration are retained", async () => {
  const first = await acquireTopicRunEvidence(input(), async () => response());
  const second = await acquireTopicRunEvidence({ ...input(), existingRootJson: JSON.stringify(first.downstream.root), changedSessionIds: ["s"] },
    async () => response(["New Zealand"]));
  assert.notEqual(second.inputSha256, first.inputSha256);
  assert.equal(second.observations[0]!.treeTopics[0]!.title, "New Zealand");
  const whitespace = input(); whitespace.sources[0]!.sessionJson += "\n";
  const third = await acquireTopicRunEvidence(whitespace, async () => response());
  assert.notEqual(third.sourceBindings[0]!.sessionSha256, first.sourceBindings[0]!.sessionSha256);
});

test("unchanged migrated sample bytes feed producer and actual searchable topic nodes", async () => {
  const base = new URL("../../../../data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/", import.meta.url);
  const source = { sessionJson: readFileSync(new URL("session.json", base), "utf8"),
    pageJson: readFileSync(new URL("session_page.json", base), "utf8") };
  const report = await acquireTopicRunEvidence({ tenantId: "toc", execution: "injected-fixture", enabled: true, sources: [source] },
    async () => response(["International Business School"]));
  assert.equal(report.sourceBindings[0]!.pageSha256, hash(source.pageJson));
  const node = report.observations[0]!.treeTopics[0]!;
  assert.equal(treeSearch(report.downstream.root!, [node.nodeId])[0]!.title, "International Business School");
  assert.equal(report.unavailableStages.semanticQuality, null);
});
