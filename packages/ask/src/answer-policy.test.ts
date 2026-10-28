import { test } from "node:test";
import assert from "node:assert/strict";
import { createAnswerPolicyVersion, simulateAnswerPolicy } from "./answer-policy.js";
import type { AskV2Result } from "./ask-shared.js";
import { answer } from "./answer.js";
import { fakeComplete } from "./testUtils.js";
import { createHash } from "node:crypto";
import type { DocumentPageSourceLocator, MessageSourceLocator } from "@lkb/core";
import type { NativeSourceQuote } from "./source-context.js";

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

const nativeText = "आवेदन October 😀.", nativeHash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
function nativeSource(kind: "document-page" | "message" = "document-page"): AskV2Result["sources"]["internal"][number] {
  const shared = { sourceId: "native-source", revisionHash: nativeHash("revision"),
    passage: { start: 7, end: 7 + nativeText.length, sha256: nativeHash(nativeText) } };
  const locator: DocumentPageSourceLocator | MessageSourceLocator = kind === "document-page"
    ? { ...shared, kind, documentId: "document", documentSourceId: "immutable-source", headRevision: 1, pageNumber: 2 }
    : { ...shared, kind, threadId: "thread", messageId: "message" };
  const quote: NativeSourceQuote = { id: "quote-" + kind, nodeId: "node-" + kind, origin: kind, sourceLocator: locator, quote: nativeText };
  return { node_id: quote.nodeId, evidence: { sourceId: shared.sourceId, revisionHash: shared.revisionHash, sourceQuotes: [quote] } };
}

test("canonical native document and message provenance allow without fabricated session or audio fields", () => {
  for (const kind of ["document-page", "message"] as const) {
    const source = nativeSource(kind), input = result({ sources: { internal: [source], web: [] } }), before = JSON.stringify(input);
    assert.equal(simulate(input).decision, "allow");
    assert.equal(JSON.stringify(input), before);
    assert.equal("sessionRef" in source.evidence!, false);
    assert.deepEqual(Object.keys((source.evidence!.sourceQuotes as NativeSourceQuote[])[0]!).sort(), ["id", "nodeId", "origin", "quote", "sourceLocator"]);
  }
});

test("malformed or mismatched native provenance and within-source legacy mixtures require review", () => {
  const source = nativeSource(), q = (source.evidence!.sourceQuotes as NativeSourceQuote[])[0]!;
  const changed = (quotes: unknown[], extra: Record<string, unknown> = {}) => ({ ...source, evidence: { ...source.evidence, sourceQuotes: quotes, ...extra } });
  const attacks = [
    changed([{ ...q, nodeId: "foreign" }]), changed([q], { sourceId: "foreign" }), changed([q], { revisionHash: nativeHash("old") }),
    changed([{ ...q, quote: q.quote + " forged" }]), changed([{ ...q, sourceLocator: { ...q.sourceLocator, passage: { ...q.sourceLocator.passage, sha256: nativeHash("forged") } } }]),
    changed([{ ...q, sourceLocator: { ...q.sourceLocator, passage: { ...q.sourceLocator.passage, end: 8 + nativeText.length } } }]),
    changed([{ ...q, sourceLocator: { ...q.sourceLocator, headRevision: 0 } }]), changed([{ ...q, sourceLocator: { ...q.sourceLocator, documentSourceId: "" } }]),
    changed([{ ...q, origin: "speech" }]), changed([{ ...q, tStart: 0 }]), changed([q], { sessionRef: "invented" }),
    changed([q, { id: "legacy", nodeId: source.node_id, quote: "speech", origin: "speech", sessionRef: "session" }]), changed([q, q]), changed([q, null]),
    changed([], { sessionRef: "invented" }), changed([{ id: "legacy", nodeId: source.node_id, quote: "speech", origin: "speech" }], { sessionRef: "invented" }),
  ];
  for (const attack of attacks) assert.equal(simulate(result({ sources: { internal: [attack], web: [] } })).reason, "missing-provenance");
});

test("distinct authorized document, message and transcript sources coexist in one covered answer", () => {
  const input = result({ sources: { internal: [nativeSource("document-page"), nativeSource("message"), ...result().sources.internal], web: [] } });
  const out = simulate(input);
  assert.equal(out.decision, "allow"); assert.equal(out.internalSources, 3);
});

test("native provenance does not relax coverage, internal-only web rules or tenant checks", () => {
  const sources = { internal: [nativeSource()], web: [] };
  assert.equal(simulate(result({ sources, insufficient_coverage: true })).reason, "insufficient-coverage");
  assert.equal(simulate(result({ sources, verdict: "ambiguous" })).reason, "insufficient-coverage");
  assert.equal(simulate(result({ sources: { ...sources, web: [{ url: "https://example.com" }] }, web_used: true })).reason, "web-disallowed");
  assert.throws(() => simulateAnswerPolicy("tenant-b", createAnswerPolicyVersion("tenant-a", "draft", "internal-only"),
    { tenantId: "tenant-b", result: result({ sources }) }), /tenant mismatch/);
});
