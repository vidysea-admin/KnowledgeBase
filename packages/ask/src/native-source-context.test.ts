import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TreeIndexNode } from "@lkb/core";
import { BoundedAskError, validateHydration, type NativeSourceQuote, type NativeSourceLocator } from "./source-context.js";
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const revisionHash = sha("canonical current revision");
function fixture(kind: "document-page" | "message") {
  const quote = kind === "document-page" ? "करियर सलाह के लिए आवेदन करें।" : "admission ke liye form bharo.";
  const sourceLocator: NativeSourceLocator = { sourceId: "source-a", revisionHash,
    passage: { start: 4, end: 4 + quote.length, sha256: sha(quote) },
    ...(kind === "document-page" ? { kind, documentId: "doc-current", documentSourceId: "immutable-document-source", headRevision: 1, pageNumber: 2 } : { kind, threadId: "thread-a", messageId: "message-a" }) };
  const proof: NativeSourceQuote = { id: "q-native", nodeId: "native-a", origin: kind, quote, sourceLocator };
  const original: TreeIndexNode = { node_id: proof.nodeId, title: "Native", summary: "ROUTE ONLY", level: "session", children: [],
    evidence: { sourceId: "source-a", revisionHash } };
  const hydration = () => ({ snapshotSHA256: sha("snapshot"), sourceBytes: Buffer.byteLength(quote),
    nodes: [{ ...original, summary: JSON.stringify([proof]), evidence: { ...original.evidence,
      sourceSnapshotSHA256: sha("snapshot"), sourceQuotes: [proof] } }] });
  return { proof, original, hydration };
}
for (const kind of ["document-page", "message"] as const) {
  test(kind + " native exact Unicode evidence validates without transcript fields", () => {
    const f = fixture(kind);
    assert.deepEqual(validateHydration(f.hydration(), [f.original]), f.hydration().nodes);
    assert.ok(!("tStart" in f.proof)); assert.ok(!("turnId" in f.proof));
  });
  for (const attack of ["foreign-source", "stale-revision", "offset", "hash", "fake-audio"] as const) {
    test(kind + " refuses " + attack + " native proof", () => {
      const f = fixture(kind);
      if (attack === "foreign-source") f.proof.sourceLocator.sourceId = "foreign";
      if (attack === "stale-revision") f.proof.sourceLocator.revisionHash = sha("old revision");
      if (attack === "offset") f.proof.sourceLocator.passage.end++;
      if (attack === "hash") f.proof.sourceLocator.passage.sha256 = sha("invented quote");
      if (attack === "fake-audio") Object.assign(f.proof, { tStart: 0, tEnd: 0 });
      assert.throws(() => validateHydration(f.hydration(), [f.original]), BoundedAskError);
    });
  }
}
for (const field of ["documentId", "documentSourceId", "headRevision"] as const) test("document evidence requires canonical " + field, () => {
  const f = fixture("document-page");
  Reflect.deleteProperty(f.proof.sourceLocator, field);
  assert.throws(() => validateHydration(f.hydration(), [f.original]), BoundedAskError);
});

test("document evidence refuses unpublished zero head revision", () => {
  const f = fixture("document-page");
  if (f.proof.sourceLocator.kind !== "document-page") throw new Error("document fixture required");
  f.proof.sourceLocator.headRevision = 0;
  assert.throws(() => validateHydration(f.hydration(), [f.original]), BoundedAskError);
});
