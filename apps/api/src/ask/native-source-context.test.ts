import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { NativeSourceLocator, TreeIndexNode } from "@lkb/core";
import { validateHydration } from "@lkb/ask";
import { createNativeEvidenceResolver, type NativeEvidenceResolver } from "../native-evidence/resolver.js";
import { createNativeSourceRevalidator } from "../answer-policy/native-evidence.js";
import { createNativeSourceHydrator } from "./native-source-context.js";

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const text = "Visa आवेदन forms open in October 😀.";
const document: NativeSourceLocator = { kind: "document-page", documentId: "doc", sourceId: "source", documentSourceId: "immutable-doc-source", headRevision: 1, revisionHash: sha("revision"),
  pageNumber: 3, passage: { start: 0, end: text.length, sha256: sha(text) } };
const message: NativeSourceLocator = { kind: "message", sourceId: "source", revisionHash: sha("revision"), threadId: "thread", messageId: "message",
  passage: { start: 0, end: text.length, sha256: sha(text) } };
const node = (sourceLocator?: NativeSourceLocator): TreeIndexNode => ({ node_id: "native-source", level: "topic", title: "Native source",
  summary: "UNTRUSTED RETRIEVAL TEXT", evidence: { sourceId: "source", revisionHash: sha("revision"), ...(sourceLocator ? { sourceLocator } : {}) }, children: [] });
function resolver(resolve: NativeEvidenceResolver["resolve"]): NativeEvidenceResolver {
  return { resolve, revalidate: async (tenantId, evidence) => resolve(tenantId, evidence.sourceLocator) };
}

test("native document and message hydration uses exact resolver passages without audio fields", async () => {
  for (const locator of [document, message]) {
    const calls: unknown[] = [], original = node();
    const result = await createNativeSourceHydrator("tenant", {
      listLocators: async (tenantId, source) => { calls.push([tenantId, source]); return [locator]; },
      resolver: resolver(async (tenantId, sourceLocator) => { calls.push([tenantId, sourceLocator]); return { sourceLocator, quote: text }; }),
    })("visa आवेदन", [original]);
    const [hydrated] = validateHydration(result, [original]);
    const [quote] = hydrated!.evidence!.sourceQuotes as Record<string, unknown>[];
    assert.equal(quote!.quote, text);
    assert.equal(quote!.origin, locator.kind);
    assert.deepEqual(quote!.sourceLocator, locator);
    assert.deepEqual(Object.keys(quote!).sort(), ["id", "nodeId", "origin", "quote", "sourceLocator"]);
    assert.equal(calls.length, 2);
    assert.ok(!JSON.stringify(result).includes("UNTRUSTED RETRIEVAL TEXT"));
    assert.equal(original.summary, "UNTRUSTED RETRIEVAL TEXT");
  }
});

test("exact admitted locator still goes through authority and never enumerates unrelated passages", async () => {
  let calls = 0;
  const result = await createNativeSourceHydrator("tenant", {
    listLocators: async () => { throw new Error("must not enumerate"); },
    resolver: resolver(async (tenantId, sourceLocator) => { assert.equal(tenantId, "tenant"); calls++; return { sourceLocator, quote: text }; }),
  })("October", [node(document)]);
  assert.equal(calls, 1);
  assert.equal(result.nodes.length, 1);
});

test("wrong-source or wrong-revision inventory refuses before source text is loaded", async () => {
  for (const locator of [{ ...document, sourceId: "foreign" }, { ...document, revisionHash: sha("old") }]) {
    let calls = 0;
    await assert.rejects(createNativeSourceHydrator("tenant", { listLocators: async () => [locator],
      resolver: resolver(async () => { calls++; return null; }) })("visa", [node()]), /outside admitted/);
    assert.equal(calls, 0);
  }
});

test("changed, withdrawn or unavailable native authority cannot fall back to retrieval text", async () => {
  await assert.rejects(createNativeSourceHydrator("tenant", { listLocators: async () => [document], resolver: resolver(async () => null) })("visa", [node()]), /changed or is unavailable/);
  await assert.rejects(createNativeSourceHydrator("tenant", { listLocators: async () => [document],
    resolver: resolver(async () => { throw new Error("authority offline"); }) })("visa", [node()]), /authority offline/);
});

test("duplicate native locators and duplicate node identities refuse", async () => {
  const deps = { listLocators: async () => [document, document], resolver: resolver(async (_tenantId, sourceLocator) => ({ sourceLocator, quote: text })) };
  await assert.rejects(createNativeSourceHydrator("tenant", deps)("visa", [node()]), /duplicate native passage/);
  await assert.rejects(createNativeSourceHydrator("tenant", { ...deps, listLocators: async () => [document] })("visa", [node(), node()]), /ambiguous native source/);
});

test("native lexical ranking uses canonical text and emits no fabricated match", async () => {
  const deps = { listLocators: async () => [document], resolver: resolver(async (_tenantId, sourceLocator) => ({ sourceLocator, quote: text })) };
  assert.equal((await createNativeSourceHydrator("tenant", deps)("आवेदन", [node()])).nodes.length, 1);
  assert.equal((await createNativeSourceHydrator("tenant", deps)("unmatchedword", [node()])).nodes.length, 0);
});

test("real shared resolver hydration cannot release immutable old page after same-content head epoch advances", async () => {
  let headRevision = 1, loads = 0;
  const authority = createNativeEvidenceResolver({ loadCurrent: async tenantId => {
    loads++;
    return { tenantId, kind: "document-page", documentId: "doc", sourceId: "source", documentSourceId: "immutable-doc-source", headRevision, pageNumber: 3,
      revisionHash: document.revisionHash, currentRevisionHash: document.revisionHash, eligible: true, text };
  } });
  const result = await createNativeSourceHydrator("tenant", { resolver: authority, listLocators: async () => [document] })("visa", [node()]);
  const selected = validateHydration(result, [node()]);
  const revalidate = createNativeSourceRevalidator("tenant", authority);
  await revalidate(selected);
  headRevision = 2;
  await assert.rejects(revalidate(selected), /native source changed/);
  assert.equal(loads, 3);
});
