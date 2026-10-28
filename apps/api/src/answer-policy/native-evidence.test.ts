import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TreeIndexNode } from "@lkb/core";
import type { NativeSourceQuote } from "../../../../packages/ask/src/source-context.js";
import type { NativeEvidenceResolver } from "../native-evidence/resolver.js";
import { createNativeSourceRevalidator, verifyNativeSourceQuotes } from "./native-evidence.js";

const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const quote: NativeSourceQuote = { id: "q", nodeId: "native", quote: "Current passage", origin: "document-page",
  sourceLocator: { kind: "document-page", sourceId: "source", documentId: "doc", documentSourceId: "immutable-doc-source", headRevision: 1, revisionHash: sha("revision"), pageNumber: 1,
    passage: { start: 0, end: 15, sha256: sha("Current passage") } } };
const node = (q = quote): TreeIndexNode => ({ node_id: "native", title: "Document", level: "topic", summary: "",
  evidence: { sourceId: "source", revisionHash: sha("revision"), sourceQuotes: [q] }, children: [] });
function resolver(revalidate: NativeEvidenceResolver["revalidate"]): NativeEvidenceResolver {
  return { resolve: async () => { throw new Error("release must revalidate"); }, revalidate };
}

test("native release verifier delegates exact tenant, locator and quote to fresh authority", async () => {
  const seen: unknown[] = [];
  assert.equal(await verifyNativeSourceQuotes("tenant", [quote], resolver(async (tenantId, evidence) => {
    seen.push([tenantId, evidence]); return evidence;
  })), true);
  assert.deepEqual(seen, [["tenant", { sourceLocator: quote.sourceLocator, quote: quote.quote }]]);
});

test("changed revision, withdrawal and changed exact passage refuse release", async () => {
  assert.equal(await verifyNativeSourceQuotes("tenant", [quote], resolver(async () => null)), false);
  assert.equal(await verifyNativeSourceQuotes("tenant", [quote], resolver(async (_tenantId, evidence) => ({ ...evidence, quote: "Changed" }))), false);
  assert.equal(await verifyNativeSourceQuotes("tenant", [], resolver(async () => null)), false);
});

test("authority failures propagate as unavailable rather than release", async () => {
  await assert.rejects(verifyNativeSourceQuotes("tenant", [quote], resolver(async () => { throw new Error("source head unavailable"); })), /source head unavailable/);
});

test("graph hook revalidates again after generation and refuses revoked evidence", async () => {
  let eligible = true, calls = 0;
  const revalidate = createNativeSourceRevalidator("tenant", resolver(async (_tenantId, evidence) => { calls++; return eligible ? evidence : null; }));
  await revalidate([node()]);
  eligible = false;
  await assert.rejects(revalidate([node()]), /native source changed/);
  assert.equal(calls, 2);
});

test("graph hook refuses a foreign node source/revision or quote node binding before authority", async () => {
  let calls = 0;
  const revalidate = createNativeSourceRevalidator("tenant", resolver(async (_tenantId, evidence) => { calls++; return evidence; }));
  for (const bad of [node({ ...quote, nodeId: "other" }), { ...node(), evidence: { ...node().evidence, sourceId: "other" } },
    { ...node(), evidence: { ...node().evidence, revisionHash: sha("old") } }]) await assert.rejects(revalidate([bad]), /native source changed/);
  assert.equal(calls, 0);
});
