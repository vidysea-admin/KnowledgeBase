/**
 * U2.5 decisions extractor — fake LLM only. No quality claim: no adjudicated decision gold exists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { extractDecisions, decisionsEnabled, type DecisionsCompleteFn } from "./decisions.js";
import { evaluateExtractionCase } from "../eval/extraction.js";

const turn = (id: string, speakerRef: string, text: string, tStart = 0, tEnd = 1): Turns =>
  ({ _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart, tEnd, text });
const done = (text: string, json?: unknown): CompleteResult =>
  ({ text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 });
const TURNS = [turn("a", "spk:0", "Should we ship Friday?", 0, 4), turn("b", "spk:1", "Yes, we ship Friday.", 4, 9), turn("c", "spk:0", "Agreed.", 9, 11)];
const fake = (payload: unknown): DecisionsCompleteFn => async () => done(JSON.stringify(payload));

test("empty turns: no provider call, not degraded", async () => {
  const r = await extractDecisions([], async () => { throw new Error("must not be called"); });
  assert.deepEqual(r, { decisions: [], degraded: null });
});

test("job kind is decisions and the transcript carries real turn ids", async () => {
  let seen: Job | undefined;
  await extractDecisions(TURNS, async (job) => { seen = job; return done("[]"); });
  assert.equal(seen!.kind, "decisions");
  const user = (seen as unknown as { messages: { role: string; content: string }[] }).messages.find((m) => m.role === "user")!.content;
  assert.match(user, /\[id:b\] \[spk:1\] Yes, we ship Friday\./);
});

test("keeps a decision with real citations; tStart/tEnd come from the cited turns, not the model", async () => {
  const r = await extractDecisions(TURNS, fake([{ text: "Ship on Friday.", turnIds: ["b", "c"], tStart: 999, tEnd: 1000 }]));
  assert.equal(r.degraded, null);
  assert.deepEqual(r.decisions, [{ text: "Ship on Friday.", evidenceTurnIds: ["b", "c"], tStart: 4, tEnd: 11 }]);
});

test("fabricated ids are removed; a decision with no real id is dropped entirely", async () => {
  const r = await extractDecisions(TURNS, fake([
    { text: "Mixed.", turnIds: ["zzz", "b"] },
    { text: "Fabricated.", turnIds: ["nope"] },
    { text: "No ids." }, { text: "  ", turnIds: ["a"] }, "junk", null,
  ]));
  assert.deepEqual(r.decisions.map((d) => [d.text, d.evidenceTurnIds]), [["Mixed.", ["b"]]]);
});

test("duplicate cited ids collapse", async () => {
  const r = await extractDecisions(TURNS, fake([{ text: "D.", turnIds: ["b", "b"] }]));
  assert.deepEqual(r.decisions[0]!.evidenceTurnIds, ["b"]);
});

test("owner kept only when it is a speaker of a cited turn", async () => {
  const r = await extractDecisions(TURNS, fake([
    { text: "Owned.", turnIds: ["b"], owner: "spk:1" },
    { text: "Wrong owner.", turnIds: ["b"], owner: "spk:0" },
    { text: "Invented owner.", turnIds: ["b"], owner: "Alice" },
  ]));
  assert.deepEqual(r.decisions.map((d) => d.owner), ["spk:1", undefined, undefined]);
  assert.ok(!("owner" in r.decisions[1]!));
});

test("provider failure degrades with a reason, never throws", async () => {
  const r = await extractDecisions(TURNS, async () => { throw new Error("provider down"); });
  assert.deepEqual(r.decisions, []);
  assert.match(r.degraded!.reason, /decisions provider call failed: provider down/);
});

test("unparseable and non-array output degrade", async () => {
  const bad = await extractDecisions(TURNS, async () => done("not json at all"));
  assert.ok(bad.degraded);
  const obj = await extractDecisions(TURNS, fake({ decisions: [] }));
  assert.match(obj.degraded!.reason, /not a JSON array/);
});

test("an honest empty array is non-degraded", async () => {
  assert.deepEqual(await extractDecisions(TURNS, fake([])), { decisions: [], degraded: null });
});

test("decisionsEnabled is OFF by default and for non-opt-in values", () => {
  assert.equal(decisionsEnabled({}), false);
  for (const v of ["", "0", "false", "off", "yes"]) assert.equal(decisionsEnabled({ LKB_EXTRACT_DECISIONS: v }), false);
  for (const v of ["1", "true", " TRUE "]) assert.equal(decisionsEnabled({ LKB_EXTRACT_DECISIONS: v }), true);
});

test("output is scorable by the U2.2 harness (filtered + persisted shapes); no labels, so nothing is measured", async () => {
  const r = await extractDecisions(TURNS, fake([{ text: "Ship on Friday.", turnIds: ["b", "c"], owner: "spk:1" }]));
  const filtered = r.decisions.map((d) => ({ ...d, tenantId: "t1", sessionId: "s1", speakerRef: d.owner, _id: "d1" }));
  const persisted = r.decisions.map((d) => ({ _id: "d1", tenantId: "t1", text: d.text, tStart: d.tStart, tEnd: d.tEnd,
    evidence: d.evidenceTurnIds.map((turnId) => ({ turnId, sessionId: "s1" })) }));
  const report = evaluateExtractionCase({ id: "dec-1", tenantId: "t1", sessionId: "s1", artifactHash: createHash("sha256").update("x").digest("hex"),
    turns: TURNS, filtered: { claims: filtered, degraded: null }, persisted });
  for (const s of ["filtered", "persisted"] as const) {
    assert.equal(report.stages[s].available, true);
    assert.deepEqual(report.stages[s].issues, [], `${s} stage reports no issues (citations, span, attribution)`);
    assert.equal(report.stages[s].invalidCitationRate.numerator, 0);
  }
  assert.equal(report.stages.persisted.optionalChecks.span, 1);
  assert.equal(report.stages.filtered.optionalChecks.attribution, 1);
  assert.equal(report.semantic.measured, false);
});

test("a tampered span is caught by the harness (the timestamps are checkable, not decorative)", () => {
  const report = evaluateExtractionCase({ id: "dec-2", tenantId: "t1", sessionId: "s1", artifactHash: "a".repeat(64), turns: TURNS,
    persisted: [{ _id: "d1", tenantId: "t1", text: "X.", tStart: 0, tEnd: 99, evidence: [{ turnId: "b", sessionId: "s1" }] }] });
  assert.deepEqual(report.stages.persisted.issues.map((i) => i.code), ["claim-span-mismatch"]);
});
