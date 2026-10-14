import { test } from "node:test";
import assert from "node:assert/strict";
import { createAnswerPolicyVersion, simulateAnswerPolicy } from "./answer-policy.js";
import type { AskV2Result } from "./ask-shared.js";
import { answer } from "./answer.js";
import { fakeComplete } from "./testUtils.js";

function result(overrides: Partial<AskV2Result> = {}): AskV2Result {
  return { answer: "Forms open in October.", verdict: "correct", reason: "covered", scored: [],
    web_used: false, insufficient_coverage: false, auditLog: [],
    sources: { internal: [{ node_id: "n1", evidence: { sessionRef: "s1" } }], web: [] }, ...overrides };
}
function simulate(value: AskV2Result, mode: "internal-only" | "internal-and-web" = "internal-only") {
  return simulateAnswerPolicy("tenant-a", createAnswerPolicyVersion("tenant-a", "draft", mode), { tenantId: "tenant-a", result: value });
}

test("policy revisions are immutable detached values and preserve their owner", () => {
  const one = createAnswerPolicyVersion("tenant-a", "draft", "internal-only");
  const two = createAnswerPolicyVersion("tenant-a", "draft", "internal-and-web", one);
  assert.equal(one.version, 1); assert.equal(one.mode, "internal-only");
  assert.equal(two.version, 2); assert.ok(Object.isFrozen(one)); assert.ok(Object.isFrozen(two));
  assert.throws(() => createAnswerPolicyVersion("tenant-b", "draft", "internal-only", one));
  assert.throws(() => createAnswerPolicyVersion("tenant-a", "other", "internal-only", one));
  assert.throws(() => createAnswerPolicyVersion("tenant-a", "draft", "internal-only", { ...one, version: Number.MAX_SAFE_INTEGER }));
});
test("invalid versions and identities cannot form a policy", () => {
  for (const id of ["", " tenant-a", "tenant-a\n"]) assert.throws(() => createAnswerPolicyVersion(id, "draft", "internal-only"));
  assert.throws(() => createAnswerPolicyVersion("tenant-a", "draft", "unsafe" as "internal-only"));
  const one = createAnswerPolicyVersion("tenant-a", "draft", "internal-only");
  for (const version of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => createAnswerPolicyVersion("tenant-a", "draft", "internal-only", { ...one, version }));
});
test("tenant mismatch refuses before observing answer or source content", () => {
  const policy = createAnswerPolicyVersion("tenant-a", "draft", "internal-only");
  const envelope = { tenantId: "tenant-b", get result(): AskV2Result { throw new Error("private content observed"); } };
  assert.throws(() => simulateAnswerPolicy("tenant-a", policy, envelope), /tenant mismatch/);
  assert.throws(() => simulateAnswerPolicy("tenant-b", policy, { tenantId: "tenant-b", result: result() }), /tenant mismatch/);
});
test("grounded internal answers allow with separate counts and unchanged source data", () => {
  const input = result(); const original = JSON.stringify(input);
  assert.deepEqual(simulate(input), { policyId: "draft", version: 1, decision: "allow", reason: "covered", internalSources: 1, webSources: 0 });
  assert.equal(JSON.stringify(input), original);
});
test("internal-only refuses mixed and web-only answers without rewriting their text", () => {
  for (const web_used of [true, false]) {
    assert.equal(simulate(result({ web_used, sources: { internal: [], web: [{ url: "https://example.com" }] } })).reason, "web-disallowed");
  }
});
test("web-enabled mode allows covered fallback and keeps source classes distinct", () => {
  const out = simulate(result({ web_used: true, verdict: "ambiguous", sources: { internal: result().sources.internal, web: [{ url: "https://example.com" }] } }), "internal-and-web");
  assert.equal(out.decision, "allow"); assert.equal(out.internalSources, 1); assert.equal(out.webSources, 1);
});
test("insufficiency, missing session provenance and unsafe web provenance require review", () => {
  assert.equal(simulate(result({ insufficient_coverage: true })).reason, "insufficient-coverage");
  assert.equal(simulate(result({ verdict: "ambiguous" })).decision, "review");
  assert.equal(simulate(result({ sources: { internal: [{ node_id: "n" }], web: [] } })).reason, "missing-provenance");
  for (const url of ["javascript:alert(1)", "data:text/plain,x", "/relative", ""]) {
    assert.equal(simulate(result({ web_used: true, sources: { internal: [], web: [{ url }] } }), "internal-and-web").reason, "missing-provenance");
  }
});
test("malformed, empty, source-free and inconsistent results fail closed", () => {
  assert.equal(simulate(result({ sources: { internal: [], web: [] } })).reason, "no-sources");
  assert.equal(simulate(result({ answer: " " })).reason, "invalid-result");
  assert.equal(simulate(result({ web_used: true }), "internal-and-web").reason, "insufficient-coverage");
  assert.equal(simulate(result({ verdict: "unsafe" as "correct" })).reason, "invalid-result");
  assert.equal(simulate(result({ sources: null as unknown as AskV2Result["sources"] })).reason, "invalid-result");
});
test("existing answer output is consumed without another provider call or lost provenance", async () => {
  const complete = fakeComplete({ text: "Forms open in October." });
  const sources = result().sources;
  const generated = await answer("When?", "Forms open in October.", sources, complete);
  const out = simulate(result({ answer: generated.text, sources: generated.sources }));
  assert.equal(out.decision, "allow"); assert.equal(complete.calls.length, 1);
  assert.equal(generated.sources, sources);
});
